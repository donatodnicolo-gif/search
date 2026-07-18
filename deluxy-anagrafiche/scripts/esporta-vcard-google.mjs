// Esporta le anagrafiche attive come vCard 3.0 importabile in Google Contacts
// (contacts.google.com → Importa). Una scheda per anagrafica: insegna = nome,
// ragione sociale = azienda, telefono/email dell'attività o del primo referente,
// indirizzo, etichette "Deluxy" + tipologia, referenti nelle note.
//
// Uso: node scripts/esporta-vcard-google.mjs [percorso-output.vcf]
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const prisma = new PrismaClient();

// Escape dei valori di testo vCard: \ ; , e a-capo
const esc = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const dest = process.argv[2] || "C:/Users/nicol/Downloads/Deluxy-Anagrafiche-Contatti.vcf";

const partner = await prisma.partner.findMany({
  where: { attivo: true },
  include: { contatti: true },
  orderBy: { nome: "asc" },
});

const blocchi = [];
for (const a of partner) {
  const tel = a.telefono || a.contatti.find((c) => c.telefono)?.telefono || "";
  const email = a.email || a.contatti.find((c) => c.email)?.email || "";
  const refTxt = a.contatti
    .map((c) => [c.ruolo, c.nome, c.telefono, c.email].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("; ");
  const note = [
    a.categoria && "Tipologia: " + a.categoria,
    "Stato: " + a.stato,
    a.account && "Account: " + a.account,
    a.interessi.length && "Interessi: " + a.interessi.join(", "),
    refTxt && "Referenti: " + refTxt,
    "Fonte: Deluxy Anagrafiche",
  ]
    .filter(Boolean)
    .join("\n");

  const righe = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:;" + esc(a.nome) + ";;;",
    "FN:" + esc(a.nome),
    "ORG:" + esc(a.ragioneSociale || a.nome),
    tel && "TEL;TYPE=WORK,VOICE:" + esc(tel),
    email && "EMAIL;TYPE=WORK:" + esc(email),
    (a.indirizzo || a.citta) &&
      "ADR;TYPE=WORK:;;" + esc(a.indirizzo || "") + ";" + esc(a.citta || "") + ";" + esc(a.provincia || "") + ";;",
    "CATEGORIES:Deluxy" + (a.categoria ? "," + esc(a.categoria) : ""),
    note && "NOTE:" + esc(note),
    "END:VCARD",
  ].filter(Boolean);
  blocchi.push(righe.join("\r\n"));
}

writeFileSync(dest, blocchi.join("\r\n") + "\r\n", "utf8");

console.log("Scritto:", dest);
console.log(
  "Contatti:", partner.length,
  "| con telefono:", partner.filter((a) => a.telefono || a.contatti.some((c) => c.telefono)).length,
  "| con email:", partner.filter((a) => a.email || a.contatti.some((c) => c.email)).length,
);
console.log("--- esempio (primo blocco):\n" + blocchi[0]);

await prisma.$disconnect();
