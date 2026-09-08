// RIEMPIMENTO 08/09/2026 — quali partner hanno DAVVERO una scelta sulla
// compensazione, e quali non l'hanno mai avuta.
//
// Il campo `compensazione` è un booleano che parte da false: finora «No» e
// «nessuno ha mai scelto» erano indistinguibili. La colonna nuova
// `compensazioneDecisa` dice se una persona ha scelto. Qui si accende SOLO dove
// la scelta è DIMOSTRABILE — non si indovina un patto commerciale:
//
//   1. `compensazione = true`. Il valore di partenza è false: un true può
//      esserci arrivato solo dall'import del foglio o dalla mano di qualcuno.
//      In tutti e due i casi è una scelta.
//   2. il nome sta in PARTNER.xlsx con la colonna scritta ESPLICITAMENTE «no»
//      (2 partner su 92: le altre 84 celle erano bianche).
//
// Tutto il resto resta «mai deciso», che è la verità: 29 schede sono nate dopo
// l'import, e per le altre la colonna del foglio era vuota.
//
// Uso: node --env-file=.env scripts/segna-compensazione-decisa.mjs [--esegui]
// Senza --esegui stampa soltanto cosa farebbe.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const p = new PrismaClient();
const ESEGUI = process.argv.includes("--esegui");

const seed = JSON.parse(fs.readFileSync("prisma/seed-data.json", "utf8"));
const chiave = (s) => s.trim().toUpperCase();
const noEsplicito = new Set(seed.partners.filter((x) => x.compensazione === false).map((x) => chiave(x.nome)));

const partners = await p.partner.findMany({ select: { id: true, nome: true, compensazione: true, compensazioneDecisa: true } });
const daSegnare = partners.filter(
  (x) => !x.compensazioneDecisa && (x.compensazione || noEsplicito.has(chiave(x.nome)))
);

console.log(`Partner: ${partners.length}`);
console.log(`Già segnati come decisi: ${partners.filter((x) => x.compensazioneDecisa).length}`);
console.log(`Da segnare adesso: ${daSegnare.length}`);
for (const x of daSegnare) {
  const perche = x.compensazione ? "compensazione accesa (il default è spento: qualcuno ha scelto)" : "«no» scritto esplicitamente in PARTNER.xlsx";
  console.log(`  ${x.nome} → ${x.compensazione ? "SÌ" : "NO"} · ${perche}`);
}
const restano = partners.length - partners.filter((x) => x.compensazioneDecisa).length - daSegnare.length;
console.log(`\nRestano «mai deciso»: ${restano}`);

// Chi, fra i mai decisi, ha vendite vendor: per loro la domanda è VERA e aperta.
const conVendite = new Set((await p.venditaVendor.groupBy({ by: ["partnerId"], _count: true })).map((x) => x.partnerId));
const daDecidere = partners.filter((x) => !x.compensazioneDecisa && !daSegnare.includes(x) && conVendite.has(x.id));
console.log(`  di cui CON vendite vendor, cioè da decidere davvero: ${daDecidere.length}`);
for (const x of daDecidere) console.log(`    ${x.nome}`);

if (!ESEGUI) {
  console.log("\n(prova: niente scritto — rilancia con --esegui)");
} else {
  const r = await p.partner.updateMany({ where: { id: { in: daSegnare.map((x) => x.id) } }, data: { compensazioneDecisa: true } });
  await p.registroModifica.create({
    data: {
      utente: "riempimento 08/09/2026",
      azione: `Compensazione: segnati come DECISI ${r.count} partner; ${restano} restano «mai deciso»`,
      categoria: "partner",
      dettaglio:
        `La scelta è dimostrabile solo dove il flag era acceso (il default è spento) o dove PARTNER.xlsx scriveva «no» esplicito. ` +
        `Da decidere davvero (mai scelto E con vendite vendor): ${daDecidere.map((x) => x.nome).join(", ") || "nessuno"}.`,
    },
  });
  console.log(`\nFATTO: segnati ${r.count}.`);
}
await p.$disconnect();
