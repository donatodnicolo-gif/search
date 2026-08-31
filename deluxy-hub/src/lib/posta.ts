import nodemailer from "nodemailer";
import { prisma } from "./db";
import { decifra } from "./cifratura";

// Posta in uscita del portale (per ora: il riepilogo presenze del Cartellino).
// Le credenziali si prendono da due posti, in quest'ordine:
//
//  1. **Le variabili d'ambiente** SMTP_HOST/PORT/USER/PASS/FROM — come nelle
//     altre app Deluxy (deluxy-transactions, deluxy-partner). L'ambiente vince
//     sempre: un'installazione già configurata su Vercel non si scavalca da una
//     pagina web.
//  2. **La cassaforte del Hub** (`/chiavi`, progetto `hub`), dove l'admin può
//     scrivere gli stessi nomi senza toccare Vercel né riavviare niente. È il
//     motivo per cui la cassaforte esiste: i segreti stanno lì, cifrati, e nessuno
//     deve passarli a mano da un'altra parte.
//
// Se non c'è né l'una né l'altra, la posta non parte e lo si dice chiaro: meglio
// un "non configurata" che un invio finto.

export const NOMI_CHIAVI = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;

export type ConfigPosta = {
  host: string;
  porta: number;
  utente: string;
  password: string;
  mittente: string;
  origine: "ambiente" | "cassaforte";
};

function porta(valore: string | undefined): number {
  const n = Number((valore ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 587;
}

function daAmbiente(): ConfigPosta | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const utente = (process.env.SMTP_USER ?? "").trim();
  const password = (process.env.SMTP_PASS ?? "").trim();
  if (!host || !utente || !password) return null;
  return {
    host,
    porta: porta(process.env.SMTP_PORT),
    utente,
    password,
    mittente: (process.env.SMTP_FROM ?? "").trim() || utente,
    origine: "ambiente",
  };
}

async function daCassaforte(): Promise<ConfigPosta | null> {
  const righe = await prisma.chiave.findMany({
    where: { progetto: "hub", nome: { in: [...NOMI_CHIAVI] } },
    select: { nome: true, valoreCifrato: true },
  });
  if (righe.length === 0) return null;

  const valori: Record<string, string> = {};
  for (const r of righe) {
    try {
      valori[r.nome] = decifra(r.valoreCifrato);
    } catch {
      // Chiave illeggibile (segreto di cifratura cambiato): vale come assente.
    }
  }

  const host = (valori.SMTP_HOST ?? "").trim();
  const utente = (valori.SMTP_USER ?? "").trim();
  const password = (valori.SMTP_PASS ?? "").trim();
  if (!host || !utente || !password) return null;

  return {
    host,
    porta: porta(valori.SMTP_PORT),
    utente,
    password,
    mittente: (valori.SMTP_FROM ?? "").trim() || utente,
    origine: "cassaforte",
  };
}

export async function configPosta(): Promise<ConfigPosta | null> {
  return daAmbiente() ?? (await daCassaforte());
}

// Serve alle pagine per dire "la posta è pronta" (o spiegare cosa manca) senza
// mai far uscire host, utente o password.
export async function statoPosta(): Promise<
  { pronta: false } | { pronta: true; origine: ConfigPosta["origine"]; mittente: string }
> {
  const c = await configPosta();
  return c ? { pronta: true, origine: c.origine, mittente: c.mittente } : { pronta: false };
}

// Un indirizzo scritto a mano: controllo minimo, giusto per non provare a
// spedire a "asd". La verità la dirà comunque il server di posta.
export function emailValida(a: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.trim());
}

export async function mandaEmail(opzioni: {
  a: string;
  oggetto: string;
  testo: string;
  html?: string;
}): Promise<void> {
  const c = await configPosta();
  if (!c) {
    throw new Error(
      "Posta non configurata: imposta SMTP_HOST, SMTP_USER e SMTP_PASS nell'ambiente oppure nella cassaforte /chiavi (progetto «hub»).",
    );
  }

  const trasporto = nodemailer.createTransport({
    host: c.host,
    port: c.porta,
    secure: c.porta === 465, // 465 = TLS diretto; 587 = STARTTLS, che nodemailer negozia da sé
    auth: { user: c.utente, pass: c.password },
  });

  await trasporto.sendMail({
    from: c.mittente,
    to: opzioni.a,
    subject: opzioni.oggetto,
    text: opzioni.testo,
    html: opzioni.html,
  });
}

/**
 * Prova il collegamento col server di posta SENZA spedire niente: si collega,
 * negozia il TLS e **autentica**. È la verifica che dice se host, porta,
 * casella e password sono giusti, e si può fare quante volte si vuole senza
 * mandare un messaggio a nessuno.
 *
 * Serve perché «configurata» e «funzionante» sono due cose diverse: le cinque
 * righe possono esserci tutte e il server rifiutare comunque le credenziali.
 */
export async function provaCollegamento(): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const c = await configPosta();
  if (!c) return { ok: false, motivo: "La posta non è configurata." };

  const trasporto = nodemailer.createTransport({
    host: c.host,
    port: c.porta,
    secure: c.porta === 465,
    auth: { user: c.utente, pass: c.password },
  });

  try {
    await trasporto.verify();
    return { ok: true };
  } catch (e) {
    // Il motivo del server si mostra all'admin: «non funziona» senza spiegazione
    // manda a indovinare. Non contiene la password.
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 300) : "errore sconosciuto" };
  }
}
