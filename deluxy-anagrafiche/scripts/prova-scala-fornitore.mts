// Il rapporto di fornitura può solo AVANZARE dalle app, mai retrocedere.
//
// ⚠️ Nasce da un caso vero (27/08/2026): un negozio già «abituale» risalvato
// dall'app di ricerca fornitori tornava «da provare», perché statoFornitore è
// un campo fattuale e vince il più fresco. Il gesto di oggi cancellava il
// rapporto di sei mesi, e nessuno se ne accorgeva.
//
//   npx tsx scripts/prova-scala-fornitore.mts
import "dotenv/config";
import { calcolaMerge } from "../src/lib/merge";

type Caso = { nome: string; da: string | null; a: string; atteso: string | null };

// `atteso` = il valore che DEVE restare dopo il merge (null = invariato).
const CASI: Caso[] = [
  { nome: "abituale ← «da provare» dall'app  (il caso vero)", da: "abituale", a: "da_provare", atteso: null },
  { nome: "abituale ← «segnalato» dall'app", da: "abituale", a: "segnalato", atteso: null },
  { nome: "da_provare ← «segnalato» dall'app", da: "da_provare", a: "segnalato", atteso: null },
  { nome: "da_provare → «abituale»  (avanza: deve passare)", da: "da_provare", a: "abituale", atteso: "abituale" },
  { nome: "segnalato → «da provare» (avanza)", da: "segnalato", a: "da_provare", atteso: "da_provare" },
  { nome: "vuoto → «abituale» (non era fornitore: passa)", da: null, a: "abituale", atteso: "abituale" },
  { nome: "abituale → «da evitare» (veto: passa, è prudente)", da: "abituale", a: "da_evitare", atteso: "da_evitare" },
  { nome: "da_evitare ← «abituale» (il veto non si ribalta)", da: "da_evitare", a: "abituale", atteso: null },
  { nome: "abituale ← «abituale» (uguale: nessun cambio)", da: "abituale", a: "abituale", atteso: null },
];

// ⚠️ asOf NEL FUTURO di proposito: è la condizione in cui il difetto si vedeva
// — la scrittura più fresca vinceva sempre. La guardia deve reggere lo stesso.
const domani = new Date(Date.now() + 86_400_000).toISOString();

let male = 0;
for (const c of CASI) {
  const esistente = {
    statoFornitore: c.da,
    provenienza: { statoFornitore: { sistema: "ui", asOf: "2026-01-01T00:00:00Z" } },
  } as unknown as Parameters<typeof calcolaMerge>[0];
  const { dati } = calcolaMerge(esistente, { statoFornitore: c.a }, "suppliers", domani);
  const scritto = (dati.statoFornitore as string | undefined) ?? null;
  const ok = scritto === c.atteso;
  if (!ok) male++;
  const dice = scritto === null ? "resta com'era" : `diventa «${scritto}»`;
  console.log(`${ok ? "ok  " : "NO  "} ${c.nome.padEnd(52)} → ${dice}`);
}
console.log("");
console.log(male ? `${male} casi sbagliati` : "Tutti i casi come attesi");
process.exit(male ? 1 : 0);

// ⚠️ E il dato GIA' SCRITTO? Una correzione non è retroattiva: si guarda anche
// se il difetto ha già fatto danno. Cercato il 27/08/2026 in tutto lo storico:
// 7 cambi di stato fornitore, **nessuna retrocessione fra due gradini**. Le due
// righe che somigliavano a una retrocessione erano AZZERAMENTI («non è più un
// nostro fornitore») fatti dalla UI — uno è la riparazione dell'aggancio
// sbagliato del 25/08. La guardia arriva prima del danno.
//
// Per rifare la verifica quando serve:
//   prisma.modifica.findMany({ where: { campo: "statoFornitore" } })
// e si guarda un salto `da` → `a` in cui ENTRAMBI sono valori della scala e
// il secondo è più basso. Verso vuoto NON è una retrocessione: è una persona
// che dice «questo non ci fornisce».
