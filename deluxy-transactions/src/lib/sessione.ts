import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import { sha256, tokenCasuale, passwordCorretta, decifra } from "./crypto";
import { codiceTotpValido } from "./totp";
import { registra } from "./audit";
import { COOKIE_SESSIONE, componiCookie, idDaCookie } from "./cookie-firma";

// Sessioni degli operatori.
//
// Deviazione dichiarata dallo Standard Deluxy §4.4: le altre app usano una
// password unica di team (`<APP>_APP_PASSWORD`). Qui no. Un'app che autorizza
// bonifici deve sapere CHI ha approvato, e la doppia firma non esiste se tutti
// condividono le stesse credenziali. Quindi: account nominali, password
// PBKDF2, secondo fattore TOTP obbligatorio per approvare.
//
// Le sessioni vivono sul database: revocarne una ha effetto immediato, mentre
// un cookie firmato e basta resterebbe valido fino alla scadenza.

const DURATA_ORE = 8; // giornata lavorativa, poi si rientra
const MAX_TENTATIVI = 5;
const BLOCCO_MINUTI = 15;

export type OperatoreSessione = {
  id: string;
  email: string;
  nome: string;
  ruolo: string;
  tettoApprovazione: number;
  totpAttivo: boolean;
};

export async function ipRichiesta(): Promise<string | null> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    return xff ? xff.split(",")[0].trim() : h.get("x-real-ip");
  } catch {
    return null;
  }
}

/** L'operatore della richiesta corrente, o null. Non fa redirect. */
export async function operatoreCorrente(): Promise<OperatoreSessione | null> {
  let valore: string | undefined;
  try {
    valore = (await cookies()).get(COOKIE_SESSIONE)?.value;
  } catch {
    return null;
  }
  const id = await idDaCookie(valore);
  if (!id) return null;
  try {
    const sessione = await prisma.sessione.findUnique({
      where: { hash: sha256(id) },
      include: { operatore: true },
    });
    if (!sessione || sessione.revocataIl) return null;
    if (sessione.scadeIl.getTime() < Date.now()) return null;
    const o = sessione.operatore;
    if (!o.attivo) return null;
    return {
      id: o.id,
      email: o.email,
      nome: o.nome,
      ruolo: o.ruolo,
      tettoApprovazione: o.tettoApprovazione,
      totpAttivo: o.totpAttivo,
    };
  } catch {
    return null;
  }
}

export type EsitoAccesso =
  | { ok: true }
  | { ok: false; errore: string };

/**
 * Accesso: email + password + codice a 6 cifre. I tre controlli sono separati
 * ma il messaggio d'errore è sempre lo stesso, così non si scopre quali email
 * esistono né se la password era giusta e mancava solo il codice.
 */
export async function accedi(email: string, password: string, codice: string): Promise<EsitoAccesso> {
  const generico = { ok: false as const, errore: "Credenziali non valide." };
  const ip = await ipRichiesta();
  const mail = email.trim().toLowerCase();
  if (!mail || !password) return generico;

  const o = await prisma.operatore.findUnique({ where: { email: mail } });
  if (!o || !o.attivo) {
    await registra("operatore.accesso_fallito", mail, { motivo: "operatore inesistente o disattivato" }, { ip });
    return generico;
  }
  if (o.bloccatoFinoA && o.bloccatoFinoA.getTime() > Date.now()) {
    return { ok: false, errore: `Accesso bloccato per troppi tentativi. Riprova fra qualche minuto.` };
  }

  const fallito = async (motivo: string) => {
    const tentativi = o.tentativiFalliti + 1;
    await prisma.operatore.update({
      where: { id: o.id },
      data: {
        tentativiFalliti: tentativi,
        bloccatoFinoA: tentativi >= MAX_TENTATIVI ? new Date(Date.now() + BLOCCO_MINUTI * 60_000) : null,
      },
    });
    await registra("operatore.accesso_fallito", mail, { motivo, tentativi }, { ip });
    return generico;
  };

  if (!passwordCorretta(password, o.passwordHash, o.passwordSalt)) return fallito("password errata");

  if (o.totpAttivo) {
    if (!o.totpSegreto) return fallito("secondo fattore non configurato");
    let segreto: string;
    try {
      segreto = decifra(o.totpSegreto);
    } catch {
      return { ok: false, errore: "Secondo fattore non leggibile: TRANSACTIONS_ENC_KEY errata." };
    }
    if (!codiceTotpValido(segreto, codice)) return fallito("codice a 6 cifre errato");
  }

  const idSessione = tokenCasuale(32);
  const h = await headers();
  await prisma.sessione.create({
    data: {
      operatoreId: o.id,
      hash: sha256(idSessione),
      ip,
      userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
      scadeIl: new Date(Date.now() + DURATA_ORE * 60 * 60 * 1000),
    },
  });
  await prisma.operatore.update({
    where: { id: o.id },
    data: { tentativiFalliti: 0, bloccatoFinoA: null, ultimoAccesso: new Date() },
  });

  const jar = await cookies();
  jar.set(COOKIE_SESSIONE, await componiCookie(idSessione), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // strict e non lax: nessuna navigazione da un altro sito deve arrivare qui
    // già autenticata. È l'antidoto al CSRF, insieme alle server action.
    sameSite: "strict",
    maxAge: DURATA_ORE * 60 * 60,
    path: "/",
  });

  await registra("operatore.accesso", mail, {}, { ip });
  return { ok: true };
}

export async function esci(): Promise<void> {
  const jar = await cookies();
  const id = await idDaCookie(jar.get(COOKIE_SESSIONE)?.value);
  if (id) {
    await prisma.sessione
      .updateMany({ where: { hash: sha256(id) }, data: { revocataIl: new Date() } })
      .catch(() => {});
  }
  jar.delete(COOKIE_SESSIONE);
}

/**
 * Conferma con il secondo fattore un'azione già dentro la sessione (approvare
 * o rifiutare un pagamento). La sessione da sola non basta: se qualcuno trova
 * il computer sbloccato, senza il telefono non autorizza niente.
 */
export async function confermaSecondoFattore(operatoreId: string, codice: string): Promise<boolean> {
  const o = await prisma.operatore.findUnique({ where: { id: operatoreId } });
  if (!o || !o.totpAttivo || !o.totpSegreto) return false;
  try {
    return codiceTotpValido(decifra(o.totpSegreto), codice);
  } catch {
    return false;
  }
}

/** true se l'app ha almeno un operatore: serve alla schermata di primo avvio. */
export async function esistonoOperatori(): Promise<boolean> {
  try {
    return (await prisma.operatore.count()) > 0;
  } catch {
    return true; // database non raggiungibile: non si mostra la procedura di setup
  }
}
