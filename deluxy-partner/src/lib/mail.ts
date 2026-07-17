import nodemailer from "nodemailer";

// Invio email via SMTP. Configurazione tramite variabili d'ambiente:
//   SMTP_HOST, SMTP_PORT (587 default), SMTP_USER, SMTP_PASS,
//   SMTP_FROM (default: SMTP_USER, es. "Deluxy <amministrazione@deluxy.it>")
// Con Gmail: host smtp.gmail.com, porta 587, e una "password per le app"
// (myaccount.google.com/apppasswords), NON la password normale.

export function smtpConfigurato(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function inviaEmail(opts: { to: string; subject: string; text: string }) {
  if (!smtpConfigurato()) {
    throw new Error(
      "SMTP non configurato: impostare SMTP_HOST, SMTP_USER e SMTP_PASS (vedi pagina Impostazioni)."
    );
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  });
}
