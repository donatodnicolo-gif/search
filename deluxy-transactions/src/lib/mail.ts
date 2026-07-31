import nodemailer from "nodemailer";
import { prisma } from "./db";
import { cifra, decifra } from "./crypto";

// Invio email. Serve a una cosa sola: recapitare al pagatore il codice che
// sblocca l'uscita di denaro.
//
// Regola non negoziabile: se l'email non parte, il codice non esiste e il
// pagamento non si sblocca. Si fallisce chiusi, mai aperti.
//
// ---------------------------------------------------------------------------
// Dove sta la configurazione, e perché è cambiato (31/07/2026)
// ---------------------------------------------------------------------------
//
// Fino al 30/07 stava SOLO nelle variabili d'ambiente, e la ragione era buona:
// chi riuscisse a scrivere sul database potrebbe sostituire il server di posta
// con uno suo e leggere i codici di sblocco mentre passano. È un furto, non un
// disservizio.
//
// Ora si può configurare anche dall'app, ma il buco resta chiuso, per due
// motivi messi insieme:
//
//  1. I valori sul database sono **cifrati AES-256-GCM** con
//     TRANSACTIONS_ENC_KEY, che vive nell'ambiente e non nel database. Chi
//     scrive sul database non sa produrre un testo cifrato valido: può
//     cancellare o corrompere le righe — e allora la posta non parte e nessun
//     pagamento esce, cioè si fallisce chiusi — ma non può *dirottare* niente
//     verso un server scelto da lui. L'attacco passa da «rubo i codici» a
//     «blocco i pagamenti», che è rumoroso e non frutta nulla.
//  2. **L'ambiente vince sempre sul database.** Se SMTP_HOST/USER/PASS sono
//     impostate su Vercel, quelle si usano e il modulo nell'app non ha effetto:
//     un'installazione già irrigidita non si ammorbidisce da una pagina web.
//
// Chi cambia la posta dall'app deve essere admin, confermare col secondo
// fattore, e la modifica finisce nel registro a catena di hash.

export type ConfigSmtp = {
  host: string;
  porta: number;
  utente: string;
  password: string;
  mittente: string;
  // Le uniche caselle a cui questa app può scrivere. Vuoto = nessun limite.
  destinatari: string[];
};
export type DaDove = "app" | "ambiente";

export const CHIAVI_SMTP = {
  host: "smtp.host",
  porta: "smtp.porta",
  utente: "smtp.utente",
  password: "smtp.password",
  mittente: "smtp.mittente",
  destinatari: "smtp.destinatari",
} as const;

/** "a@b.it, c@d.it" → ["a@b.it", "c@d.it"], in minuscolo e senza doppioni. */
export function elencoDestinatari(grezzo: string): string[] {
  const visti = new Set<string>();
  for (const pezzo of grezzo.split(/[,;\s]+/)) {
    const e = pezzo.trim().toLowerCase();
    if (e.includes("@")) visti.add(e);
  }
  return [...visti];
}

function daAmbiente(): ConfigSmtp | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const utente = (process.env.SMTP_USER ?? "").trim();
  const password = (process.env.SMTP_PASS ?? "").trim();
  if (!host || !utente || !password) return null;
  const porta = Number(process.env.SMTP_PORT ?? 587);
  return {
    host,
    porta: Number.isFinite(porta) && porta > 0 ? porta : 587,
    utente,
    password,
    mittente: (process.env.SMTP_FROM ?? "").trim() || utente,
    destinatari: elencoDestinatari(process.env.SMTP_DESTINATARI ?? ""),
  };
}

async function daDatabase(): Promise<ConfigSmtp | null> {
  try {
    const righe = await prisma.impostazione.findMany({
      where: { chiave: { in: Object.values(CHIAVI_SMTP) } },
    });
    const m = new Map(righe.map((r) => [r.chiave, r.valore]));
    const host = m.get(CHIAVI_SMTP.host);
    const utente = m.get(CHIAVI_SMTP.utente);
    const password = m.get(CHIAVI_SMTP.password);
    if (!host || !utente || !password) return null;
    const porta = Number(m.get(CHIAVI_SMTP.porta) ?? 587);
    const mittente = m.get(CHIAVI_SMTP.mittente);
    const destinatari = m.get(CHIAVI_SMTP.destinatari);
    return {
      host: decifra(host),
      porta: Number.isFinite(porta) && porta > 0 ? porta : 587,
      utente: decifra(utente),
      password: decifra(password),
      mittente: mittente ? decifra(mittente) : decifra(utente),
      destinatari: destinatari ? elencoDestinatari(decifra(destinatari)) : [],
    };
  } catch {
    // Database irraggiungibile, oppure righe che non si decifrano (chiave
    // sbagliata o valori manomessi): non si prova a indovinare, la posta
    // risulta non configurata e i pagamenti restano fermi.
    return null;
  }
}

export async function configSmtp(): Promise<ConfigSmtp | null> {
  return daAmbiente() ?? (await daDatabase());
}

export async function postaConfigurata(): Promise<boolean> {
  return (await configSmtp()) != null;
}

/** Quello che la pagina Impostazioni può mostrare. La password non esce mai. */
export async function statoPosta(): Promise<{
  configurata: boolean;
  da: DaDove | null;
  bloccataDallAmbiente: boolean;
  host: string;
  porta: number;
  utente: string;
  mittente: string;
  destinatari: string[];
}> {
  const ambiente = daAmbiente();
  const c = ambiente ?? (await daDatabase());
  return {
    configurata: c != null,
    da: c ? (ambiente ? "ambiente" : "app") : null,
    bloccataDallAmbiente: ambiente != null,
    host: c?.host ?? "",
    porta: c?.porta ?? 587,
    utente: c?.utente ?? "",
    mittente: c?.mittente ?? "",
    destinatari: c?.destinatari ?? [],
  };
}

/**
 * L'elenco delle caselle ammesse è un secondo lucchetto, indipendente da chi è
 * il pagatore: anche se qualcuno riuscisse a spostare `pagatoreEmail` su una
 * persona sua, il codice non partirebbe comunque verso un indirizzo che non è
 * in questo elenco. Vuoto = nessun limite (è il caso di chi configura la posta
 * solo dalle variabili d'ambiente e non imposta SMTP_DESTINATARI).
 */
export function destinatarioAmmesso(a: string, ammessi: string[]): boolean {
  if (!ammessi.length) return true;
  return ammessi.includes(a.trim().toLowerCase());
}

function trasporto(c: ConfigSmtp) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.porta,
    secure: c.porta === 465,
    auth: { user: c.utente, pass: c.password },
  });
}

/**
 * Prova le credenziali contro il server vero, come si fa con le chiavi della
 * banca: si salva solo ciò che funziona, altrimenti si scopre che la posta non
 * parte nel momento peggiore — davanti a una distinta da sbloccare.
 */
export async function provaSmtp(c: ConfigSmtp): Promise<{ ok: true } | { ok: false; errore: string }> {
  try {
    await trasporto(c).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "errore sconosciuto" };
  }
}

/** Scrive la configurazione sul database, cifrata. Il chiamante l'ha già provata. */
export async function salvaConfigSmtp(c: ConfigSmtp): Promise<void> {
  const valori: [string, string][] = [
    [CHIAVI_SMTP.host, cifra(c.host)],
    [CHIAVI_SMTP.porta, String(c.porta)], // non è un segreto e serve leggibile
    [CHIAVI_SMTP.utente, cifra(c.utente)],
    [CHIAVI_SMTP.password, cifra(c.password)],
    [CHIAVI_SMTP.mittente, cifra(c.mittente)],
    // Cifrato come il resto: chi tocca il database può romperlo, non allargarlo.
    [CHIAVI_SMTP.destinatari, cifra(c.destinatari.join(","))],
  ];
  for (const [chiave, valore] of valori) {
    await prisma.impostazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
  }
}

/** Cancella la configurazione salvata nell'app. La posta torna a non partire. */
export async function scollegaPosta(): Promise<void> {
  await prisma.impostazione.deleteMany({ where: { chiave: { in: Object.values(CHIAVI_SMTP) } } });
}

/** Manda l'email. Se non parte, alza: il chiamante deve fermarsi. */
export async function inviaEmail(opzioni: { a: string; oggetto: string; testo: string }): Promise<void> {
  const c = await configSmtp();
  if (!c) {
    throw new Error(
      "Posta non configurata: senza server di posta il codice di pagamento non può essere spedito, quindi nessun pagamento può partire.",
    );
  }
  // Il filtro sta QUI, non nei chiamanti: è l'unico punto da cui esce un'email,
  // e una regola sul destinatario che si può aggirare cambiando chiamante non è
  // una regola. Si fallisce chiusi: se l'indirizzo non è ammesso non si manda,
  // e chi aspettava quel codice non lo riceve.
  if (!destinatarioAmmesso(opzioni.a, c.destinatari)) {
    throw new Error(
      `Questa app può scrivere solo a ${c.destinatari.join(", ")}: l'invio a ${opzioni.a} è stato rifiutato. ` +
        "Se l'indirizzo è legittimo, va aggiunto in Impostazioni → Server di posta.",
    );
  }
  await trasporto(c).sendMail({
    from: c.mittente,
    to: opzioni.a,
    subject: opzioni.oggetto,
    text: opzioni.testo,
  });
}
