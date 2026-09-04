// LE FATTURE DI FINANCE SENZA UN DOCUMENTO SU FATTURE IN CLOUD — e il
// tentativo di riconciliarle con FIC (04/09/2026, chiesto dall'utente).
//
// Per ogni riga senza numero cerca su FIC una fattura che possa essere la sua:
//   1. stesso CLIENTE (nomi riconciliati del partner + il suo nome)
//   2. stesso IMPORTO netto (±0,02) — il criterio forte
//   3. stesso PERIODO: emessa nel mese di competenza o nei due successivi
// Stampa una tabella: quando un candidato c'è, la riga non è persa — le manca
// solo il numero; quando non c'è, la fattura non è mai stata emessa.
//
// Non scrive NIENTE: è un censimento.
// Uso: npx tsx scripts/fatture-senza-documento.mts [--tutte]
//   senza flag: solo le righe che la scheda partner tiene fuori davvero;
//   --tutte: TUTTE quelle senza un numero, compreso lo storico del vecchio
//   foglio (che oggi è un'eccezione dichiarata in `fattura-vera.ts`).
import { PrismaClient } from "@prisma/client";
import { ficFatture } from "../src/lib/fic";
import { eFatturaVera } from "../src/lib/fattura-vera";
import { nomiFicDelPartner, nomiCoincidono } from "../src/lib/fic-partner";

const p = new PrismaClient();

const TUTTE = process.argv.includes("--tutte");
const righe = (
  await p.fatturaServizio.findMany({
    include: { partner: { select: { id: true, nome: true } }, tipologia: { select: { nome: true } } },
    orderBy: [{ anno: "asc" }, { mese: "asc" }],
  })
).filter((f) => (TUTTE ? !(f.numero && /\d/.test(f.numero)) : !eFatturaVera(f)));

console.log(`Righe senza documento: ${righe.length}\n`);

// le fatture emesse su FIC degli anni che servono
const anni = [...new Set(righe.map((r) => r.anno))];
const ficPerAnno = new Map<number, Awaited<ReturnType<typeof ficFatture>>>();
for (const a of anni) {
  ficPerAnno.set(a, await ficFatture({ anno: a }));
  console.log(`FIC ${a}: ${ficPerAnno.get(a)!.length} fatture emesse`);
}
// l'anno dopo serve per le fatture emesse a gennaio su competenza dicembre
for (const a of anni) {
  if (!ficPerAnno.has(a + 1)) {
    ficPerAnno.set(a + 1, await ficFatture({ anno: a + 1 }));
    console.log(`FIC ${a + 1}: ${ficPerAnno.get(a + 1)!.length} fatture emesse`);
  }
}

const nomiCache = new Map<string, string[]>();
async function nomi(partnerId: string, partnerNome: string) {
  if (!nomiCache.has(partnerId)) nomiCache.set(partnerId, await nomiFicDelPartner(partnerId, partnerNome));
  return nomiCache.get(partnerId)!;
}

console.log("\n| anno-mese | partner | imponibile | descrizione | candidato su FIC |");
console.log("|---|---|---|---|---|");

let conCandidato = 0;
for (const f of righe) {
  const nomiP = await nomi(f.partner.id, f.partner.nome);
  const universo = [...(ficPerAnno.get(f.anno) ?? []), ...(ficPerAnno.get(f.anno + 1) ?? [])];
  const suoi = universo.filter((d) => nomiCoincidono(d.cliente ?? "", nomiP));
  const stessoImporto = suoi.filter((d) => Math.abs((d.imponibile ?? 0) - f.imponibile) < 0.02);
  const nellaFinestra = stessoImporto.filter((d) => {
    const m = Number((d.data ?? "").slice(5, 7));
    const a = Number((d.data ?? "").slice(0, 4));
    const distanza = (a - f.anno) * 12 + (m - f.mese);
    return distanza >= 0 && distanza <= 2;
  });
  const scelti = nellaFinestra.length ? nellaFinestra : stessoImporto;
  if (scelti.length) conCandidato++;
  const candidato = scelti.length
    ? scelti.map((d) => `${d.numero} del ${d.data} (${d.imponibile} netto)`).join(" · ")
    : suoi.length
      ? `nessuna con questo importo — su FIC quel cliente ha ${suoi.length} fatture`
      : "nessuna fattura su FIC per questo cliente";
  console.log(
    `| ${f.anno}-${String(f.mese).padStart(2, "0")} | ${f.partner.nome} | ${f.imponibile.toFixed(2)} € | ${(f.descrizione ?? "").slice(0, 34)} | ${candidato} |`
  );
}

console.log(`\nCon un candidato su FIC: ${conCandidato} · senza: ${righe.length - conCandidato}`);
await p.$disconnect();
