import { db } from './db'
import { leggiImpostazioni } from './impostazioni'
import { agganciaAffidabile } from './aggancio-fornitore'
import { chiaveFornitore } from './richieste-fornitore'
import { siglaProvincia } from './province'
import { mestierePerNegozio } from './fornitori-zona'
import { contattoDaMaps } from './anagrafica-da-maps'
import type { DettaglioMaps } from './maps-fornitori'

// IL FORNITORE PAGATO ENTRA NEL REGISTRO (24/08/2026, richiesta dell'utente).
//
// Un pagamento fatto dimostra che quell'azienda ci ha fornito davvero: se non
// è nel registro delle anagrafiche va aggiunta, se c'è va marcata fornitore.
// Il registro resta il proprietario del dato (qui nessuna copia): si manda un
// upsert-merge a POST /api/v1/partners e decide lui — i campi curati dal team
// non si toccano, e un fornitore «da evitare» NON torna buono solo perché
// l'abbiamo pagato (guardia nel merge del registro).
//
// ⚠️ PRIMA DI SCRIVERE SI CHIEDE /partners/match: il POST aggancia per
// nome+città ESATTI, e noi la città del fornitore non la sappiamo (quella
// sull'ordine è la città di CONSEGNA: dedurla scriverebbe un dato inventato).
// Senza il match, «Ketty Flowers» pagata oggi diventerebbe un DOPPIONE di
// «Ketty Flowers · PORTO CERVO» già in registro. Con il match:
//   agganciata → si rimanda nome+città DEL REGISTRO, e il merge colpisce giusto;
//   candidati  → NON si scrive (creare a caso = doppione): la richiesta resta
//                nella pagina /match del registro, la risolve una persona;
//   nessuna    → si crea, senza città: meglio «non indicato» che sbagliato.
//
// Best-effort per contratto: chi ci chiama ha appena registrato un'uscita di
// denaro, e quel fatto non deve fallire per colpa di un contorno.

const BASE_DEFAULT = 'https://deluxy-anagrafiche.vercel.app'

export type EsitoRegistroFornitore = {
  /** true = il registro ora conosce questo fornitore (creato o aggiornato). */
  ok: boolean
  esito:
    | 'creato'
    | 'aggiornato'
    | 'non-configurato'
    | 'senza-nome'
    | 'ambiguo'
    | 'rimborso'
    | 'errore'
  /** Una riga da mostrare o da scrivere nei log. */
  messaggio: string
}

/**
 * Scrive sulla richiesta com'è andata col registro.
 *
 * ⚠️⚠️ Prima l'esito tornava a chi aveva chiamato e finiva lì: il browser di chi
 * stava salvando lo mostrava per due secondi, e poi non lo sapeva più nessuno.
 * Misurato il 27/08/2026 su 26 fornitori pagati: **due erano AMBIGUI** — il
 * registro dice «somiglia a più anagrafiche», noi giustamente non scriviamo, e
 * quei due restavano fermi senza che niente in quest'app lo dicesse.
 *
 * ⚠️ Non solleva mai: è un contorno di un contorno, e chi ci chiama ha appena
 * registrato un'uscita di denaro.
 */
async function segnaEsito(richiestaId: string, e: EsitoRegistroFornitore): Promise<void> {
  try {
    await db.richiestaPagamento.updateMany({
      where: { id: richiestaId },
      data: { registroEsito: e.esito, registroMessaggio: e.messaggio, registroIl: new Date() },
    })
  } catch {
    // se non si scrive, il pagamento vale comunque
  }
}

export async function segnalaFornitorePagatoAlRegistro(
  richiestaId: string,
  /**
   * Pretendere che il pagamento sia già stato fatto.
   *
   * ⚠️ Dal 25/08/2026 il fornitore entra nel registro **quando si salva la
   * richiesta**, non solo quando si paga (chiesto dall'utente). Il motivo è che
   * fra il salvataggio e il bonifico possono passare giorni, e in quei giorni
   * il fornitore non esiste per nessun'altra app del gruppo: chi lo cerca in
   * anagrafica non lo trova e lo ricrea a mano, ed è così che nascono i
   * doppioni che poi qualcuno deve unire.
   *
   * Resta `true` per il vecchio richiamo dal «Pagata»: quella chiamata è
   * comunque utile, perché a quel punto l'IBAN è stato usato per davvero.
   * L'operazione è un upsert-merge, quindi chiamarla due volte non duplica.
   */
  pretendiPagata = true,
  /**
   * IL LUOGO DI GOOGLE MAPS da cui è stato scelto questo fornitore, quando è
   * stato scelto da lì.
   *
   * ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «devi importare tutti i dati da maps
   * che servono per creare il contatto in anagrafiche». Un fornitore trovato su
   * Maps è **quasi sempre nuovo** — è per quello che si è dovuti andare a
   * cercarlo fuori — quindi è esattamente il caso in cui il registro non sa
   * niente di lui e questi dati sono tutto quello che ci sarà.
   *
   * ⚠️ NON si tiene da nessuna parte in casa nostra: viaggia dalla schermata
   * alla rotta a qui e finisce nel registro, che è il suo proprietario
   * (Standard Deluxy §7: ogni dato ha una casa sola). Per questo arriva come
   * argomento invece che da una colonna di `RichiestaPagamento`.
   *
   * ⚠️ Conseguenza da sapere: al richiamo dal «Pagata» questo argomento non
   * c'è più. Non è un problema — l'operazione è un upsert-merge e la scrittura
   * buona è già andata al salvataggio — ma se **quella** è fallita (registro
   * irraggiungibile, match ambiguo) i dati di Maps non tornano da soli.
   */
  daMaps?: DettaglioMaps | null
): Promise<EsitoRegistroFornitore> {
  // ⚠️⚠️ Un guscio, e non un `segnaEsito` sparso nei rami: questa funzione esce
  // in SETTE punti diversi (non trovata, non pagata, senza nome, chiave
  // mancante, match fallito, ambiguo, errore di rete) e quello dimenticato
  // sarebbe proprio quello che non si vede mai. Qui l'esito si scrive UNA
  // volta, per costruzione, qualunque strada abbia preso.
  const esito = await calcola(richiestaId, pretendiPagata, daMaps)
  await segnaEsito(richiestaId, esito)
  return esito
}

async function calcola(
  richiestaId: string,
  pretendiPagata: boolean,
  daMaps?: DettaglioMaps | null
): Promise<EsitoRegistroFornitore> {
  const r = await db.richiestaPagamento.findUnique({
    where: { id: richiestaId },
    select: {
      intestatario: true,
      iban: true,
      ibanValido: true,
      metodo: true,
      ordineNumero: true,
      pagataIl: true,
    },
  })
  if (!r) {
    return { ok: false, esito: 'errore', messaggio: 'Richiesta non trovata.' }
  }
  if (pretendiPagata && !r.pagataIl) {
    return { ok: false, esito: 'errore', messaggio: 'Richiesta non ancora pagata.' }
  }

  // Il nome migliore che abbiamo: il fornitore scritto sull'ordine (se c'è),
  // altrimenti l'intestatario del conto. Sono spesso la stessa cosa dopo la
  // riconciliazione, ma quando differiscono l'ordine è più affidabile:
  // l'intestatario può essere la persona, non l'insegna.
  let ordine: {
    fornitoreNome: string
    fornitoreTelefono: string
    fornitoreEmail: string
    fornitoreCitta: string
    negozioNome: string
  } | null =
    null
  if (r.ordineNumero) {
    const numero = r.ordineNumero.replace('#', '')
    ordine = await db.ordine.findFirst({
      where: { numero: { in: [numero, `#${numero}`] } },
      select: {
        fornitoreNome: true,
        fornitoreTelefono: true,
        fornitoreEmail: true,
        // ⚠️ La città DEL FORNITORE (chi l'ha registrato l'ha scritta, o è
        // arrivata dal registro): è quella che lo rende ritrovabile. Vedi sotto.
        fornitoreCitta: true,
        // Il negozio dell'ordine: dice il MESTIERE del fornitore (vedi sotto).
        negozioNome: true,
      },
    })
  }
  const nome = (ordine?.fornitoreNome || r.intestatario || '').trim()
  if (!nome) {
    return { ok: false, esito: 'senza-nome', messaggio: 'Il pagamento non dice a chi è andato.' }
  }

  // Stessa configurazione della lettura (src/lib/anagrafiche.ts): prima le
  // env, poi le Impostazioni. La chiave `deluxy-messaging` dal 24/08/2026 ha
  // lo scope «driver di prima parte» (solo POST /partners, niente cancellazioni).
  const envUrl = (process.env.ANAGRAFICHE_URL ?? '').trim()
  const envChiave = (process.env.ANAGRAFICHE_API_KEY ?? '').trim()
  const config: { anagraficheUrl?: string; anagraficheApiKey?: string } = envChiave
    ? {}
    : await leggiImpostazioni(['anagraficheUrl', 'anagraficheApiKey'])
  const chiave = envChiave || config.anagraficheApiKey
  if (!chiave) return { ok: false, esito: 'non-configurato', messaggio: 'Chiave del registro non configurata.' }
  const base = (envUrl || config.anagraficheUrl || BASE_DEFAULT).replace(/\/+$/, '')

  try {
    // 1) Chi è, per il registro?
    //
    // ⚠️⚠️ LA CITTÀ NON SI MANDA AL MATCH, nemmeno adesso che con Maps la
    // sappiamo. Il registro, nel match, la confronta come
    // `citta: citta.toUpperCase()` — un uguale **sensibile alle maiuscole**,
    // che nasce dall'import dell'Excel dove le città erano tutte maiuscole. Su
    // un'anagrafica scritta «Milano» quel filtro non trova niente, il match
    // risponde «nessuna» e noi creeremmo il doppione **proprio del fornitore
    // che c'era**. Restringere una ricerca con un criterio che può solo
    // sbagliare per eccesso di zelo è peggio che non restringerla: senza città
    // il peggio che capita è un «candidati», che nessuno scrive e una persona
    // risolve.
    const qm = new URLSearchParams({ nome, sistema: 'customer-service' })
    const resMatch = await fetch(`${base}/api/v1/partners/match?${qm.toString()}`, {
      headers: { 'x-api-key': chiave },
      cache: 'no-store',
    })
    if (!resMatch.ok) {
      return { ok: false, esito: 'errore', messaggio: `Il registro ha risposto ${resMatch.status} al match.` }
    }
    const match = (await resMatch.json()) as {
      esito?: 'agganciata' | 'candidati' | 'nessuna'
      match?: { nome?: string; citta?: string | null } | null
    }
    if (match.esito === 'candidati') {
      return {
        ok: false,
        esito: 'ambiguo',
        messaggio: `«${nome}» somiglia a più anagrafiche: la richiesta è nella pagina Match del registro, da risolvere a mano.`,
      }
    }

    // ⚠️⚠️ E un «agganciata» NON si prende sulla parola: il 25/08/2026 il
    // registro ha agganciato «Paradis des fleurs» a «Contatti senza azienda
    // (HubSpot)» — un contenitore con 288 contatti dentro, in cui le tre parole
    // comparivano sparse — e noi ci abbiamo scritto sopra «fornitore abituale».
    // Il fornitore vero è rimasto fuori dall'anagrafica.
    // Perché succede e come si controlla: src/lib/aggancio-fornitore.ts.
    if (match.esito === 'agganciata') {
      const suo = (match.match?.nome ?? '').trim()
      if (!agganciaAffidabile(nome, suo)) {
        return {
          ok: false,
          esito: 'ambiguo',
          messaggio: `Il registro ha agganciato «${nome}» a «${suo}», che è un'altra azienda: non ho scritto niente. Da collegare a mano dalla pagina Match del registro.`,
        }
      }
    }

    // 2) L'upsert-merge. Con l'aggancio si rimandano nome e città COME LI HA
    //    IL REGISTRO, così il merge colpisce quel record e non ne crea un altro.
    const corpo: Record<string, unknown> = {
      nome: match.esito === 'agganciata' && match.match?.nome ? match.match.nome : nome,
      sistema: 'customer-service',
      asOf: new Date().toISOString(),
      // Gli abbiamo dato un ordine e stiamo per pagarlo: è un fornitore del
      // nostro giro. «abituale» è il valore vero fra quelli del catalogo; se il
      // team l'ha bocciato («da evitare») il registro ignora questa riga, per
      // sua regola — quindi anticipare la scrittura al salvataggio non può
      // riabilitare un fornitore che qualcuno aveva escluso.
      statoFornitore: 'abituale',
    }
    // ── DOVE STA, che è quello che lo rende ritrovabile ──
    //
    // ⚠️⚠️ Senza città, un fornitore nel registro **non tornerà mai indietro**:
    // la lista «fornitori in zona» di un ordine nuovo filtra per provincia
    // (`fornitoriInZona`, che ricava la sigla da `provincia` **o** dalla città),
    // quindi chi non ha né l'una né l'altra è invisibile. Misurato il
    // 25/08/2026: 15 fornitori nostri in anagrafica, tutti senza città — cioè
    // gente che abbiamo già pagato e che al prossimo ordine in quella stessa
    // provincia non verrebbe proposta a nessuno.
    //
    // ⚠️⚠️ E la città è quella del FORNITORE, presa dall'ordine dove l'ha scritta
    // una persona o dove è arrivata dal registro: **non** la città di consegna.
    // Sono due cose diverse — si consegna a Milano un mazzo preparato a Sesto —
    // e dedurla scriverebbe un dato inventato dentro il golden record di tutti.
    //
    // ⚠️ La provincia si aggiunge solo se dalla città si ricava una sigla certa
    // (`siglaProvincia`): «Firenze» → FI sì, un comune che non è capoluogo no.
    // Meglio la sola città che una sigla indovinata.
    //
    // ⚠️⚠️ E DA OGGI (27/08/2026) C'È UNA TERZA VIA, che è la migliore delle tre
    // quando c'è: la città di GOOGLE MAPS. Non è dedotta da niente — è il
    // `locality` della scheda del luogo — e arriva **insieme** a via, CAP,
    // provincia, regione e telefono. Sta dopo le altre due solo perché il nome
    // del registro e il dato scritto da una persona vincono su una lettura
    // automatica; ma nel caso di Maps le altre due sono quasi sempre vuote,
    // perché un fornitore lo si va a cercare fuori proprio quando non lo
    // conosciamo.
    // ⚠️ Il mestiere ricavato dal NOSTRO ordine si calcola qui perché serve
    // subito: entra in `contattoDaMaps` come categoria da preferire ai tipi di
    // Google (vedi il commento sotto, «CHE MESTIERE FA»).
    const mestiere = ordine?.negozioNome ? mestierePerNegozio(ordine.negozioNome) : null
    // ⚠️⚠️ LA SCHEDA VALE SOLO SE PARLA DI CHI STIAMO SCRIVENDO. Il nome che va
    // al registro è quello dell'ORDINE quando c'è (`fornitoreNome`), non
    // l'intestatario da cui è nata la scheda di Maps: normalmente sono la stessa
    // azienda — la rotta blocca con un 409 chi chiede di pagare Caio su un
    // ordine preparato da Tizio — ma quel blocco ha un'eccezione, il rimborso
    // AL CLIENTE, che per definizione ha un nome diverso. Lì attaccare
    // indirizzo, telefono e categoria di un luogo di Google al fornitore
    // dell'ordine vorrebbe dire scrivere nel golden record di tutti i dati di
    // un'azienda su un'altra. Si confronta con `chiaveFornitore`, la stessa
    // regola con cui la rotta decide che due nomi sono lo stesso fornitore.
    //
    // ⚠️ Due regole in OR, e non è una per sicurezza: `chiaveFornitore` è secca
    // (punteggiatura via, niente altro), quindi «S.A.S. ELENA FLEURS» e «Elena
    // Fleurs» per lei sono due aziende — e sono la stessa. `agganciaAffidabile`
    // copre proprio quel caso (il nome corto per intero dentro il lungo) ed è
    // già lo standard di questo file per decidere se due nomi sono la stessa
    // insegna. Quello che nessuna delle due lascia passare è un nome
    // *estraneo*, che è l'unica cosa da cui ci si sta difendendo.
    const parlaDiLui =
      !!daMaps &&
      (chiaveFornitore(nome) === chiaveFornitore(daMaps.nome ?? '') ||
        agganciaAffidabile(nome, daMaps.nome ?? ''))
    const daMapsCampi =
      daMaps && parlaDiLui
        ? contattoDaMaps(daMaps, mestiere ? (mestiere === 'fioraio' ? 'FIORISTA' : 'PASTICCERIA') : '')
        : null
    const cittaDelRegistro = match.esito === 'agganciata' ? (match.match?.citta ?? '') : ''
    const cittaNostra = (ordine?.fornitoreCitta ?? '').trim()
    const citta = cittaDelRegistro || cittaNostra || (daMapsCampi?.citta ?? '')
    if (citta) {
      corpo.citta = citta
      // ⚠️⚠️ La sigla di Google vale SOLO se la città che stiamo mandando è la
      // sua. Le tre città possono essere tre comuni diversi (il registro dice
      // «Milano», Maps «Sesto San Giovanni»): attaccare la provincia dell'una
      // alla città dell'altra è il modo di scrivere una coppia che non esiste.
      // Se la città viene da altrove si ricade su `siglaProvincia`, che risponde
      // solo quando è certa.
      const daMapsQuestaCitta = daMapsCampi && citta === daMapsCampi.citta ? daMapsCampi.provincia : ''
      const sigla = daMapsQuestaCitta || siglaProvincia(citta)
      if (sigla) corpo.provincia = sigla
    }

    // ── CHE MESTIERE FA, quando lo sappiamo per fatto ──
    //
    // ⚠️⚠️ Senza categoria un fornitore è **invisibile** nell'elenco «fornitori
    // in zona», che tiene solo FIORISTA e PASTICCERIA. Segnalato dall'utente il
    // 25/08/2026 su #2798: Passiflora aveva preparato quell'ordine e non
    // compariva — era `categoria: ALTRO` come tutti quelli entrati pagandoli.
    //
    // ⚠️ Non è una deduzione dal nome (da «Vecchio Maurizio» non si ricava un
    // mestiere, e inventarlo sarebbe peggio): è il NEGOZIO dell'ordine che ha
    // preparato. Chi ha fatto un bouquet per FLowers è un fioraio, chi ha fatto
    // una torta per Cake è una pasticceria — l'ha fatto davvero, non lo
    // supponiamo. Su «Deluxy», che vende di tutto, il mestiere non si sa e la
    // categoria non si manda: meglio ALTRO che una categoria sbagliata.
    // ⚠️ `mestiere` è calcolato più su (serve a `contattoDaMaps`).
    if (mestiere) corpo.categoria = mestiere === 'fioraio' ? 'FIORISTA' : 'PASTICCERIA'
    else if (daMapsCampi?.categoria) {
      // ⚠️ Il ripiego sui tipi di Google — `florist`, `pastry_shop` — vale
      // proprio nel caso che il commento qui sopra lasciava scoperto: l'ordine
      // del negozio «Deluxy», che vende di tutto e non dice il mestiere. La
      // lista dei tipi tradotti è corta apposta (src/lib/anagrafica-da-maps.ts):
      // ci sono solo quelli che in italiano vogliono dire una cosa sola.
      corpo.categoria = daMapsCampi.categoria
    }
    if (ordine?.fornitoreTelefono?.trim()) corpo.telefono = ordine.fornitoreTelefono.trim()
    else if (daMapsCampi?.telefono) corpo.telefono = daMapsCampi.telefono
    if (ordine?.fornitoreEmail?.trim()) corpo.email = ordine.fornitoreEmail.trim()
    // ⚠️ L'email da Maps non c'è e non ci sarà: Google non la dà. È l'unico
    // campo del contatto che resta da riempire a mano.

    // ── E IL RESTO DI QUELLO CHE MAPS SA ──
    //
    // ⚠️ Regione, via e note (sito, CAP, voto di Google, link alla scheda e
    // `place_id`) non hanno un'altra sorgente in casa nostra: o arrivano da
    // qui o non arrivano. Il merge del registro non sovrascrive un campo già
    // pieno curato dal team, quindi mandarli è additivo per costruzione.
    if (daMapsCampi?.regione) corpo.regione = daMapsCampi.regione
    if (daMapsCampi?.indirizzo) corpo.indirizzo = daMapsCampi.indirizzo
    if (daMapsCampi?.note) corpo.note = daMapsCampi.note
    // L'IBAN entra solo verificato (checksum ok): nel golden record un IBAN
    // sbagliato costa un bonifico rifiutato. L'intestatario viaggia con lui.
    if (r.metodo === 'iban' && r.ibanValido && r.iban.trim()) {
      corpo.iban = r.iban.trim()
      corpo.intestatarioConto = r.intestatario.trim() || undefined
    }

    const resPost = await fetch(`${base}/api/v1/partners`, {
      method: 'POST',
      headers: { 'x-api-key': chiave, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      cache: 'no-store',
    })
    const dati = (await resPost.json().catch(() => ({}))) as { esito?: string; errore?: string }
    if (!resPost.ok) {
      return { ok: false, esito: 'errore', messaggio: dati.errore || `Il registro ha risposto ${resPost.status}.` }
    }
    const creato = dati.esito === 'creato'
    // ⚠️ Si dice CHE COSA è entrato, non solo «fatto». Con Maps di mezzo la
    // differenza fra un contatto col solo nome e uno con indirizzo, telefono e
    // categoria è tutta la differenza fra ritrovarlo e ricopiarlo a mano — e
    // chi legge questa riga è la persona che dovrebbe fidarsi di non doverlo
    // fare. ⚠️ Si elencano i campi presi da MAPS, non tutto il corpo: gli altri
    // il registro li aveva già.
    const presi = daMapsCampi
      ? (
          [
            // ⚠️ Il confronto pretende che il valore CI SIA: senza, due campi
            // assenti risultano «uguali» (`undefined === undefined`) e la riga
            // vanterebbe un telefono che nessuno ha mandato.
            daMapsCampi.indirizzo ? 'indirizzo' : '',
            daMapsCampi.citta && corpo.citta === daMapsCampi.citta ? 'città' : '',
            daMapsCampi.telefono && corpo.telefono === daMapsCampi.telefono ? 'telefono' : '',
            daMapsCampi.categoria && corpo.categoria === daMapsCampi.categoria ? 'categoria' : '',
            daMapsCampi.regione ? 'regione' : '',
            daMapsCampi.note ? 'sito e scheda Google' : '',
          ] as string[]
        ).filter(Boolean)
      : []
    const conMaps = presi.length ? ` Da Google Maps: ${presi.join(', ')}.` : ''
    return {
      ok: true,
      esito: creato ? 'creato' : 'aggiornato',
      messaggio: creato
        ? `«${corpo.nome}» non era in anagrafica: creato come fornitore abituale.${conMaps}`
        : `«${corpo.nome}» aggiornato nel registro come fornitore abituale.${conMaps}`,
    }
  } catch (e) {
    return {
      ok: false,
      esito: 'errore',
      messaggio: `Registro non raggiungibile: ${e instanceof Error ? e.message : 'errore'}`,
    }
  }
}
