'use client'

/**
 * Chi comanda il tasto «r»?
 *
 * Le scorciatoie globali (`Scorciatoie`) e la pila della conversazione
 * (`ConversazioneStack`) ascoltano tutte e due la tastiera sulla finestra, e
 * quella montata prima — la globale, che sta nel layout — riceve il tasto per
 * prima. Senza un accordo, premendo «r» dopo essersi spostati con j/k si
 * risponderebbe alla mail in cima invece che al messaggio a fuoco: cioè la
 * scorciatoia farebbe una cosa diversa da quella che si vede.
 *
 * L'accordo è questo: la pila dichiara qui il messaggio a fuoco **solo quando
 * l'utente lo sceglie davvero** (j/k o clic), e finché c'è, le scorciatoie di
 * risposta lasciano fare a lei.
 */
let aFuoco: string | null = null

export function dichiaraFuocoConversazione(id: string | null) {
  aFuoco = id
}

export function fuocoConversazione(): string | null {
  return aFuoco
}
