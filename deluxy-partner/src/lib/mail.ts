import nodemailer from "nodemailer";
import { prisma } from "./db";
import { CHIAVI } from "./impostazioni";

// Invio email via SMTP. La configurazione si fa dalla pagina Impostazioni
// (sezione "Email solleciti", salvata nel database); in mancanza valgono le
// variabili d'ambiente SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM.
//
// Con una casella Register.it del dominio: host authmail.register.it,
// porta 587 (o 465 SSL), utente = indirizzo email completo.

export type ConfigSmtp = {
  host?: string;
  port: number;
  user?: string;
  pass?: string;
  from?: string;
};

export async function configSmtp(): Promise<ConfigSmtp> {
  const righe = await prisma.impostazione.findMany({
    where: { chiave: { startsWith: "smtp." } },
  });
  const m = Object.fromEntries(righe.map((r) => [r.chiave, r.valore]));
  const host = m[CHIAVI.smtpHost] || process.env.SMTP_HOST;
  const port = parseInt(m[CHIAVI.smtpPort] || process.env.SMTP_PORT || "587");
  const user = m[CHIAVI.smtpUser] || process.env.SMTP_USER;
  const pass = m[CHIAVI.smtpPass] || process.env.SMTP_PASS;
  const from = m[CHIAVI.smtpFrom] || process.env.SMTP_FROM || user;
  return { host, port, user, pass, from };
}

export async function smtpConfigurato(): Promise<boolean> {
  const c = await configSmtp();
  return Boolean(c.host && c.user && c.pass);
}

export async function inviaEmail(opts: { to: string; subject: string; text: string }) {
  const c = await configSmtp();
  if (!c.host || !c.user || !c.pass) {
    throw new Error(
      "SMTP non configurato: compila la sezione Email solleciti in Impostazioni."
    );
  }
  const transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
  });
  await transporter.sendMail({
    from: c.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  });
}
