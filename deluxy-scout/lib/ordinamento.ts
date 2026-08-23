// Ordinamento delle tabelle, in un posto solo.
//
// Nasce da una richiesta dell'utente («consentimi di ordinare tutte le tabelle
// presenti nell'app», 21/08/2026). Sta qui e non dentro le schermate perché due
// tabelle che si ordinano in due modi diversi — i vuoti in cima in una e in
// fondo nell'altra, le maiuscole che contano di qua e non di là — sono due
// comportamenti da imparare invece che uno.
import { useCallback, useMemo, useState } from 'react';

export type Verso = 'asc' | 'desc';
export interface Ordine<C extends string> {
  campo: C;
  verso: Verso;
}

/**
 * Confronta due valori di una cella.
 *
 * ⚠️ **I vuoti stanno sempre in fondo**, in tutti e due i versi. Ordinando per
 * «telefono» crescente, cento righe senza numero in cima sarebbero cento righe
 * di niente prima di arrivare al dato: il vuoto non è un valore piccolo, è
 * l'assenza di valore. I numeri si confrontano da numeri (se no «10» viene
 * prima di «9») e le stringhe con `localeCompare`, che sa dove va la È.
 */
export function confrontaCelle(a: unknown, b: unknown, verso: Verso): number {
  const vuotoA = a === null || a === undefined || a === '';
  const vuotoB = b === null || b === undefined || b === '';
  if (vuotoA && vuotoB) return 0;
  if (vuotoA) return 1; // sempre in fondo, qualunque sia il verso
  if (vuotoB) return -1;
  const segno = verso === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * segno;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (Number(a) - Number(b)) * segno;
  return String(a).localeCompare(String(b), 'it', { sensitivity: 'base', numeric: true }) * segno;
}

/**
 * Lo stato dell'ordinamento di una tabella.
 *
 * Toccando la colonna già attiva si gira il verso; toccandone un'altra si
 * riparte dal verso naturale di quella colonna — crescente per i testi (A→Z, è
 * quello che uno si aspetta da un elenco di nomi), decrescente per i numeri
 * (i più grandi per primi: in una colonna di soldi si guarda chi conta di più).
 */
export function useOrdinamento<C extends string>(
  iniziale: Ordine<C>,
  numeriche: readonly C[] = [],
) {
  const [ordine, setOrdine] = useState<Ordine<C>>(iniziale);
  const numericheSet = useMemo(() => new Set<string>(numeriche), [numeriche]);
  const ordinaPer = useCallback(
    (campo: C) =>
      setOrdine((o) =>
        o.campo === campo
          ? { campo, verso: o.verso === 'asc' ? 'desc' : 'asc' }
          : { campo, verso: numericheSet.has(campo) ? 'desc' : 'asc' },
      ),
    [numericheSet],
  );
  return { ordine, ordinaPer };
}

/** La freccia da mettere accanto all'intestazione: ↑ ↓ o niente. */
export function frecciaOrdine<C extends string>(ordine: Ordine<C>, campo: C): string {
  if (ordine.campo !== campo) return '';
  return ordine.verso === 'asc' ? ' ↑' : ' ↓';
}

/** Ordina una lista leggendo da ogni riga il valore della colonna attiva. */
export function ordinaRighe<T, C extends string>(
  righe: T[],
  ordine: Ordine<C>,
  valore: (r: T, campo: C) => unknown,
): T[] {
  return [...righe].sort((a, b) => confrontaCelle(valore(a, ordine.campo), valore(b, ordine.campo), ordine.verso));
}
