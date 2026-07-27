// Hook condiviso: carica i places, applica le regole di categoria a quelli senza
// ipotesi, ed espone opzioni di filtro derivate dai dati.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Place } from '@/types';
import {
  fetchPlaces,
  fetchPlaceIdConBozza,
  fetchPlaceIdConContatto,
  fetchPlaceIdContattati,
  fetchPlaceIdVisitati,
  fetchRecapitiPlace,
  type RecapitoPlace,
} from '@/lib/db';
import { caricaRegole, popolaIpotesiMancanti } from '@/lib/categoryRules';
import { passaFiltroCitta } from '@/lib/citta';
import type { FiltriMappa } from '@/components/Filters';

export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>([]);
  // Negozi che hanno almeno una persona in rubrica: è ciò che distingue un
  // Prospect da un Selezionato (vedi lib/livelli.ts).
  const [conContatto, setConContatto] = useState<Set<string>>(new Set());
  // Negozi a cui abbiamo già scritto/telefonato/fatto visita: è ciò che
  // distingue un Lead da un Selezionato mai toccato.
  const [contattati, setContattati] = useState<Set<string>>(new Set());
  // Il semaforo della visita: chi ha un resoconto a metà e chi c'è già stato.
  const [conBozza, setConBozza] = useState<Set<string>>(new Set());
  const [visitati, setVisitati] = useState<Set<string>>(new Set());
  // Telefono e mail del negozio, presi dalla rubrica (decisore per primo): le
  // liste ci appendono le azioni di contatto senza rifare la query ognuna.
  const [recapiti, setRecapiti] = useState<Map<string, RecapitoPlace>>(new Map());
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
      // Best-effort: se fallisce restano tutti Selezionati, meglio che rompere
      // la lista.
      try {
        setConContatto(await fetchPlaceIdConContatto());
      } catch {
        setConContatto(new Set());
      }
      try {
        setContattati(await fetchPlaceIdContattati());
      } catch {
        setContattati(new Set());
      }
      // Il semaforo della visita (lib/statoVisita.ts): bozza aperta = giallo,
      // visita registrata = verde. Se una delle due letture non riesce il
      // semaforo perde una sfumatura, non la lista.
      try {
        const [b, v] = await Promise.all([fetchPlaceIdConBozza().catch(() => new Set<string>()), fetchPlaceIdVisitati().catch(() => new Set<string>())]);
        setConBozza(b);
        setVisitati(v);
      } catch {
        setConBozza(new Set());
        setVisitati(new Set());
      }
      // Idem: senza recapiti le azioni di contatto restano spente, non sparisce
      // la lista.
      try {
        setRecapiti(await fetchRecapitiPlace());
      } catch {
        setRecapiti(new Map());
      }
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
      account: uniq(places.map((p) => p.anagrafiche_account ?? null)),
      creatori: uniq(places.map((p) => p.creato_da_nome ?? null)),
    };
  }, [places]);

  return { places, conContatto, contattati, conBozza, visitati, recapiti, loading, errore, ricarica: carica, opzioni };
}

/** Applica i filtri a una lista di places. La mappa NON filtra via i pin di default
 *  (regola #1): questo va usato solo quando l'utente sceglie esplicitamente un filtro. */
export function applicaFiltri(places: Place[], f: FiltriMappa): Place[] {
  return places.filter((p) => {
    if (f.priorita && p.priorita !== f.priorita) return false;
    if (f.stato && p.stato !== f.stato) return false;
    if (!passaFiltroCitta(p.zona, f.zona)) return false; // f.zona = bucket città
    if (f.settore && p.settore !== f.settore) return false;
    if (f.linea && p.linea_ipotizzata !== f.linea) return false;
    if (f.account && (p.anagrafiche_account ?? null) !== f.account) return false;
    if (f.creatore && (p.creato_da_nome ?? null) !== f.creatore) return false;
    return true;
  });
}

export function haFiltriAttivi(f: FiltriMappa): boolean {
  return Boolean(f.priorita || f.stato || f.zona || f.settore || f.linea || f.account || f.creatore);
}
