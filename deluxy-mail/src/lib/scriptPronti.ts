import { leggiChiaviApp } from './chiaviApp'
import type { ScriptPronto } from './scriptTesto'

// I TESTI PRONTI dell'azienda (deluxy-scripts) dentro AI Mail.
//
// ⚠️ Qui «script» vuol dire COPIONE COMMERCIALE, non codice: sono le parole con
// cui Deluxy parla ai clienti — offerte, inviti, presentazioni, solleciti,
// risposte ai reclami. Si scrivono una volta sola nell'app Scripts e si
// richiamano da dove servono.
//
// ⚠️ QUESTA INTEGRAZIONE NON È UNA SINCRONIZZAZIONE, ed è giusto che non lo sia.
// Con Tasks e Calendario ci sono due copie dello stesso dato da tenere allineate
// nei due sensi. Qui no: i testi hanno UN padrone solo, l'app Scripts, e AI Mail
// li LEGGE e basta — già composti, con firma e recapiti giusti per la posta.
// Copiarli qui vorrebbe dire creare la seconda versione di un testo aziendale
// che poi diverge: esattamente ciò che l'app Scripts esiste per evitare.
//
// I buchi si scrivono `{{COSÌ}}`. Scripts riempie da sé quelli che sa (firma,
// recapiti, tono della nostra app); quelli che restano — il nome del cliente, la
// data — arrivano in `daCompilare` e li si riempie qui prima di mandare. Quello
// che resta scoperto NON si nasconde: nel testo si continua a leggere
// `{{DATA}}`, così lo si vede prima di premere invio invece di spedire un vuoto.

const SCRIPTS_URL = (process.env.SCRIPTS_URL || 'https://deluxy-scripts.vercel.app').replace(/\/$/, '')

/** Con quale nome AI Mail è registrata fra le app collegate di Scripts. */
const APP = process.env.SCRIPTS_APP || 'deluxy-mail'


async function chiaveScripts(): Promise<string> {
  try {
    return (await leggiChiaviApp()).scripts
  } catch {
    return ''
  }
}

/** Per la UI: i testi pronti sono collegati? */
export async function scriptProntiAttivi(): Promise<boolean> {
  return (await chiaveScripts()).length > 0
}

/**
 * I testi accesi per AI Mail, già composti. Vuoto (e mai un errore) se la
 * chiave manca o Scripts non risponde: senza testi pronti si scrive a mano,
 * come sempre — non è un motivo per rompere la schermata di scrittura.
 */
export async function elencoScriptPronti(): Promise<ScriptPronto[]> {
  const chiave = await chiaveScripts()
  if (!chiave) return []
  try {
    const res = await fetch(`${SCRIPTS_URL}/api/v1/script?app=${encodeURIComponent(APP)}`, {
      headers: { 'x-api-key': chiave },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const dati = (await res.json()) as { script?: ScriptPronto[] }
    return (dati.script ?? []).map((s) => ({
      slug: s.slug,
      nome: s.nome,
      descrizione: s.descrizione ?? '',
      canale: s.canale ?? '',
      categoria: s.categoria ?? '',
      oggetto: s.oggetto ?? '',
      testo: s.testo ?? '',
      daCompilare: s.daCompilare ?? [],
    }))
  } catch {
    return []
  }
}
