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
  id?: string
  titolo: string
  categoria: string
  testo: string
  ambito: string
  /** Il brand per cui vale. Vuoto/null = tutti i brand. */
  negozioId?: string | null
  /** Quale regola generale questa regola di brand manda in pensione. */
  sostituisceId?: string | null
}

/** Il brand per cui stiamo scrivendo. `null` = non lo sappiamo. */
export type Brand = { id: string; nome: string } | null

/**
 * L'istruzione vale per questo brand?
 *
 * ⚠️ Una regola di brand con brand SCONOSCIUTO **non** si applica. Sembra
 * prudente il contrario («nel dubbio applica tutto»), ma le regole dei brand si
 * contraddicono per costruzione — la firma dei fiori contro quella della
 * pasticceria — e applicarle insieme produce una risposta che non appartiene a
 * nessuno. Meglio il tono neutro dell'azienda che quello del brand sbagliato.
 */
export function valePerBrand(negozioId: string | null | undefined, brand: Brand): boolean {
  if (!negozioId) return true
  return !!brand && negozioId === brand.id
}

/**
 * Il blocco di istruzioni da mettere nel prompt, per un contesto e un brand.
 *
 * I paletti vengono per primi e sono dichiarati come non negoziabili: se
 * un'istruzione scritta a mano li contraddicesse, l'AI deve seguire i paletti.
 * Senza questa gerarchia esplicita, un'istruzione tipo «sii sempre accomodante
 * col cliente» finirebbe per far promettere rimborsi.
 */
export function componiIstruzioni(
  istruzioni: Istruzione[],
  contesto: 'chat' | 'email',
  brand: Brand = null
): string {
  const valide = istruzioni.filter(
    (i) => valeNellAmbito(i.ambito, contesto) && valePerBrand(i.negozioId, brand)
  )

  const parti: string[] = []
  parti.push(
    'REGOLE NON NEGOZIABILI (valgono sempre, anche se le istruzioni qui sotto dicono altro):'
  )
  parti.push(PALETTI.map((p) => `- ${p}`).join('\n'))

  // Raggruppate per categoria: un prompt ordinato si legge meglio anche da un
  // modello, e soprattutto si rilegge meglio da una persona che lo debug-a.
  const aBlocchi = (elenco: Istruzione[]) => {
    const perCategoria = new Map<string, Istruzione[]>()
    for (const i of elenco) {
      const k = i.categoria || 'Generale'
      perCategoria.set(k, [...(perCategoria.get(k) ?? []), i])
    }
    const righe: string[] = []
    for (const [categoria, voci] of perCategoria) {
      righe.push(`\n${categoria}:`)
      for (const i of voci) righe.push(`- ${i.titolo}: ${i.testo}`)
    }
    return righe
  }

  // ⚠️ LE REGOLE DEL BRAND VANNO DOPO, E DICHIARATE VINCENTI.
  //
  // Prima erano mescolate alle generali, in ordine di `ordine`. Sembrava
  // ragionevole, ma le due cose si contraddicono per mestiere: la regola
  // generale dice di firmarsi «Servizio Clienti Deluxy», quella di Cake dice
  // «Il team di Cake Design». Misurato: con le due nello stesso elenco il
  // modello sceglieva la generale e la firma del brand non compariva MAI —
  // cioè il brand era plumbing perfetto e comportamento nullo.
  // La gerarchia è paletti > brand > generali, e va scritta: un modello non la
  // indovina dall'ordine delle righe.
  const diBrand = valide.filter((i) => i.negozioId)
  // Le generali che una regola di brand attiva ha esplicitamente sostituito NON
  // entrano nel prompt. È qui che si risolve il conflitto: in codice, prima di
  // parlare col modello — non chiedendogli di arbitrare fra due righe che
  // dicono il contrario (provato: sceglieva la generale 4-6 volte su 6, anche
  // con scritto a lettere maiuscole che vinceva l'altra).
  const pensionate = new Set(diBrand.map((i) => i.sostituisceId).filter(Boolean) as string[])
  const generali = valide.filter((i) => !i.negozioId && !(i.id && pensionate.has(i.id)))

  if (generali.length) {
    parti.push(`\nISTRUZIONI DELL'AZIENDA (${per(contesto)}):`)
    parti.push(...aBlocchi(generali))
  }

  if (diBrand.length && brand) {
    parti.push(`\nISTRUZIONI DEL BRAND ${brand.nome.toUpperCase()} (${per(contesto)}):`)
    parti.push(...aBlocchi(diBrand))
  }

  // ⚠️ IL BRAND VA IN FONDO, NON IN CIMA. Misurato, contro l'intuizione.
  //
  // Prima apriva il blocco («BRAND: stai scrivendo per Cake…»), che sembrava il
  // posto giusto: prima dici chi sei, poi come parli. Su 6 chiamate identiche
  // per condizione, con quel cappello in testa le istruzioni di forma — firma,
  // oggetto — sparivano dalla risposta 6 volte su 6, mentre senza brand
  // comparivano 6 su 6. Non è il testo della riga: provata in tre versioni
  // diverse, anche togliendo ogni divieto, il risultato non cambiava.
  // Qui in fondo il brand è un'istruzione fra le altre invece di un'identità che
  // le precede — e le regole tornano ad applicarsi.
  if (brand) {
    parti.push(
      `\nStai scrivendo per il negozio «${brand.nome}» del gruppo Deluxy: applica tutte le istruzioni qui sopra e, dove chiedono il nome del negozio, usa «${brand.nome}».`
    )
  }

  return parti.join('\n')
}

const per = (contesto: 'chat' | 'email') => (contesto === 'chat' ? 'per le chat' : 'per le mail')

/**
 * Le istruzioni di partenza.
 *
 * Non sono inventate: sono le regole che quest'app già applica altrove — la
 * lingua del cliente (src/lib/lingua.ts), i rimborsi che vanno approvati
 * (src/lib/rimborsi.ts), il non dedurre le date di consegna — più il tono che si
 * legge negli script esistenti (del lei, cortese, mai sbrigativo).
 * Vanno riscritte con le parole dell'azienda: sono un punto di partenza, non un
 * manuale calato dall'alto.
 *
 * ⚠️ SONO SCRITTE COME ORDINI, e non per gusto di stile. Nella prima versione
 * erano descrittive («si dà sempre del lei», «si chiude con Un cordiale
 * saluto»): misurato con l'AI vera, venivano applicate a intermittenza — il
 * modello legge una descrizione come un'informazione sull'azienda, non come una
 * cosa da fare adesso. Riscritte all'imperativo, attecchiscono. Chi ne aggiunge
 * di nuove faccia lo stesso: «Chiudi con…» funziona, «ci si firma…» no.
 */
export const ISTRUZIONI_INIZIALI = [
  {
    titolo: 'Dare del lei, con calore',
    categoria: 'Tono di voce',
    testo:
      'Dai sempre del lei. Scrivi cortese e caldo, mai sbrigativo e mai servile: siamo un servizio di consegna in guanti bianchi, non un call center. Usa frasi corte, evita il burocratese.',
    ambito: 'tutti',
    ordine: 10,
  },
  {
    titolo: 'Scrivere nella lingua del cliente',
    categoria: 'Tono di voce',
    testo:
      'Rispondi nella lingua in cui il cliente ha scritto. Se non è chiara, usa quella già impostata nella bozza: l’app la sceglie dal recapito del cliente.',
    ambito: 'tutti',
    ordine: 20,
  },
  {
    titolo: 'Scusarsi una volta sola',
    categoria: 'Reclami',
    testo:
      'Se abbiamo sbagliato, scusati una volta sola e con chiarezza, poi passa subito a cosa facciamo per rimediare. Non ripetere le scuse: non consolano nessuno e fanno sembrare che non ci sia una soluzione.',
    ambito: 'tutti',
    ordine: 30,
  },
  {
    titolo: 'Cosa possiamo dire su un rimborso',
    categoria: 'Reclami',
    testo:
      'Puoi dire che la richiesta è stata presa in carico e che verrà valutata entro breve. Non dire mai che sarà accolta, né quanto, né quando arriverà: quelle decisioni le prende una persona.',
    ambito: 'tutti',
    ordine: 40,
  },
  {
    titolo: 'In chat si sta corti',
    categoria: 'Chat',
    testo:
      'In chat rispondi in due o tre frasi. Non aprire con formule lunghe: il cliente vede l’anteprima sul telefono e deve capire subito se il problema è risolto.',
    ambito: 'chat',
    ordine: 50,
  },
  {
    titolo: 'Oggetto e firma della mail',
    categoria: 'Email',
    testo:
      // ⚠️ La firma NON nomina Deluxy a caso: dice «il negozio per cui stai
      // scrivendo». Nella versione precedente c'era scritto «Servizio Clienti
      // Deluxy», e misurando è saltato fuori che con un brand impostato la mail
      // usciva SENZA FIRMA 6 volte su 6 — il modello si rifiuta di firmare col
      // nome di un marchio diverso da quello per cui gli hai detto di scrivere.
      // In un gruppo con più negozi, una firma fissa è una firma che sparisce.
      'Metti sempre il numero d’ordine nell’oggetto. Chiudi ogni mail con «Un cordiale saluto,» e a capo il nome del negozio per cui stai scrivendo, anche se lo script non ha una firma. Se il cliente ha scritto per primo, richiama la sua richiesta in una riga.',
    ambito: 'email',
    ordine: 60,
  },
] as const
