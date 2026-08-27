// Customer Service — vocabolario dei reclami.
//
// Qui stanno gli stati di un reclamo, i tipi di colpa (a chi è imputabile) e i
// livelli di gravità, con nomi e colori per l'interfaccia. C'è anche il calcolo
// del GIUDIZIO AUTOMATICO: dato l'insieme dei reclami di un valet o di un
// partner, se ne ricava un punteggio e un'etichetta (Ottimo → Critico).

export const STATI_RECLAMO = [
  { chiave: 'aperto', nome: 'Aperto', colore: '#c93400' },
  { chiave: 'in_lavorazione', nome: 'In lavorazione', colore: '#0071e3' },
  { chiave: 'risolto', nome: 'Risolto', colore: '#248a3d' },
  { chiave: 'chiuso', nome: 'Chiuso', colore: '#6e6e73' },
] as const

export type ChiaveStatoReclamo = (typeof STATI_RECLAMO)[number]['chiave']

export function statoReclamoValido(v: string): v is ChiaveStatoReclamo {
  return STATI_RECLAMO.some((s) => s.chiave === v)
}

export function nomeStatoReclamo(chiave: string): string {
  return STATI_RECLAMO.find((s) => s.chiave === chiave)?.nome ?? 'Aperto'
}

export function coloreStatoReclamo(chiave: string): string {
  return STATI_RECLAMO.find((s) => s.chiave === chiave)?.colore ?? '#c93400'
}

/** Uno stato conta come "aperto/da lavorare" (non ancora chiuso). */
export function reclamoAperto(stato: string): boolean {
  return stato === 'aperto' || stato === 'in_lavorazione'
}

// A chi può essere imputato un reclamo. I due su cui si danno i giudizi sono
// `valet` e `partner`; gli altri servono a non forzare una colpa quando non c'è.
export const COLPA_TIPI = [
  { chiave: 'valet', nome: 'Valet (consegna)' },
  { chiave: 'partner', nome: 'Partner (fornitore)' },
  { chiave: 'azienda', nome: 'Deluxy (interno)' },
  { chiave: 'cliente', nome: 'Cliente' },
  { chiave: 'nessuno', nome: 'Da attribuire' },
] as const

export type ChiaveColpa = (typeof COLPA_TIPI)[number]['chiave']

export function colpaValida(v: string): v is ChiaveColpa {
  return COLPA_TIPI.some((c) => c.chiave === v)
}

export function nomeColpa(chiave: string): string {
  return COLPA_TIPI.find((c) => c.chiave === chiave)?.nome ?? 'Da attribuire'
}

/** Solo i tipi di colpa a cui ha senso dare un giudizio. */
export function colpaGiudicabile(tipo: string): tipo is 'valet' | 'partner' {
  return tipo === 'valet' || tipo === 'partner'
}

// Gravità del reclamo: pesa nel giudizio automatico.
// Escalation semantica (Libro UX §5): l'oro NON è mai uno stato — la Media era
// oro (#b8963e) e diventa arancio «attende un'azione»; la Grave sale a rosso
// «intervento adesso». La Lieve resta neutra. Valori allineati ai token
// --grey / --orange / --red.
export const GRAVITA = [
  { livello: 1, nome: 'Lieve', colore: '#8a8a8e' },
  { livello: 2, nome: 'Media', colore: '#c93400' },
  { livello: 3, nome: 'Grave', colore: '#d70015' },
] as const

export function nomeGravita(livello: number): string {
  return GRAVITA.find((g) => g.livello === livello)?.nome ?? 'Media'
}

export function coloreGravita(livello: number): string {
  return GRAVITA.find((g) => g.livello === livello)?.colore ?? '#c93400'
}

export function gravitaValida(v: number): boolean {
  return v === 1 || v === 2 || v === 3
}

// ── Giudizio automatico ─────────────────────────────────────────────────────
//
// L'idea: pochi reclami lievi non pesano, tanti reclami gravi sì. Sommiamo i
// pesi (gravità) dei reclami di un soggetto — dando meno peso a quelli già
// risolti, perché rimediati — e traduciamo il totale in un'etichetta. È volutamente
// trasparente: nessun numero magico nascosto, così l'operatore capisce da cosa
// nasce il giudizio (e può sempre sovrascriverlo con un giudizio manuale).

export type FasciaGiudizio = {
  chiave: 'ottimo' | 'buono' | 'attenzione' | 'critico'
  nome: string
  colore: string
}

const FASCE: FasciaGiudizio[] = [
  { chiave: 'ottimo', nome: 'Ottimo', colore: '#248a3d' },
  { chiave: 'buono', nome: 'Buono', colore: '#b8963e' },
  { chiave: 'attenzione', nome: 'Attenzione', colore: '#c93400' },
  { chiave: 'critico', nome: 'Critico', colore: '#d70015' },
]

export type RiepilogoReclami = {
  totale: number
  aperti: number
  risolti: number
  perGravita: { 1: number; 2: number; 3: number }
}

/** Il peso di un reclamo: la gravità, dimezzata se già risolto/chiuso. */
function pesoReclamo(gravita: number, stato: string): number {
  const g = gravitaValida(gravita) ? gravita : 2
  return reclamoAperto(stato) ? g : g / 2
}

/**
 * Da un elenco di reclami di UNO stesso soggetto ricava il punteggio (somma dei
 * pesi) e la fascia di giudizio.
 *
 * Soglie: 0 → Ottimo, ≤2 → Buono, ≤6 → Attenzione, oltre → Critico.
 * Sono tarate così perché UN reclamo grave ancora aperto (peso 3) deve già
 * accendere "Attenzione": con la soglia a 3 restava "Buono", che è troppo
 * indulgente su un problema serio non ancora risolto. Lo stesso reclamo una
 * volta risolto pesa 1,5 e torna "Buono" — rimediare conta.
 */
export function giudizioAutomatico(
  reclami: { gravita: number; stato: string }[]
): { punteggio: number; fascia: FasciaGiudizio } {
  const punteggio = reclami.reduce((s, r) => s + pesoReclamo(r.gravita, r.stato), 0)
  let fascia: FasciaGiudizio
  if (punteggio === 0) fascia = FASCE[0]
  else if (punteggio <= 2) fascia = FASCE[1]
  else if (punteggio <= 6) fascia = FASCE[2]
  else fascia = FASCE[3]
  return { punteggio: Math.round(punteggio * 10) / 10, fascia }
}

/** Conteggi utili da mostrare accanto al giudizio. */
export function riepilogaReclami(reclami: { gravita: number; stato: string }[]): RiepilogoReclami {
  const perGravita = { 1: 0, 2: 0, 3: 0 } as { 1: number; 2: number; 3: number }
  let aperti = 0
  let risolti = 0
  for (const r of reclami) {
    const g = gravitaValida(r.gravita) ? (r.gravita as 1 | 2 | 3) : 2
    perGravita[g]++
    if (reclamoAperto(r.stato)) aperti++
    else risolti++
  }
  return { totale: reclami.length, aperti, risolti, perGravita }
}
