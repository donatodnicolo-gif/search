// Il correttore di bozze: rilegge un messaggio PRIMA che parta al cliente.
//
// IL PROBLEMA, misurato il 22/08/2026 su 120 messaggi usciti scritti a mano:
// **18 avevano almeno un refuso vero — il 15%**. «Good mornign», «Yes we
// recived your order», «compresa consegnsa», «servirbbe», «tutta via», «un
// ora». Il correttore del browser è già acceso sulla casella di risposta e non
// basta, per due motivi: l'invio parte con **Invio** (non c'è un momento in cui
// si guardino le sottolineature), e con un solo dizionario installato ogni
// parola dell'altra lingua risulta sbagliata — una schermata tutta rossa si
// impara a ignorare in un giorno.
//
// ⚠️⚠️ **L'AI propone, il codice decide.** Il filtro sta in
// `src/lib/refusi.ts`: ogni parola proposta deve esistere davvero nel testo.
// ⚠️⚠️ **Non corregge mai da solo.** Torna un elenco; sostituire è un gesto di
// chi scrive.
// ⚠️ **Se qualcosa va storto, il messaggio parte lo stesso**: timeout corto ed
// errori ingoiati. Un correttore che blocca le risposte ai clienti è molto
// peggio di un refuso.

import OpenAI from 'openai'
import { leggiImpostazioni } from './impostazioni'
import { filtra, maschera, type Refuso } from './refusi'

/** Oltre questo non si aspetta più: si manda. */
const ATTESA_MASSIMA_MS = 2500

/** Il modello grande, e non è un vezzo: vedi la nota su `cercaRefusi`. */
const MODELLO_DEFAULT = 'gpt-4o'

export type EsitoCorrettore = {
  refusi: Refuso[]
  /** `false` quando il controllo non è stato possibile: allora si manda e basta. */
  controllato: boolean
}

const NIENTE: EsitoCorrettore = { refusi: [], controllato: false }

const ISTRUZIONI = [
  'Sei un correttore di bozze per il servizio clienti di un negozio di fiori e torte.',
  'Ti do UN messaggio che un operatore sta per mandare a un cliente. Può essere in italiano, inglese o in un’altra lingua.',
  'Segnala SOLO errori di ORTOGRAFIA veri: parole scritte male («mornign» per «morning», «consegnsa» per «consegna»), parole staccate o attaccate a torto («tutta via» per «tuttavia», «un ora» per «un’ora»), lettere di troppo attaccate a una parola.',
  'NON segnalare: stile, tono, giri di frase, punteggiatura, maiuscole, nomi di persona, nomi di città, nomi di prodotto, sigle, parole straniere usate apposta.',
  'Se il messaggio è a posto, torna un elenco vuoto. Nel dubbio non segnalare: un falso allarme è peggio di un refuso che passa.',
  'Rispondi SOLO in JSON: {"refusi":[{"sbagliato":"la parola come sta nel messaggio","giusto":"la parola corretta"}]}',
].join('\n')

/**
 * Cerca i refusi in un messaggio.
 *
 * ⚠️ Il modello è quello **grande**, e non per abitudine: misurato il
 * 22/08/2026 sugli stessi 120 messaggi veri, `gpt-4o` ha trovato **18**
 * messaggi con refusi e `gpt-4o-mini` solo **11** — si perdeva «servirbbe»,
 * «tranfer», «theese», «tutta via». Al volume di quest'app la differenza costa
 * circa un euro al mese, e il testo lo legge un cliente. È la stessa lezione
 * già scritta in `src/lib/ai.ts` per le risposte.
 */
export async function cercaRefusi(testo: string): Promise<EsitoCorrettore> {
  const pulito = (testo ?? '').trim()
  // Sotto una manciata di caratteri non c'è niente da correggere; sopra i 2000
  // non è una chat ma una mail lunga, dove l'attesa non vale il controllo.
  if (pulito.length < 8 || pulito.length > 2000) return NIENTE

  const imp = await leggiImpostazioni(['openaiApiKey', 'openaiModelloRisposte'])
  if (!imp.openaiApiKey) return NIENTE

  const client = new OpenAI({ apiKey: imp.openaiApiKey })

  try {
    const risposta = await client.chat.completions.create(
      {
        model: imp.openaiModelloRisposte || MODELLO_DEFAULT,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ISTRUZIONI },
          { role: 'user', content: maschera(pulito) },
        ],
      },
      // ⚠️ Il timeout è la parte importante: scaduto, si manda senza controllo.
      { signal: AbortSignal.timeout(ATTESA_MASSIMA_MS) }
    )
    const letto = JSON.parse(risposta.choices[0]?.message?.content ?? '{}') as {
      refusi?: Refuso[]
    }
    // ⚠️ Il filtro si applica al testo VERO, non a quello mascherato: è lì che
    // le parole devono ritrovarsi.
    return { refusi: filtra(pulito, letto.refusi ?? []), controllato: true }
  } catch {
    // Rete, timeout, chiave scaduta, JSON storto: il messaggio parte lo stesso.
    return NIENTE
  }
}
