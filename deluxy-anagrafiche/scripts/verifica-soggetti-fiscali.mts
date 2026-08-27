// Parità fra il modello VECCHIO e quello NUOVO della fatturazione.
//
// Il 27/08/2026 i dati fiscali sono passati dal record-SEDE al SOGGETTO
// FISCALE (`SoggettoFiscale`). Le colonne vecchie sono ancora **nel database**
// — l'app non le vede più, nessuno le legge e nessuno le scrive — e restano
// come rete di sicurezza finché questa verifica non è stata rifatta in
// produzione. ⚠️ Quando si decide di cancellarle, si lancia PRIMA questo.
//
//   npx tsx scripts/verifica-soggetti-fiscali.mts
//
// Esce 1 se anche un solo valore che stava sulla sede non si ritrova sul suo
// soggetto: allora le colonne NON si cancellano.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { CAMPI_SOGGETTO } from "../src/lib/soggetto-fiscale";

// ⚠️ Lettura grezza: le colonne non esistono più nel modello Prisma, quindi
// l'unico modo di rileggerle è il SQL — con lo schema qualificato, che sul
// cluster condiviso senza prefisso si finisce nella tabella di un'altra app.
const colonne = CAMPI_SOGGETTO.map((c) => `"${c}"`).join(", ");
const vecchi = await prisma.$queryRawUnsafe<Record<string, string | null>[]>(
  `select "id", "nome", ${colonne} from "anagrafiche"."Partner" where "attivo" = true`,
);
const nuovi = await prisma.partner.findMany({ where: { attivo: true }, include: { soggettoFiscale: true } });
const perId = new Map(nuovi.map((p) => [p.id, p]));

let persi = 0, diversi = 0, senzaSoggetto = 0;
for (const v of vecchi) {
  const compilati = CAMPI_SOGGETTO.filter((c) => v[c]);
  if (!compilati.length) continue;
  const p = perId.get(v.id as string);
  const s = p?.soggettoFiscale;
  if (!s) { senzaSoggetto++; console.log(`  SENZA SOGGETTO  «${v.nome}» aveva ${compilati.join(", ")}`); continue; }
  for (const c of compilati) {
    if (!s[c]) { persi++; console.log(`  PERSO    «${v.nome}».${c} = «${v[c]}»`); }
    else if (s[c] !== v[c]) { diversi++; console.log(`  DIVERSO  «${v.nome}».${c}: sede «${v[c]}» ≠ soggetto «${s[c]}»`); }
  }
}

const sog = await prisma.soggettoFiscale.findMany({ include: { _count: { select: { sedi: true } } } });
console.log(`\nanagrafiche vive: ${nuovi.length}   collegate a un soggetto: ${nuovi.filter((p) => p.soggettoFiscaleId).length}`);
console.log(`soggetti fiscali: ${sog.length}   con più di una sede: ${sog.filter((s) => s._count.sedi > 1).map((s) => `${s.ragioneSociale} (${s._count.sedi})`).join(", ") || "nessuno"}`);
console.log(`soggetti senza nessuna sede (rumore da ripulire): ${sog.filter((s) => s._count.sedi === 0).length}`);
console.log(`\nvalori persi: ${persi}   valori diversi: ${diversi}   sedi con dati vecchi e nessun soggetto: ${senzaSoggetto}`);
console.log(persi || diversi || senzaSoggetto ? "\n⚠️ NON cancellare le colonne vecchie." : "\nParità piena: le colonne vecchie si possono cancellare.");
await prisma.$disconnect();
process.exit(persi || diversi || senzaSoggetto ? 1 : 0);
