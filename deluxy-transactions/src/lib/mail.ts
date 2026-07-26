import nodemailer from "nodemailer";

// Invio email. Serve a una cosa sola: recapitare al pagatore il codice che
// sblocca l'uscita di denaro.
//
// A differenza di deluxy-partner, qui la configurazione SMTP NON sta sul
// database ma solo nelle variabili d'ambiente (SMTP_HOST / SMTP_PORT /
// SMTP_USER / SMTP_PASS / SMTP_FROM). Motivo: chi entrasse nel database
// potrebbe altrimenti cambiare il server di posta e dirottare i codici su una
// casella sua. Le variabili d'ambiente si cambiano solo su Vercel.
//
// Regola non negoziabile: se l'email non parte, il codice non esiste e il
// pagamento non si sblocca. Si fallisce chiusi, mai aperti.

export type ConfigSmtp = { host: string; porta: number; utente: string; password: string; mittente: string };

export function configSmtp(): ConfigSmtp | null {
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
  };
}

export function postaConfigurata(): boolean {
  return configSmtp() != null;
}

/** Manda l'email. Se non parte, alza: il chiamante deve fermarsi. */
export async function inviaEmail(opzioni: { a: string; oggetto: string; testo: string }): Promise<void> {
  const c = configSmtp();
  if (!c) {
    throw new Error(
      "Posta non configurata: senza SMTP_HOST / SMTP_USER / SMTP_PASS il codice di pagamento non può essere spedito, quindi nessun pagamento può partire.",
    );
  }
  const trasporto = nodemailer.createTransport({
    host: c.host,
    port: c.porta,
    secure: c.porta === 465,
    auth: { user: c.utente, pass: c.password },
  });
  await trasporto.sendMail({
    from: c.mittente,
    to: opzioni.a,
    subject: opzioni.oggetto,
    text: opzioni.testo,
  });
}
