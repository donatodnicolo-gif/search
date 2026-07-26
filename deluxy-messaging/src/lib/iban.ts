// Verifica formale dell'IBAN: lunghezza per paese + checksum mod-97 (ISO 13616).
// Serve a non fidarsi ciecamente di quello che estrae l'AI: un IBAN letto male
// da un'immagine sfocata quasi sempre fallisce il checksum, e lo diciamo.
//
// Attenzione a cosa NON dimostra: un IBAN formalmente valido può comunque non
// esistere o non essere del titolare dichiarato. Qui si verifica la forma.

// Lunghezze ufficiali per paese (registro IBAN). Solo i paesi che ci servono
// più i principali europei; per gli altri si controlla il solo checksum.
const LUNGHEZZE: Record<string, number> = {
  AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20,
  ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26,
  IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15,
  PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, TR: 26,
  AE: 23, SA: 24, IL: 23,
}

export type EsitoIban = {
  valido: boolean
  normalizzato: string // senza spazi, maiuscolo
  formattato: string // a gruppi di 4, come si scrive
  paese: string
  motivo: string // perché non è valido (vuoto se valido)
}

/** Resto di `numero mod 97` calcolato a pezzi: l'IBAN è troppo lungo per un Number. */
function mod97(cifre: string): number {
  let resto = 0
  for (const c of cifre) {
    resto = (resto * 10 + Number(c)) % 97
  }
  return resto
}

export function verificaIban(grezzo: string): EsitoIban {
  const iban = (grezzo ?? '').replace(/[\s -]/g, '').toUpperCase()
  const vuoto: EsitoIban = {
    valido: false,
    normalizzato: iban,
    formattato: iban.replace(/(.{4})/g, '$1 ').trim(),
    paese: iban.slice(0, 2),
    motivo: '',
  }

  if (!iban) return { ...vuoto, motivo: 'IBAN mancante.' }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    return { ...vuoto, motivo: 'Formato non valido: servono 2 lettere di paese, 2 cifre di controllo, poi il conto.' }
  }

  const paese = iban.slice(0, 2)
  const attesa = LUNGHEZZE[paese]
  if (attesa && iban.length !== attesa) {
    return {
      ...vuoto,
      paese,
      motivo: `Lunghezza sbagliata per ${paese}: ${iban.length} caratteri invece di ${attesa}.`,
    }
  }

  // mod-97: si sposta in coda il prefisso paese+controllo e si convertono le
  // lettere in numeri (A=10 … Z=35). È valido se il resto è 1.
  const riordinato = iban.slice(4) + iban.slice(0, 4)
  const cifre = riordinato.replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55))
  if (mod97(cifre) !== 1) {
    return { ...vuoto, paese, motivo: 'Cifre di controllo errate: l’IBAN è stato letto o trascritto male.' }
  }

  return { valido: true, normalizzato: iban, formattato: vuoto.formattato, paese, motivo: '' }
}

/** La "stringa pulita" da copiare e mandare al cliente. */
export function stringaPagamento(d: {
  iban: string
  intestatario: string
  importo?: number
  valuta?: string
  causale?: string
}): string {
  const iban = verificaIban(d.iban).formattato || d.iban
  const parti = [`IBAN ${iban}`, `intestato a ${d.intestatario || '—'}`]
  if (d.importo && d.importo > 0) {
    parti.push(
      `importo ${d.importo.toLocaleString('it-IT', {
        style: 'currency',
        currency: d.valuta || 'EUR',
      })}`
    )
  }
  if (d.causale) parti.push(`causale «${d.causale}»`)
  return parti.join(' — ')
}
