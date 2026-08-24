// CHE COSA ABBIAMO IN MANO PER RISPONDERE A UNA CONTESTAZIONE.
//
// ⚠️⚠️ La pagina Chargeback sapeva dire quanto manca alla scadenza e sapeva
// mandare le prove, ma non diceva **se le prove esistono**. Chi apriva la
// schermata trovava «da rispondere, 12 giorni» e un riquadro di testo vuoto: per
// sapere se avevamo qualcosa da opporre bisognava andare a cercare l'ordine, le
// conversazioni e il fornitore, uno per uno. È il motivo per cui, contate il
// 19/08, dieci contestazioni erano state perse per 2.087,66 € con le prove mai
// partite: non perché qualcuno avesse deciso di non rispondere, ma perché
// rispondere cominciava con mezz'ora di ricerche.
//
// ⚠️⚠️ E il verdetto qui dentro può essere SCOMODO. Se dei nostri archivi non
// risulta nessuna consegna, questo file lo dice — non cerca un modo di
// presentare bene la cosa. Una difesa costruita su una consegna che non
// risulta è una dichiarazione falsa mandata a una banca, e vale molto più dei
// cento euro in ballo.
//
// ⚠️ Questo file NON importa `db`: lo legge anche la pagina, che è client.

export type ProveOrdine = {
  /** Se l'ordine è ancora nella nostra copia di 60 giorni. */
  trovato: boolean
  gestione: string
  gestioneIl: string | null
  gestioneDaNome: string
  fornitoreNome: string
  dataConsegna: string | null
  fasciaConsegna: string
  citta: string
  conversazioni: number
  ultimoMessaggioIl: string | null
  /** Un pagamento al fornitore è la prova che qualcuno l'ha preparato. */
  pagatoAlFornitore: number | null
}

export type Verdetto = {
  livello: 'abbiamo' | 'poco' | 'niente' | 'non-si-sa'
  titolo: string
  spiegazione: string
  /** Le cose vere che si possono mettere nella risposta. */
  punti: string[]
}

/**
 * Gli stati di lavorazione che dicono «questo ordine è stato portato a
 * termine». ⚠️ `gestito` NON è fra questi in modo assoluto: vuol dire che un
 * operatore l'ha spuntato, che è una testimonianza, non una prova di consegna.
 */
const STATI_CONCLUSI = ['consegnato', 'attesa_consegna', 'gestito', 'in_pagamento']

export function valuta(p: ProveOrdine, motivo: string): Verdetto {
  if (!p.trovato) {
    return {
      livello: 'non-si-sa',
      titolo: 'L’ordine è fuori dalla nostra copia',
      spiegazione:
        'Teniamo qui gli ordini degli ultimi 60 giorni: questo è più vecchio. Le prove ci sono, ma vanno prese da Shopify e dall’archivio Ordini.',
      punti: [],
    }
  }

  const punti: string[] = []
  if (p.fornitoreNome) {
    punti.push(
      p.pagatoAlFornitore !== null
        ? `L’ordine è stato preparato da ${p.fornitoreNome}, che abbiamo pagato ${p.pagatoAlFornitore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}.`
        : `L’ordine è stato affidato a ${p.fornitoreNome}.`
    )
  }
  if (p.dataConsegna) {
    punti.push(
      `Consegna prevista per il ${new Date(p.dataConsegna).toLocaleDateString('it-IT')}${
        p.fasciaConsegna ? `, fascia ${p.fasciaConsegna}` : ''
      }${p.citta ? `, a ${p.citta}` : ''}.`
    )
  }
  if (STATI_CONCLUSI.includes(p.gestione) && p.gestioneIl) {
    punti.push(
      `Il ${new Date(p.gestioneIl).toLocaleDateString('it-IT')} l’ordine è stato segnato «${p.gestione.replace(/_/g, ' ')}»${
        p.gestioneDaNome ? ` da ${p.gestioneDaNome}` : ''
      }.`
    )
  }
  if (p.conversazioni > 0) {
    punti.push(
      `Con il cliente ci sono ${p.conversazioni} ${p.conversazioni === 1 ? 'conversazione' : 'conversazioni'}${
        p.ultimoMessaggioIl
          ? `, l’ultimo messaggio del ${new Date(p.ultimoMessaggioIl).toLocaleDateString('it-IT')}`
          : ''
      }.`
    )
  }

  // ⚠️⚠️ IL CASO SCOMODO, e si dice per primo. «Mai ricevuto» contro un ordine
  // che dai nostri archivi non risulta nemmeno lavorato non è una contestazione
  // da combattere: è probabilmente vera.
  const maiLavorato = ['da_gestire', 'ricerca_fornitore'].includes(p.gestione)
  if (motivo === 'product_not_received' && maiLavorato && !p.fornitoreNome) {
    return {
      livello: 'niente',
      titolo: 'Dai nostri archivi questo ordine non risulta lavorato',
      spiegazione:
        'Nessun fornitore, nessuna conversazione col cliente, e lo stato è ancora quello di partenza. Il cliente dice di non aver ricevuto niente e da qui non risulta il contrario: prima di rispondere serve una verifica fuori dall’app. Se non ha ricevuto, la strada è il rimborso, non la difesa.',
      punti,
    }
  }
  if (!punti.length) {
    return {
      livello: 'niente',
      titolo: 'Non abbiamo niente da opporre',
      spiegazione:
        'Di quest’ordine non risulta né chi l’ha preparato, né una consegna, né uno scambio col cliente. Una risposta senza fatti si perde, e costa il tempo di scriverla.',
      punti,
    }
  }
  if (punti.length === 1) {
    return {
      livello: 'poco',
      titolo: 'Abbiamo poco',
      spiegazione:
        'Un elemento solo. Vale la pena cercare anche fuori dall’app — la conferma del fornitore, una foto della consegna, un messaggio del destinatario — prima di mandare le prove: si può mandare una volta sola.',
      punti,
    }
  }
  return {
    livello: 'abbiamo',
    titolo: `Abbiamo ${punti.length} elementi da mettere nella risposta`,
    spiegazione:
      'Sono fatti presi dai nostri archivi. Rileggili: vanno nella risposta solo quelli veri e verificabili, e le prove si mandano una volta sola.',
    punti,
  }
}

/** I giorni che restano, contati come li conta chi deve decidere cosa fare. */
export function giorniAllaScadenza(iso: string | null, adesso: number): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - adesso) / 86400000)
}
