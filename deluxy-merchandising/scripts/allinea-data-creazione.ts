// **La data di creazione è una sola.**
//
// Chiesto dall'utente l'08/09/2026: «il valore in tabella ultimo creato è quello
// della nostra app (quindi valgono anche i prodotti in concept); per quelli che
// erano già esistenti riempi questo dato con quello di shopify».
//
// Prima c'erano due date e la tabella sceglieva: `creatoIlShopify` se c'era,
// altrimenti `creatoIl`. Il difetto è che **i prodotti nati qui non hanno la
// data di Shopify**, quindi ordinando per «creato» finivano tutti in fondo — e
// un Concept appena creato spariva in coda a 5.000 righe.
//
// Il rimedio è togliere la scelta: `creatoIl` diventa l'unica data, e per i
// prodotti che venivano da Shopify si riempie con la data vera del negozio.
// `creatoIlShopify` resta dov'è: è il fatto letto dal negozio, e non si
// cancella un dato per averne fatto una copia.
//
// ⚠️ Si scrive solo dove le due date **differiscono di più di un minuto**: sui
// prodotti creati qui e già allineati non c'è niente da fare, e riscriverli
// vorrebbe dire toccare migliaia di righe per nulla.
//
//   npx tsx scripts/allinea-data-creazione.ts            # prova, non scrive
//   npx tsx scripts/allinea-data-creazione.ts --applica

import { caricaEnv } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const righe = await prisma.prodotto.findMany({
    where: { creatoIlShopify: { not: null } },
    select: { id: true, codice: true, nome: true, creatoIl: true, creatoIlShopify: true },
  });
  const totale = await prisma.prodotto.count();
  const senzaShopify = totale - righe.length;

  const daFare = righe.filter((r) => {
    if (!r.creatoIlShopify) return false;
    return Math.abs(r.creatoIl.getTime() - r.creatoIlShopify.getTime()) > 60_000;
  });

  console.log([
    `Prodotti in tutto              ${String(totale).padStart(6)}`,
    `  con la data di Shopify       ${String(righe.length).padStart(6)}`,
    `  nati qui (resta la loro)     ${String(senzaShopify).padStart(6)}`,
    `  già allineati                ${String(righe.length - daFare.length).padStart(6)}`,
    "  ------------------------------------",
    `  DA RIPORTARE ALLA DATA VERA  ${String(daFare.length).padStart(6)}`,
  ].join("\n"));

  const campione = daFare.slice(0, 6);
  if (campione.length) {
    console.log("\n  campione (da → a):");
    for (const r of campione) {
      console.log(`   ${(r.codice ?? "").padEnd(14)} ${r.nome.slice(0, 30).padEnd(30)} ${r.creatoIl.toISOString().slice(0, 10)} → ${r.creatoIlShopify?.toISOString().slice(0, 10)}`);
    }
  }
  const piuVecchia = daFare.reduce<Date | null>((a, r) => (r.creatoIlShopify && (!a || r.creatoIlShopify < a) ? r.creatoIlShopify : a), null);
  if (piuVecchia) console.log(`\n  la più vecchia che rientra: ${piuVecchia.toISOString().slice(0, 10)}`);

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }
  // ⚠️ **Un aggiornamento solo, non 3.657.** Riga per riga sarebbero altrettanti
  // giri sul pooler condiviso da quattordici app — mezz'ora di connessioni per
  // una copia di colonna che il database fa in un colpo. La condizione è la
  // stessa contata qui sopra, così il numero annunciato e quello scritto
  // coincidono.
  const n = await prisma.$executeRaw`
    UPDATE "merchandising"."Prodotto"
       SET "creatoIl" = "creatoIlShopify"
     WHERE "creatoIlShopify" IS NOT NULL
       AND ABS(EXTRACT(EPOCH FROM ("creatoIl" - "creatoIlShopify"))) > 60`;
  console.log(`\nAllineati ${n} prodotti (atteso ${daFare.length}).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
