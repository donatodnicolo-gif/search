// Chi va avvisato quando arriva un messaggio, e per cosa.
//
// Sta qui e non dentro l'inbox perché è una regola, non un dettaglio di
// disegno: si prova da sola, con dei casi, senza aprire un browser.

/** Il minimo che serve per decidere: quanti non letti, e di chi è. */
export type RigaAvviso = { id: string; nonLetti: number; presaDaId?: string }

export type Avviso = {
  /** Quanti messaggi nuovi meritano un avviso (0 = silenzio). */
  quanti: number
  /** Almeno uno arriva da una conversazione che non ha ancora un padrone. */
  daLibere: boolean
}

/**
 * I messaggi nuovi che riguardano CHI STA GUARDANDO.
 *
 * Gli operatori sono tre e l'inbox è una sola: avvisare tutti di tutto vuol
 * dire che l'avviso riguarda quasi sempre il lavoro di qualcun altro, e un
 * avviso così si impara a ignorare — è il modo più rapido per rendere inutile
 * anche quello che conta. Da quando le conversazioni si prendono in carico il
 * filtro naturale c'è:
 *
 * - **mia** → avvisa: la risposta la devo io;
 * - **libera** → avvisa: è il caso peggiore, quello in cui rischia di non
 *   rispondere **nessuno**;
 * - **di un collega** → silenzio: se ne sta occupando lui.
 *
 * ⚠️ Si confronta il non letto **conversazione per conversazione**, non la
 * somma: con la somma, un collega che *libera* una conversazione con tre
 * messaggi non letti farebbe salire il totale filtrato e suonerebbe come se
 * fossero appena arrivati. Un cambio di proprietario non è un messaggio nuovo.
 *
 * ⚠️ `prima === null` è il primo caricamento e non avvisa **mai**: aprire
 * l'inbox con 106 non letti non è un messaggio appena arrivato.
 */
export function nuoviDaAvvisare(
  prima: Map<string, number> | null,
  adesso: RigaAvviso[],
  ioId: string
): Avviso {
  if (!prima) return { quanti: 0, daLibere: false }
  let quanti = 0
  let daLibere = false
  for (const c of adesso) {
    const cresciuti = c.nonLetti - (prima.get(c.id) ?? 0)
    if (cresciuti <= 0) continue
    const presa = c.presaDaId ?? ''
    const libera = presa === ''
    // ⚠️ `ioId` vuoto non rende «mia» ogni conversazione presa: senza sapere chi
    // guarda si avvisa solo per le libere, che è il ripiego prudente.
    const mia = presa !== '' && ioId !== '' && presa === ioId
    if (!mia && !libera) continue
    quanti += cresciuti
    if (libera) daLibere = true
  }
  return { quanti, daLibere }
}
