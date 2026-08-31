// QUANDO LA CONSEGNA PARTE, L'ORDINE QUI È FINITO.
//
// Chiesto dall'utente il 31/08/2026: «controlla da app deluxy delivery gli
// ordini con ddt in consegna e segnali come gestito».
//
// Il caso vero: un ordine passa alla piattaforma, un valet lo prende, la
// consegna parte — e nella nostra bacheca quell'ordine resta lì, aperto, in
// mezzo a quelli da lavorare. Chi apre la lista non ha modo di sapere che è già
// per strada, e lo rilavora: chiama il fornitore, cerca il valet, riapre una
// conversazione chiusa.
//
// ⚠️⚠️ IL PONTE È IL DDT, ed è per questo che si scrive col BRAND. La consegna
// di là porta `ddtNumber` (il nostro numero d'ordine) e `ddtBrand`: «1798» da
// solo esiste su più negozi — Cake e Deluxy hanno numerazioni che si
// sovrappongono — e chiudere l'ordine sbagliato vorrebbe dire togliere dalla
// bacheca un lavoro che nessuno ha fatto.
//
// ⚠️ Si legge a PAGINE con un cursore (`aggiornateDa`), una chiamata a giro:
// chiedere consegna per consegna vorrebbe dire centinaia di richieste a una
// app che non è un nostro database.

import { db } from './db'
import { leggiImpostazioni, salvaImpostazione } from './impostazioni'
import { consegneAggiornate, type ConsegnaDdt } from './piattaforma'
import { CHIUSURA } from './gestione'

const CHIAVE_ULTIMO = 'piattaformaConsegneUltimo'
const CHIAVE_ESITO = 'piattaformaConsegneEsito'

/**
 * Gli stati che dicono «è partita, il lavoro è loro».
 *
 * ⚠️ Elenco POSITIVO e corto. `created`, `assigned`, `accepted` NON chiudono
 * niente: la consegna esiste ma non si è mossa, e un ordine tolto dalla bacheca
 * mentre è ancora fermo è un ordine che nessuno guarda più.
 * ⚠️ `not_delivered`, `cancelled`, `not_accepted` nemmeno — anzi: quelle
 * TORNANO a noi, ed è il momento in cui bisogna accorgersene.
 */
export const STATI_CHE_CHIUDONO = ['in_delivery', 'delivered']

export type EsitoConsegne = {
  lette: number
  chiuse: number
  giaChiuse: number
  ambigue: number
  senzaOrdine: number
  righe: string[]
  errore: string
}

/** «#1798» e «1798» sono lo stesso numero: si confronta la forma nuda. */
function nudo(numero: string): string {
  return (numero ?? '').trim().replace(/^#+/, '').toLowerCase()
}

/**
 * Chiude gli ordini la cui consegna è partita.
 *
 * ⚠️ `prova: true` non scrive niente: serve a guardare cosa cambierebbe prima
 * di far sparire delle righe dalla bacheca di chi lavora.
 */
export async function chiudiOrdiniInConsegna(
  opz: { prova?: boolean } = {}
): Promise<EsitoConsegne> {
  const esito: EsitoConsegne = {
    lette: 0,
    chiuse: 0,
    giaChiuse: 0,
    ambigue: 0,
    senzaOrdine: 0,
    righe: [],
    errore: '',
  }

  const c = await leggiImpostazioni([CHIAVE_ULTIMO])
  // ⚠️ Un'ora indietro rispetto all'ultimo giro: se una scrittura di là e la
  // nostra lettura si incrociano al secondo, senza margine quella consegna non
  // la vedremmo mai più.
  const da = c[CHIAVE_ULTIMO] ? new Date(new Date(c[CHIAVE_ULTIMO]).getTime() - 3600 * 1000) : null

  const risposta = await consegneAggiornate(da)
  if (risposta.stato === 'non-configurato') {
    esito.errore = 'Chiave della piattaforma non configurata (Impostazioni).'
    return esito
  }
  if (risposta.stato === 'errore') {
    esito.errore = risposta.messaggio
    return esito
  }
  if (risposta.stato === 'non-trovato') {
    esito.errore = 'La piattaforma non ha la rotta delle consegne.'
    return esito
  }

  const consegne: ConsegnaDdt[] = risposta.dati.consegne ?? []
  esito.lette = consegne.length

  for (const co of consegne) {
    if (!STATI_CHE_CHIUDONO.includes((co.stato ?? '').trim())) continue
    const numero = nudo(co.ddtNumero ?? '')
    if (!numero) {
      esito.senzaOrdine++
      continue
    }

    // ⚠️⚠️ IL NUMERO DA SOLO NON BASTA: si cercano tutte e due le forme e poi si
    // stringe col BRAND. Se restano due ordini — stesso numero su due negozi e
    // nessun brand scritto sulla consegna — non si chiude NIENTE: chiudere
    // quello sbagliato toglie dalla bacheca un lavoro che nessuno ha fatto, e
    // non se ne accorge nessuno perché la riga semplicemente sparisce.
    const candidati = await db.ordine.findMany({
      where: { numero: { in: [numero, `#${numero}`] } },
      select: { id: true, numero: true, negozioNome: true, gestione: true },
    })
    if (candidati.length === 0) {
      esito.senzaOrdine++
      continue
    }
    const brand = (co.ddtBrand ?? '').trim().toLowerCase()
    const scelti = brand
      ? candidati.filter((o) => (o.negozioNome ?? '').trim().toLowerCase() === brand)
      : candidati
    if (scelti.length !== 1) {
      esito.ambigue++
      esito.righe.push(
        `consegna ${co.numero ?? co.id}: ddt ${numero}${brand ? ` (${brand})` : ' senza brand'} → ${scelti.length} ordini, non chiudo niente`
      )
      continue
    }

    const o = scelti[0]
    if (o.gestione === CHIUSURA) {
      esito.giaChiuse++
      continue
    }

    esito.chiuse++
    esito.righe.push(
      `${o.numero} (${o.negozioNome}) → gestito: consegna ${co.numero ?? ''} ${co.stato}`
    )
    if (opz.prova) continue

    await db.ordine.update({
      where: { id: o.id },
      data: {
        gestione: CHIUSURA,
        // ⚠️ Il nome dice che non è stata una persona: chi guarda la bacheca fra
        // un mese deve poter distinguere «chiuso da Federica» da «chiuso perché
        // la consegna è partita», che sono due fatti diversi.
        gestioneDaId: '',
        gestioneDaNome: 'Piattaforma consegne',
        gestioneIl: new Date(),
      },
    })
  }

  if (!opz.prova) {
    await salvaImpostazione(CHIAVE_ULTIMO, new Date().toISOString())
    await salvaImpostazione(
      CHIAVE_ESITO,
      `${new Date().toISOString()} · lette ${esito.lette}, chiuse ${esito.chiuse}, ambigue ${esito.ambigue}`
    )
  }
  return esito
}
