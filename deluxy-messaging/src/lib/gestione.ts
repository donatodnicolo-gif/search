// Lo stato di lavorazione di un ordine DA PARTE NOSTRA, distinto dallo stato
// della pipeline di Deluxy Orders (`statoChiave`): quello dice a che punto è
// l'ordine per l'azienda, questo dice cosa abbiamo fatto noi in questa app.
// Lo scarico da Orders non lo sovrascrive mai.

export const GESTIONI = [
  { chiave: 'da_gestire', nome: 'Da gestire', colore: '#6e6e73' },
  { chiave: 'in_pagamento', nome: 'In pagamento', colore: '#c93400' },
  { chiave: 'comunicazione', nome: 'Comunicazione con cliente', colore: '#0071e3' },
  { chiave: 'gestito', nome: 'Gestito', colore: '#248a3d' },
] as const

export type ChiaveGestione = (typeof GESTIONI)[number]['chiave']

export function gestioneValida(v: string): v is ChiaveGestione {
  return GESTIONI.some((g) => g.chiave === v)
}

export function nomeGestione(chiave: string): string {
  return GESTIONI.find((g) => g.chiave === chiave)?.nome ?? 'Da gestire'
}

export function coloreGestione(chiave: string): string {
  return GESTIONI.find((g) => g.chiave === chiave)?.colore ?? '#6e6e73'
}
