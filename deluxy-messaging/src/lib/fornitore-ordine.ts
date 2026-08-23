// A chi è stato dato un ordine da preparare: le regole, senza database.
//
// ⚠️ Questo file NON importa `db` né altro lato server: lo usa anche il modulo
// dentro la scheda dell'ordine, che è un componente client. È la stessa regola
// che vale per `turni.ts`, `refusi.ts` e `glossario.ts` — importare qui il
// database farebbe fallire la build con «Reading from node:crypto is not
// handled», ed è già successo tre volte.

export type FornitoreOrdineDto = {
  fornitoreNome: string
  fornitoreId: string
  fornitoreCitta: string
  fornitoreTelefono: string
  fornitoreEmail: string
  fornitoreCosto: number | null
  fornitoreNota: string
}

/** Quanto può valere un ordine dato a un fornitore. */
export function costoValido(v: number | null): boolean {
  if (v === null) return true // «non ancora concordato» è una risposta
  return Number.isFinite(v) && v >= 0 && v <= 100_000
}

/**
 * Il costo scritto a mano, letto come numero.
 *
 * ⚠️ Si accetta la VIRGOLA: in italiano «130,50» si scrive così, e un modulo che
 * la rifiuta in silenzio (o la legge come 130) fa nascere richieste di pagamento
 * sbagliate. Vuoto = `null` = non ancora concordato, che è diverso da zero.
 */
export function leggiCosto(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/\s|€/g, '')
  if (!s) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** Toglie gli spazi di troppo e taglia alle lunghezze che la tabella regge. */
export function ripulisciFornitore(c: Record<string, unknown>): FornitoreOrdineDto {
  const testo = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
  return {
    fornitoreNome: testo(c.nome, 120),
    fornitoreId: testo(c.id, 60),
    fornitoreCitta: testo(c.citta, 80),
    fornitoreTelefono: testo(c.telefono, 40),
    fornitoreEmail: testo(c.email, 120).toLowerCase(),
    fornitoreCosto: leggiCosto(c.costo),
    fornitoreNota: testo(c.nota, 500),
  }
}

/**
 * Se su questo ordine la mancanza del fornitore è una cosa da segnalare.
 *
 * ⚠️ Serve a decidere QUANDO chiederlo. Un promemoria su ogni ordine appena
 * arrivato sarebbe rumore — il fornitore non c'è ancora e non deve esserci.
 * Diventa una mancanza quando l'ordine è già andato avanti: **in pagamento** (a
 * chi lo stiamo pagando?) o **in attesa di consegna** (chi la sta preparando?).
 *
 * ⚠️⚠️ «Gestito» NON è nell'elenco, e la ragione è un numero: contati sul
 * database il 24/08/2026, gli ordini senza fornitore erano 828 — di cui **822
 * già chiusi**. Segnalarli avrebbe acceso un avviso su quasi ogni riga della
 * bacheca per una cosa che (a) non si può più fare, quell'ordine è consegnato,
 * e (b) non si POTEVA fare, perché il campo nasce oggi. Un avviso che compare
 * su tutto non lo legge più nessuno, nemmeno le sei volte in cui serve
 * davvero — e sei erano, contate: gli ordini non chiusi senza fornitore.
 */
const STATI_CHE_LO_PRETENDONO = ['in_pagamento', 'attesa_consegna']

export function fornitoreAtteso(gestione: string): boolean {
  return STATI_CHE_LO_PRETENDONO.includes(gestione)
}

/** Come si scrive un costo a schermo. */
export function costoScritto(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return 'da concordare'
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}
