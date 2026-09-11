// Customer Service — le richieste di rimborso.
//
// ⚠️ QUI NON SI RIMBORSA NIENTE. Si registra che un rimborso è stato chiesto,
// approvato o rifiutato; i soldi li muove una persona (da Shopify o dalla
// banca) e poi lo si segna come "eseguito". Vale la regola di tutto il repo:
// nessuna app Deluxy paga per conto proprio.

export const STATI_RIMBORSO = [
  { chiave: 'richiesto', nome: 'Da approvare', colore: '#c93400' },
  { chiave: 'approvato', nome: 'Approvato', colore: '#0071e3' },
  { chiave: 'eseguito', nome: 'Rimborsato', colore: '#248a3d' },
  { chiave: 'rifiutato', nome: 'Rifiutato', colore: '#6e6e73' },
  { chiave: 'annullato', nome: 'Annullato', colore: '#6e6e73' },
] as const

export type ChiaveStatoRimborso = (typeof STATI_RIMBORSO)[number]['chiave']

export function statoRimborsoValido(v: string): v is ChiaveStatoRimborso {
  return STATI_RIMBORSO.some((s) => s.chiave === v)
}

export function nomeStatoRimborso(chiave: string): string {
  return STATI_RIMBORSO.find((s) => s.chiave === chiave)?.nome ?? 'Da approvare'
}

export function coloreStatoRimborso(chiave: string): string {
  return STATI_RIMBORSO.find((s) => s.chiave === chiave)?.colore ?? '#c93400'
}

/**
 * Uno stato che IMPEGNA del denaro: la richiesta è viva o già pagata, quindi il
 * suo importo va contato quando si controlla di non rendere più dell'incassato.
 * Rifiutato e annullato non impegnano niente.
 */
export function rimborsoImpegna(stato: string): boolean {
  return stato === 'richiesto' || stato === 'approvato' || stato === 'eseguito'
}

/** Una richiesta ancora da lavorare (non decisa o decisa ma non pagata). */
export function rimborsoAperto(stato: string): boolean {
  return stato === 'richiesto' || stato === 'approvato'
}

/**
 * ⭐ 11/09/2026 — LO STORICO (utente: «crea una sezione storico dove far andare
 * i rimborsi approvati o meno»): le richieste su cui non c'è più niente da
 * fare — rese, rifiutate, annullate.
 *
 * ⚠️⚠️ Un rimborso APPROVATO ma non ancora reso NON sta qui: la decisione è
 * presa, ma i soldi al cliente non sono usciti, e toglierlo dalla vista di
 * lavoro vorrebbe dire promettere un rimborso e poi dimenticarlo — che è
 * esattamente il caso che questa pagina esiste per non far succedere. Passa
 * nello storico quando è «Rimborsato».
 */
export function rimborsoStorico(stato: string): boolean {
  return stato === 'eseguito' || stato === 'rifiutato' || stato === 'annullato'
}

/** Gli stati che compongono le due viste, per le query e i conteggi. */
export const STATI_DA_LAVORARE = ['richiesto', 'approvato'] as const
export const STATI_STORICO = ['eseguito', 'rifiutato', 'annullato'] as const

// ── Controlli sull'importo ──────────────────────────────────────────────────
//
// I soldi non si arrotondano a occhio: gli importi arrivano da Shopify come
// float, quindi i confronti si fanno sui centesimi interi. Senza questo,
// 100 - 33.33 - 33.33 - 33.34 può dare -0.000000001 e un rimborso legittimo
// verrebbe rifiutato.

function centesimi(v: number): number {
  return Math.round(v * 100)
}

export function soldi(v: number, valuta = 'EUR'): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

/**
 * ⭐ 11/09/2026 — CHE COSA SI CONCRETIZZA (utente: «mostra in tabella l'azione
 * che si concretizza», dopo aver dovuto chiedere che cosa facesse «Approva»).
 *
 * ⚠️⚠️ Le due azioni di questa pagina si somigliano e fanno cose opposte:
 * **approvare** scrive una decisione e non muove un euro, **rimborsare su
 * Shopify** fa uscire i soldi davvero. Chi guarda l'elenco deve leggere quale
 * delle due sta per succedere SENZA aprire niente e senza chiederlo a
 * qualcuno — che è esattamente com'è andata la prima volta.
 *
 * Torna due righe: l'azione chiesta (`cosa`) e che cosa fa il bottone che si
 * vede adesso (`ora`).
 */
export function azioneRimborso(
  r: { stato: string; tipo: string; importo: number; importoOrdine: number; valuta: string },
  ruolo = 'operatore'
): { cosa: string; ora: string } {
  const quanto = soldi(r.importo, r.valuta)
  const chiesto =
    r.tipo === 'totale'
      ? `Rendere ${quanto} al cliente (tutto l'ordine)`
      : `Rendere ${quanto} dei ${soldi(r.importoOrdine, r.valuta)} pagati`
  switch (r.stato) {
    case 'richiesto':
      return {
        cosa: chiesto,
        // ⚠️ Si dice che NON muove soldi: è la domanda che si fa chi ha il dito
        // sul bottone, e la risposta non stava da nessuna parte.
        ora: 'Approva registra la decisione: nessun soldo si muove',
      }
    case 'approvato':
      return {
        cosa: chiesto,
        ora:
          ruolo === 'admin'
            ? `«Rimborsa su Shopify» rende ${quanto} sul metodo con cui ha pagato`
            : 'Il rimborso vero lo fa un amministratore',
      }
    case 'eseguito':
      return { cosa: `${quanto} resi al cliente`, ora: 'Niente da fare: i soldi sono usciti' }
    case 'rifiutato':
      return { cosa: 'Nessun rimborso: richiesta rifiutata', ora: '' }
    case 'annullato':
      return { cosa: 'Nessun rimborso: richiesta annullata', ora: '' }
    default:
      return { cosa: chiesto, ora: '' }
  }
}

export type EsitoControllo = { ok: true } | { ok: false; errore: string }

/**
 * Si può chiedere questo rimborso?
 *
 * `giaImpegnato` è la somma dei rimborsi già chiesti/approvati/eseguiti sullo
 * stesso ordine (esclusa la richiesta che si sta modificando). Il tetto è il
 * totale dell'ordine: **non si rende più di quanto si è incassato**, ed è il
 * controllo per cui questa funzione esiste — una svista qui è denaro vero che
 * esce due volte.
 */
export function controllaImporto(
  importo: number,
  totaleOrdine: number,
  giaImpegnato = 0
): EsitoControllo {
  if (!Number.isFinite(importo) || centesimi(importo) <= 0) {
    return { ok: false, errore: 'L’importo del rimborso dev’essere maggiore di zero.' }
  }
  // Un ordine a zero (o senza totale noto) non ha un tetto da confrontare:
  // meglio lasciar passare e far decidere una persona che inventare un limite.
  if (centesimi(totaleOrdine) <= 0) return { ok: true }

  const residuo = centesimi(totaleOrdine) - centesimi(giaImpegnato)
  if (centesimi(importo) > residuo) {
    if (residuo <= 0) {
      return {
        ok: false,
        errore: `Su questo ordine è già stato chiesto o reso l’intero importo (${soldi(
          totaleOrdine
        )}): non c’è più niente da rimborsare.`,
      }
    }
    return {
      ok: false,
      errore: `Si può rimborsare al massimo ${soldi(residuo / 100)}: l’ordine vale ${soldi(
        totaleOrdine
      )} e ${soldi(giaImpegnato)} sono già impegnati in altre richieste.`,
    }
  }
  return { ok: true }
}

/** Totale o parziale, deciso sui centesimi. */
export function tipoRimborso(importo: number, totaleOrdine: number): 'totale' | 'parziale' {
  if (centesimi(totaleOrdine) <= 0) return 'parziale'
  return centesimi(importo) >= centesimi(totaleOrdine) ? 'totale' : 'parziale'
}

// ── Avvisi sullo stato del pagamento ────────────────────────────────────────
//
// Non bloccano: avvisano. Il dato di Shopify può essere in ritardo o incompleto,
// e chi ha parlato col cliente ne sa di più — ma deve saperlo prima di decidere,
// non scoprirlo dopo.

/**
 * Cosa c'è da sapere sul pagamento prima di chiedere un rimborso, o '' se non
 * c'è niente di strano.
 */
export function avvisoPagamento(statoPagamento: string): string {
  switch ((statoPagamento || '').toUpperCase()) {
    case 'REFUNDED':
      return 'Shopify risulta già RIMBORSATO per intero: controlla di non renderlo due volte.'
    case 'PARTIALLY_REFUNDED':
      return 'Shopify risulta già rimborsato in parte: verifica quanto è stato reso prima di aggiungere.'
    case 'VOIDED':
      return 'Il pagamento risulta STORNATO: il denaro potrebbe non essere mai stato incassato.'
    case 'PENDING':
      return 'L’ordine risulta NON ancora incassato: se non è entrato niente, non c’è niente da rendere.'
    case '':
      return 'Di questo ordine non conosciamo lo stato del pagamento: verificalo prima di approvare.'
    default:
      return ''
  }
}
