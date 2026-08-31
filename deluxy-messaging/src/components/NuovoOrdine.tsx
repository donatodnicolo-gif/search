'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { chiediJson, frasePerEsito } from '@/lib/leggi-json'

// Fare un ordine per un cliente al telefono, senza uscire dall'app.
//
// ⚠️ L'ordine nasce in Shopify (bozza d'ordine) e torna indietro dal registro
// come tutti gli altri: qui non si scrive nessun ordine «nostro», che sarebbe
// invisibile a logistica e contabilità.

type Negozio = { id: string; nome: string }
type Prodotto = {
  variantId: string
  titolo: string
  variante: string
  prezzo: number
  immagine: string
  disponibile: boolean
}
type ClienteTrovato = {
  nome: string
  cognome: string
  email: string
  telefono: string
  indirizzo: string
  note: string
  cap: string
  citta: string
  provincia: string
  paese: string
  ordini: number
}

type Riga = {
  variantId?: string
  titolo: string
  variante?: string
  prezzo: number
  quantita: number
  immagine?: string
}

function soldi(v: number): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

export function NuovoOrdine({
  prefill,
}: {
  /** Chi è il cliente, quando si arriva da una conversazione. */
  prefill?: { nome?: string; email?: string; telefono?: string; negozioId?: string }
}) {
  const [negozi, setNegozi] = useState<Negozio[]>([])
  // ⚠️ Il negozio arriva dalla conversazione quando si parte da lì: il cliente
  // ha scritto AL marchio, e far scegliere di nuovo è sia un gesto in più sia
  // un modo per sbagliare — un ordine Cake creato su Flowers ha il listino, la
  // spedizione e la voce di consegna di un'altra azienda.
  const [negozioId, setNegozioId] = useState(prefill?.negozioId ?? '')

  const [nome, setNome] = useState(prefill?.nome ?? '')
  const [cognome, setCognome] = useState('')
  const [email, setEmail] = useState(prefill?.email ?? '')
  const [telefono, setTelefono] = useState(prefill?.telefono ?? '')

  const [data, setData] = useState('')
  const [fascia, setFascia] = useState('')
  const [indirizzo, setIndirizzo] = useState('')
  const [note, setNote] = useState('')
  const [cap, setCap] = useState('')
  const [citta, setCitta] = useState('')
  const [provincia, setProvincia] = useState('')
  const [paese, setPaese] = useState('IT')

  const [q, setQ] = useState('')
  const [prodotti, setProdotti] = useState<Prodotto[]>([])
  const [catalogoChiuso, setCatalogoChiuso] = useState(false)
  const [cercando, setCercando] = useState(false)
  const [righe, setRighe] = useState<Riga[]>([])

  const [rigaTitolo, setRigaTitolo] = useState('')
  const [rigaPrezzo, setRigaPrezzo] = useState('')

  const [spedizioneTitolo, setSpedizioneTitolo] = useState('')
  const [spedizionePrezzo, setSpedizionePrezzo] = useState('0')
  /**
   * Le tariffe di consegna calcolate da Shopify per questo indirizzo e questo
   * carrello: sono quelle del SITO, non scritte a mano.
   */
  const [tariffe, setTariffe] = useState<{ titolo: string; prezzo: number }[]>([])
  const [tariffeStato, setTariffeStato] = useState<'idle' | 'carico' | 'ok' | 'errore'>('idle')
  const [tariffeNota, setTariffeNota] = useState('')
  /**
   * L'ultima tariffa messa in automatico, in forma `titolo|prezzo`: se
   * l'operatore la cambia a mano, il ricalcolo non gliela sovrascrive.
   */
  const tariffaMessa = useRef('')

  /**
   * Aggiungere l'IVA. ⚠️ Spenta di suo: su Deluxy e Flowers i prezzi sono IVA
   * esclusa, quindi Shopify di suo la aggiungeva sopra al link — che è la cosa
   * segnalata. Ora si aggiunge SOLO spuntando qui.
   */
  const [aggiungiIva, setAggiungiIva] = useState(false)

  /** I suggerimenti di Google Maps per l'indirizzo che si sta scrivendo. */
  const [indirizzi, setIndirizzi] = useState<{ id: string; testo: string; secondario: string }[]>(
    []
  )
  const [mapsSenzaChiave, setMapsSenzaChiave] = useState(false)
  /** Vero quando l'indirizzo è stato SCELTO da Maps, non digitato. */
  const [indirizzoDaMaps, setIndirizzoDaMaps] = useState(false)

  /** Richiamo di un cliente già registrato in quel negozio. */
  const [qCliente, setQCliente] = useState('')
  const [clienti, setClienti] = useState<ClienteTrovato[]>([])
  const [cercandoCliente, setCercandoCliente] = useState(false)
  const [clienteCercato, setClienteCercato] = useState(false)
  const [biglietto, setBiglietto] = useState('')

  const [pagamento, setPagamento] = useState<'link' | 'pagato'>('link')
  const [mezzo, setMezzo] = useState('')
  /**
   * I metodi che QUESTO negozio usa davvero, chiesti ai suoi ordini.
   *
   * ⚠️⚠️ Prima qui c'erano cinque voci scritte nel codice (bonifico, contanti,
   * POS, PayPal, altro): i nomi che usiamo noi, mai confrontati con Shopify.
   * Misurato il 27/08/2026, i tre negozi usano «Shopify Payments», «Paypal»,
   * «Manual» — e Cake anche **«Bank Deposit»**, che gli altri due non hanno.
   * Una lista nel codice l'avrebbe data a tutti o a nessuno.
   */
  const [metodi, setMetodi] = useState<{ nome: string; usato: number }[]>([])
  const [metodiNota, setMetodiNota] = useState('')

  const [creando, setCreando] = useState(false)
  const [errore, setErrore] = useState('')
  const [esito, setEsito] = useState<{
    linkPagamento: string
    ordineNumero: string
    inviato: boolean
  } | null>(null)

  // ⚠️⚠️ SEGNALATO IL 27/08/2026: «nel creare un nuovo ordine non vede quali
  // sono i negozi». Prima qui c'era `r.ok ? r.json() : { negozi: [] }` con un
  // `.catch(() => setNegozi([]))`: **qualunque** cosa andasse storta diventava
  // «non ci sono negozi», cioè una tendina col solo «Scegli…» e nessun
  // messaggio. E il caso che capita davvero è la sessione scaduta con l'app
  // aperta in una scheda: il middleware fa un 307 verso /login, `fetch` lo
  // segue, `r.ok` è **vero**, e si finisce nel ramo della lista vuota.
  // Adesso i tre casi si distinguono e si dicono (`src/lib/leggi-json.ts`).
  const [negoziNota, setNegoziNota] = useState('')
  useEffect(() => {
    let vivo = true
    chiediJson<{ negozi?: Negozio[] }>('/api/ordini?gestione=gestito').then((e) => {
      if (!vivo) return
      if (e.stato !== 'ok') {
        setNegoziNota(frasePerEsito(e))
        return
      }
      const n = e.dati.negozi ?? []
      setNegozi(n)
      setNegoziNota(
        n.length
          ? ''
          : // ⚠️ Zero negozi è un caso vero e diverso da un guasto: si dice
            // dove si aggiungono, invece di lasciare una tendina muta.
            'Nessun negozio configurato: li aggiunge un amministratore dalla pagina Negozi.'
      )
      if (n.length === 1) setNegozioId(n[0].id)
    })
    return () => {
      vivo = false
    }
  }, [])

  // ⚠️ I metodi di pagamento si rileggono a ogni cambio di negozio: sono del
  // negozio, non dell'azienda — «Bank Deposit» ce l'ha solo Cake.
  useEffect(() => {
    if (!negozioId) return
    chiediJson<{ metodi?: { nome: string; usato: number }[] }>(
      '/api/nuovo-ordine/pagamenti?negozio=' + encodeURIComponent(negozioId)
    ).then((e) => {
      if (e.stato !== 'ok') {
        setMetodi([])
        setMetodiNota(
          e.stato === 'sessione-scaduta'
            ? frasePerEsito(e)
            : // ⚠️ Si dice che la lista è di RISERVA: senza, chi non trova
              // «Bank Deposit» crede che quel negozio non ce l'abbia.
              'Non sono riuscito a chiedere a Shopify quali metodi usa questo negozio: qui sotto ci sono quelli generici.'
        )
        return
      }
      const m = e.dati.metodi ?? []
      setMetodi(m)
      setMetodiNota(
        m.length ? '' : 'Shopify non riporta nessun metodo per questo negozio: qui sotto quelli generici.'
      )
      if (m.length) setMezzo(m[0].nome)
    })
  }, [negozioId])

  // ── LA SPEDIZIONE LA CALCOLA SHOPIFY, DAL SITO ──
  //
  // ⚠️⚠️ Chiesto dall'utente il 28/08/2026: «i valori delle consegne saranno
  // aggiornati con le impostazioni del sito? Dovresti prendere tutto da lì». Sì:
  // qui non c'è nessun prezzo scritto a mano. Si chiede a `draftOrderCalculate`
  // le tariffe che il sito offre per QUESTO indirizzo e QUESTO carrello — le
  // stesse che il cliente vedrebbe alla cassa, col nome giusto. Se domani
  // cambiano un prezzo sul sito, qui cambia da solo.
  //
  // ⚠️ La tariffa dipende dalla zona E dal subtotale: si ricalcola quando cambia
  // il negozio, l'indirizzo o il carrello. Con un'attesa, per non chiamare
  // Shopify a ogni tasto.
  const cartSig = righe
    .map((r) => `${r.variantId ?? r.titolo}:${r.prezzo}:${r.quantita}`)
    .join('|')
  useEffect(() => {
    // Senza negozio, senza carrello o senza un pezzo d'indirizzo che dica la
    // zona (provincia, città o paese) Shopify non può calcolare: si aspetta.
    if (!negozioId || !righe.length || !(provincia.trim() || citta.trim() || paese.trim())) {
      setTariffe([])
      setTariffeStato('idle')
      setTariffeNota('')
      return
    }
    let vivo = true
    setTariffeStato('carico')
    const t = setTimeout(async () => {
      const e = await chiediJson<{ tariffe?: { titolo: string; prezzo: number }[]; errore?: string }>(
        '/api/nuovo-ordine/tariffe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            negozioId,
            indirizzo: { citta, cap, provincia, paese },
            righe: righe.map((r) => ({
              variantId: r.variantId,
              titolo: r.variantId ? undefined : r.titolo,
              prezzo: r.variantId ? undefined : r.prezzo,
              quantita: r.quantita,
            })),
          }),
        }
      )
      if (!vivo) return
      if (e.stato !== 'ok') {
        setTariffe([])
        setTariffeStato('errore')
        setTariffeNota(frasePerEsito(e))
        return
      }
      const list = e.dati.tariffe ?? []
      setTariffe(list)
      setTariffeStato('ok')
      setTariffeNota(
        list.length
          ? ''
          : // ⚠️ Vuoto è una risposta VERA: il sito non ha una tariffa per questa
            // consegna (una provincia fuori dalle zone). Non si inventa un prezzo.
            'Il sito non ha una tariffa per questo indirizzo: scegli tu la spedizione, o lasciala a zero.'
      )
      // ⚠️ Si mette la più economica in automatico, ma solo se l'operatore non
      // ha già cambiato a mano: la sua scelta vince sul ricalcolo.
      const attuale = `${spedizioneTitolo}|${spedizionePrezzo}`
      const manoLibera = tariffaMessa.current === '' || attuale === tariffaMessa.current
      if (list.length && manoLibera) {
        setSpedizioneTitolo(list[0].titolo)
        setSpedizionePrezzo(String(list[0].prezzo))
        tariffaMessa.current = `${list[0].titolo}|${list[0].prezzo}`
      }
    }, 450)
    return () => {
      vivo = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negozioId, provincia, citta, cap, paese, cartSig])

  /** Cerca un cliente già registrato e, scegliendolo, riempie tutto. */
  const cercaCliente = useCallback(async () => {
    if (!negozioId) {
      setErrore('Scegli prima il negozio: le anagrafiche sono separate per marchio.')
      return
    }
    if (!qCliente.trim()) return
    setCercandoCliente(true)
    setErrore('')
    try {
      const p = new URLSearchParams({ negozio: negozioId, q: qCliente.trim() })
      const res = await fetch('/api/nuovo-ordine/clienti?' + p.toString())
      const d = (await res.json().catch(() => ({}))) as {
        clienti?: ClienteTrovato[]
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Ricerca non riuscita.')
        return
      }
      setClienti(d.clienti ?? [])
      setClienteCercato(true)
    } finally {
      setCercandoCliente(false)
    }
  }, [negozioId, qCliente])

  function usaCliente(c: ClienteTrovato) {
    setNome(c.nome)
    setCognome(c.cognome)
    if (c.email) setEmail(c.email)
    if (c.telefono) setTelefono(c.telefono)
    // ⚠️ L'indirizzo si riempie SOLO se il cliente ne ha uno: sovrascrivere con
    // il vuoto quello appena scritto a mano sarebbe il modo più rapido per far
    // perdere lavoro a chi sta al telefono.
    if (c.indirizzo) setIndirizzo(c.indirizzo)
    if (c.note) setNote(c.note)
    if (c.cap) setCap(c.cap)
    if (c.citta) setCitta(c.citta)
    if (c.provincia) setProvincia(c.provincia)
    if (c.paese) setPaese(c.paese)
    setClienti([])
    setClienteCercato(false)
  }

  const cerca = useCallback(async () => {
    if (!negozioId) {
      setErrore('Scegli prima il negozio.')
      return
    }
    setCercando(true)
    setErrore('')
    try {
      const p = new URLSearchParams({ negozio: negozioId, q })
      const res = await fetch('/api/nuovo-ordine/prodotti?' + p.toString())
      const d = (await res.json().catch(() => ({}))) as {
        prodotti?: Prodotto[]
        senzaPermesso?: boolean
        nota?: string
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Ricerca non riuscita.')
        return
      }
      setCatalogoChiuso(Boolean(d.senzaPermesso))
      setProdotti(d.prodotti ?? [])
    } finally {
      setCercando(false)
    }
  }, [negozioId, q])

  // ── L'indirizzo si cerca mentre si scrive ──
  //
  // ⚠️ Con un'attesa di mezzo secondo: una chiamata a ogni tasto sarebbe una
  // raffica pagata a Google per niente, e i suggerimenti ballerebbero sotto le
  // dita di chi sta scrivendo.
  useEffect(() => {
    const testo = indirizzo.trim()
    if (indirizzoDaMaps || testo.length < 4) {
      setIndirizzi([])
      return
    }
    const attesa = setTimeout(() => {
      fetch('/api/indirizzi?q=' + encodeURIComponent(testo))
        .then((r) => (r.ok ? r.json() : { suggerimenti: [] }))
        .then(
          (d: {
            suggerimenti?: { id: string; testo: string; secondario: string }[]
            senzaChiave?: boolean
          }) => {
            setMapsSenzaChiave(Boolean(d.senzaChiave))
            setIndirizzi(d.suggerimenti ?? [])
          }
        )
        .catch(() => setIndirizzi([]))
    }, 500)
    return () => clearTimeout(attesa)
  }, [indirizzo, indirizzoDaMaps])

  /** Scelto un indirizzo: si prendono i campi separati, non la riga di testo. */
  async function usaIndirizzo(id: string) {
    const res = await fetch('/api/indirizzi?id=' + encodeURIComponent(id))
    const d = (await res.json().catch(() => ({}))) as {
      indirizzo?: { indirizzo: string; cap: string; citta: string; provincia: string; paese: string }
    }
    if (!d.indirizzo) return
    setIndirizzo(d.indirizzo.indirizzo)
    if (d.indirizzo.cap) setCap(d.indirizzo.cap)
    if (d.indirizzo.citta) setCitta(d.indirizzo.citta)
    if (d.indirizzo.provincia) setProvincia(d.indirizzo.provincia)
    if (d.indirizzo.paese) setPaese(d.indirizzo.paese)
    setIndirizzi([])
    setIndirizzoDaMaps(true)
  }

  const totale =
    righe.reduce((s, r) => s + r.prezzo * r.quantita, 0) + (Number(spedizionePrezzo) || 0)

  // ── LA BOZZA DEL MODULO SI SALVA DA SOLA, OGNI 15 SECONDI ──────────────────
  //
  // Chiesto dall'utente il 31/08/2026, subito dopo aver perso un modulo pieno:
  // Shopify aveva rifiutato la creazione («Address2 in shipping exceeds maximum
  // length»), e con il cliente al telefono bisognava riscrivere tutto.
  //
  // ⚠️⚠️ Si salva in LOCALE, nel browser di chi compila, e non nel database:
  // una bozza a metà non è un ordine, e finirebbe in una tabella che qualcuno
  // poi conterebbe. Qui è quello che è: un foglio di brutta che sopravvive a un
  // errore, a un ricaricamento e a una chiusura per sbaglio.
  //
  // ⚠️ NON si ripristina da sola: si propone. Riempire il modulo con i dati di
  // un altro cliente — quello di mezz'ora fa — mentre se ne sta servendo uno
  // nuovo è il modo di mandare un regalo all'indirizzo sbagliato.
  //
  // ⚠️ Scade dopo un giorno e si cancella appena l'ordine parte: una bozza
  // vecchia riproposta la settimana dopo è solo confusione.
  const CHIAVE_BOZZA = 'nuovo-ordine:bozza'
  const SCADENZA_BOZZA = 24 * 60 * 60 * 1000

  type BozzaModulo = {
    quando: number
    negozioId: string
    nome: string
    cognome: string
    email: string
    telefono: string
    data: string
    fascia: string
    indirizzo: string
    note: string
    cap: string
    citta: string
    provincia: string
    paese: string
    righe: Riga[]
    biglietto: string
    spedizioneTitolo: string
    spedizionePrezzo: string
    pagamento: string
    mezzo: string
    aggiungiIva: boolean
  }

  const [bozzaTrovata, setBozzaTrovata] = useState<BozzaModulo | null>(null)
  const [salvataAlle, setSalvataAlle] = useState('')

  /** Tutto quello che si è scritto, in un oggetto solo. */
  const modulo = useCallback(
    (): BozzaModulo => ({
      quando: Date.now(),
      negozioId,
      nome,
      cognome,
      email,
      telefono,
      data,
      fascia,
      indirizzo,
      note,
      cap,
      citta,
      provincia,
      paese,
      righe,
      biglietto,
      spedizioneTitolo,
      spedizionePrezzo,
      pagamento,
      mezzo,
      aggiungiIva,
    }),
    [
      negozioId, nome, cognome, email, telefono, data, fascia, indirizzo, note, cap, citta,
      provincia, paese, righe, biglietto, spedizioneTitolo, spedizionePrezzo, pagamento, mezzo,
      aggiungiIva,
    ]
  )

  /** C'è qualcosa da salvare? Un modulo vuoto non è una bozza. */
  const qualcosaScritto = useCallback((m: BozzaModulo) => {
    return Boolean(
      m.nome.trim() || m.cognome.trim() || m.email.trim() || m.telefono.trim() ||
        m.indirizzo.trim() || m.note.trim() || m.biglietto.trim() || m.righe.length
    )
  }, [])

  // All'apertura: se c'è una bozza recente, si PROPONE.
  useEffect(() => {
    try {
      const grezzo = window.localStorage.getItem(CHIAVE_BOZZA)
      if (!grezzo) return
      const b = JSON.parse(grezzo) as BozzaModulo
      if (!b?.quando || Date.now() - b.quando > SCADENZA_BOZZA) {
        window.localStorage.removeItem(CHIAVE_BOZZA)
        return
      }
      if (qualcosaScritto(b)) setBozzaTrovata(b)
    } catch {
      // localStorage può essere spento (finestra privata, criterio aziendale):
      // ⚠️ non è un errore da mostrare — il modulo funziona lo stesso, solo
      // senza rete di sicurezza.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ogni 15 secondi, e solo se c'è qualcosa scritto.
  useEffect(() => {
    const t = window.setInterval(() => {
      const m = modulo()
      if (!qualcosaScritto(m)) return
      try {
        window.localStorage.setItem(CHIAVE_BOZZA, JSON.stringify(m))
        setSalvataAlle(
          new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        )
      } catch {
        // Spazio finito o storage spento: si tace, come sopra.
      }
    }, 15000)
    return () => window.clearInterval(t)
  }, [modulo, qualcosaScritto])

  function riprendiBozza() {
    const b = bozzaTrovata
    if (!b) return
    setNegozioId(b.negozioId)
    setNome(b.nome)
    setCognome(b.cognome)
    setEmail(b.email)
    setTelefono(b.telefono)
    setData(b.data)
    setFascia(b.fascia)
    setIndirizzo(b.indirizzo)
    setNote(b.note)
    setCap(b.cap)
    setCitta(b.citta)
    setProvincia(b.provincia)
    setPaese(b.paese)
    setRighe(b.righe ?? [])
    setBiglietto(b.biglietto)
    setSpedizioneTitolo(b.spedizioneTitolo)
    setSpedizionePrezzo(b.spedizionePrezzo)
    setPagamento(b.pagamento as typeof pagamento)
    setMezzo(b.mezzo)
    setAggiungiIva(Boolean(b.aggiungiIva))
    setBozzaTrovata(null)
  }

  function buttaBozza() {
    try {
      window.localStorage.removeItem(CHIAVE_BOZZA)
    } catch {
      /* niente da fare */
    }
    setBozzaTrovata(null)
  }

  async function crea() {
    if (creando) return
    if (!righe.length) {
      setErrore('Aggiungi almeno un prodotto.')
      return
    }
    if (pagamento === 'link' && !email.trim()) {
      setErrore('Per mandare il link di pagamento serve l’email del cliente.')
      return
    }
    // ⚠️ «Già pagato» crea un ordine PAGATO su Shopify: se i soldi non sono
    // arrivati davvero, la contabilità legge un incasso che non esiste.
    if (pagamento === 'pagato') {
      const ok = window.confirm(
        `L'ordine nascerà già PAGATO (${mezzo}) per ${soldi(totale)}.\n\n` +
          'Usalo solo se i soldi sono già arrivati. Procedo?'
      )
      if (!ok) return
    }
    setCreando(true)
    setErrore('')
    try {
      const res = await fetch('/api/nuovo-ordine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negozioId,
          cliente: { nome, cognome, email, telefono },
          consegna: {
            data,
            fascia,
            indirizzo,
            civicoNote: note,
            cap,
            citta,
            provincia,
            paese,
          },
          righe: righe.map((r) => ({
            variantId: r.variantId,
            titolo: r.variantId ? undefined : r.titolo,
            prezzo: r.variantId ? undefined : r.prezzo,
            quantita: r.quantita,
          })),
          biglietto,
          spedizione: { titolo: spedizioneTitolo, prezzo: Number(spedizionePrezzo) || 0 },
          pagamento,
          mezzoPagamento: mezzo,
          aggiungiIva,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        errore?: string
        linkPagamento?: string
        ordineNumero?: string
        inviato?: boolean
      }
      if (!res.ok) {
        setErrore(d.errore || 'Ordine non creato.')
        return
      }
      // ⚠️ La bozza si butta SOLO adesso, a ordine creato: fino a un attimo fa
      // era l'unica copia di quello che l'operatore aveva scritto.
      try {
        window.localStorage.removeItem(CHIAVE_BOZZA)
      } catch {
        /* storage spento: niente da pulire */
      }
      setEsito({
        linkPagamento: d.linkPagamento ?? '',
        ordineNumero: d.ordineNumero ?? '',
        inviato: Boolean(d.inviato),
      })
    } catch {
      setErrore('Ordine non creato: problema di rete.')
    } finally {
      setCreando(false)
    }
  }

  if (esito) {
    return (
      <>
        <div className="testa-pagina">
          <h1>Ordine creato</h1>
        </div>
        <div className="card">
          {esito.ordineNumero ? (
            <>
              <p>
                Ordine <strong>{esito.ordineNumero}</strong> creato e segnato come{' '}
                <strong>pagato ({mezzo})</strong>.
              </p>
              <p className="descrizione">
                ⚠️ Arriva nella bacheca al prossimo giro del registro (entro 20 minuti), con la
                sua consegna e i suoi passi. Fino ad allora lo trovi su Shopify.
              </p>
            </>
          ) : (
            <>
              <p>
                Bozza creata.{' '}
                {esito.inviato
                  ? `Il link di pagamento è partito per email a ${email}.`
                  : 'Il link di pagamento è qui sotto: mandalo tu al cliente.'}
              </p>
              {esito.linkPagamento ? (
                <>
                  <label className="campo">
                    <span>Link di pagamento</span>
                    <input readOnly value={esito.linkPagamento} />
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="bottone"
                      onClick={() => navigator.clipboard?.writeText(esito.linkPagamento)}
                    >
                      Copia link
                    </button>
                    {telefono.trim() ? (
                      <a
                        className="bottone secondario"
                        href={`https://wa.me/${telefono.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
                          `Ecco il link per completare l'ordine: ${esito.linkPagamento}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Manda su WhatsApp
                      </a>
                    ) : null}
                  </div>
                </>
              ) : null}
              <p className="descrizione">
                ⚠️ Finché il cliente non paga <strong>resta una bozza</strong>: non compare fra
                gli ordini da lavorare, ed è giusto così — non c'è niente da consegnare finché
                non è pagato.
              </p>
            </>
          )}
          <button className="bottone secondario" onClick={() => setEsito(null)}>
            Fai un altro ordine
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="testa-pagina">
        <h1>Nuovo ordine</h1>
        <span className="cella-sub">
          Per il cliente al telefono. L&apos;ordine nasce su Shopify e torna qui dal registro.
          {/* ⚠️ Si dice CHE si salva e QUANDO è stato salvato l'ultima volta:
              un salvataggio automatico di cui nessuno sa non protegge nessuno —
              chi ha perso un modulo una volta, la seconda ricopia a mano per
              sicurezza. */}
          {salvataAlle ? ` · bozza salvata alle ${salvataAlle}` : ' · si salva da solo ogni 15 secondi'}
        </span>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* ── C'È UNA BOZZA DI PRIMA ──
          ⚠️⚠️ Si PROPONE, non si ripristina da sola: riempire il modulo coi dati
          del cliente di mezz'ora fa mentre se ne sta servendo un altro è il modo
          di mandare un regalo all'indirizzo sbagliato. Chi la riprende lo
          decide guardando di chi è. */}
      {bozzaTrovata ? (
        <div className="avviso-ok" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            C&apos;è un ordine cominciato e non inviato
            {bozzaTrovata.nome || bozzaTrovata.cognome
              ? ` (${[bozzaTrovata.nome, bozzaTrovata.cognome].filter(Boolean).join(' ')})`
              : ''}
            , di{' '}
            {new Date(bozzaTrovata.quando).toLocaleString('it-IT', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </span>
          <button className="bottone" onClick={riprendiBozza}>
            Riprendilo
          </button>
          <button className="bottone secondario" onClick={buttaBozza}>
            Buttalo
          </button>
        </div>
      ) : null}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Negozio e cliente</h2>
        <div className="griglia-campi">
          <label className="campo">
            <span>Negozio</span>
            <select value={negozioId} onChange={(e) => setNegozioId(e.target.value)}>
              <option value="">Scegli…</option>
              {negozi.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
            {/* ⚠️ La nota sta ATTACCATA alla tendina, non in cima alla pagina:
                è lì che si guarda quando non si trova il proprio negozio. */}
            {negoziNota ? <span className="avviso-errore">{negoziNota}</span> : null}
          </label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}>
            {/* ── Richiamare un cliente già registrato ──
                ⚠️ Serve a NON ridigitare via, CAP e città al telefono: è lì che
                si sbaglia una cifra e il valet suona alla porta sbagliata.
                ⚠️ Si cerca dentro il negozio scelto: i tre marchi hanno
                anagrafiche separate su Shopify, e un indirizzo preso da un altro
                negozio è un dato che quel negozio non ha mai visto. */}
            <span>Cliente già registrato (nome, email o telefono)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={qCliente}
                onChange={(e) => setQCliente(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void cercaCliente()
                  }
                }}
                placeholder="rossi, mario@…, 3331234567"
                style={{ flex: 1 }}
              />
              <button
                className="bottone secondario"
                onClick={() => void cercaCliente()}
                disabled={cercandoCliente}
              >
                {cercandoCliente ? 'Cerco…' : 'Richiama'}
              </button>
            </div>
          </label>

          {clienti.length ? (
            <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 6 }}>
              {clienti.map((c, i) => (
                <button
                  key={i}
                  className="card riga-cliccabile"
                  style={{ padding: 8, textAlign: 'left' }}
                  onClick={() => usaCliente(c)}
                >
                  <div className="cella-nome">
                    {[c.nome, c.cognome].filter(Boolean).join(' ') || c.email || 'senza nome'}
                  </div>
                  <div className="cella-sub">
                    {[
                      c.email,
                      c.telefono,
                      [c.indirizzo, c.cap, c.citta].filter(Boolean).join(' '),
                      c.ordini ? `${c.ordini} ordini` : 'mai ordinato',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          ) : clienteCercato ? (
            <p className="descrizione" style={{ gridColumn: '1 / -1' }}>
              Nessun cliente con quel nome in questo negozio: compila i campi a mano.
            </p>
          ) : null}

          <label className="campo">
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="campo">
            <span>Cognome</span>
            <input value={cognome} onChange={(e) => setCognome(e.target.value)} />
          </label>
          <label className="campo">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="serve per il link di pagamento" />
          </label>
          <label className="campo">
            <span>Telefono</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Consegna</h2>
        <div className="griglia-campi">
          <label className="campo">
            <span>Giorno</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="campo">
            <span>Fascia oraria</span>
            <input value={fascia} onChange={(e) => setFascia(e.target.value)} placeholder="16-20" />
          </label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}>
            {/* ── L'indirizzo lo dà Maps ──
                ⚠️ Un indirizzo scelto da un elenco ESISTE; uno digitato al
                telefono ha una cifra sbagliata una volta su dieci, e l'errore si
                scopre col mazzo in mano davanti alla porta sbagliata. */}
            <span>
              Indirizzo{' '}
              {indirizzoDaMaps ? (
                <span className="cella-sub">· preso da Maps</span>
              ) : (
                <span className="cella-sub">· scrivi e scegli dall&apos;elenco</span>
              )}
            </span>
            <input
              value={indirizzo}
              onChange={(e) => {
                setIndirizzo(e.target.value)
                setIndirizzoDaMaps(false)
              }}
              placeholder="Via …, 12"
            />
            {indirizzi.length ? (
              <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                {indirizzi.map((s) => (
                  <button
                    key={s.id}
                    className="card riga-cliccabile"
                    style={{ padding: 8, textAlign: 'left' }}
                    onClick={() => void usaIndirizzo(s.id)}
                  >
                    <div className="cella-nome">{s.testo}</div>
                    <div className="cella-sub">{s.secondario}</div>
                  </button>
                ))}
              </div>
            ) : null}
            {mapsSenzaChiave ? (
              <span className="cella-sub">
                ⚠️ Manca la chiave Google Maps (Impostazioni → Indirizzi): l&apos;indirizzo si
                scrive a mano, e nessuno controlla che esista.
              </span>
            ) : null}
          </label>
          <label className="campo">
            <span>CAP</span>
            <input value={cap} onChange={(e) => setCap(e.target.value)} />
          </label>
          <label className="campo">
            <span>Città</span>
            <input value={citta} onChange={(e) => setCitta(e.target.value)} />
          </label>
          <label className="campo">
            <span>Provincia</span>
            <input value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="MI" />
          </label>
          <label className="campo">
            <span>Paese</span>
            <input value={paese} onChange={(e) => setPaese(e.target.value)} placeholder="IT" />
          </label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}>
            <span>Note per la consegna (citofono, piano, orari)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          ⚠️ Giorno e fascia si scrivono negli attributi che il registro sa leggere: senza,
          l&apos;ordine torna indietro «consegna non indicata» e finisce in fondo alla bacheca.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Prodotti</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void cerca()
            }}
            placeholder="Cerca nel catalogo del negozio…"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="bottone secondario" onClick={() => void cerca()} disabled={cercando}>
            {cercando ? 'Cerco…' : 'Cerca'}
          </button>
        </div>

        {/* ⚠️ Resta per il giorno in cui il permesso venisse tolto: un catalogo
            che non si legge deve DIRLO, non tornare una lista vuota — «non c'è
            niente con quel nome» è un'altra cosa da «non posso guardare». */}
        {catalogoChiuso ? (
          <div className="avviso-errore">
            L&apos;app non ha il permesso di leggere il catalogo (<code>read_products</code>):
            scrivi la riga a mano qui sotto. ⚠️ Un ordine così non porta la <strong>foto del
            prodotto</strong>, che è quella che si manda al fornitore.
          </div>
        ) : null}

        {prodotti.length ? (
          <div className="griglia-fornitori" style={{ marginBottom: 10 }}>
            {prodotti.map((p) => (
              <button
                key={p.variantId}
                className="card riga-cliccabile"
                style={{ padding: 8, textAlign: 'left' }}
                onClick={() =>
                  setRighe((r) => [
                    ...r,
                    {
                      variantId: p.variantId,
                      titolo: p.titolo,
                      variante: p.variante,
                      prezzo: p.prezzo,
                      quantita: 1,
                      immagine: p.immagine,
                    },
                  ])
                }
              >
                {/* ⚠️ La foto, non solo il nome: al telefono col cliente si
                    riconosce «quello con le peonie» in un colpo d'occhio, e i
                    titoli si somigliano tutti («Bouquet La Lady in Rose ·
                    Medio», «· Medio-Grande», «· Grande»). È anche la foto che
                    finirà nell'ordine e che si manda al fornitore. */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {p.immagine ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.immagine}
                      alt=""
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }}
                    />
                  ) : null}
                  <div>
                    <div className="cella-nome">{p.titolo}</div>
                    <div className="cella-sub">
                      {[p.variante, soldi(p.prezzo), p.disponibile ? '' : 'non disponibile']
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {/* La riga scritta a mano: serve col catalogo chiuso, e per i
            fuori-listino veri (una composizione su misura). */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="campo" style={{ flex: 1, minWidth: 200 }}>
            <span>Riga scritta a mano</span>
            <input
              value={rigaTitolo}
              onChange={(e) => setRigaTitolo(e.target.value)}
              placeholder="Bouquet di rose rosse, 24 steli"
            />
          </label>
          <label className="campo" style={{ width: 120 }}>
            <span>Prezzo €</span>
            <input value={rigaPrezzo} onChange={(e) => setRigaPrezzo(e.target.value)} placeholder="85" />
          </label>
          <button
            className="bottone secondario"
            onClick={() => {
              if (!rigaTitolo.trim()) return
              setRighe((r) => [
                ...r,
                { titolo: rigaTitolo.trim(), prezzo: Number(rigaPrezzo) || 0, quantita: 1 },
              ])
              setRigaTitolo('')
              setRigaPrezzo('')
            }}
          >
            Aggiungi
          </button>
        </div>

        {righe.length ? (
          <table className="tabella" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>Prezzo</th>
                <th>Quantità</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.titolo}
                    {r.variante ? <span className="cella-sub"> · {r.variante}</span> : null}
                    {!r.variantId ? <span className="cella-sub"> · riga a mano</span> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{soldi(r.prezzo)}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={r.quantita}
                      onChange={(e) =>
                        setRighe((righe) =>
                          righe.map((x, k) =>
                            k === i ? { ...x, quantita: Math.max(1, Number(e.target.value) || 1) } : x
                          )
                        )
                      }
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <button
                      className="bottone secondario mini"
                      onClick={() => setRighe((righe) => righe.filter((_, k) => k !== i))}
                    >
                      Togli
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="descrizione">Nessun prodotto ancora.</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Consegna, biglietto e pagamento</h2>
        <div className="griglia-campi">
          <label className="campo" style={{ gridColumn: '1 / -1' }}>
            {/* ⚠️⚠️ IL PREZZO LO CALCOLA IL SITO. Le tariffe qui sotto sono
                quelle che Shopify offre per questo indirizzo e questo carrello
                (`draftOrderCalculate`), col nome del sito. Se domani cambiano un
                prezzo sul sito, cambia qui da solo. Le zone Deluxy sono otto —
                Bergamo costa 80 € — quindi scriverle a mano le sbaglierebbe. */}
            <span>Spedizione</span>
            {/* La tariffa scelta, con la tendina delle alternative del sito
                quando ce n'è più d'una. */}
            {tariffe.length ? (
              <select
                value={`${spedizioneTitolo}|${spedizionePrezzo}`}
                onChange={(e) => {
                  const [tit, pre] = e.target.value.split('|')
                  setSpedizioneTitolo(tit)
                  setSpedizionePrezzo(pre)
                  // ⚠️ Scegliendo a mano dalla tendina, il ricalcolo non deve
                  // ributtarci sopra la più economica: si segna come scelta.
                  tariffaMessa.current = e.target.value
                }}
              >
                {tariffe.map((s) => (
                  <option key={`${s.titolo}|${s.prezzo}`} value={`${s.titolo}|${s.prezzo}`}>
                    {s.titolo} — {soldi(s.prezzo)}
                  </option>
                ))}
              </select>
            ) : (
              // Nessuna tariffa dal sito (o carrello/indirizzo non ancora
              // completi): campi a mano, per l'operatore.
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={spedizioneTitolo}
                  onChange={(e) => setSpedizioneTitolo(e.target.value)}
                  placeholder="Titolo della spedizione"
                  style={{ flex: 1 }}
                />
                <input
                  value={spedizionePrezzo}
                  onChange={(e) => setSpedizionePrezzo(e.target.value.replace(',', '.'))}
                  inputMode="decimal"
                  aria-label="Prezzo della spedizione"
                  style={{ width: 90, textAlign: 'right' }}
                />
              </div>
            )}
            {/* Cosa sta succedendo col calcolo. */}
            {tariffeStato === 'carico' ? (
              <span className="cella-sub">Calcolo la spedizione dal sito…</span>
            ) : tariffeStato === 'ok' && tariffe.length ? (
              <span className="cella-sub" style={{ color: 'var(--gold, #B8963E)' }}>
                Tariffe del sito per {citta.trim() || provincia.trim() || 'questo indirizzo'}
              </span>
            ) : tariffeNota ? (
              <span className="cella-sub">{tariffeNota}</span>
            ) : !negozioId ? (
              <span className="cella-sub">Scegli il negozio e l&apos;indirizzo per calcolare la spedizione.</span>
            ) : null}
          </label>
        </div>

        {/* ── L'IVA È UNA SCELTA ──
            ⚠️⚠️ Segnalato dall'utente il 28/08/2026: sul link di pagamento
            Shopify aggiungeva l'IVA da solo. Su Deluxy e Flowers i prezzi sono
            IVA esclusa, quindi di suo l'imposta si somma sopra. Ora si aggiunge
            SOLO spuntando qui — spenta, il totale del link è il prezzo
            concordato e basta. */}
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', margin: '4px 0 2px' }}>
          <input
            type="checkbox"
            checked={aggiungiIva}
            onChange={(e) => setAggiungiIva(e.target.checked)}
          />
          <span>
            <strong>Aggiungi l&apos;IVA</strong> sul totale — di suo il link non la aggiunge
          </span>
        </label>
        <label className="campo">
          <span>Biglietto (il messaggio per chi riceve)</span>
          <textarea rows={3} value={biglietto} onChange={(e) => setBiglietto(e.target.value)} />
        </label>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '10px 0' }}>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input
              type="radio"
              checked={pagamento === 'link'}
              onChange={() => setPagamento('link')}
            />
            <span>
              <strong>Link di pagamento</strong> — paga lui, resta bozza finché non paga
            </span>
          </label>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input
              type="radio"
              checked={pagamento === 'pagato'}
              onChange={() => setPagamento('pagato')}
            />
            <span>
              <strong>Ha già pagato</strong> — l&apos;ordine nasce pagato
            </span>
          </label>
          {pagamento === 'pagato' ? (
            <label className="campo" style={{ width: 180 }}>
              <span>Con che mezzo</span>
              <select value={mezzo} onChange={(e) => setMezzo(e.target.value)}>
                {/* ⚠️ I metodi VERI di questo negozio davanti, col nome che si
                    rileggerà su Shopify. La riserva sotto serve quando Shopify
                    non risponde o il negozio non ha storia — e resta separata,
                    così non si confonde «quello che il negozio usa» con
                    «quello che scriviamo noi». */}
                {metodi.length ? (
                  <optgroup label="Usati da questo negozio">
                    {metodi.map((m) => (
                      <option key={m.nome} value={m.nome}>
                        {m.nome}
                        {m.usato > 1 ? ` — ${m.usato} ordini` : ''}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label={metodi.length ? 'Altri' : 'Generici'}>
                  <option value="Bonifico">Bonifico</option>
                  <option value="Contanti">Contanti</option>
                  <option value="POS">POS</option>
                  <option value="PayPal">PayPal</option>
                  <option value="Altro">Altro</option>
                </optgroup>
              </select>
              {metodiNota ? <span className="cella-sub">{metodiNota}</span> : null}
              {/* ⚠️⚠️ SI DICE DOVE FINISCE, perché non è dove ci si aspetta.
                  Shopify non lascia scegliere il mezzo quando si chiude una
                  bozza: `draftOrderComplete` accetta un `paymentGatewayId` che
                  questa app non ha modo di ricavare (provato: non esiste una
                  query che elenchi i gateway). Quindi il mezzo resta scritto
                  nelle NOTE dell'ordine, e su Shopify la transazione risulta
                  «Manual». Meglio dirlo che lasciar credere il contrario. */}
              <span className="cella-sub">
                Il mezzo resta scritto nelle note dell&apos;ordine: su Shopify la transazione
                risulta comunque «Manual».
              </span>
            </label>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>Totale {soldi(totale)}</strong>
          <button className="bottone" onClick={crea} disabled={creando || !negozioId}>
            {creando ? 'Creo…' : pagamento === 'link' ? 'Crea e manda il link' : 'Crea come pagato'}
          </button>
        </div>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          ⚠️ «Ha già pagato» scrive su Shopify un ordine <strong>pagato</strong>: usalo solo
          quando i soldi sono arrivati davvero. Il mezzo resta scritto nelle note dell&apos;ordine.
        </p>
      </div>
    </>
  )
}
