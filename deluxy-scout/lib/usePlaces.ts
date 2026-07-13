// Hook condiviso: carica i places, applica le regole di categoria a quelli senza
// ipotesi, ed espone opzioni di filtro derivate dai dati.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Place } from '@/types';
import { fetchPlaces } from '@/lib/db';
import { caricaRegole, popolaIpotesiMancanti } from '@/lib/categoryRules';
import type { FiltriMappa } from '@/components/Filters';

export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const raw = await fetchPlaces();
      const regole = await caricaRegole();
      // Regola #1: pre-popola linea_ipotizzata/aggancio/priorità dove mancano.
      const arricchiti = await popolaIpotesiMancanti(raw, regole);
      setPlaces(arricchiti);
    } catch (e: any) {
      setErrore(e?.message ?? 'Errore nel caricamento delle attività');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carica();
  }, [carica]);

  const opzioni = useMemo(() => {
    const uniq = (xs: (string | null)[]) =>
      Array.from(new Set(xs.filter(Boolean) as string[])).sort();
    return {
      zone: uniq(places.map((p) => p.zona)),
      settori: uniq(places.map((p) => p.settore)),
      linee: uniq(places.map((p) => p.linea_ipotizzata)),
    };
  }, [places]);

  return { places, loading, errore, ricarica: carica, opzioni };
}

/** Applica i filtri a una lista di places. La mappa NON filtra via i pin di default
 *  (regola #1): questo va usato solo quando l'utente sceglie esplicitamente un filtro. */
export function applicaFiltri(places: Place[], f: FiltriMappa): Place[] {
  return places.filter((p) => {
    if (f.priorita && p.priorita !== f.priorita) return false;
    if (f.stato && p.stato !== f.stato) return false;
    if (f.zona && p.zona !== f.zona) return false;
    if (f.settore && p.settore !== f.settore) return false;
    if (f.linea && p.linea_ipotizzata !== f.linea) return false;
    return true;
  });
}

export function haFiltriAttivi(f: FiltriMappa): boolean {
  return Boolean(f.priorita || f.stato || f.zona || f.settore || f.linea);
}
