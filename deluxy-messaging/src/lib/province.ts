// Le province italiane, per confrontarle.
//
// ⚠️⚠️ NASCE DA UN DATO MISURATO, non da un dubbio teorico: nel registro
// Anagrafiche la stessa provincia è scritta in due modi — 20 partner hanno «MI»
// e 9 hanno «MILANO», e ci sono «ROMA», «FIRENZE», «COMO», «ALESSANDRIA»
// accanto a «GE», «FI», «BG». Confrontando le stringhe così come sono, un
// ordine a Milano troverebbe 20 fornitori su 29 e nessuno se ne accorgerebbe:
// la lista sembrerebbe semplicemente più corta.
//
// Qui si riduce tutto alla SIGLA di due lettere, che è l'unica forma che non ha
// varianti.

/** Nome esteso → sigla. Sono le 107 province italiane. */
const SIGLE: Record<string, string> = {
  AGRIGENTO: 'AG', ALESSANDRIA: 'AL', ANCONA: 'AN', AOSTA: 'AO', AREZZO: 'AR',
  'ASCOLI PICENO': 'AP', ASTI: 'AT', AVELLINO: 'AV', BARI: 'BA',
  'BARLETTA-ANDRIA-TRANI': 'BT', BELLUNO: 'BL', BENEVENTO: 'BN', BERGAMO: 'BG',
  BIELLA: 'BI', BOLOGNA: 'BO', BOLZANO: 'BZ', BRESCIA: 'BS', BRINDISI: 'BR',
  CAGLIARI: 'CA', CALTANISSETTA: 'CL', CAMPOBASSO: 'CB', CASERTA: 'CE',
  CATANIA: 'CT', CATANZARO: 'CZ', CHIETI: 'CH', COMO: 'CO', COSENZA: 'CS',
  CREMONA: 'CR', CROTONE: 'KR', CUNEO: 'CN', ENNA: 'EN', FERMO: 'FM',
  FERRARA: 'FE', FIRENZE: 'FI', FOGGIA: 'FG', 'FORLI-CESENA': 'FC',
  'FORLÌ-CESENA': 'FC', FROSINONE: 'FR', GENOVA: 'GE', GORIZIA: 'GO',
  GROSSETO: 'GR', IMPERIA: 'IM', ISERNIA: 'IS', 'LA SPEZIA': 'SP',
  "L'AQUILA": 'AQ', LAQUILA: 'AQ', LATINA: 'LT', LECCE: 'LE', LECCO: 'LC',
  LIVORNO: 'LI', LODI: 'LO', LUCCA: 'LU', MACERATA: 'MC', MANTOVA: 'MN',
  'MASSA-CARRARA': 'MS', MASSA: 'MS', MATERA: 'MT', MESSINA: 'ME', MILANO: 'MI',
  MODENA: 'MO', 'MONZA E DELLA BRIANZA': 'MB', 'MONZA E BRIANZA': 'MB',
  MONZA: 'MB', NAPOLI: 'NA', NOVARA: 'NO', NUORO: 'NU', ORISTANO: 'OR',
  PADOVA: 'PD', PALERMO: 'PA', PARMA: 'PR', PAVIA: 'PV', PERUGIA: 'PG',
  'PESARO E URBINO': 'PU', PESCARA: 'PE', PIACENZA: 'PC', PISA: 'PI',
  PISTOIA: 'PT', PORDENONE: 'PN', POTENZA: 'PZ', PRATO: 'PO', RAGUSA: 'RG',
  RAVENNA: 'RA', 'REGGIO CALABRIA': 'RC', 'REGGIO EMILIA': 'RE', RIETI: 'RI',
  RIMINI: 'RN', ROMA: 'RM', ROVIGO: 'RO', SALERNO: 'SA', SASSARI: 'SS',
  SAVONA: 'SV', SIENA: 'SI', SIRACUSA: 'SR', SONDRIO: 'SO', SUD_SARDEGNA: 'SU',
  'SUD SARDEGNA': 'SU', TARANTO: 'TA', TERAMO: 'TE', TERNI: 'TR', TORINO: 'TO',
  TRAPANI: 'TP', TRENTO: 'TN', TREVISO: 'TV', TRIESTE: 'TS', UDINE: 'UD',
  VARESE: 'VA', VENEZIA: 'VE', 'VERBANO-CUSIO-OSSOLA': 'VB', VERBANIA: 'VB',
  VERCELLI: 'VC', VERONA: 'VR', 'VIBO VALENTIA': 'VV', VICENZA: 'VI',
  VITERBO: 'VT',
}

/**
 * Le province SOPPRESSE, ricondotte a quella di oggi.
 *
 * ⚠️⚠️ Non è pedanteria da atlante: Google Maps risponde ancora con le vecchie.
 * Misurato il 04/09/2026 — «Porto Rotondo» torna `OT` (Olbia-Tempio, abolita nel
 * 2016) mentre «Romazzino», che è a tre chilometri, torna `SS`. Senza questa
 * tabella lo stesso fornitore risulterebbe di due province diverse a seconda del
 * comune, e `siglaProvincia('OT')` tornerebbe vuoto — cioè «non lo sappiamo» su
 * un dato che sappiamo benissimo.
 */
const SOPPRESSE: Record<string, string> = {
  OT: 'SS', // Olbia-Tempio → Sassari
  OG: 'NU', // Ogliastra → Nuoro
  VS: 'SU', // Medio Campidano → Sud Sardegna
  CI: 'SU', // Carbonia-Iglesias → Sud Sardegna
}

/** Tutte le sigle valide, per riconoscerle quando arrivano già così. */
const TUTTE = new Set(Object.values(SIGLE))

/**
 * La sigla di due lettere, da qualunque forma arrivi.
 *
 * Torna stringa vuota quando non si riconosce: **meglio nessun risultato che
 * risultati di un'altra provincia**. Un fornitore proposto a 400 km fa perdere
 * una telefonata e la fiducia nella lista.
 */
export function siglaProvincia(valore: string | null | undefined): string {
  const v = (valore ?? '').trim().toUpperCase().replace(/[().]/g, '').trim()
  if (!v) return ''
  if (v.length === 2 && TUTTE.has(v)) return v
  if (v.length === 2 && SOPPRESSE[v]) return SOPPRESSE[v]
  const dritto = SIGLE[v]
  if (dritto) return dritto
  // «Firenze FI», «20144 Milano (MI)»: se dentro c'è una sigla nota, vale quella.
  const parole = v.split(/[\s,]+/).filter(Boolean)
  for (const p of parole) if (p.length === 2 && TUTTE.has(p)) return p
  for (const p of parole) if (SIGLE[p]) return SIGLE[p]
  for (const p of parole) if (p.length === 2 && SOPPRESSE[p]) return SOPPRESSE[p]
  return ''
}

/** Due province sono la stessa? Vuoto da una parte = no, mai «forse». */
export function stessaProvincia(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = siglaProvincia(a)
  const y = siglaProvincia(b)
  return !!x && x === y
}
