// CS AI — le istruzioni con cui l'AI parla ai clienti.
//
// Qui si decide COME si risponde: tono, firma, cosa non promettere, cosa cambia
// fra una chat e una mail. Non confondere con gli **Script**: uno script è un
// testo che si manda, un'istruzione dice all'AI come comportarsi mentre lo
// adatta. Gli script sono il *cosa*, queste sono il *come*.
//
// ⚠️ DUE LIVELLI, E IL PRIMO NON SI TOCCA DALL'INTERFACCIA.
// I `PALETTI` qui sotto restano nel codice: sono ciò che impedisce all'AI di
// promettere a un cliente cose che l'azienda non ha deciso — un rimborso, una
// data di consegna, uno sconto. Se fossero righe modificabili, basterebbe
// cancellarne una per distruzione di fiducia, e nessuno se ne accorgerebbe
// finché un cliente non ci tiene per una promessa che non abbiamo mai fatto.
// Quello che si scrive nella pagina CS AI si AGGIUNGE ai paletti, non li
// sostituisce.

export const AMBITI = [
  { chiave: 'tutti', nome: 'Sempre', spiega: 'Vale sia per le chat sia per le mail.' },
  { chiave: 'chat', nome: 'Solo chat', spiega: 'WhatsApp, Messenger, Instagram, chat del sito.' },
  { chiave: 'email', nome: 'Solo email', spiega: 'Le mail hanno oggetto e firma: regole loro.' },
] as const

export type ChiaveAmbito = (typeof AMBITI)[number]['chiave']

export function ambitoValido(v: string): v is ChiaveAmbito {
  return AMBITI.some((a) => a.chiave === v)
}

export function nomeAmbito(chiave: string): string {
  return AMBITI.find((a) => a.chiave === chiave)?.nome ?? chiave
}

/** L'istruzione vale in questo contesto? `tutti` vale sempre. */
export function valeNellAmbito(ambitoIstruzione: string, contesto: 'chat' | 'email'): boolean {
  return ambitoIstruzione === 'tutti' || ambitoIstruzione === contesto
}

// ── I paletti: non modificabili, non cancellabili ───────────────────────────
//
// Sono scritti come regole per l'AI, in italiano, perché finiscono nel prompt.

export const PALETTI = [
  'Non inventare MAI dati che non ti sono stati dati: date di consegna, orari, numeri d’ordine, importi. Se un dato manca, resta sul generico invece di riempirlo.',
  'Non promettere rimborsi, sconti, omaggi o rifacimenti: in questa azienda li approva una persona. Puoi dire che la richiesta viene presa in carico, non che sarà accolta.',
  'Non promettere una data o un orario di consegna che non ti è stato fornito.',
  'Non scrivere niente che sembri una decisione aziendale se non ti risulta già decisa.',
  'Se non hai elementi per rispondere bene, dillo e lascia la risposta a una persona. Meglio nessuna risposta che una sbagliata.',
] as const

export type Istruzione = {
  titolo: string
  categoria: string
  testo: string
  ambito: string
}

/**
 * Il blocco di istruzioni da mettere nel prompt, per un contesto preciso.
 *
 * I paletti vengono per primi e sono dichiarati come non negoziabili: se
 * un'istruzione scritta a mano li contraddicesse, l'AI deve seguire i paletti.
 * Senza questa gerarchia esplicita, un'istruzione tipo «sii sempre accomodante
 * col cliente» finirebbe per far promettere rimborsi.
 */
export function componiIstruzioni(
  istruzioni: Istruzione[],
  contesto: 'chat' | 'email'
): string {
  const valide = istruzioni.filter((i) => valeNellAmbito(i.ambito, contesto))

  const parti: string[] = []
  parti.push(
    'REGOLE NON NEGOZIABILI (valgono sempre, anche se le istruzioni qui sotto dicono altro):'
  )
  parti.push(PALETTI.map((p) => `- ${p}`).join('\n'))

  if (valide.length) {
    parti.push(
      `\nISTRUZIONI DELL'AZIENDA (${contesto === 'chat' ? 'per le chat' : 'per le mail'}):`
    )
    // Raggruppate per categoria: un prompt ordinato si legge meglio anche da un
    // modello, e soprattutto si rilegge meglio da una persona che lo debug-a.
    const perCategoria = new Map<string, Istruzione[]>()
    for (const i of valide) {
      const k = i.categoria || 'Generale'
      perCategoria.set(k, [...(perCategoria.get(k) ?? []), i])
    }
    for (const [categoria, elenco] of perCategoria) {
      parti.push(`\n${categoria}:`)
      for (const i of elenco) parti.push(`- ${i.titolo}: ${i.testo}`)
    }
  }

  return parti.join('\n')
}

/**
 * Le istruzioni di partenza.
 *
 * Non sono inventate: sono le regole che quest'app già applica altrove — la
 * lingua del cliente (src/lib/lingua.ts), i rimborsi che vanno approvati
 * (src/lib/rimborsi.ts), il non dedurre le date di consegna — più il tono che si
 * legge negli script esistenti (del lei, cortese, mai sbrigativo).
 * Vanno riscritte con le parole dell'azienda: sono un punto di partenza, non un
 * manuale calato dall'alto.
 */
export const ISTRUZIONI_INIZIALI = [
  {
    titolo: 'Dare del lei, con calore',
    categoria: 'Tono di voce',
    testo:
      'Si dà sempre del lei. Il tono è cortese e caldo, mai sbrigativo e mai servile: siamo un servizio di consegna in guanti bianchi, non un call center. Frasi corte, niente burocratese.',
    ambito: 'tutti',
    ordine: 10,
  },
  {
    titolo: 'Scrivere nella lingua del cliente',
    categoria: 'Tono di voce',
    testo:
      'Si risponde nella lingua in cui il cliente ha scritto. Se non è chiara, si usa quella già impostata nella bozza: l’app la sceglie dal recapito del cliente.',
    ambito: 'tutti',
    ordine: 20,
  },
  {
    titolo: 'Scusarsi una volta sola',
    categoria: 'Reclami',
    testo:
      'Se abbiamo sbagliato lo si dice una volta, con chiarezza, e poi si passa a cosa facciamo per rimediare. Ripetere le scuse tre volte non consola nessuno e fa sembrare che non ci sia una soluzione.',
    ambito: 'tutti',
    ordine: 30,
  },
  {
    titolo: 'Cosa possiamo dire su un rimborso',
    categoria: 'Reclami',
    testo:
      'Si può dire che la richiesta è stata presa in carico e che verrà valutata entro breve. Non si può dire che sarà accolta, né quanto, né quando arriverà: quelle decisioni le prende una persona.',
    ambito: 'tutti',
    ordine: 40,
  },
  {
    titolo: 'In chat si sta corti',
    categoria: 'Chat',
    testo:
      'Su WhatsApp e nelle chat si risponde in due o tre frasi. Niente formule d’apertura lunghe: il cliente vede l’anteprima sul telefono e deve capire subito se il problema è risolto.',
    ambito: 'chat',
    ordine: 50,
  },
  {
    titolo: 'Oggetto e firma della mail',
    categoria: 'Email',
    testo:
      'L’oggetto contiene sempre il numero d’ordine. Si chiude con «Un cordiale saluto,» seguito da «Servizio Clienti Deluxy». Se il cliente ha scritto per primo, si risponde citando la sua richiesta in una riga.',
    ambito: 'email',
    ordine: 60,
  },
] as const
