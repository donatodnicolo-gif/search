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
