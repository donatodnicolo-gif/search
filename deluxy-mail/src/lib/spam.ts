// Valutazione spam "a punteggio", come i client veri ma in piccolo: nessun
// segnale da solo decide, si sommano indizi. Restituisce un livello:
//   - 'basso'  → non è spam, resta in posta
//   - 'medio'  → dubbio: lo decide l'AI (giudicaSpam)
//   - 'alto'   → spam evidente: in SPAM subito, senza spendere in AI
//
// Prudenza voluta: è una casella aziendale. Chi ti ha già scritto, chi è del
// tuo dominio o è un contatto AI NON viene mai marcato spam.

export type LivelloSpam = 'basso' | 'medio' | 'alto'
export type EsitoSpam = { livello: LivelloSpam; punteggio: number; motivi: string[] }

// Frasi tipiche di spam/phishing (IT + EN). Ognuna pesa; più ne trovi, più sale.
const FRASI: { re: RegExp; peso: number; nota: string }[] = [
  { re: /\b(hai vinto|you (have )?won|congratulazioni.*vinto|winner)\b/i, peso: 3, nota: 'annuncio di vincita' },
  { re: /\b(loteria|lotteria|lottery|jackpot|premio in denaro)\b/i, peso: 3, nota: 'lotteria/premio' },
  { re: /\b(eredit[àa]|inheritance|unclaimed funds|fondi non reclamati|prince)\b/i, peso: 3, nota: 'truffa eredità' },
  { re: /\b(verif(ica|y).{0,20}(account|conto|password)|conferma.{0,15}password|update your (details|account|password)|aggiorna i tuoi dati)\b/i, peso: 3, nota: 'phishing credenziali' },
  { re: /\b(account (sospeso|bloccato|suspended|locked|disabled)|attivit[àa] (insolita|sospetta)|unusual activity)\b/i, peso: 3, nota: 'account sospeso/attività insolita' },
  { re: /\b(bonifico urgente|wire transfer|western union|money ?gram|trasferimento fondi)\b/i, peso: 2, nota: 'richiesta di trasferimento denaro' },
  { re: /\b(viagra|cialis|farmacia online|online pharmacy|enlargement|ingrandimento)\b/i, peso: 3, nota: 'farmaci/adulti' },
  { re: /\b(bitcoin|crypto|criptovalut|investi.{0,15}(garantit|rendiment)|guadagn(a|are).{0,15}(casa|subito|facil))\b/i, peso: 2, nota: 'investimenti/guadagni facili' },
  { re: /\b(prestito|loan|credito (facile|immediato)|rimborso fiscale|tax refund)\b/i, peso: 2, nota: 'prestiti/rimborsi' },
  { re: /\b(clicca (qui|subito)|click here|act now|agisci (ora|subito)|offerta.{0,10}(scade|limited|last))\b/i, peso: 1, nota: 'invito urgente al click' },
  { re: /\b(free|gratis|100% (free|gratis|risk)|risk[- ]?free|nessun rischio)\b/i, peso: 1, nota: 'gratis/senza rischio' },
]

function contaLink(testo: string): number {
  return (testo.match(/https?:\/\//gi) || []).length
}

function dominioDa(email: string): string {
  const i = email.lastIndexOf('@')
  return i >= 0 ? email.slice(i + 1).toLowerCase() : ''
}

export function valutaSpam(
  m: { oggetto: string; corpoTesto: string; mittente: string; mittenteNome: string | null },
  ctx: { contattoNoto: boolean; dominioProprio: boolean; contattoAI: boolean }
): EsitoSpam {
  // Whitelist: chi conosci non è mai spam. Chiude subito il discorso.
  if (ctx.contattoNoto || ctx.dominioProprio || ctx.contattoAI) {
    return { livello: 'basso', punteggio: 0, motivi: [] }
  }

  const testo = `${m.oggetto}\n${m.corpoTesto}`
  const motivi: string[] = []
  let punti = 0

  for (const f of FRASI) {
    if (f.re.test(testo)) {
      punti += f.peso
      motivi.push(f.nota)
    }
  }

  // Oggetto tutto maiuscolo (con qualche lettera) o pieno di "!!!"
  const lettere = m.oggetto.replace(/[^A-Za-zÀ-ÿ]/g, '')
  if (lettere.length >= 6 && lettere === lettere.toUpperCase()) {
    punti += 1
    motivi.push('oggetto tutto maiuscolo')
  }
  if (/!{3,}/.test(m.oggetto + m.corpoTesto)) {
    punti += 1
    motivi.push('punteggiatura eccessiva')
  }

  // Link a indirizzi IP nudi o accorciatori: tipici del phishing.
  if (/https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(testo)) {
    punti += 2
    motivi.push('link verso un indirizzo IP')
  }
  if (/https?:\/\/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|ow\.ly)/i.test(testo)) {
    punti += 1
    motivi.push('link accorciato')
  }
  if (contaLink(testo) >= 8) {
    punti += 1
    motivi.push('molti link')
  }

  // Il nome mittente cita un marchio noto ma il dominio non c'entra → spoofing.
  const nome = (m.mittenteNome || '').toLowerCase()
  const dominio = dominioDa(m.mittente)
  const MARCHI = ['paypal', 'amazon', 'apple', 'microsoft', 'google', 'poste', 'intesa', 'unicredit', 'netflix', 'inps', 'agenzia entrate']
  for (const marca of MARCHI) {
    if (nome.includes(marca) && !dominio.includes(marca.replace(/\s/g, ''))) {
      punti += 3
      motivi.push(`sembra "${marca}" ma il dominio è ${dominio || 'sconosciuto'}`)
      break
    }
  }

  // Mittente sconosciuto: segnale debole, da solo non basta.
  punti += 1
  motivi.push('mittente mai visto prima')

  const livello: LivelloSpam = punti >= 5 ? 'alto' : punti >= 3 ? 'medio' : 'basso'
  return { livello, punteggio: punti, motivi }
}
