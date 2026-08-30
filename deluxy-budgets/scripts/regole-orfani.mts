// LE REGOLE CHE ADOTTANO I 228 ORFANI (30/08/2026).
//
// Il 27/08, riclassificando in Finance, sono saltati fuori 228 movimenti per
// 176.891 € (34 controparti, tutti ≤2025) con una categoria che nessuna regola
// giustificava più: finché restavano così, «↻ Riclassifica tutto» in Finance
// li avrebbe SPOGLIATI — 176.891 € di costi fuori dal conto economico di anni
// chiusi. La causa non era la categoria ma la GRAFIA: regole a match esatto
// contro controparti scritte in più modi («Gente & moda srl» / «GENTE E MODA
// SRL», «Freeze» con lo spazio davanti, «Filippo Airoldi» / «filippo airoldi»).
//
// Queste 26 regole (a «contiene», che assorbe le grafie) codificano la
// categoria che i movimenti hanno GIÀ, tranne tre correzioni decise
// dall'utente il 30/08:
//   · MARCOPOLO SRL: era «Materiali per gli ordini» [COGS], ma era un PARTNER
//     («Saldo fatture e vendite — ns commissioni») → Partner che eseguono gli
//     ordini [ESCLUSA]: 2.926 € escono dal COGS 2023–24;
//   · GREEN CLICK MEDIA e ZOÈ COMUNICAZIONE: agenzie media, non consulenti
//     → Pubblicità (4.526 + 3.395 €).
// Le altre conferme dell'utente: calcagni cristian = consegne come Di Marco;
// Madami = colazioni come Martesana (partner); Ciardo = dipendente;
// Rossella = prestito (resta ESCLUSA in Banca e giroconti — la regola prende
// anche i 278 € di «Servizi» della stessa controparte, accettato).
//
// ✅ SIMULATO PRIMA DI SCRIVERE (30/08, dal motore vero di Finance): con
// queste regole cambiano ESATTAMENTE 228 movimenti — i 228 orfani — e nessun
// altro dei 13.626. Zero catture collaterali (il rischio era una regola corta:
// «gente» avrebbe matchato anche «AGENTE…»; per questo i match sono lunghi).
//
// ⚠️ Le regole da sole NON muovono il conto economico: la categoria del
// movimento la decide Finance. Dopo averle scritte va premuto
// «↻ Riclassifica tutto» in /spese di Finance — che ora è innocuo, perché
// ogni orfano ha una regola che lo riconosce.
//
// Uso (idempotente: le regole già presenti si saltano):
//   npx tsx@4 --env-file=.env scripts/regole-orfani.mts

import { prisma } from "../src/lib/db";

const NUOVE: [string, string][] = [
  ["calcagni cristian", "Consegne (valet e corrieri)"],
  ["gianluca di marco", "Consegne (valet e corrieri)"],
  ["benfante piera monica", "Consegne (valet e corrieri)"],
  ["francesco lo gullo", "Consegne (valet e corrieri)"],
  ["lacerenza rosa", "Consegne (valet e corrieri)"],
  ["debora anzilli", "Consegne (valet e corrieri)"],
  ["davide airoldi", "Consegne (valet e corrieri)"],
  ["filippo airoldi", "Consegne (valet e corrieri)"],
  ["rachele zambon", "Consegne (valet e corrieri)"],
  ["pittui andrea", "Consegne (valet e corrieri)"],
  ["bagnato sabrina", "Consegne (valet e corrieri)"],
  ["martesana", "Partner che eseguono gli ordini"],
  ["madami catering", "Partner che eseguono gli ordini"],
  ["marcopolo srl", "Partner che eseguono gli ordini"],
  ["italia daniela ciardo", "Stipendi dei dipendenti"],
  ["samuele tagliaferri", "Stipendi dei dipendenti"],
  ["afol metropolitana", "Stipendi dei dipendenti"],
  ["donato giacomina rossella", "Banca e giroconti"],
  ["freeze s.a.s. di patruno", "Pubblicità"],
  ["green click media", "Pubblicità"],
  ["zoè comunicazione", "Pubblicità"],
  ["gente e moda", "Struttura e servizi fissi"],
  ["gente & moda", "Struttura e servizi fissi"],
  ["komete srl", "Sviluppo su commessa"],
  ["enderlin veronique", "Consulenti esterni"],
  ["branca giuseppe", "Consulenti esterni"],
];

const categorie = await prisma.categoriaCosto.findMany({
  select: { id: true, nome: true, regole: { select: { match: true } } },
});
const perNome = new Map(categorie.map((c) => [c.nome, c]));
let scritte = 0;
let saltate = 0;
for (const [match, nome] of NUOVE) {
  const cat = perNome.get(nome);
  if (!cat) {
    // Meglio fermarsi: una categoria rinominata vorrebbe dire regole scritte
    // verso il nulla, e l'errore si vedrebbe solo alla prossima riclassifica.
    console.error(`CATEGORIA MANCANTE: «${nome}» — niente è stato scritto oltre questo punto.`);
    process.exit(1);
  }
  if (cat.regole.some((r) => r.match.trim().toLowerCase() === match)) {
    console.log(`già presente: ${match}`);
    saltate++;
    continue;
  }
  await prisma.regolaCosto.create({ data: { match, esatto: false, categoriaId: cat.id } });
  console.log(`scritta: «${match}» → ${nome}`);
  scritte++;
}
console.log(`\n${scritte} regole scritte, ${saltate} saltate.`);
console.log("Ora: «↻ Riclassifica tutto» in /spese di Finance.");
await prisma.$disconnect();
