// La parte dei TESTI PRONTI che serve anche al browser: la forma di un testo e
// il riempimento dei buchi. Niente qui dentro tocca il server.
//
// ⚠️ Sta in un file a parte apposta. Il riquadro «Testi pronti» è un componente
// client, e importare da `scriptPronti.ts` (che risolve le chiavi API, quindi
// `node:crypto`) trascinava tutto il modulo nel bundle del browser e il build
// fallisce: «Reading from node:crypto is not handled by plugins». Tipi e funzioni
// pure di qua, chiamate al server di là.

/**
 * I segnaposto che ricorrono in quasi tutti i testi. Si propongono scrivendone
 * uno nuovo, così i nomi restano gli stessi in tutta l'azienda: è per NOME che
 * i valori impostati per una app (firma, recapiti, tono) si agganciano al testo.
 * Scriverne uno diverso non è un errore, ma quel buco resterà da compilare a
 * mano per sempre.
 */
export const VARIABILI_SUGGERITE = [
  'NOME_CLIENTE',
  'AZIENDA',
  'REFERENTE',
  'DATA',
  'ORA',
  'LUOGO',
  'FIRMA',
  'LINK',
] as const

export type ScriptPronto = {
  slug: string
  nome: string
  descrizione: string
  canale: string
  categoria: string
  /** Oggetto dell'email, già composto (vuoto per i testi da WhatsApp). */
  oggetto: string
  /** Il messaggio, già composto coi valori della nostra app. */
  testo: string
  /** Le variabili ancora scoperte: le riempie chi manda. */
  daCompilare: string[]
}

/**
 * Riempie i buchi `{{COSÌ}}` con i valori dati. Non inventa niente: quello che
 * non riceve resta scritto `{{COSÌ}}` bene in vista.
 *
 * ⚠️ È il punto in cui si è deciso di NON essere furbi. Sarebbe facile riempire
 * `{{DATA}}` con la data di oggi — e sarebbe un invito col giorno sbagliato
 * spedito a un cliente. Un segnaposto che si vede è sempre meglio di un dato
 * inventato che non si nota.
 *
 * Le chiavi si passano come stanno nel testo (`NOME_CLIENTE`), senza graffe, in
 * qualunque combinazione di maiuscole.
 */
export function componiScript(testo: string, valori: Record<string, string>): string {
  const normalizzati = new Map(
    Object.entries(valori)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k, v]) => [k.trim().toUpperCase(), v.trim()])
  )
  if (normalizzati.size === 0) return testo
  return testo.replace(/\{\{\s*([A-Z0-9_ÀÈÉÌÒÙ]+)\s*\}\}/gi, (intero, nome: string) => {
    const v = normalizzati.get(nome.trim().toUpperCase())
    return v ?? intero
  })
}
