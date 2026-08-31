import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

// Recupero password: le regole, in un posto solo.
//
// Il giro è quello canonico (Libro della Sicurezza §1-2): chi ha dimenticato la
// password chiede un link, il link porta un token monouso a scadenza breve, e
// usarlo cambia la password E chiude tutte le sessioni aperte — se qualcuno era
// entrato col vecchio accesso, esce di lì.
//
// Tre cose non negoziabili:
// 1. **A database non c'è mai il token in chiaro**, solo il suo SHA-256. Un
//    backup o una lettura della tabella non bastano per entrare.
// 2. **La risposta non dice mai se l'email esiste**: il portale è la porta di
//    tutta la suite, e un modulo che risponde «questo indirizzo non risulta»
//    regala l'elenco delle persone a chiunque.
// 3. **Il token è monouso e a tempo**: speso o scaduto, non vale più; e usarne
//    uno spegne anche tutti gli altri della stessa persona.

export const DURATA_TOKEN_MIN = 60; // un'ora: il tempo di leggere una mail, non un giorno
export const MIN_PASSWORD = 12; // NIST 800-63B: la lunghezza conta più delle regole di composizione

// Quanti recuperi si possono chiedere in un'ora. Non è un capriccio: senza un
// freno, questo modulo diventa un modo per bombardare di email la casella di una
// persona (e per far spendere all'app un invio SMTP a ogni click).
const MAX_PER_UTENTE_ORA = 3;
const MAX_PER_IP_ORA = 10;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// L'IP serve solo a contare le richieste: si conserva il suo hash (con il
// segreto dell'app come sale), mai il valore. Un indirizzo IP è un dato
// personale, e qui basta poter dire «è di nuovo lo stesso».
export function hashIp(ip: string): string {
  if (!ip) return "";
  return createHash("sha256")
    .update((process.env.HUB_SESSION_SECRET ?? "deluxy") + ":" + ip)
    .digest("hex");
}

// Password nuova: nessuna regola di composizione (NIST le sconsiglia: producono
// «Password1!» e nient'altro), ma lunghezza vera e blocklist dei valori che
// stanno in cima a ogni dizionario. Si rifiuta anche la password che contiene
// l'email o il nome: è la prima cosa che prova chi conosce la persona.
const BLOCKLIST = [
  "password", "passw0rd", "123456", "12345678", "123456789", "1234567890",
  "qwerty", "qwertyuiop", "abc123", "iloveyou", "admin", "welcome", "letmein",
  "monkey", "dragon", "football", "baseball", "sunshine", "princess",
  "deluxy", "deluxy2026", "deluxy2025", "cambiami", "changeme", "segreto",
];

export function problemaPassword(
  password: string,
  chi: { email: string; nome: string },
): string | null {
  if (password.length < MIN_PASSWORD) return "corta";
  const bassa = password.toLowerCase();
  if (BLOCKLIST.some((v) => bassa === v || bassa.startsWith(v))) return "comune";
  const locale = chi.email.split("@")[0]?.toLowerCase() ?? "";
  if (locale.length >= 3 && bassa.includes(locale)) return "contiene-email";
  for (const parte of chi.nome.toLowerCase().split(/\s+/)) {
    if (parte.length >= 4 && bassa.includes(parte)) return "contiene-nome";
  }
  return null;
}

// Crea il token per un utente. Ritorna il valore IN CHIARO (l'unico momento in
// cui esiste: da qui va dritto nell'email) oppure null se il freno è scattato.
export async function creaTokenRecupero(
  utenteId: string,
  ipHash: string,
): Promise<string | null> {
  const unOraFa = new Date(Date.now() - 60 * 60 * 1000);

  const [perUtente, perIp] = await Promise.all([
    prisma.tokenReset.count({ where: { utenteId, creatoIl: { gte: unOraFa } } }),
    ipHash
      ? prisma.tokenReset.count({ where: { ipHash, creatoIl: { gte: unOraFa } } })
      : Promise.resolve(0),
  ]);
  if (perUtente >= MAX_PER_UTENTE_ORA || perIp >= MAX_PER_IP_ORA) return null;

  // 32 byte casuali: 256 bit di entropia, non indovinabili nemmeno provando
  // per tutta la durata di validità.
  const token = randomBytes(32).toString("base64url");
  await prisma.tokenReset.create({
    data: {
      utenteId,
      hash: hashToken(token),
      scadeIl: new Date(Date.now() + DURATA_TOKEN_MIN * 60 * 1000),
      ipHash,
    },
  });
  return token;
}

export type EsitoToken =
  | { valido: true; utenteId: string; email: string; nome: string; tokenId: string }
  | { valido: false };

// Legge un token dall'URL e dice se vale. Si cerca PER HASH (indice unico): non
// si scorrono i token dell'utente confrontandoli, che sarebbe il posto giusto
// per un attacco a tempo.
export async function leggiTokenRecupero(token: string): Promise<EsitoToken> {
  if (!token || token.length < 20) return { valido: false };

  const riga = await prisma.tokenReset.findUnique({
    where: { hash: hashToken(token) },
    include: { utente: { select: { id: true, email: true, nome: true, attivo: true } } },
  });
  if (!riga || riga.usatoIl || riga.scadeIl < new Date() || !riga.utente.attivo) {
    return { valido: false };
  }

  // Confronto a tempo costante sull'hash trovato: la ricerca per chiave unica
  // ha già fatto il lavoro, ma il confronto finale non deve essere un `===`
  // (Libro §1: mai un oracolo temporale su un segreto).
  const atteso = Buffer.from(riga.hash, "hex");
  const calcolato = Buffer.from(hashToken(token), "hex");
  if (atteso.length !== calcolato.length || !timingSafeEqual(atteso, calcolato)) {
    return { valido: false };
  }

  return {
    valido: true,
    utenteId: riga.utente.id,
    email: riga.utente.email,
    nome: riga.utente.nome,
    tokenId: riga.id,
  };
}

// Il testo dell'email. Sobrio e senza fronzoli: dice cosa fare, quanto dura, e
// cosa fare se non sei stato tu. Nessun dato oltre al nome.
export function emailRecupero(nome: string, link: string): { oggetto: string; testo: string; html: string } {
  const oggetto = "Deluxy Hub — reimposta la password";
  const testo = [
    `Ciao ${nome},`,
    "",
    "hai chiesto di reimpostare la password del portale Deluxy.",
    "Apri questo indirizzo entro un'ora:",
    "",
    link,
    "",
    "Il link si può usare una volta sola. Aprendolo, ogni altro accesso già aperto",
    "col tuo account viene chiuso.",
    "",
    "Se non sei stato tu, non devi fare niente: senza questo link la password non cambia.",
    "",
    "Deluxy Hub — deluxy-hub.vercel.app",
  ].join("\n");

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;background:#f5f5f7;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e3e6;border-radius:14px;padding:28px">
    <h1 style="font-size:19px;margin:0 0 14px;letter-spacing:-.02em">Reimposta la password</h1>
    <p style="margin:0 0 16px;font-size:14.5px">Ciao ${esc(nome)}, hai chiesto di reimpostare la password del portale Deluxy.</p>
    <p style="margin:0 0 22px"><a href="${esc(link)}" style="display:inline-block;background:#111318;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14.5px">Scegli una password nuova</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#6e6e73">Il link vale <b>un'ora</b> e si usa <b>una volta sola</b>. Aprendolo, ogni altro accesso già aperto col tuo account viene chiuso.</p>
    <p style="margin:0;font-size:13px;color:#6e6e73">Se non sei stato tu, non devi fare niente: senza questo link la password non cambia.</p>
  </div>
</div>`;

  return { oggetto, testo, html };
}
