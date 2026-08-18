/**
 * Deluxy Fondo — aggiornamento quotidiano dei dati.
 *
 *   npm run aggiorna            aggiorna tutto (storico 10 anni)
 *   npm run aggiorna -- --breve solo l'ultimo anno, per il giro giornaliero
 *
 * Gira su Node 24, che legge i moduli TypeScript direttamente: i file in src/lib sono gli
 * stessi che usa l'app, così non esistono due versioni della stessa logica.
 *
 * Regola di questo script: se una fonte fallisce, il file esistente NON viene toccato e il
 * fallimento finisce in `istantanea.json`. Meglio un dato vecchio dichiarato vecchio che un
 * file mezzo scritto che sembra fresco.
 */

import { scaricaSerie, scaricaFondamentali, scaricaNotizie, trovaDiscontinuita } from "../src/lib/fonti.ts";
import { scriviSerie, scriviFondamentali, scriviNotizie, scriviIstantanea } from "../src/lib/archivio.ts";
import { TITOLI, BENCHMARK_MERCATO, BENCHMARK_TOTALE } from "../src/lib/universo.ts";

const breve = process.argv.includes("--breve");
const intervallo = breve ? "1y" : "10y";
const stati = [];

function riga(testo) {
  process.stdout.write(testo + "\n");
}

riga(`Deluxy Fondo — aggiornamento (${breve ? "giro breve, 1 anno" : "storico completo, 10 anni"})`);
riga("");

// --- Prezzi ----------------------------------------------------------------
const simboli = [
  ...TITOLI.map((t) => ({ simbolo: t.simbolo, nome: t.nome })),
  { simbolo: BENCHMARK_MERCATO, nome: "FTSE MIB" },
  { simbolo: BENCHMARK_TOTALE, nome: "FTSE MIB a dividendi reinvestiti" },
];

for (const { simbolo, nome } of simboli) {
  const { serie, stato } = await scaricaSerie(simbolo, nome, intervallo);
  stati.push(stato);
  if (!serie) {
    riga(`  ✗ ${simbolo.padEnd(12)} ${stato.messaggio}`);
    continue;
  }
  await scriviSerie(serie);
  const salti = trovaDiscontinuita(serie);
  riga(`  ✓ ${simbolo.padEnd(12)} ${String(serie.barre.length).padStart(5)} barre  ${serie.barre[0]?.data} → ${serie.barre.at(-1)?.data}`);
  for (const s of salti) {
    riga(`      ⚠ salto ×${s.rapporto.toFixed(2)} il ${s.data} (${s.precedente.toFixed(3)} → ${s.successivo.toFixed(3)}): possibile operazione sul capitale non rettificata`);
  }
}

// --- Fondamentali ----------------------------------------------------------
riga("");
for (const t of TITOLI) {
  const { dati, stato } = await scaricaFondamentali(t.simbolo);
  stati.push(stato);
  if (stato.esito !== "ok") {
    riga(`  ✗ fondamentali ${t.simbolo.padEnd(10)} ${stato.messaggio}`);
    continue;
  }
  await scriviFondamentali(t.simbolo, dati);
  const voci = Object.keys(dati).length;
  riga(`  ✓ fondamentali ${t.simbolo.padEnd(10)} ${voci} voci, ${stato.record} valori`);
}

// --- Notizie ---------------------------------------------------------------
// Query strette: cercare solo «TIM» pesca titoli su persone di nome Tim.
riga("");
const RICERCHE = [
  { query: '"Telecom Italia" OR "TIM" (nomina OR dimissioni OR "amministratore delegato" OR consiglio OR OPAS OR Poste)', etichetta: "TIM" },
  { query: '"cambio al vertice" OR "nuovo amministratore delegato" borsa italiana', etichetta: "Cambi di vertice, Italia" },
];

const tutteLeNotizie = [];
for (const r of RICERCHE) {
  const { notizie, stato } = await scaricaNotizie(r.query, r.etichetta);
  stati.push(stato);
  if (stato.esito !== "ok") {
    riga(`  ✗ notizie ${r.etichetta}: ${stato.messaggio}`);
    continue;
  }
  tutteLeNotizie.push(...notizie);
  riga(
    `  ✓ notizie ${r.etichetta.padEnd(24)} ${notizie.length} titoli — ` +
      `${notizie.filter((n) => n.segnali.length).length} di governance, ` +
      `${notizie.filter((n) => n.straordinarie.length).length} di operazioni straordinarie`
  );
}

// Deduplica per URL: Google News ripete lo stesso fatto da testate diverse.
const viste = new Set();
const uniche = tutteLeNotizie.filter((n) => {
  if (viste.has(n.url)) return false;
  viste.add(n.url);
  return true;
});
if (uniche.length) await scriviNotizie(uniche);

// --- Istantanea ------------------------------------------------------------
await scriviIstantanea({ generataIl: new Date().toISOString(), fonti: stati });

const ko = stati.filter((s) => s.esito !== "ok");
riga("");
riga(`Fonti interrogate: ${stati.length} — riuscite ${stati.length - ko.length}, fallite ${ko.length}`);
if (ko.length) {
  riga("");
  riga("Fallite (l'app le mostrerà come non disponibili, non userà dati vecchi al loro posto):");
  for (const s of ko) riga(`  · ${s.nome}: ${s.messaggio}`);
}
process.exit(ko.length === stati.length ? 1 : 0);
