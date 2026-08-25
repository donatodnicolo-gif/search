// LE PROPOSTE AI FORNITORI: chi chiamare per primo, e chi non richiamare.
//
// ⚠️⚠️ Perché ordinare conta più di quanto sembri. Davanti a un ordine con la
// consegna domani si scrive ai primi due o tre dell'elenco, non a tutti: l'ordine
// dell'elenco È la decisione di chi lavora. Un elenco alfabetico, o nell'ordine
// in cui il registro li restituisce, manda a chiedere ogni volta alle stesse
// insegne — quelle con la A — e lascia fuori chi ha già lavorato per noi.
//
// ⚠️ Questo file NON importa `db`: lo usa anche la scheda ordine, che è un
// componente client.

/** Chi si può contattare, con quello che sappiamo di lui. */
export type Candidato = {
  id: string
  nome: string
  categoria: string
  citta: string
  telefono: string
  email: string
  /** Da chi arriva il recapito, quando è di un referente e non dell'insegna. */
  recapitoDa: string
  /** Lo stato nel registro: `attivo` = ci lavoriamo già. */
  stato: string
  /** Quanti ordini gli abbiamo già affidato (dai nostri, non dal registro). */
  ordiniFatti: number
}

/** Una proposta già partita. */
export type Chiesto = {
  id: string
  fornitoreNome: string
  fornitoreId: string
  canale: string
  chiestoIl: string
  chiestoDaNome: string
  esito: string
  nota: string
}

export const ESITI = [
  { chiave: 'in_attesa', nome: 'in attesa' },
  { chiave: 'si', nome: 'ha detto sì' },
  { chiave: 'no', nome: 'ha detto no' },
]

export function nomeEsito(v: string): string {
  return ESITI.find((e) => e.chiave === v)?.nome ?? v
}

/**
 * Si può ancora contattare, sì o no.
 *
 * ⚠️⚠️ Chi ha già detto NO non si richiama: è la cosa che dà più fastidio a un
 * fornitore, e la seconda volta la risposta non cambia. Chi è in attesa invece
 * SÌ, ma con l'avviso — a volte non ha visto il messaggio, e dopo due ore su un
 * ordine di domani richiamare è giusto.
 */
export function siPuoRichiedere(c: Chiesto | undefined): boolean {
  if (!c) return true
  return c.esito !== 'no' && c.esito !== 'si'
}

/**
 * Da quanto gliel'abbiamo chiesto, come si dice a voce.
 * ⚠️ Serve a decidere se insistere: «due minuti fa» e «ieri» portano a due cose
 * diverse, e una data e un'ora in tabella le fa calcolare a mente ogni volta.
 */
export function daQuanto(iso: string, adesso: number): string {
  const minuti = Math.round((adesso - new Date(iso).getTime()) / 60000)
  if (minuti < 1) return 'adesso'
  if (minuti < 60) return `${minuti} minut${minuti === 1 ? 'o' : 'i'} fa`
  const ore = Math.round(minuti / 60)
  if (ore < 24) return `${ore} or${ore === 1 ? 'a' : 'e'} fa`
  const giorni = Math.round(ore / 24)
  return `${giorni} giorn${giorni === 1 ? 'o' : 'i'} fa`
}

/**
 * Quanto è promettente un candidato: chi risponde prima, in cima.
 *
 * ⚠️ L'ordine non è alfabetico ed è una scelta: davanti a una consegna di domani
 * si scrive ai primi due o tre, quindi in cima va chi ha più probabilità di dire
 * sì — chi ha già lavorato per noi e sa come funziona, poi chi è un partner
 * attivo, poi chi ha almeno un numero.
 */
export function punteggioCandidato(c: Candidato): number {
  let p = 0
  // ⚠️ Aver già lavorato per noi pesa più di tutto: sa i tempi, sa le consegne,
  // e soprattutto ha già detto sì almeno una volta.
  p += Math.min(c.ordiniFatti, 10) * 100
  if (c.stato === 'attivo') p += 50
  // ⚠️ Senza un numero la proposta non parte affatto: va in fondo, ma NON si
  // toglie — il suo indirizzo email c'è, e a volte è l'unica strada.
  if (c.telefono) p += 30
  else if (c.email) p += 5
  // ⚠️ Un recapito che è di un referente e non dell'insegna vale un po' meno:
  // si scrive a una persona, che può non essere quella che decide.
  if (c.recapitoDa) p -= 5
  return p
}

/**
 * L'elenco pronto: prima chi non abbiamo ancora chiesto, poi il resto.
 *
 * ⚠️⚠️ Chi ha già risposto NON sparisce dall'elenco: sparire vorrebbe dire che
 * quel lavoro non è stato fatto, e qualcuno lo rifarebbe. Va in fondo, marcato
 * con quello che ha risposto — che è anche il modo di accorgersi che «ho chiesto
 * a cinque e hanno detto tutti no», cioè che il problema è il prezzo, non i
 * fornitori.
 */
export function ordinaCandidati(
  candidati: Candidato[],
  chiesti: Map<string, Chiesto>
): { candidato: Candidato; chiesto: Chiesto | undefined }[] {
  return candidati
    .map((candidato) => ({ candidato, chiesto: chiesti.get(chiaveFornitore(candidato.nome)) }))
    .sort((a, b) => {
      const da = statoOrdinamento(a.chiesto)
      const db = statoOrdinamento(b.chiesto)
      if (da !== db) return da - db
      return punteggioCandidato(b.candidato) - punteggioCandidato(a.candidato)
    })
}

/** 0 = da chiedere · 1 = in attesa · 2 = ha già risposto. */
function statoOrdinamento(c: Chiesto | undefined): number {
  if (!c) return 0
  if (c.esito === 'in_attesa') return 1
  return 2
}

/** Come si confronta il nome di un fornitore: senza maiuscole né accenti. */
export function chiaveFornitore(v: string): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Il riassunto in una riga: quanti chiesti, quanti in attesa, quanti no. */
export function riassunto(chiesti: Chiesto[]): string {
  if (!chiesti.length) return 'Non hai ancora chiesto a nessuno.'
  const si = chiesti.filter((c) => c.esito === 'si').length
  const no = chiesti.filter((c) => c.esito === 'no').length
  const attesa = chiesti.filter((c) => c.esito === 'in_attesa').length
  if (si) return `${si} ha detto sì.`
  const pezzi = [
    `${chiesti.length} chiest${chiesti.length === 1 ? 'o' : 'i'}`,
    attesa ? `${attesa} senza risposta` : '',
    no ? `${no} ha detto no` : '',
  ].filter(Boolean)
  // ⚠️ Quando hanno detto no TUTTI, il problema non sono i fornitori: si dice,
  // perché continuare a cercarne altri è la reazione istintiva e quasi sempre
  // quella sbagliata.
  if (no && no === chiesti.length && no >= 3) {
    return `${pezzi.join(' · ')} — hanno detto no tutti: forse è il prezzo o la data, non il fornitore.`
  }
  return pezzi.join(' · ')
}
