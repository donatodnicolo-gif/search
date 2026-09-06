// IL NUMERO COME LO VUOLE WHATSAPP: prefisso internazionale, solo cifre.
//
// ⚠️⚠️ Segnalato dall'utente il 06/09/2026: «nella lista fornitori di un ordine
// quando clicco WhatsApp sembra non comporre bene il numero». Vero, e non solo
// lì: dieci punti dell'app facevano `telefono.replace(/[^\d]/g, '')` e lo
// mettevano in `wa.me/<cifre>`. Ma `wa.me` vuole il numero INTERNAZIONALE senza
// il «+»: «081496704» (un fisso di Napoli com'è scritto nel registro) diventa un
// numero di un altro paese o niente, «3331234567» idem, «0039…» si porta dietro
// due zeri che non ci vanno. Misurato: 236 clienti su 1.344 hanno il numero
// «nudo» senza prefisso, 17 lo hanno con «00»; nel registro Anagrafiche i fissi
// stanno spesso senza prefisso.
//
// Regola: se il numero dichiara il paese («+…» oppure «00…») si tiene quello;
// se non lo dichiara e ha la forma di un numero italiano (cellulare che comincia
// per 3, fisso che comincia per 0) si antepone 39. Il resto passa com'è: un
// numero senza prefisso che non è italiano non lo si può indovinare, e
// inventare un paese è peggio di lasciare il dubbio.
//
// ⚠️ Pura, senza import: la usano componenti client.

/** Le cifre per `wa.me`, o '' se non è un numero utilizzabile. */
export function numeroWhatsApp(telefono: string | null | undefined): string {
  const grezzo = (telefono ?? '').trim()
  if (!grezzo) return ''
  let cifre = grezzo.replace(/\D/g, '')
  const dichiaraPaese = grezzo.startsWith('+') || cifre.startsWith('00')
  if (cifre.startsWith('00')) cifre = cifre.slice(2)
  if (cifre.length < 6) return ''
  if (!dichiaraPaese) {
    // Italiano senza prefisso: cellulare (3xx, 9-10 cifre) o fisso (0xx, 6-11 cifre).
    if (/^3\d{8,9}$/.test(cifre) || /^0\d{5,10}$/.test(cifre)) cifre = '39' + cifre
  }
  return cifre.length >= 8 ? cifre : ''
}

/** Il link `wa.me`, con il testo già scritto se c'è; '' se il numero non serve. */
export function linkWhatsApp(telefono: string | null | undefined, testo = ''): string {
  const n = numeroWhatsApp(telefono)
  if (!n) return ''
  return `https://wa.me/${n}${testo ? `?text=${encodeURIComponent(testo)}` : ''}`
}
