// Store condiviso degli indirizzi preferiti: la barra laterale li mostra e la
// Mappa li aggiunge/rimuove; tutte le viste restano allineate senza refresh.
import { useEffect, useState } from 'react';
import { eliminaPreferito, fetchPreferiti, salvaPreferito, type IndirizzoPreferito } from '@/lib/db';

let cache: IndirizzoPreferito[] = [];
let caricato = false;
const listeners = new Set<() => void>();

async function refresh() {
  cache = await fetchPreferiti().catch(() => []);
  caricato = true;
  listeners.forEach((l) => l());
}

/** Hook: la lista dei preferiti, aggiornata quando cambia da qualunque vista. */
export function usePreferiti(): IndirizzoPreferito[] {
  const [v, setV] = useState<IndirizzoPreferito[]>(cache);
  useEffect(() => {
    const l = () => setV([...cache]);
    listeners.add(l);
    if (!caricato) refresh();
    else setV([...cache]);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}

export async function aggiungiPreferito(p: { etichetta: string; indirizzo: string; lat: number; lng: number; contesto?: 'mappa' | 'affiliazioni' }): Promise<void> {
  await salvaPreferito(p);
  await refresh();
}

export async function rimuoviPreferito(id: string): Promise<void> {
  await eliminaPreferito(id);
  await refresh();
}
