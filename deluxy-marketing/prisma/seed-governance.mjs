// Precarica cadenze ricorrenti e occasioni del gifting dai Definitivi.
// Idempotente (upsert su chiavi naturali). Fonti: doc 5 §8.1, doc 10 §7,
// doc 8.2 §3.1, ISTRUZIONI PROGETTO.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CADENZE = [
  { nome: "Checkpoint settimanale del lunedì", frequenza: "settimanale", fonte: "doc 10 §7", checklist: "Stato azioni aggiornato (obiettivo 80%) · pacing spesa vs budget ±15% · revisione flag TRAINO · tabella alert A5 · igiene Google Ads 20 minuti" },
  { nome: "Refresh esclusioni acquirenti recenti", frequenza: "settimanale", fonte: "doc 5 §8.1", checklist: "Esclusioni acquirenti 30gg · ATC 14gg · controllo match rate" },
  { nome: "Refresh seed Lookalike VIP/Champions", frequenza: "bisettimanale", fonte: "doc 5 §8.1", checklist: "Re-export seed · verifica dimensione ≥100 stesso paese" },
  { nome: "Re-upload Customer Match (recency 540gg)", frequenza: "mensile", fonte: "doc 5 §8.1", checklist: "Re-export liste · hashing SHA-256 · upload Google/Meta · voce nel registro CRM" },
  { nome: "Manutenzione mensile sistema esperto ADV", frequenza: "mensile", fonte: "ISTRUZIONI PROGETTO (1° del mese)", checklist: "Consolidamento APPEND · revisione Cestino Drive · SYNC-MEMORIE · voci 00.3 obsolete → Storico" },
  { nome: "Ricalcolo RFM e verifica soglie pubblici", frequenza: "trimestrale", fonte: "doc 5 §8.1", checklist: "Ricalcolo RFM · test % lookalike · verifica life events in Ads Manager" },
  { nome: "Purge dati oltre 540 giorni", frequenza: "annuale", fonte: "doc 5 §8.1", checklist: "Eliminare export scaduti · verificare retention Customer Match" },
];

// Occasioni del gifting (doc 8.2 §3.1 + doc 4 §2.2). Prossime ricorrenze.
const OCCASIONI = [
  { nome: "Natale", data: "2026-12-25", brand: "cross", note: "Picco massimo del gifting. Niente nuovi tCPA in finestra (doc 4 §2.2)." },
  { nome: "San Valentino", data: "2027-02-14", brand: "cross", note: "Mai attivare un tCPA nel picco (doc 4 §2.2). Budget concentrato 1-14 febbraio." },
  { nome: "Festa della donna (8 marzo)", data: "2027-03-08", brand: "flowers", note: "Picco fiori: mimose e bouquet." },
  { nome: "Festa della mamma", data: "2027-05-09", brand: "cross", note: "Mai attivare un tCPA nel picco (doc 4 §2.2)." },
];

let nc = 0;
for (const c of CADENZE) {
  await prisma.cadenza.upsert({ where: { nome: c.nome }, create: c, update: { frequenza: c.frequenza, checklist: c.checklist, fonte: c.fonte } });
  nc++;
}
let no = 0;
for (const o of OCCASIONI) {
  const data = new Date(o.data);
  await prisma.occasione.upsert({
    where: { nome_data: { nome: o.nome, data } },
    create: { nome: o.nome, data, brand: o.brand, note: o.note },
    update: { brand: o.brand, note: o.note },
  });
  no++;
}
await prisma.registroEvento.create({
  data: { autore: "import", tipo: "import", entita: "cadenza", titolo: "Precaricate cadenze e occasioni dai Definitivi", dettaglio: `${nc} cadenze · ${no} occasioni` },
});
console.log(`Governance: ${nc} cadenze · ${no} occasioni`);
await prisma.$disconnect();
