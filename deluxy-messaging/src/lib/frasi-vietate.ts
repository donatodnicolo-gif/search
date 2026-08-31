// QUELLO CHE UNA RISPOSTA AUTOMATICA NON PUÒ DIRE.
//
// ⚠️⚠️ IL CASO VERO (31/08/2026, segnalato dall'utente con lo schermo davanti).
// Una cliente manda la foto di una torta: «desidero questa però invece della
// scritta "Birthday Girl" vorrei "Twenty One"». La risposta automatica, fuori
// turno, è stata:
//
//   «mi dispiace informarla che il prodotto scelto non è attualmente
//    disponibile. Le propongo alternative di pari o superiore valore…»
//
// Non era vero — quella torta si fa, con qualunque scritta — e soprattutto **non
// era sapibile**: l'AI non vede il magazzino né l'agenda dei fornitori. Un «non
// si può» detto a chi voleva comprare è un ordine buttato via, e non si
// recupera: il cliente non riscrive, compra altrove.
//
// ⚠️⚠️ PERCHÉ UN CONTROLLO SUL TESTO E NON SOLO UNA REGOLA NEL PROMPT. La regola
// c'è (vedi `PALETTI` in cs-ai.ts), ma un'istruzione nel prompt si può ignorare:
// è già successo con la firma del brand, misurato 4-6 volte su 6. Qui il danno è
// commerciale e irreversibile, quindi la regola si ripete dove non si può
// disobbedire — nel codice, sul testo già scritto, prima che parta.
//
// ⚠️ Non è un filtro che CORREGGE la frase: riscrivere la risposta di un modello
// per farle dire il contrario produce frasi storte e cambia il senso di quello
// che c'è attorno. Qui si BLOCCA e si passa la mano a una persona — che è la
// strada che questa app ha già (la domanda su WhatsApp all'amministratore).

/**
 * Le frasi che non devono uscire da una risposta automatica.
 *
 * ⚠️ In italiano **e in inglese**: fuori turno si risponde nella lingua del
 * cliente, e un divieto scritto in una lingua sola è un divieto che vale per
 * metà dei clienti.
 */
const VIETATE: { frase: RegExp; perche: string }[] = [
  {
    frase: /non\s+(è|e')\s+(al momento\s+|attualmente\s+)?disponibil/i,
    perche: 'dice che il prodotto non è disponibile',
  },
  { frase: /non\s+(sono|risultano)\s+disponibil/i, perche: 'dice che i prodotti non sono disponibili' },
  { frase: /\bnon\s+disponibil/i, perche: 'dice «non disponibile»' },
  { frase: /\besaurit[oaie]\b/i, perche: 'dice che il prodotto è esaurito' },
  { frase: /\bfuori\s+(catalogo|produzione)\b/i, perche: 'dice che il prodotto è fuori catalogo' },
  {
    frase: /non\s+(possiamo|riusciamo a|siamo in grado di)\s+(realizzar|far|prepar|produr|consegnar)/i,
    perche: 'dice che non possiamo farlo',
  },
  { frase: /non\s+(è|e')\s+(possibile|realizzabile|fattibil)/i, perche: 'dice che non è possibile' },
  { frase: /\bimpossibil/i, perche: 'dice che è impossibile' },
  { frase: /\bout of stock\b/i, perche: 'dice out of stock' },
  { frase: /\b(not|no longer)\s+available\b/i, perche: 'dice not available' },
  { frase: /\bunavailable\b/i, perche: 'dice unavailable' },
  { frase: /\bwe\s+(can(no|')t|are unable to)\b/i, perche: 'dice che non possiamo' },
]

/**
 * La prima cosa vietata che questa risposta dice, se ce n'è una.
 *
 * Torna la spiegazione in italiano — quella che finisce nella domanda mandata su
 * WhatsApp e nel registro del giro: «bloccata perché dice che il prodotto non è
 * disponibile» si capisce anche fra sei mesi, `regex #3` no.
 */
export function fraseVietata(testo: string): string {
  const t = (testo ?? '').trim()
  if (!t) return ''
  for (const v of VIETATE) {
    if (v.frase.test(t)) return v.perche
  }
  return ''
}
