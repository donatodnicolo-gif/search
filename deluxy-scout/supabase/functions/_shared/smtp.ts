// Credenziali SMTP PER UTENTE, condivise dalle Edge Function che mandano email.
//
// Perché così: ogni venditore invia dalla PROPRIA casella (Register.it), quindi
// la password non può stare nei secret globali. Vive cifrata (AES-256-GCM) nella
// tabella `smtp_account`, che ha RLS senza policy → leggibile SOLO dal
// service_role, cioè da queste funzioni. Il client non la rilegge mai.
//
// Formato del cifrato: "iv.tag.dati" in base64 (lo stesso di deluxy-mail).
// Secret richiesto: SMTP_ENC_KEY = 32 byte casuali in base64.

export interface Credenziali {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

function chiave(): Promise<CryptoKey> {
  const b64 = Deno.env.get('SMTP_ENC_KEY');
  if (!b64) throw new Error('SMTP_ENC_KEY non configurata');
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('SMTP_ENC_KEY deve essere di 32 byte (base64)');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Cifra una password in "iv.tag.dati" (base64). */
export async function cifra(testo: string): Promise<string> {
  const key = await chiave();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(testo)),
  );
  // Web Crypto concatena il tag (16 byte) in coda al ciphertext: lo separiamo
  // per restare compatibili col formato usato da deluxy-mail.
  const dati = out.slice(0, out.length - 16);
  const tag = out.slice(out.length - 16);
  return [b64(iv), b64(tag), b64(dati)].join('.');
}

/** Decifra il formato "iv.tag.dati". */
export async function decifra(cifrato: string): Promise<string> {
  const [ivB64, tagB64, datiB64] = cifrato.split('.');
  if (!ivB64 || !tagB64 || !datiB64) throw new Error('Password cifrata in formato non valido');
  const key = await chiave();
  const iv = deB64(ivB64);
  const tag = deB64(tagB64);
  const dati = deB64(datiB64);
  const insieme = new Uint8Array(dati.length + tag.length);
  insieme.set(dati);
  insieme.set(tag, dati.length);
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, insieme);
  return new TextDecoder().decode(out);
}

/**
 * Credenziali con cui inviare per conto di `ownerId`:
 * 1) la casella personale configurata dall'utente (tabella `smtp_account`);
 * 2) in mancanza, i secret globali SMTP_* (se un giorno si userà una casella unica);
 * 3) altrimenti null → la funzione chiamante resta inerte.
 */
export async function credenzialiPerUtente(admin: any, ownerId: string | null): Promise<Credenziali | null> {
  if (ownerId) {
    const { data } = await admin.from('smtp_account').select('*').eq('owner', ownerId).maybeSingle();
    if (data?.host && data?.utente && data?.password_cifrata) {
      return {
        host: data.host,
        port: Number(data.porta ?? 465),
        user: data.utente,
        pass: await decifra(data.password_cifrata),
        from: data.mittente || data.utente,
      };
    }
  }
  const host = Deno.env.get('SMTP_HOST');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  if (host && user && pass) {
    return {
      host,
      user,
      pass,
      port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
      from: Deno.env.get('SMTP_FROM') ?? user,
    };
  }
  return null;
}
