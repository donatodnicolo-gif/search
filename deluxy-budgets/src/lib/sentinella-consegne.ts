// LA SENTINELLA SUI MESI CHIUSI (27/08/2026).
//
// Nasce da una domanda dell'utente — «i costi di consegna che ogni giorno
// l'app aggiorna, come ti vengono notificati?» — e dalla risposta, che era:
// **non mi vengono notificati affatto**. Budgets non riceve niente: chiede alla
// piattaforma a ogni apertura di pagina. È il modo giusto, e ha un rovescio.
//
// ⚠️ **Un mese chiuso non è congelato.** Il costo si ricalcola dalle righe
// delle consegne a ogni lettura, filtrando per data della consegna. Se in
// piattaforma si corregge la paga di una consegna di marzo — un plus rimesso,
// una consegna resa pagabile, un valet che passa a partita IVA — il costo di
// marzo cambia da solo, e con lui l'EBITDA dei mesi chiusi. Prima di questo
// file non se ne accorgeva nessuno: l'unica traccia era che il numero a
// schermo non era quello che ti ricordavi.
//
// ⭐ **La scelta: non congelare, ma far vedere.** Congelare vorrebbe dire
// tenersi una copia e ignorare le correzioni vere — cioè preferire un numero
// stabile a uno giusto. Qui il cambiamento passa; quello che cambia è che si
// **vede**, con la data e la cifra.
//
// ⚠️⚠️ La tabella `LetturaConsegne` **non è una fonte**: nessun conto la legge.
// Serve solo a ricordare quanto valeva ieri. Chi un giorno la usasse per
// calcolare avrebbe creato la tabella-copia che il contratto dati vieta.

import { prisma } from "./db";
import { fetchCostiConsegne } from "./consegne";
import { primoMeseAperto } from "./periodo";

/** Di quanto deve muoversi un mese chiuso perché valga la pena dirlo. */
export const SOGLIA_SCOSTAMENTO = 1;

export type MeseMosso = {
  year: number;
  month: number;
  prima: number;
  adesso: number;
  differenza: number;
  quando: Date;
};

/**
 * Legge il costo dei mesi **chiusi** e lo confronta con l'ultima lettura
 * registrata. Restituisce i mesi che si sono mossi, e — se `registra` è vero —
 * salva la fotografia di oggi.
 *
 * ⚠️ Solo i mesi **chiusi**: il mese in corso cambia per definizione a ogni
 * consegna che si fa, e segnalarlo vorrebbe dire un avviso al giorno che
 * nessuno leggerebbe più. Il punto non è che i numeri cambino: è che cambi
 * qualcosa che si credeva fermo.
 */
export async function controllaMesiChiusi(
  anno: number,
  opzioni: { registra?: boolean } = {}
): Promise<{ ok: boolean; errore?: string; mossi: MeseMosso[]; controllati: number }> {
  const costi = await fetchCostiConsegne(anno);
  if (!costi.ok) return { ok: false, errore: costi.errore, mossi: [], controllati: 0 };

  const aperto = primoMeseAperto(anno);
  const chiusi = Array.from({ length: Math.max(0, Math.min(aperto - 1, 12)) }, (_, i) => i + 1);
  if (chiusi.length === 0) return { ok: true, mossi: [], controllati: 0 };

  // L'ultima lettura di ciascun mese chiuso. Una query sola, non una per mese.
  const precedenti = await prisma.letturaConsegne.findMany({
    where: { year: anno, month: { in: chiusi } },
    orderBy: { lettoIl: "desc" },
  });
  const ultima = new Map<number, (typeof precedenti)[number]>();
  for (const p of precedenti) if (!ultima.has(p.month)) ultima.set(p.month, p);

  const mossi: MeseMosso[] = [];
  const daScrivere: { year: number; month: number; costo: number; consegne: number }[] = [];

  for (const m of chiusi) {
    const oggi = costi.mesi[m - 1];
    if (!oggi) continue;
    const prima = ultima.get(m);
    // ⚠️ La PRIMA lettura di un mese non è uno scostamento: non c'era niente da
    // confrontare. Si registra e basta — altrimenti il giorno che si accende la
    // sentinella si accenderebbero anche sette avvisi che non dicono niente.
    if (prima && Math.abs(oggi.costo - prima.costo) >= SOGLIA_SCOSTAMENTO) {
      mossi.push({
        year: anno,
        month: m,
        prima: prima.costo,
        adesso: oggi.costo,
        differenza: oggi.costo - prima.costo,
        quando: prima.lettoIl,
      });
    }
    // Si scrive solo se è cambiato qualcosa (o se non c'era niente): una riga
    // al giorno per mese, uguale alla precedente, non aggiunge nulla e in un
    // anno sono duemila righe che rendono illeggibile lo storico.
    if (!prima || Math.abs(oggi.costo - prima.costo) >= SOGLIA_SCOSTAMENTO) {
      daScrivere.push({ year: anno, month: m, costo: oggi.costo, consegne: oggi.consegne });
    }
  }

  if (opzioni.registra && daScrivere.length) {
    await prisma.letturaConsegne.createMany({ data: daScrivere });
  }

  return { ok: true, mossi, controllati: chiusi.length };
}

/**
 * I mesi mossi **senza registrare**: è quello che serve a una pagina, che deve
 * poter guardare senza scrivere. Una lettura che scrive è una lettura che
 * cambia il risultato della prossima.
 */
export async function mesiChiusiMossi(anno: number): Promise<MeseMosso[]> {
  const esito = await controllaMesiChiusi(anno, { registra: false });
  return esito.mossi;
}
