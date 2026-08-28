// ── LE SCORCIATOIE DI PERIODO (Libro UX&UI v1.9 §8-bis) ──
//
// Un valore solo («mese» | «scorso» | «trimestre» | «anno»), non quattro date:
// si traduce in un intervallo [da, a) sul campo data che ogni pagina dichiara.
// Semantica del Libro: mese = mese corrente; scorso = mese precedente;
// trimestre = ultimi 3 mesi INCLUSO il corrente; anno = anno solare corrente.
//
// ⚠️ La regola vive QUI e in nessun altro posto: quattro pagine che si
// calcolano il «mese scorso» per conto loro prima o poi lo calcolano diverso.

export type Periodo = '' | 'mese' | 'scorso' | 'trimestre' | 'anno'

export const PERIODI: { chiave: Exclude<Periodo, ''>; nome: string }[] = [
  { chiave: 'mese', nome: 'Mese in corso' },
  { chiave: 'scorso', nome: 'Mese scorso' },
  { chiave: 'trimestre', nome: 'Trimestre' },
  { chiave: 'anno', nome: 'Anno' },
]

/** Il parametro come arriva dall'indirizzo: tutto ciò che non è un periodo è ''. */
export function periodoValido(v: string | null | undefined): Periodo {
  return v === 'mese' || v === 'scorso' || v === 'trimestre' || v === 'anno' ? v : ''
}

/**
 * L'intervallo [da, a) del periodo. `null` = nessun filtro.
 *
 * ⚠️ I confini sono le mezzanotti locali del primo del mese — nel browser il
 * fuso di chi guarda, nelle rotte quello del server (UTC su Vercel: ±2 ore sul
 * confine). Per delle SCORCIATOIE va bene così: dove serve il giorno esatto
 * restano le date libere o i filtri della pagina.
 */
export function intervalloPeriodo(
  periodo: Periodo,
  oggi = new Date()
): { da: Date; a: Date } | null {
  const anno = oggi.getFullYear()
  const mese = oggi.getMonth()
  switch (periodo) {
    case 'mese':
      return { da: new Date(anno, mese, 1), a: new Date(anno, mese + 1, 1) }
    case 'scorso':
      // Il Date di JavaScript scavalca l'anno da solo: mese −1 a gennaio è
      // dicembre dell'anno prima.
      return { da: new Date(anno, mese - 1, 1), a: new Date(anno, mese, 1) }
    case 'trimestre':
      return { da: new Date(anno, mese - 2, 1), a: new Date(anno, mese + 1, 1) }
    case 'anno':
      return { da: new Date(anno, 0, 1), a: new Date(anno + 1, 0, 1) }
    default:
      return null
  }
}

/**
 * Per i filtri in memoria delle pagine client: la data (ISO) cade nel periodo?
 * ⚠️ Una riga SENZA data non cade in nessun periodo: dire che è «di questo
 * mese» sarebbe dedurre un dato che non c'è.
 */
export function nelPeriodo(iso: string | null | undefined, periodo: Periodo): boolean {
  const i = intervalloPeriodo(periodo)
  if (!i) return true
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= i.da.getTime() && t < i.a.getTime()
}
