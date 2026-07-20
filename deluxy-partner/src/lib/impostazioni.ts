import { prisma } from "./db";

// Chiavi note delle impostazioni
export const CHIAVI = {
  ordinanteNome: "sepa.ordinante.nome",
  ordinanteIban: "sepa.ordinante.iban",
  ordinanteBic: "sepa.ordinante.bic",
  // Intestazione dei documenti emessi (pro-forma): dati mittente
  aziendaIntestazione: "azienda.intestazione",
  aziendaIndirizzo: "azienda.indirizzo",
  aziendaPiva: "azienda.piva",
  aziendaContatti: "azienda.contatti",
  // SMTP per invio solleciti (es. casella Register.it del dominio)
  smtpHost: "smtp.host",
  smtpPort: "smtp.port",
  smtpUser: "smtp.user",
  smtpPass: "smtp.pass",
  smtpFrom: "smtp.from",
} as const;

export async function leggiImpostazioni(): Promise<Record<string, string>> {
  const righe = await prisma.impostazione.findMany();
  return Object.fromEntries(righe.map((r) => [r.chiave, r.valore]));
}

export async function salvaImpostazione(chiave: string, valore: string) {
  if (valore.trim() === "") {
    await prisma.impostazione.deleteMany({ where: { chiave } });
    return;
  }
  await prisma.impostazione.upsert({
    where: { chiave },
    create: { chiave, valore: valore.trim() },
    update: { valore: valore.trim() },
  });
}

export function ibanValido(iban: string): boolean {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  // controllo mod-97 (ISO 13616)
  const r = s.slice(4) + s.slice(0, 4);
  let resto = 0;
  for (const ch of r) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) resto = (resto * 10 + +d) % 97;
  }
  return resto === 1;
}
