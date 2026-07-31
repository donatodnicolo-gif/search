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

// PERCHÉ un IBAN è stato rifiutato, in italiano, con l'eventuale correzione.
//
// «IBAN non valido» non aiuta nessuno: chi lo legge ha appena copiato il codice
// da una fattura o da un messaggio e non sa dove guardare. Il caso di gran
// lunga più frequente è la trascrizione: la lettera **I** al posto della cifra
// **1**, la **O** al posto dello **0** — succede leggendo da un PDF o da una
// foto. Se scambiandole l'IBAN torna valido lo si dice, così si vede subito
// qual era il carattere sbagliato. Non si corregge da soli: su un IBAN si
// propone, non si indovina.
export function diagnosiIban(iban: string): { ok: boolean; motivo?: string; forse?: string } {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (ibanValido(s)) return { ok: true };

  const conCifre = s.replace(/[IO]/g, (c) => (c === "I" ? "1" : "0"));
  const soloTesta =
    s.length >= 4 ? s.slice(0, 2) + s.slice(2, 4).replace(/I/g, "1").replace(/O/g, "0") + s.slice(4) : s;
  const forse = [soloTesta, conCifre].find((x) => x !== s && ibanValido(x));

  let motivo: string;
  if (!/^[A-Z]{2}/.test(s)) {
    motivo = "non inizia con la sigla del paese (per l'Italia «IT»)";
  } else if (!/^[A-Z]{2}\d{2}/.test(s)) {
    motivo = `dopo «${s.slice(0, 2)}» ci vogliono due CIFRE di controllo, qui c'è «${s.slice(2, 4)}»`;
  } else if (!/^[A-Z0-9]+$/.test(s)) {
    motivo = "contiene caratteri che un IBAN non può avere (solo lettere e numeri)";
  } else if (s.startsWith("IT") && s.length !== 27) {
    motivo = `un IBAN italiano ha 27 caratteri, questo ne ha ${s.length}`;
  } else {
    motivo = "il codice di controllo non torna: c'è un carattere sbagliato";
  }
  return { ok: false, motivo, forse };
}
