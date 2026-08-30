// BUDGET = CONSUNTIVO sui mesi chiusi rimasti a zero (30/08/2026, decisione
// dell'utente: «budget metti uguale a consuntivo», confermata con «si procedi»).
//
// Il caso che lo motiva è il punto aperto n.2 dell'handoff: il budget D2C di
// Deluxy.it era a ZERO da gennaio a giugno contro ~453.000 € venduti davvero —
// e finché mancava, ogni percentuale di realizzazione del periodo era
// illeggibile (la pagina mostrava «manca Gen, Feb, …» al posto del numero).
//
// Cosa fa, e i tre paletti che NON scavalca:
//   1. tocca solo i mesi CHIUSI (il mese in corso è a metà: un budget scritto
//      su mezzo mese direbbe 100% per costruzione);
//   2. tocca solo le caselle dove il budget D2C è a zero SU TUTTE LE FONTI
//      (dove un budget c'è, resta: sovrascrivere pianificazione vera per far
//      tornare le percentuali sarebbe cancellare dati reali);
//   3. scrive `fonte = "iniziale"`: se domani una proposta ADV o commerciale
//      parla su quella casella, la sostituisce — come per ogni altro budget.
//
// Il valore è il venduto VERO del mese dal registro ordini (Orders), arrotondato
// all'euro. Su un mese chiuso «budget = consuntivo» significa realizzato 100%:
// è il senso della decisione — quei mesi non hanno mai avuto un piano, e un
// piano inventato a posteriori diverso dal reale mentirebbe due volte.
//
// Uso:
//   npx tsx@4 --env-file=.env scripts/budget-da-consuntivo.mts          → prova a vuoto
//   npx tsx@4 --env-file=.env scripts/budget-da-consuntivo.mts scrivi   → applica

import { prisma } from "../src/lib/db";
import { caricaAnno, ANNO_CORRENTE } from "../src/lib/calc";
import { caricaVenduto } from "../src/lib/venduto";

const SCRIVI = process.argv.includes("scrivi");
const SLUG_D2C = "D2C";

const oggi = new Date();
const meseInCorso = oggi.getUTCFullYear() === ANNO_CORRENTE ? oggi.getUTCMonth() + 1 : 13;
const mesiChiusi = Array.from({ length: Math.max(0, meseInCorso - 1) }, (_, i) => i + 1);

const dati = await caricaAnno(ANNO_CORRENTE);
const venduto = await caricaVenduto(ANNO_CORRENTE, dati.maisons);
if (!venduto.ok) {
  console.error("Orders non risponde:", venduto.errore, "— senza il venduto non si scrive niente.");
  process.exit(1);
}

let daScrivere: { maisonId: string; nome: string; month: number; valore: number }[] = [];
for (const m of dati.maisons) {
  const mesiNegozio = venduto.perMaison.get(m.slug);
  if (!mesiNegozio) continue; // niente negozio → niente D2C da pareggiare
  for (const month of mesiChiusi) {
    const dm = m.mesi.find((x) => x.month === month);
    const budget = dm?.vendite[SLUG_D2C] ?? 0;
    if (budget > 0) continue; // un budget c'è: non si tocca
    const vend = Math.round(mesiNegozio[month - 1] ?? 0);
    if (vend <= 0) continue; // niente venduto: uno zero resta uno zero onesto
    daScrivere.push({ maisonId: m.id, nome: m.nome, month, valore: vend });
  }
}

console.log(`mesi chiusi: 1–${mesiChiusi.length} · caselle da riempire: ${daScrivere.length}`);
for (const r of daScrivere)
  console.log(`  ${r.nome} · mese ${r.month} → ${r.valore.toLocaleString("it-IT", { useGrouping: "always" })} €`);
const tot = daScrivere.reduce((s, r) => s + r.valore, 0);
console.log(`totale: ${tot.toLocaleString("it-IT", { useGrouping: "always" })} €`);

if (!SCRIVI) {
  console.log("\n(prova a vuoto: niente scritto — rilancia con «scrivi»)");
  await prisma.$disconnect();
  process.exit(0);
}

for (const r of daScrivere) {
  await prisma.budgetEntry.upsert({
    where: {
      year_maisonId_month_canale_fonte: {
        year: ANNO_CORRENTE,
        maisonId: r.maisonId,
        month: r.month,
        canale: SLUG_D2C,
        fonte: "iniziale",
      },
    },
    create: { year: ANNO_CORRENTE, maisonId: r.maisonId, month: r.month, canale: SLUG_D2C, fonte: "iniziale", vendite: r.valore },
    // update solo se la casella era a zero: il filtro sopra l'ha già garantito
    // (budget totale del canale = 0 ⇒ anche l'iniziale è 0), quindi qui non si
    // sovrascrive mai un numero vero.
    update: { vendite: r.valore },
  });
}
console.log(`\nSCRITTO: ${daScrivere.length} caselle.`);
await prisma.$disconnect();
