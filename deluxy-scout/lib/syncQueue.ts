// Coda di sincronizzazione offline.
//
// Fase 3: se non c'è rete, la visita viene salvata in locale (AsyncStorage) e
// accodata. Fase 4: al ritorno online la coda viene processata in ordine, con
// retry e gestione del rate limit HubSpot (429).
//
// Flusso di flush per ogni visita in coda:
//   1. carica la foto vetrina su Storage (se presente in locale)
//   2. inserisce la visita su Supabase
//   3. aggiorna lo stato del place
//   4. chiama la Edge Function per creare Company/Contact/Deal/Nota su HubSpot
//   5. marca hubspot_synced=true e rimuove dalla coda
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type { QueuedVisit, StatoPlace } from '@/types';
import { aggiornaStatoPlace, caricaFotoVetrina, inserisciVisita } from '@/lib/db';
import { RateLimitError, syncVisita } from '@/lib/hubspot';
import { env } from '@/lib/env';

const CHIAVE_CODA = 'deluxy.sync.queue.v1';
const MAX_RETRY = 5;

// Stato di esito che deriva lo stato del place dopo la visita.
export const statoDaEsito: Record<string, StatoPlace> = {
  interessato: 'visitato',
  da_richiamare: 'visitato',
  non_target: 'perso',
  chiuso: 'cliente',
};

async function leggiCoda(): Promise<QueuedVisit[]> {
  const raw = await AsyncStorage.getItem(CHIAVE_CODA);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedVisit[];
  } catch {
    return [];
  }
}

async function scriviCoda(coda: QueuedVisit[]): Promise<void> {
  await AsyncStorage.setItem(CHIAVE_CODA, JSON.stringify(coda));
}

export async function contaInCoda(): Promise<number> {
  return (await leggiCoda()).length;
}

export async function accodaVisita(item: QueuedVisit): Promise<void> {
  const coda = await leggiCoda();
  coda.push(item);
  await scriviCoda(coda);
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

interface FlushResult {
  synced: number;
  rimasti: number;
}

/**
 * Processa la coda in ordine (FIFO). Si ferma al primo elemento non completabile
 * per preservare l'ordine, così una visita "bloccata" non fa passare avanti le altre.
 */
export async function flushCoda(): Promise<FlushResult> {
  if (!(await isOnline())) {
    return { synced: 0, rimasti: (await leggiCoda()).length };
  }

  let coda = await leggiCoda();
  let synced = 0;

  while (coda.length > 0) {
    const item = coda[0];
    try {
      await processaUno(item);
      coda = coda.slice(1);
      await scriviCoda(coda);
      synced += 1;
    } catch (e) {
      if (e instanceof RateLimitError) {
        // Backoff: aspetta il Retry-After e ferma il flush (riprende al prossimo giro).
        await attendi(e.retryAfterSec * 1000);
        break;
      }
      // Errore generico: incrementa i retry; se supera il massimo, sposta in coda
      // (in fondo) per non bloccare le altre, ma resta segnalata.
      item.retries += 1;
      if (item.retries >= MAX_RETRY) {
        coda = [...coda.slice(1), item];
      }
      await scriviCoda(coda);
      break;
    }
  }

  return { synced, rimasti: coda.length };
}

async function processaUno(item: QueuedVisit): Promise<void> {
  // 1. foto (se locale)
  let fotoUrl = item.payload.foto_url;
  if (item.fotoLocalUri) {
    fotoUrl = await caricaFotoVetrina(item.fotoLocalUri, item.payload.place_id);
  }

  // 2. inserisci visita
  const visita = await inserisciVisita({ ...item.payload, foto_url: fotoUrl });

  // 3. aggiorna stato place in base all'esito
  if (visita.esito && statoDaEsito[visita.esito]) {
    await aggiornaStatoPlace(visita.place_id, statoDaEsito[visita.esito]);
  }

  // 4. sync HubSpot (solo se configurata). Se non c'è, la visita resta su Supabase
  //    con hubspot_synced=false: verrà sincronizzata quando la Edge Function esiste.
  if (env.hubspotSyncUrl()) {
    await syncVisita(visita.id);
  }
}

function attendi(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Registra un listener: appena torna la connessione prova a svuotare la coda.
 * Ritorna la funzione di cleanup.
 */
export function avviaAutoFlush(onFlush?: (r: FlushResult) => void): () => void {
  const unsub = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      flushCoda().then((r) => onFlush?.(r)).catch(() => {});
    }
  });
  return unsub;
}
