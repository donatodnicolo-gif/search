import { randomBytes } from "crypto";
import { prisma } from "./db";
import { confrontaSicuro, hashPassword, passwordCorretta, sha256 } from "./crypto";
import { leggiRegole } from "./impostazioni";
import { inviaEmail, postaConfigurata } from "./mail";
import { registra } from "./audit";
import { euro } from "./denaro";

// Sblocco del pagamento — l'unica porta da cui esce il denaro.
//
// Regola dell'app (decisa dal titolare, luglio 2026): Deluxy Transactions è
// l'unica applicazione da cui può uscire denaro, e da qui esce solo se UNA
// persona — il pagatore, impostazione `pagatoreEmail` — supera tre prove:
//
//   1. è già dentro con password + TOTP (la sessione),
//   2. digita un codice che è arrivato sulla SUA casella email,
//   3. digita il PIN, che non è scritto da nessuna parte in chiaro.
//
// Perché il codice via email e non un altro TOTP: il codice viaggia su un
// canale diverso dal browser e dal telefono, e soprattutto l'email DICE cosa si
// sta per pagare (quanto, a chi, quale distinta). Se arriva un codice che non
// si è chiesto, il pagatore lo scopre lì — è l'allarme antifurto, non solo la
// serratura.
//
// Il codice è legato all'IMPRONTA della distinta: se fra l'invio e lo sblocco
// cambia anche solo un IBAN o un centesimo, il codice non vale più.

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // senza I, O, 0, 1: si copia a mano
const LUNGHEZZA = 8;
const MAX_TENTATIVI = 5;

export type Esito = { ok: true; messaggio: string } | { ok: false; errore: string };

function generaCodice(): string {
  const b = randomBytes(LUNGHEZZA);
  let out = "";
  for (const byte of b) out += ALFABETO[byte % ALFABETO.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Toglie spazi e trattini e alza il maiuscolo: si accetta come è stato copiato. */
export function normalizzaCodice(grezzo: string): string {
  const pulito = grezzo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return pulito.length === LUNGHEZZA ? `${pulito.slice(0, 4)}-${pulito.slice(4)}` : pulito;
}

export async function emailPagatore(): Promise<string> {
  const r = await leggiRegole();
  return r.pagatoreEmail.trim().toLowerCase();
}

/** true se questo operatore è il pagatore. Il confronto è a tempo costante. */
export async function eIlPagatore(email: string): Promise<boolean> {
  const atteso = await emailPagatore();
  if (!atteso) return false;
  return confrontaSicuro(email.trim().toLowerCase(), atteso);
}

type LottoConRichieste = {
  id: string;
  riferimento: string;
  stato: string;
  richieste: { riferimento: string; iban: string; importoCent: number }[];
};

/**
 * Impronta di ciò che si sta per pagare. Cambia se cambia la composizione della
 * distinta: è ciò che impedisce di farsi mandare il codice per 100 € e usarlo
 * per 10.000 €.
 */
export function improntaDistinta(l: LottoConRichieste): string {
  const righe = l.richieste
    .map((r) => `${r.riferimento}|${r.iban}|${r.importoCent}`)
    .sort()
    .join("\n");
  return sha256(`${l.riferimento}\n${totaleDi(l)}\n${righe}`);
}

export function totaleDi(l: LottoConRichieste): number {
  return l.richieste.reduce((s, r) => s + r.importoCent, 0);
}

/** true se la distinta è sbloccata adesso (e per quanto ancora). */
export function sbloccoAttivo(l: { sbloccatoIl: Date | null; sbloccoScadeIl: Date | null }): boolean {
  return Boolean(l.sbloccatoIl && l.sbloccoScadeIl && l.sbloccoScadeIl.getTime() > Date.now());
}

// ---------------------------------------------------------------------------
// 1. Chiedere il codice
// ---------------------------------------------------------------------------

export async function chiediCodice(
  lottoId: string,
  operatore: { id: string; email: string; nome: string },
  ip: string | null,
): Promise<Esito> {
  if (!(await eIlPagatore(operatore.email))) {
    await registra(
      "pagamento.negato",
      operatore.email,
      { motivo: "non è il pagatore", lottoId },
      { ip },
    );
    return { ok: false, errore: `Solo ${await emailPagatore()} può far uscire denaro da questa app.` };
  }

  const o = await prisma.operatore.findUnique({ where: { id: operatore.id } });
  if (!o?.pinHash || !o.pinSalt) {
    return { ok: false, errore: "Prima imposta il PIN di pagamento nella pagina PIN: senza, il denaro non esce." };
  }
  if (!(await postaConfigurata())) {
    return {
      ok: false,
      errore:
        "Posta non configurata: il codice non può essere spedito, quindi il pagamento non parte. Si configura in Impostazioni → Server di posta.",
    };
  }

  const lotto = await prisma.lotto.findUnique({
    where: { id: lottoId },
    include: { richieste: { select: { riferimento: true, iban: true, importoCent: true, beneficiario: true } } },
  });
  if (!lotto) return { ok: false, errore: "Distinta inesistente." };
  if (lotto.stato === "annullato") return { ok: false, errore: "Distinta annullata." };
  if (lotto.richieste.length === 0) return { ok: false, errore: "Distinta vuota." };

  const regole = await leggiRegole();
  const codice = generaCodice();
  const totale = totaleDi(lotto);
  const scadeIl = new Date(Date.now() + regole.minutiCodicePagamento * 60_000);

  // Un codice vivo per volta: chiederne uno nuovo spegne i precedenti.
  await prisma.sbloccoPagamento.updateMany({
    where: { lottoId, usatoIl: null, annullatoIl: null },
    data: { annullatoIl: new Date() },
  });

  const destinatario = await emailPagatore();
  const elenco = lotto.richieste
    .map((r) => `  · ${r.beneficiario} — ${euro(r.importoCent)} (${r.riferimento})`)
    .join("\n");

  // Prima si manda l'email, poi si scrive la riga: se la posta non parte non
  // deve restare in giro un codice valido che nessuno ha ricevuto.
  try {
    await inviaEmail({
      a: destinatario,
      oggetto: `Codice per pagare ${lotto.riferimento} — ${euro(totale)}`,
      testo: [
        `Codice di pagamento: ${codice}`,
        ``,
        `Vale ${regole.minutiCodicePagamento} minuti e serve, insieme al PIN, per generare il file SEPA di questa distinta.`,
        ``,
        `Distinta:    ${lotto.riferimento}`,
        `Totale:      ${euro(totale)}`,
        `Pagamenti:   ${lotto.richieste.length}`,
        elenco,
        ``,
        `Richiesto da ${operatore.nome} <${operatore.email}>${ip ? ` — IP ${ip}` : ""}.`,
        ``,
        `SE NON HAI CHIESTO TU QUESTO CODICE non usarlo e non darlo a nessuno:`,
        `qualcuno è dentro l'app con le tue credenziali. Entra e disattiva le`,
        `sessioni dalla pagina Operatori.`,
      ].join("\n"),
    });
  } catch (e) {
    await registra(
      "pagamento.negato",
      operatore.email,
      { motivo: "invio del codice fallito", lottoId, dettaglio: (e as Error).message },
      { ip },
    );
    return { ok: false, errore: `Il codice non è partito: ${(e as Error).message}` };
  }

  await prisma.sbloccoPagamento.create({
    data: {
      lottoId,
      chiestoDa: operatore.email,
      inviatoA: destinatario,
      codiceHash: sha256(codice),
      totaleCent: totale,
      impronta: improntaDistinta(lotto),
      scadeIl,
      ip,
    },
  });
  await registra(
    "pagamento.codice_richiesto",
    operatore.email,
    { lotto: lotto.riferimento, totaleCent: totale, inviatoA: destinatario, minuti: regole.minutiCodicePagamento },
    { ip },
  );

  return {
    ok: true,
    messaggio: `Codice spedito a ${destinatario}. Vale ${regole.minutiCodicePagamento} minuti.`,
  };
}

// ---------------------------------------------------------------------------
// 2. Sbloccare con codice + PIN
// ---------------------------------------------------------------------------

export async function sblocca(
  lottoId: string,
  operatore: { id: string; email: string },
  codiceGrezzo: string,
  pin: string,
  ip: string | null,
): Promise<Esito> {
  if (!(await eIlPagatore(operatore.email))) {
    await registra("pagamento.negato", operatore.email, { motivo: "non è il pagatore", lottoId }, { ip });
    return { ok: false, errore: `Solo ${await emailPagatore()} può far uscire denaro da questa app.` };
  }

  const o = await prisma.operatore.findUnique({ where: { id: operatore.id } });
  if (!o?.pinHash || !o.pinSalt) return { ok: false, errore: "PIN non impostato." };

  const sbloccoRiga = await prisma.sbloccoPagamento.findFirst({
    where: { lottoId, usatoIl: null, annullatoIl: null },
    orderBy: { creatoIl: "desc" },
  });
  if (!sbloccoRiga) return { ok: false, errore: "Nessun codice in corso: chiedine uno nuovo." };
  if (sbloccoRiga.scadeIl.getTime() < Date.now()) {
    return { ok: false, errore: "Codice scaduto: chiedine uno nuovo." };
  }

  // Messaggio unico per codice sbagliato e PIN sbagliato: chi prova non deve
  // scoprire quale dei due ha indovinato.
  const fallito = async (motivo: string): Promise<Esito> => {
    const tentativi = sbloccoRiga.tentativi + 1;
    const esaurito = tentativi >= MAX_TENTATIVI;
    await prisma.sbloccoPagamento.update({
      where: { id: sbloccoRiga.id },
      data: { tentativi, annullatoIl: esaurito ? new Date() : null },
    });
    await registra(
      esaurito ? "sicurezza.allarme" : "pagamento.sblocco_fallito",
      operatore.email,
      { motivo, tentativi, lottoId },
      { ip },
    );
    return {
      ok: false,
      errore: esaurito
        ? "Cinque tentativi sbagliati: il codice è stato annullato. Chiedine uno nuovo."
        : `Codice o PIN errato. Restano ${MAX_TENTATIVI - tentativi} tentativi.`,
    };
  };

  if (!confrontaSicuro(sha256(normalizzaCodice(codiceGrezzo)), sbloccoRiga.codiceHash)) {
    return fallito("codice errato");
  }
  if (!passwordCorretta(pin, o.pinHash, o.pinSalt)) return fallito("PIN errato");

  // Il codice vale per QUELLA distinta com'era: se nel frattempo è cambiata,
  // si ricomincia.
  const lotto = await prisma.lotto.findUnique({
    where: { id: lottoId },
    include: { richieste: { select: { riferimento: true, iban: true, importoCent: true } } },
  });
  if (!lotto) return { ok: false, errore: "Distinta inesistente." };
  if (improntaDistinta(lotto) !== sbloccoRiga.impronta) {
    await prisma.sbloccoPagamento.update({ where: { id: sbloccoRiga.id }, data: { annullatoIl: new Date() } });
    await registra(
      "sicurezza.allarme",
      operatore.email,
      { motivo: "la distinta è cambiata dopo l'invio del codice", lotto: lotto.riferimento },
      { ip },
    );
    return {
      ok: false,
      errore: "La distinta è cambiata dopo l'invio del codice. Il codice è stato annullato: chiedine uno nuovo.",
    };
  }

  const regole = await leggiRegole();
  const adesso = new Date();
  const scadenza = new Date(adesso.getTime() + regole.minutiSbloccoPagamento * 60_000);
  await prisma.sbloccoPagamento.update({ where: { id: sbloccoRiga.id }, data: { usatoIl: adesso } });
  await prisma.lotto.update({
    where: { id: lottoId },
    data: { sbloccatoDa: operatore.email, sbloccatoIl: adesso, sbloccoScadeIl: scadenza },
  });
  await registra(
    "pagamento.sbloccato",
    operatore.email,
    { lotto: lotto.riferimento, totaleCent: totaleDi(lotto), minuti: regole.minutiSbloccoPagamento },
    { ip },
  );

  return {
    ok: true,
    messaggio: `${lotto.riferimento} sbloccata per ${regole.minutiSbloccoPagamento} minuti: adesso il file SEPA si può generare.`,
  };
}

// ---------------------------------------------------------------------------
// 3. Il cancello vero: lo chiama chi sta per far uscire il denaro
// ---------------------------------------------------------------------------

/**
 * Restituisce null se si può procedere, altrimenti il motivo del rifiuto.
 * Da chiamare in TUTTI i punti che fanno uscire denaro: generazione del file
 * SEPA e, il giorno che ci sarà, esecuzione via banca.
 */
export async function verificaCancello(
  lottoId: string,
  operatore: { email: string },
): Promise<string | null> {
  if (!(await eIlPagatore(operatore.email))) {
    return `Solo ${await emailPagatore()} può generare il file di pagamento. Gli altri operatori preparano la distinta, non la fanno uscire.`;
  }
  const l = await prisma.lotto.findUnique({
    where: { id: lottoId },
    select: { sbloccatoIl: true, sbloccoScadeIl: true },
  });
  if (!l) return "Distinta inesistente.";
  if (!sbloccoAttivo(l)) {
    return "Distinta non sbloccata (o sblocco scaduto): chiedi il codice via email e inserisci codice e PIN.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------

export function pinAccettabile(pin: string): string | null {
  if (!/^\d{6,12}$/.test(pin)) return "Il PIN deve avere da 6 a 12 cifre.";
  if (/^(\d)\1+$/.test(pin)) return "Un PIN con tutte le cifre uguali non va bene.";
  const cifre = pin.split("").map(Number);
  const crescente = cifre.every((c, i) => i === 0 || c === cifre[i - 1] + 1);
  const decrescente = cifre.every((c, i) => i === 0 || c === cifre[i - 1] - 1);
  if (crescente || decrescente) return "Niente sequenze tipo 123456.";
  return null;
}

export function impronteDelPin(pin: string): { hash: string; salt: string } {
  return hashPassword(pin);
}
