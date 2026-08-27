// QUELLO CHE UN MESSAGGIO AUTOMATICO DEVE (E NON DEVE) CONTENERE.
//
// ⚠️⚠️ Due regole nate dallo stesso caso vero, il 27/08/2026. L'AI fuori turno
// ha risposto a un cliente su WhatsApp con:
//
//     «Dear Client, my name is [Your Name] from Deluxy. Please feel free to…»
//
// Due difetti in una riga sola, e nessuno dei due si vedeva prima di leggerla.

/**
 * IL SEGNAPOSTO CHE NON È STATO RIEMPITO.
 *
 * ⚠️⚠️ `[Your Name]` **non veniva da nessuno script**: misurato subito dopo, dei
 * 31 script attivi **zero** contengono parentesi quadre. Se l'ha inventato il
 * modello, riempiendo un modulo che non gli avevamo dato — e nessun controllo
 * lo ha fermato, perché lo schema strutturato valida la FORMA della risposta
 * (che ci sia un `scriptId` noto e un testo non vuoto), non il suo contenuto.
 *
 * ⚠️ Un segnaposto è l'unico difetto di una risposta automatica che si vede a
 * colpo d'occhio **dalla parte del cliente**: dice, senza possibilità di
 * equivoco, che dall'altra parte non c'era nessuno. Vale più di una risposta
 * sbagliata, che almeno sembra scritta da una persona.
 *
 * ⚠️ Si riconoscono le quattro forme che i modelli usano davvero — `[…]`,
 * `{…}`, `{{…}}`, `<…>` — e in mezzo ci deve stare **qualcosa che sembra una
 * parola**: così `[1234]` o un `<3` non fanno scattare niente. E la lunghezza è
 * limitata: una parentesi quadra aperta e mai chiusa in un testo lungo non deve
 * far sembrare segnaposto tutta la risposta.
 */
const SEGNAPOSTI = [
  /\[[^\]\n]{2,60}\]/,
  /\{\{[^}\n]{2,60}\}\}/,
  /\{[A-Za-z_][^}\n]{1,59}\}/,
  /<[A-Za-z_][A-Za-z0-9 _-]{1,58}>/,
]

/**
 * Il segnaposto trovato, o stringa vuota.
 *
 * ⚠️ Torna QUALE, non solo sì/no: finisce nella riga di diagnosi e nel
 * messaggio all'amministratore, e «c'è un segnaposto» senza dire quale manda a
 * rileggere tutta la risposta.
 */
export function segnapostoNonRiempito(testo: string): string {
  const t = testo ?? ''
  for (const re of SEGNAPOSTI) {
    const m = re.exec(t)
    // ⚠️ Dentro ci deve essere una lettera: un numero d'ordine fra parentesi
    // quadre, o una faccina, non sono un modulo da riempire.
    if (m && /[A-Za-zÀ-ÿ]/.test(m[0])) return m[0]
  }
  return ''
}

/**
 * DIRE CHE RISPONDE UNA MACCHINA.
 *
 * ⚠️⚠️ Chiesto dall'utente il 27/08/2026 dopo aver ricevuto quella risposta:
 * «spiega che è una AI in tutti questi casi». È giusto e non è solo cortesia:
 * un messaggio che si presenta come una persona («my name is…») quando dall'
 * altra parte non c'è nessuno è una piccola bugia detta al cliente, e la prima
 * volta che se ne accorge — chiedendo qualcosa che la macchina non capisce —
 * quella bugia diventa la cosa che ricorda.
 *
 * ⚠️ La frase la scrive il CODICE, non il modello. Un'istruzione nel prompt si
 * può ignorare, e questa è la riga che non deve mancare mai: metterla nelle
 * mani della stessa cosa che ha inventato «[Your Name]» sarebbe chiedere al
 * sorvegliato di firmare il registro.
 *
 * ⚠️ E si dice anche **cosa succede dopo**: «una persona ti risponde appena
 * rientra». Senza, «sono un assistente automatico» si legge come «non avrai
 * risposta», ed è il momento in cui un cliente se ne va.
 */
const AVVISO: Record<string, string> = {
  italiano:
    'Ti ha risposto l’assistente automatico di Deluxy. Una persona legge e ti risponde appena rientra.',
  inglese:
    'This reply came from Deluxy’s automated assistant. A member of our team will read your message and get back to you.',
  francese:
    'Cette réponse provient de l’assistant automatique de Deluxy. Une personne de notre équipe vous répondra dès que possible.',
  spagnolo:
    'Esta respuesta procede del asistente automático de Deluxy. Una persona de nuestro equipo te responderá lo antes posible.',
  tedesco:
    'Diese Antwort stammt vom automatischen Assistenten von Deluxy. Ein Mitarbeiter meldet sich, sobald er verfügbar ist.',
  portoghese:
    'Esta resposta veio do assistente automático da Deluxy. Uma pessoa da nossa equipa responde assim que possível.',
  russo:
    'Это ответ автоматического помощника Deluxy. Наш сотрудник прочитает сообщение и ответит вам.',
  arabo:
    'هذا رد من المساعد الآلي لدى Deluxy. سيقوم أحد أفراد فريقنا بقراءة رسالتك والرد عليك.',
}

/**
 * La frase che dichiara la macchina, nella lingua del cliente.
 *
 * ⚠️ Lingua sconosciuta = **italiano e inglese insieme**, non solo italiano:
 * chi ha scritto in una lingua che non riconosciamo quasi certamente non legge
 * l'italiano, ed è il caso in cui la dichiarazione serve di più.
 */
export function avvisoAutomatico(lingua?: string): string {
  const l = (lingua ?? '').trim().toLowerCase()
  if (AVVISO[l]) return AVVISO[l]
  return `${AVVISO.italiano}\n${AVVISO.inglese}`
}

/**
 * Il testo pronto da mandare: la risposta, e sotto la dichiarazione.
 *
 * ⚠️ In fondo e non in cima: in cima sposterebbe la risposta sotto la piega su
 * un telefono, e la prima cosa che il cliente deve leggere è quello che ha
 * chiesto. ⚠️ Separata da una riga vuota, così si legge come una nota e non
 * come parte della frase.
 *
 * ⚠️ Non si aggiunge due volte: se il testo la contiene già (una rilettura, un
 * rinvio) resta com'è.
 */
export function conAvvisoAutomatico(testo: string, lingua?: string): string {
  const t = (testo ?? '').trim()
  const avviso = avvisoAutomatico(lingua)
  if (!t) return t
  // ⚠️ Si confronta un pezzo stabile della frase, non tutta: la lingua potrebbe
  // essere stata riconosciuta diversamente fra un giro e l'altro.
  const gia = Object.values(AVVISO).some((a) => t.includes(a.slice(0, 40)))
  return gia ? t : `${t}\n\n${avviso}`
}
