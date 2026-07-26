// Customer Service — la PAGELLA di valet e partner.
//
// Il punteggio non è una formula fissa: è la media pesata di VOCI configurabili
// (tabella `VocePunteggio`). Ogni voce dice cosa misura, da dove prende il dato
// e quanto pesa. Aggiungere una variabile nuova ("cura del confezionamento")
// significa aggiungere una voce, non modificare questo file.
//
// Ogni voce produce un sotto-punteggio da 0 a 100, così voci di natura diversa
// (una media di voti 1-5, una percentuale, un conteggio di reclami) diventano
// confrontabili e sommabili.
//
// DUE REGOLE CHE TENGONO ONESTO IL CALCOLO
//
// 1. Una voce SENZA DATI per quel soggetto viene ESCLUSA dalla media, non
//    contata come zero. Un partner di cui non misuriamo la puntualità non deve
//    risultare scarso per un dato che non abbiamo mai raccolto: il punteggio
//    dice "su cosa l'ho valutato", e quel "su cosa" viene restituito insieme al
//    numero (`vociUsate` / `vociSenzaDati`).
// 2. Un soggetto senza NESSUN dato non prende 0: prende `null`. Zero è un
//    giudizio, l'assenza di dati non lo è.

import { giudizioAutomatico } from './reclami'

// ── Le fonti da cui una voce può prendere il dato ────────────────────────────

export const FONTI = [
  {
    chiave: 'reclami',
    nome: 'Reclami',
    // Cosa vuol dire la soglia per questa fonte, detto all'operatore.
    soglia: 'Punteggio-reclami che azzera la voce',
    aiuto: 'Meno reclami (e meno gravi) = più punti. I reclami risolti pesano metà.',
  },
  {
    chiave: 'feedback',
    nome: 'Feedback ricevuti',
    soglia: '',
    aiuto: 'Media dei voti da 1 a 5 ricevuti sul soggetto.',
  },
  {
    chiave: 'puntualita',
    nome: 'Puntualità',
    soglia: 'Minuti di tolleranza per essere "in orario"',
    aiuto: 'Quota di consegne arrivate entro la tolleranza. Solo per i valet.',
  },
  {
    chiave: 'manuale',
    nome: 'Valore a mano',
    soglia: '',
    aiuto: 'Un valore da 0 a 100 che imposti tu per ogni soggetto.',
  },
] as const

export type ChiaveFonte = (typeof FONTI)[number]['chiave']

export function fonteValida(v: string): v is ChiaveFonte {
  return FONTI.some((f) => f.chiave === v)
}

export function nomeFonte(chiave: string): string {
  return FONTI.find((f) => f.chiave === chiave)?.nome ?? chiave
}

/** Se la soglia serve a questa fonte, l'etichetta da mostrare; altrimenti ''. */
export function etichettaSoglia(fonte: string): string {
  return FONTI.find((f) => f.chiave === fonte)?.soglia ?? ''
}

// A chi si applica una voce.
export const SOGGETTI_VOCE = [
  { chiave: 'tutti', nome: 'Valet e partner' },
  { chiave: 'valet', nome: 'Solo valet' },
  { chiave: 'partner', nome: 'Solo partner' },
] as const

export function soggettoVoceValido(v: string): boolean {
  return SOGGETTI_VOCE.some((s) => s.chiave === v)
}

/** La voce si applica a questo tipo di soggetto? */
export function voceSiApplica(soggettoVoce: string, tipo: string): boolean {
  return soggettoVoce === 'tutti' || soggettoVoce === tipo
}

// ── Le fasce del punteggio finale (0-100) ───────────────────────────────────

export type FasciaPunteggio = {
  chiave: 'ottimo' | 'buono' | 'attenzione' | 'critico'
  nome: string
  colore: string
}

const FASCE: FasciaPunteggio[] = [
  { chiave: 'ottimo', nome: 'Ottimo', colore: '#248a3d' },
  { chiave: 'buono', nome: 'Buono', colore: '#b8963e' },
  { chiave: 'attenzione', nome: 'Attenzione', colore: '#c93400' },
  { chiave: 'critico', nome: 'Critico', colore: '#d70015' },
]

/** ≥85 Ottimo · ≥70 Buono · ≥50 Attenzione · sotto Critico. */
export function fasciaDaPunteggio(punteggio: number): FasciaPunteggio {
  if (punteggio >= 85) return FASCE[0]
  if (punteggio >= 70) return FASCE[1]
  if (punteggio >= 50) return FASCE[2]
  return FASCE[3]
}

// ── I dati grezzi di un soggetto, da cui si ricavano i sotto-punteggi ────────

export type Voce = {
  id: string
  nome: string
  soggetto: string
  fonte: string
  peso: number
  soglia: number
}

export type DatiSoggetto = {
  tipo: string // valet | partner
  id: string
  nome: string
  /** I reclami imputati al soggetto. */
  reclami: { gravita: number; stato: string }[]
  /** I voti dei feedback ricevuti (1-5). */
  votiFeedback: number[]
  /** I ritardi in minuti delle consegne misurate (solo valet). */
  ritardi: number[]
  /** I valori manuali, per id di voce. */
  manuali: Record<string, number>
}

export type SottoPunteggio = {
  voceId: string
  nome: string
  fonte: string
  peso: number
  /** 0-100, oppure null se per questo soggetto la voce non ha dati. */
  valore: number | null
  /** Come si è arrivati al valore, in parole: si mostra all'operatore. */
  dettaglio: string
}

function arrotonda(n: number): number {
  return Math.round(n * 10) / 10
}

/** Tiene un numero dentro 0-100. */
function limita(n: number): number {
  return Math.max(0, Math.min(100, n))
}

// ── I sotto-punteggi, una fonte per volta ───────────────────────────────────
//
// Ognuna torna `{ v, d }` — il valore 0-100 e come ci si è arrivati — oppure
// `null` quando per quel soggetto non c'è nulla da misurare.

type Esito = { v: number; d: string }

/**
 * Reclami → 0-100. Si parte da 100 e si scende in proporzione al punteggio-
 * reclami (la somma delle gravità, dimezzata per i risolti — vedi
 * `giudizioAutomatico`). La `soglia` dice quale punteggio-reclami azzera la
 * voce: con soglia 10, un punteggio-reclami di 5 vale 50.
 *
 * Nessun reclamo = 100 e non "nessun dato": non aver ricevuto reclami è
 * un'informazione, e buona.
 */
function daReclami(dati: DatiSoggetto, soglia: number): Esito {
  const sogliaValida = soglia > 0 ? soglia : 10
  const { punteggio } = giudizioAutomatico(dati.reclami)
  const valore = limita(100 - (punteggio / sogliaValida) * 100)
  const d = dati.reclami.length
    ? `${dati.reclami.length} reclami, peso ${punteggio} su soglia ${sogliaValida}`
    : 'nessun reclamo'
  return { v: arrotonda(valore), d }
}

/** Feedback → 0-100: media dei voti 1-5 riportata su 0-100 (3 → 50). */
function daFeedback(dati: DatiSoggetto): Esito | null {
  if (!dati.votiFeedback.length) return null
  const media = dati.votiFeedback.reduce((s, v) => s + v, 0) / dati.votiFeedback.length
  return {
    v: arrotonda(limita(((media - 1) / 4) * 100)),
    d: `${dati.votiFeedback.length} feedback, media ${arrotonda(media)}/5`,
  }
}

/**
 * Puntualità → 0-100: quota di consegne arrivate entro la tolleranza
 * (`soglia` in minuti). Un anticipo conta come puntuale.
 */
function daPuntualita(dati: DatiSoggetto, soglia: number): Esito | null {
  if (!dati.ritardi.length) return null
  const tolleranza = soglia >= 0 ? soglia : 0
  const inOrario = dati.ritardi.filter((m) => m <= tolleranza).length
  const quota = (inOrario / dati.ritardi.length) * 100
  return {
    v: arrotonda(limita(quota)),
    d: `${inOrario} su ${dati.ritardi.length} entro ${tolleranza} min`,
  }
}

/** Manuale → il valore impostato, se c'è. */
function daManuale(dati: DatiSoggetto, voceId: string): Esito | null {
  const v = dati.manuali[voceId]
  if (v === undefined || v === null) return null
  return { v: arrotonda(limita(v)), d: `impostato a mano: ${arrotonda(limita(v))}/100` }
}

// ── Il calcolo completo ─────────────────────────────────────────────────────

/**
 * Quanto peso deve essere coperto da dati veri prima di prendere sul serio un
 * punteggio. Sotto questa quota il numero si mostra, ma come "Da valutare":
 * un partner che risulta 100 solo perché non ha ancora reclami non è "Ottimo",
 * è semplicemente uno di cui non sappiamo niente. Chiamarlo Ottimo sarebbe
 * dire più di quello che abbiamo misurato.
 */
export const COPERTURA_MINIMA = 0.5

export type Pagella = {
  tipo: string
  id: string
  nome: string
  /** 0-100, oppure null se non c'è un solo dato su cui giudicare. */
  punteggio: number | null
  fascia: FasciaPunteggio | null
  sotto: SottoPunteggio[]
  /** Quante voci hanno contribuito e quante sono state escluse per mancanza di dati. */
  vociUsate: number
  vociSenzaDati: number
  /** Quota del peso applicabile davvero coperta da dati (0-1). */
  copertura: number
  /**
   * `true` se il punteggio si regge su prove sufficienti (vedi
   * COPERTURA_MINIMA). Quando è `false` il numero c'è ma non va letto come un
   * giudizio: va letto come "manca troppo per dirlo".
   */
  attendibile: boolean
}

/**
 * La pagella di un soggetto: applica le voci che lo riguardano, ne fa la media
 * pesata e restituisce anche il dettaglio voce per voce.
 *
 * Le voci senza dati restano nell'elenco con `valore: null` (così l'operatore
 * vede cosa NON è stato misurato) ma non entrano nella media.
 */
export function calcolaPagella(dati: DatiSoggetto, voci: Voce[]): Pagella {
  const applicabili = voci.filter((v) => voceSiApplica(v.soggetto, dati.tipo))

  const sotto: SottoPunteggio[] = applicabili.map((v) => {
    let esito: Esito | null = null
    if (v.fonte === 'reclami') esito = daReclami(dati, v.soglia)
    else if (v.fonte === 'feedback') esito = daFeedback(dati)
    else if (v.fonte === 'puntualita') esito = daPuntualita(dati, v.soglia)
    else if (v.fonte === 'manuale') esito = daManuale(dati, v.id)

    return {
      voceId: v.id,
      nome: v.nome,
      fonte: v.fonte,
      peso: v.peso,
      valore: esito ? esito.v : null,
      dettaglio: esito ? esito.d : 'nessun dato',
    }
  })

  // Media pesata sulle sole voci con dati e con peso > 0.
  const conDati = sotto.filter((s) => s.valore !== null && s.peso > 0)
  const pesoUsato = conDati.reduce((t, s) => t + s.peso, 0)
  const punteggio =
    pesoUsato > 0
      ? arrotonda(conDati.reduce((t, s) => t + (s.valore as number) * s.peso, 0) / pesoUsato)
      : null

  // Quanto del peso che POTEVA essere misurato lo è stato davvero: è questo che
  // dice se il punteggio è un giudizio o solo un'impressione.
  const pesoApplicabile = sotto.reduce((t, s) => t + s.peso, 0)
  const copertura = pesoApplicabile > 0 ? pesoUsato / pesoApplicabile : 0
  const attendibile = punteggio !== null && copertura >= COPERTURA_MINIMA

  return {
    tipo: dati.tipo,
    id: dati.id,
    nome: dati.nome,
    punteggio,
    // La fascia (Ottimo/Buono/…) si dà solo se le prove bastano: altrimenti
    // sarebbe un'etichetta più sicura del dato che la regge.
    fascia: attendibile ? fasciaDaPunteggio(punteggio as number) : null,
    sotto,
    vociUsate: conDati.length,
    vociSenzaDati: sotto.length - conDati.length,
    copertura: Math.round(copertura * 100) / 100,
    attendibile,
  }
}

/**
 * Le voci di partenza, proposte al primo avvio: coprono esattamente quello che
 * serve — i partner su feedback e reclami, i valet su puntualità e feedback — e
 * restano tutte modificabili.
 */
export const VOCI_INIZIALI = [
  {
    nome: 'Reclami',
    descrizione: 'Quanti reclami gli sono stati imputati, e quanto gravi. I risolti pesano metà.',
    soggetto: 'tutti',
    fonte: 'reclami',
    peso: 3,
    soglia: 10,
  },
  {
    nome: 'Feedback dei clienti',
    descrizione: 'La media dei voti da 1 a 5 raccolti dai clienti.',
    soggetto: 'tutti',
    fonte: 'feedback',
    peso: 3,
    soglia: 0,
  },
  {
    nome: 'Puntualità',
    descrizione: 'Quota di consegne arrivate entro 15 minuti dall’orario atteso.',
    soggetto: 'valet',
    fonte: 'puntualita',
    peso: 4,
    soglia: 15,
  },
  {
    nome: 'Qualità del prodotto',
    descrizione:
      'Valutazione nostra su fiori e confezionamento. Esempio di variabile impostata a mano: cambiala o aggiungine altre.',
    soggetto: 'partner',
    fonte: 'manuale',
    peso: 2,
    soglia: 0,
  },
] as const
