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


/**
 * Crea (o aggiorna, passando `slug`) un testo pronto DENTRO l'app Scripts, e lo
 * accende per AI Mail.
 *
 * ⚠️ Non è una copia locale, ed è la differenza che conta. Il testo nasce e vive
 * là — qui non se ne tiene nessuna versione — ma lo si può scrivere **da qui**,
 * mentre si risponde alla posta. Chi risponde alle mail tutto il giorno le
 * formule buone le riconosce lì, in quel momento: obbligarlo a cambiare app per
 * salvarle vuol dire che non le salverà mai.
 *
 * Serve una chiave di SCRITTURA (leggere basta una qualsiasi).
 */
export async function creaScriptPronto(dati: {
  nome: string
  corpo: string
  oggetto?: string
  descrizione?: string
  categoria?: string
  canale?: string
  autore?: string
  slug?: string
}): Promise<{ ok: boolean; messaggio: string; slug?: string }> {
  const chiave = await chiaveScripts()
  if (!chiave) {
    return { ok: false, messaggio: 'Testi pronti non collegati (Impostazioni → App Deluxy → Testi pronti).' }
  }
  try {
    const res = await fetch(`${SCRIPTS_URL}/api/v1/script`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': chiave },
      body: JSON.stringify({ ...dati, app: APP, nomeApp: 'AI Mail' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    const risposta = (await res.json().catch(() => ({}))) as {
      slug?: string
      esito?: string
      errore?: string
      variabili?: string[]
    }
    if (!res.ok) {
      // Il motivo per esteso: «non riuscito» da solo fa tirare a indovinare.
      const aiuto =
        res.status === 403
          ? ' Serve una chiave di SCRITTURA: rigenerala nell’app Scripts e reincollala in Impostazioni App.'
          : ''
      return { ok: false, messaggio: `${risposta.errore ?? `Errore ${res.status}`}.${aiuto}` }
    }
    const quante = risposta.variabili?.length ?? 0
    const nota = quante > 0 ? ` ${quante} variabil${quante === 1 ? 'e' : 'i'} riconosciut${quante === 1 ? 'a' : 'e'}.` : ''
    return {
      ok: true,
      slug: risposta.slug,
      messaggio: `${risposta.esito === 'aggiornato' ? 'Testo aggiornato' : 'Testo salvato'} in Scripts e acceso per AI Mail.${nota}`,
    }
  } catch {
    return { ok: false, messaggio: 'Non riesco a raggiungere i Testi pronti: riprova fra poco.' }
  }
}

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
