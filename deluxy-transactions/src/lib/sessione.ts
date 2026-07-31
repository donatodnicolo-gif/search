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

const DURATA_ORE = 8; // tetto assoluto: dopo si rientra comunque, anche lavorando
// Scadenza per inattività: dieci minuti fermi e la sessione è morta. Serve al
// caso concreto di un'app che autorizza bonifici — il computer lasciato aperto
// mentre si esce dalla stanza — che le otto ore non coprono per niente.
const INATTIVITA_MINUTI = 10;
// Ogni pagina aperta rimette il contatore a zero, ma si scrive sul database al
// massimo una volta ogni mezzo minuto: senza, ogni navigazione costerebbe due
// UPDATE (il layout e la pagina chiedono entrambi chi è l'operatore). Il prezzo
// è che il conto può partire fino a 30 secondi prima dell'ultimo clic vero.
const TOCCO_SECONDI = 30;
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
    // Ferma da troppo: si esce. Non serve scrivere niente per chiuderla —
    // `ultimoUso` non si aggiorna più, quindi da qui in poi il conto è sempre
    // scaduto e la sessione non può tornare buona.
    const fermaDa = Date.now() - sessione.ultimoUso.getTime();
    if (fermaDa > INATTIVITA_MINUTI * 60_000) return null;
    const o = sessione.operatore;
    if (!o.attivo) return null;
    if (fermaDa > TOCCO_SECONDI * 1000) {
      await prisma.sessione
        .update({ where: { id: sessione.id }, data: { ultimoUso: new Date() } })
        .catch(() => {}); // una scrittura persa non deve buttare fuori nessuno
    }
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

/** I minuti di inattività, per scriverli nella pagina senza ricopiare il numero. */
export const MINUTI_INATTIVITA = INATTIVITA_MINUTI;

/**
 * true se il cookie che il browser ha ancora in mano punta a una sessione morta
 * per inattività. Serve alla pagina di accesso per dire *perché* si è finiti lì:
 * senza, un'uscita automatica sembra un guasto.
 */
export async function uscitoPerInattivita(): Promise<boolean> {
  try {
    const id = await idDaCookie((await cookies()).get(COOKIE_SESSIONE)?.value);
    if (!id) return false;
    const s = await prisma.sessione.findUnique({ where: { hash: sha256(id) } });
    if (!s || s.revocataIl) return false; // uscita volontaria, non scadenza
    if (s.scadeIl.getTime() < Date.now()) return false; // scaduta per le otto ore
    return Date.now() - s.ultimoUso.getTime() > INATTIVITA_MINUTI * 60_000;
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
