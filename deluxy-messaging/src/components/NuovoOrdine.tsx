'use client'

import { numeroWhatsApp } from '@/lib/whatsapp-link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { chiediJson, frasePerEsito } from '@/lib/leggi-json'
import { fascePerNegozio } from '@/lib/fasce-consegna'
import { adessoRoma, fasceDelGiorno, fasceIntere, etichettaFascia, giornoSelezionabile, type OrarioNegozioDati } from '@/lib/orari-regole'

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
type Stima = {
  partenza: string
  km: number
  base: number
  baseTitolo: string
  euroPerKm: number
  prezzo: number
}
type Gruppo = {
  titolo: string
  immagine: string
  /** Le taglie/varianti di QUEL prodotto, come le manda Shopify. */
  varianti: Prodotto[]
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

/**
 * Che cosa si legge sotto il nome del prodotto nell'elenco.
 *
 * ⚠️ Il prezzo di un prodotto con più taglie NON è un numero solo: scriverne
 * uno (il primo, il più basso) farebbe promettere al telefono un prezzo che
 * poi cambia alla variante scelta. O il prezzo unico, o l'intervallo vero.
 */
function descriviGruppo(g: { varianti: { prezzo: number; disponibile: boolean }[] }): string {
  const prezzi = g.varianti.map((v) => v.prezzo)
  const min = Math.min(...prezzi)
  const max = Math.max(...prezzi)
  const quanto = min === max ? soldi(min) : `da ${soldi(min)} a ${soldi(max)}`
  const pezzi = [quanto]
  if (g.varianti.length > 1) pezzi.push(`${g.varianti.length} varianti`)
  // Si dice solo quando è vero per TUTTE: se una taglia c'è, il prodotto si
  // può ancora vendere, e scrivere «non disponibile» lo farebbe saltare a
  // torto.
  if (!g.varianti.some((v) => v.disponibile)) pezzi.push('non disponibile')
  return pezzi.join(' · ')
}

/** Un campo proposto dall'AI: il valore e la frase della chat da cui viene. */
type CampoAi = { valore: string; citazione: string }

export function NuovoOrdine({
  prefill,
  compatto = false,
  conversazioneId = '',
}: {
  /** Chi è il cliente, quando si arriva da una conversazione. */
  prefill?: { nome?: string; email?: string; telefono?: string; negozioId?: string }
  /**
   * La conversazione da cui si parte: il modulo chiede all'AI i campi
   * dell'ordine (destinatario, indirizzo, giorno, fascia, biglietto, note) e
   * li compila — solo quelli vuoti, ognuno con la frase da cui viene. Utente,
   * 06/09/2026.
   */
  conversazioneId?: string
  /**
   * Il modulo sta DENTRO qualcosa (la scheda laterale della chat): niente
   * titolone di pagina.
   *
   * ⚠️ La riga del salvataggio automatico NON si toglie insieme al titolo: e
   * l unica cosa che dice a chi compila che il lavoro non si perde, e in una
   * colonna stretta serve piu che altrove.
   */
  compatto?: boolean
}) {
  const [negozi, setNegozi] = useState<Negozio[]>([])
  // ⭐ 10/09/2026 — ORARI NEGOZI: per negozio, i giorni aperti, le fasce e le
  // chiusure scritte in «Orari negozi». Decidono se la data si può scegliere e
  // quali fasce proporre. Se la rotta non risponde si resta come prima (fasce
  // storiche, nessun controllo sulla data): il modulo non si blocca per questo,
  // e il controllo vero lo rifà comunque il server alla creazione.
  // ⚠️ Si tengono SOLO i negozi con orari scritti (`configurato`): per gli
  // altri non c'è nessuna regola — né sulla data né sulle fasce.
  const [orari, setOrari] = useState<Record<string, OrarioNegozioDati>>({})
  useEffect(() => {
    let vivo = true
    chiediJson<{ negozi?: { negozio: { id: string }; orario: OrarioNegozioDati; configurato: boolean }[] }>('/api/orari-negozi').then((e) => {
      if (!vivo || e.stato !== 'ok') return
      const mappa: Record<string, OrarioNegozioDati> = {}
      for (const n of e.dati.negozi ?? []) if (n.configurato) mappa[n.negozio.id] = n.orario
      setOrari(mappa)
    })
    return () => {
      vivo = false
    }
  }, [])
  // ── COMPILATO DALL'AI, DALLA CHAT ──
  /** I campi riempiti dall'AI, con la frase: si mostrano per farli controllare. */
  const [daAi, setDaAi] = useState<{ etichetta: string; valore: string; citazione: string }[]>([])
  const [aiStato, setAiStato] = useState<'' | 'leggo' | 'fatto' | 'niente' | 'errore'>('')
  const [aiErrore, setAiErrore] = useState('')
  const [aiProdotto, setAiProdotto] = useState<CampoAi | null>(null)
  const [aiBattute, setAiBattute] = useState<{ usate: number; totali: number } | null>(null)
  // ⚠️ Il negozio arriva dalla conversazione quando si parte da lì: il cliente
  // ha scritto AL marchio, e far scegliere di nuovo è sia un gesto in più sia
  // un modo per sbagliare — un ordine Cake creato su Flowers ha il listino, la
  // spedizione e la voce di consegna di un'altra azienda.
  const [negozioId, setNegozioId] = useState(prefill?.negozioId ?? '')

  const [nome, setNome] = useState(prefill?.nome ?? '')
  const [cognome, setCognome] = useState('')
  const [email, setEmail] = useState(prefill?.email ?? '')
  const [telefono, setTelefono] = useState(prefill?.telefono ?? '')
  /**
   * CHI RICEVE, se non è il mittente (utente, 06/09/2026). Prima il nome del
   * cliente finiva sull'indirizzo di consegna: nei regali il valet chiedeva
   * di chi aveva pagato, non di chi doveva ricevere.
   * ⚠️ Nasce ACCESA (decisione dell'utente, 06/09/2026: «default è un'altra
   * persona»): i nostri ordini sono regali, chi riceve e chi paga sono due
   * persone quasi sempre. Si toglie quando il cliente ordina per sé.
   */
  const [altroDestinatario, setAltroDestinatario] = useState(true)
  const [destNome, setDestNome] = useState('')
  const [destCognome, setDestCognome] = useState('')
  const [destTelefono, setDestTelefono] = useState('')
  /**
   * Consenso marketing: ACCESO di suo (decisione dell'utente, 06/09/2026: «deve
   * essere di default attivo»). L'operatore lo toglie se il cliente dice di no.
   * Shopify da solo lascerebbe il cliente «non iscritto»: e' questa spunta che
   * lo iscrive, dopo la creazione.
   */
  const [consensoMarketing, setConsensoMarketing] = useState(true)

  const [data, setData] = useState('')
  const [fascia, setFascia] = useState('')
  /**
   * La fascia si scrive a mano invece di sceglierla dalle voci del sito.
   *
   * ⚠️ Non è un ripiego: le eccezioni concordate al telefono («passo dopo le
   * 20») esistono. Senza una via d'uscita finirebbero nelle note, dove il
   * fornitore non le legge.
   */
  const [fasciaLibera, setFasciaLibera] = useState(false)
  /**
   * ⚠️⚠️ La consegna ANONIMA (utente, 02/09/2026): chi manda non vuole comparire.
   * Va detto a chi consegna — per questo viaggia in TRE posti: la nota
   * dell'ordine, un attributo che Shopify porta con sé, e la nota della
   * consegna quando l'ordine si manda in app. Scritta in un posto solo,
   * arriverebbe a metà strada.
   */
  const [anonima, setAnonima] = useState(false)
  /**
   * ⭐ ECCEZIONE agli orari del negozio (utente, 10/09/2026): la data scelta è un
   * giorno chiuso ma si consegna lo stesso, perché è stato concordato. Spunta +
   * motivo obbligatorio: il motivo va nella nota dell'ordine, dove lo legge chi
   * prepara e chi consegna. Si azzera da sola quando la data torna buona.
   */
  const [eccezioneOrari, setEccezioneOrari] = useState(false)
  const [eccezioneMotivo, setEccezioneMotivo] = useState('')
  const [indirizzo, setIndirizzo] = useState('')
  const [note, setNote] = useState('')
  const [cap, setCap] = useState('')
  const [citta, setCitta] = useState('')
  const [provincia, setProvincia] = useState('')
  const [paese, setPaese] = useState('IT')

  const [q, setQ] = useState('')
  /**
   * I risultati della ricerca, UN PRODOTTO PER SCHEDA.
   *
   * ⚠️⚠️ Non una riga per variante: cercando «botticelli» uscivano trenta
   * schede, sei col medesimo titolo e la sola taglia a distinguerle. La
   * variante si sceglie DOPO, dentro il prodotto.
   */
  const [gruppi, setGruppi] = useState<Gruppo[]>([])
  /**
   * La stima al chilometro per una consegna FUORI dalle zone del sito.
   *
   * ⚠️ Si mostra e non si scrive: il prezzo giusto dipende da chi consegna —
   * noi che usciamo dalla città, o un fornitore del posto.
   */
  const [stima, setStima] = useState<Stima | null>(null)
  /**
   * L operatore vuole scrivere LUI l importo della consegna, anche se il sito
   * una tariffa ce l ha.
   *
   * ⚠️⚠️ Chiesto dall utente il 02/09/2026 («puoi creare draft orders per
   * mettere importi di consegna personalizzati?»). La bozza lo permetteva gia —
   * la riga di spedizione su Shopify e nostra, titolo e prezzo liberi — ma la
   * SCHERMATA no: con una tariffa del sito compariva solo la tendina. Su Cake,
   * che chiede 10 EUR piatti ovunque, una consegna a Palermo non si poteva
   * far pagare piu di 10 EUR (bozza #D269, pagata cosi).
   */
  const [spedizioneAMano, setSpedizioneAMano] = useState(false)
  const [stimaStato, setStimaStato] = useState('')
  /** Quanto e lontano, quando e troppo: un rifiuto senza il motivo non si capisce. */
  const [stimaLontano, setStimaLontano] = useState<{ km: number; partenza: string } | null>(null)
  /** Il prodotto di cui si stanno guardando le varianti. */
  const [aperto, setAperto] = useState<Gruppo | null>(null)
  const [catalogoChiuso, setCatalogoChiuso] = useState(false)
  /**
   * L ultimo prodotto scelto dai risultati.
   *
   * ⚠️ Finche c e, i risultati non si mostrano: il clic ha fatto qualcosa e si
   * vede. Si azzera anche a ogni ricerca nuova, o dopo aver scelto si
   * cercherebbe a vuoto senza vedere niente.
   */
  const [scelto, setScelto] = useState<Prodotto | null>(null)
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
   * Questo ordine va SENZA costo di consegna.
   *
   * ⚠️⚠️ Serve un interruttore e non basta mettere zero a mano: il prezzo lo
   * calcola il sito e si ri-calcola da solo a ogni cambio di indirizzo o di
   * carrello: lo zero scritto a mano tornava tariffa da solo, e chi aveva
   * promesso al telefono «la consegna gliela offriamo io» se ne accorgeva
   * dopo, sul link gia mandato.
   */
  const [senzaConsegna, setSenzaConsegna] = useState(false)

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
    /** Com'è andata la scrittura del consenso marketing ('' = non chiesto). */
    consensoEsito?: string
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
      setStima(null)
      setStimaStato('')
      setStimaLontano(null)
      setTariffeStato('idle')
      setTariffeNota('')
      return
    }
    let vivo = true
    setTariffeStato('carico')
    const t = setTimeout(async () => {
      const e = await chiediJson<{
        tariffe?: { titolo: string; prezzo: number }[]
        stima?: Stima | null
        stimaStato?: string
        stimaKm?: number | null
        stimaPartenza?: string
        errore?: string
      }>(
        '/api/nuovo-ordine/tariffe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            negozioId,
            indirizzo: { indirizzo, citta, cap, provincia, paese },
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
        setStima(null)
        setStimaStato('')
        setStimaLontano(null)
        setTariffeStato('errore')
        setTariffeNota(frasePerEsito(e))
        return
      }
      const list = e.dati.tariffe ?? []
      setTariffe(list)
      setStima(e.dati.stima ?? null)
      setStimaStato(e.dati.stimaStato ?? '')
      setStimaLontano(
        e.dati.stimaKm != null ? { km: e.dati.stimaKm, partenza: e.dati.stimaPartenza ?? '' } : null
      )
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
      // ⚠️⚠️ Con «senza consegna» acceso il ricalcolo NON scrive: e il punto
      // di tutta la spunta. Le tariffe si continuano a chiedere e a mostrare —
      // serve sapere quanto si sta regalando — ma non si mettono nel campo.
      if (list.length && manoLibera && !senzaConsegna && !spedizioneAMano) {
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

  /**
   * Mette la variante scelta fra le righe dell'ordine, chiude l'elenco e dice
   * che cosa è stato preso.
   *
   * ⚠️ Sta in una funzione sola perché i punti da cui si sceglie sono due (la
   * scheda del prodotto con variante unica, e l'elenco delle varianti): due
   * copie della stessa riga si sarebbero scostate al primo ritocco.
   */
  const aggiungi = useCallback((p: Prodotto) => {
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
    setScelto(p)
    setAperto(null)
  }, [])
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
        raggruppati?: Gruppo[]
        senzaPermesso?: boolean
        nota?: string
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Ricerca non riuscita.')
        return
      }
      setCatalogoChiuso(Boolean(d.senzaPermesso))
      setGruppi(d.raggruppati ?? [])
      // ⚠️ Una ricerca nuova toglie di mezzo la conferma di quella prima e le
      // varianti aperte: altrimenti si cercherebbe qualcosa e non comparirebbe
      // niente, con ancora a schermo il prodotto di prima.
      setScelto(null)
      setAperto(null)
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

  // Le fasce del marchio scelto, e il caso della bozza riaperta.
  //
  // ⚠️ Se la fascia che c'è già NON è una del sito (una vecchia scritta a mano,
  // o una eccezione concordata), si apre da sola in modalità libera: altrimenti
  // la tendina la cancellerebbe scegliendo la prima voce al posto sua.
  const nomeNegozio = negozi.find((n) => n.id === negozioId)?.nome ?? ''
  // ⭐ Le fasce vengono da «Orari negozi» quando ce ne sono; altrimenti le voci
  // storiche del marchio (fasce-consegna.ts), misurate sugli ordini veri.
  const orarioNegozio = negozioId ? orari[negozioId] : undefined
  // ⭐ 10/09 sera: le fasce si CALCOLANO dalle regole del negozio per la data
  // scelta e l'ora italiana di adesso (le stesse che vede il cliente sul sito).
  // Senza data ancora scelta: la griglia dei giorni «oltre». Senza regole
  // salvate: le voci storiche del marchio.
  const fasceDelNegozio = orarioNegozio
    ? data
      ? fasceDelGiorno(orarioNegozio, data, adessoRoma()).etichette
      : fasceIntere(orarioNegozio.regole, orarioNegozio.regole.oltre.durataOre).map(etichettaFascia)
    : fascePerNegozio(nomeNegozio)
  const chiaveFasce = fasceDelNegozio.join('|')
  useEffect(() => {
    if (fascia.trim() && !chiaveFasce.split('|').includes(fascia.trim())) setFasciaLibera(true)
  }, [fascia, chiaveFasce])
  // ⭐ La data si può scegliere? (giorno chiuso, festa, già passata). A parole.
  const giornoEsito = data && orarioNegozio ? giornoSelezionabile(orarioNegozio, data) : null
  /** Se il giorno è buono ma per quell'ora non resta nessuna fascia, lo si dice (l'operatore può scrivere una fascia flessibile). */
  const fasceEsito = data && orarioNegozio && giornoEsito?.ok ? fasceDelGiorno(orarioNegozio, data, adessoRoma()) : null
  /** Una data passata non si concorda: l'eccezione non si offre nemmeno. */
  const dataPassata = Boolean(data) && data < adessoRoma().data
  const giornoChiusoMaConcordabile = Boolean(giornoEsito && !giornoEsito.ok && !dataPassata)
  useEffect(() => {
    if (!giornoChiusoMaConcordabile) {
      setEccezioneOrari(false)
      setEccezioneMotivo('')
    }
  }, [giornoChiusoMaConcordabile])

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
    senzaConsegna: boolean
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
      senzaConsegna,
      pagamento,
      mezzo,
      aggiungiIva,
    }),
    [
      negozioId, nome, cognome, email, telefono, data, fascia, indirizzo, note, cap, citta,
      provincia, paese, righe, biglietto, spedizioneTitolo, spedizionePrezzo, senzaConsegna,
      anonima, fasciaLibera,
      pagamento, mezzo,
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

  // All'apertura da una chat: si chiede all'AI e si riempiono i campi VUOTI.
  // ⚠️ Solo i vuoti: quello che c'è già (il nome dalla conversazione, una bozza
  // ripresa, quello che l'operatore ha iniziato a scrivere) non si tocca.
  useEffect(() => {
    if (!conversazioneId) return
    let vivo = true
    setAiStato('leggo')
    setAiErrore('')
    ;(async () => {
      try {
        const res = await fetch(`/api/conversazioni/${conversazioneId}/ordine-da-chat`, { method: 'POST' })
        const d = (await res.json().catch(() => ({}))) as {
          ordine?: { battute: { usate: number; totali: number }; campi: Record<string, CampoAi> }
          errore?: string
        }
        if (!vivo) return
        if (!res.ok || !d.ordine) {
          setAiStato('errore')
          setAiErrore(d.errore || 'Lettura della chat non riuscita.')
          return
        }
        const c = d.ordine.campi
        const messi: { etichetta: string; valore: string; citazione: string }[] = []
        const metti = (campo: CampoAi | undefined, etichetta: string, attuale: string, set: (v: string) => void) => {
          if (!campo?.valore || attuale.trim()) return
          set(campo.valore)
          messi.push({ etichetta, valore: campo.valore, citazione: campo.citazione })
        }
        metti(c.mittenteNome, 'Nome', nome, setNome)
        metti(c.mittenteCognome, 'Cognome', cognome, setCognome)
        metti(c.mittenteTelefono, 'Telefono', telefono, setTelefono)
        metti(c.mittenteEmail, 'Email', email, setEmail)
        if (c.destinatarioNome?.valore || c.destinatarioTelefono?.valore) setAltroDestinatario(true)
        metti(c.destinatarioNome, 'Destinatario: nome', destNome, setDestNome)
        metti(c.destinatarioCognome, 'Destinatario: cognome', destCognome, setDestCognome)
        metti(c.destinatarioTelefono, 'Destinatario: telefono', destTelefono, setDestTelefono)
        metti(c.via, 'Indirizzo', indirizzo, setIndirizzo)
        metti(c.noteCivico, 'Civico / note', note, setNote)
        metti(c.cap, 'CAP', cap, setCap)
        metti(c.citta, 'Città', citta, setCitta)
        metti(c.provincia, 'Provincia', provincia, setProvincia)
        if (c.paese?.valore && c.paese.valore !== 'IT') metti(c.paese, 'Paese', '', setPaese)
        metti(c.dataISO, 'Giorno', data, setData)
        if (c.fascia?.valore && !fascia) {
          // Una fascia del sito si sceglie dalla tendina; un orario a parole va
          // nella fascia flessibile, che è il posto dove il fornitore la legge.
          const f = c.fascia.valore.replace(/\s+/g, '')
          const delSito = fasceDelNegozio.find((x) => x.replace(/\s+/g, '') === f || x.replace(/^0/, '').replace(/-0/, '-') === f.replace(/^0/, '').replace(/-0/, '-'))
          if (delSito) setFascia(delSito)
          else {
            setFasciaLibera(true)
            setFascia(c.fascia.valore)
          }
          messi.push({ etichetta: 'Fascia', valore: delSito ?? c.fascia.valore, citazione: c.fascia.citazione })
        }
        metti(c.biglietto, 'Biglietto', biglietto, setBiglietto)
        if (c.noteConsegna?.valore) {
          // Le istruzioni per chi consegna stanno nelle note dell'indirizzo, dopo il civico.
          const gia = note.trim() || c.noteCivico?.valore || ''
          const nuove = gia && !gia.includes(c.noteConsegna.valore) ? `${gia} · ${c.noteConsegna.valore}` : gia || c.noteConsegna.valore
          setNote(nuove)
          messi.push({ etichetta: 'Note per chi consegna', valore: c.noteConsegna.valore, citazione: c.noteConsegna.citazione })
        }
        if (c.prodotto?.valore) {
          setAiProdotto(c.prodotto)
          // Il prodotto NON si mette in una riga: il prezzo e la variante
          // vengono dal catalogo, e una riga scritta a mano finirebbe in ordine
          // senza il prodotto vero. Si porta la richiesta nella ricerca.
          if (!q.trim() && !righe.length) setQ(c.prodotto.valore.slice(0, 60))
        }
        setAiBattute(d.ordine.battute)
        setDaAi(messi)
        setAiStato(messi.length || c.prodotto?.valore ? 'fatto' : 'niente')
      } catch {
        if (!vivo) return
        setAiStato('errore')
        setAiErrore('Lettura della chat non riuscita: problema di rete.')
      }
    })()
    return () => {
      vivo = false
    }
    // Una volta sola, all'apertura: rileggere a ogni tasto sovrascriverebbe il lavoro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversazioneId])

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
    setSenzaConsegna(Boolean(b.senzaConsegna))
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
    // ⭐ Orari negozi: una data in cui il negozio è chiuso non passa, salvo
    // ECCEZIONE CONCORDATA con motivo. Lo stesso controllo lo rifà il server
    // (creaOrdine), che è dove sta il divieto.
    if (giornoEsito && !giornoEsito.ok) {
      if (dataPassata) {
        setErrore(giornoEsito.motivo + ' Una data passata non si può concordare.')
        return
      }
      if (!eccezioneOrari || !eccezioneMotivo.trim()) {
        setErrore(giornoEsito.motivo + ' Scegli un altro giorno, oppure spunta «Eccezione concordata» e scrivi il motivo.')
        return
      }
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
          destinatario: altroDestinatario
            ? { nome: destNome, cognome: destCognome, telefono: destTelefono }
            : undefined,
          consensoMarketing,
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
          // ⚠️⚠️ Con «senza costo di consegna» si manda una riga «Consegna
          // offerta» a ZERO, non il titolo vuoto. Fino al 06/09/2026 si mandava
          // il vuoto (nessuna riga sulla bozza) credendo che bastasse: ma una
          // bozza SENZA riga di spedizione lascia al checkout di Shopify il
          // calcolo della tariffa, e il cliente si trovava la consegna in conto
          // (utente, bozza #D5685: «avevo messo flag per no costo consegna ma
          // Shopify me lo ha riportato lo stesso»). Con la riga a zero il
          // checkout la rispetta e non ricalcola niente.
          spedizione: senzaConsegna
            ? { titolo: 'Consegna offerta', prezzo: 0 }
            : { titolo: spedizioneTitolo, prezzo: Number(spedizionePrezzo) || 0 },
          pagamento,
          mezzoPagamento: mezzo,
          aggiungiIva,
          anonima,
          // ⭐ Il motivo dell'eccezione agli orari, solo se la data è chiusa e
          // l'operatore l'ha spuntata: altrimenti vuoto.
          eccezioneOrari: giornoChiusoMaConcordabile && eccezioneOrari ? eccezioneMotivo.trim() : '',
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        errore?: string
        linkPagamento?: string
        ordineNumero?: string
        inviato?: boolean
        consensoEsito?: string
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
        consensoEsito: d.consensoEsito ?? '',
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
          {/* L'esito del consenso marketing, quando l'operatore l'ha spuntato:
              un consenso che si crede registrato e non lo è vale una multa. */}
          {esito.consensoEsito ? (
            <div className={/NON registrato/.test(esito.consensoEsito) ? 'avviso-errore' : 'avviso-ok'}>
              {esito.consensoEsito}
            </div>
          ) : null}
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
                        href={`https://wa.me/${numeroWhatsApp(telefono)}?text=${encodeURIComponent(
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
        {compatto ? null : <h1>Nuovo ordine</h1>}
        <span className="cella-sub">
          {compatto
            ? null
            : 'Per il cliente al telefono. L’ordine nasce su Shopify e torna qui dal registro.'}
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
      {/* ── Cosa ha compilato l'AI dalla chat, e da dove ──
          ⚠️ Si mostra SEMPRE cosa è stato riempito e la frase: un campo
          compilato in silenzio si crede vero, e su un indirizzo di consegna
          credere è il modo di sbagliare. */}
      {aiStato === 'leggo' ? (
        <p className="cella-sub" style={{ margin: '0 0 10px' }}>Leggo la chat per compilare il modulo…</p>
      ) : null}
      {aiStato === 'errore' ? <div className="avviso-errore">{aiErrore} Compila a mano.</div> : null}
      {aiStato === 'niente' ? (
        <p className="cella-sub" style={{ margin: '0 0 10px' }}>
          Nella chat non ho trovato indirizzo, giorno o destinatario da riportare: compila a mano.
        </p>
      ) : null}
      {aiStato === 'fatto' ? (
        <details className="avviso-ok" open style={{ marginBottom: 10 }}>
          <summary style={{ cursor: 'pointer' }}>
            <strong>Compilato dalla chat</strong>: {daAi.length} {daAi.length === 1 ? 'campo' : 'campi'}
            {aiProdotto ? ' + il prodotto chiesto' : ''} — controlla, ogni voce ha la frase da cui viene.
            {aiBattute && aiBattute.usate < aiBattute.totali ? ` Letto sulle ultime ${aiBattute.usate} battute su ${aiBattute.totali}.` : ''}
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {daAi.map((v) => (
              <li key={v.etichetta} style={{ fontSize: 13 }}>
                <strong>{v.etichetta}</strong>: {v.valore} <span className="cella-sub">— «{v.citazione}»</span>
              </li>
            ))}
            {aiProdotto ? (
              <li style={{ fontSize: 13 }}>
                <strong>Prodotto chiesto</strong>: {aiProdotto.valore}{' '}
                <span className="cella-sub">— «{aiProdotto.citazione}» · cercalo nel catalogo qui sotto: prezzo e variante vengono da lì.</span>
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
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
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Negozio e mittente (chi ordina e paga)</h2>
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

          {/* ⚠️ «Nome» da solo, con un destinatario tre riquadri più sotto, si
              compila con la persona sbagliata (utente, 06/09/2026). */}
          <label className="campo">
            <span>Nome del mittente</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="campo">
            <span>Cognome del mittente</span>
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
          {/* ── IL CONSENSO MARKETING (utente, 06/09/2026: «deve essere di default
              attivo») ── Shopify registra il cliente nato da una bozza come «non
              iscritto»; qui la spunta nasce ACCESA e a ordine creato il consenso
              si scrive sul suo profilo con la data. Chi ha il cliente al telefono
              la toglie se dice di no. L'esito si legge a ordine creato. */}
          <label
            style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
          >
            <input
              type="checkbox"
              checked={consensoMarketing}
              onChange={(e) => setConsensoMarketing(e.target.checked)}
            />
            <span>
              Il cliente <strong>acconsente alle comunicazioni marketing</strong> (newsletter,
              promozioni). Togli la spunta se dice di no: senza, su Shopify resta «non iscritto».
            </span>
          </label>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Consegna</h2>
        <div className="griglia-campi">
          {/* ── CHI RICEVE ──
              ⚠️ Nei nostri ordini chi paga e chi riceve sono quasi sempre due
              persone. Senza questa casella il nome del mittente finiva
              sull'indirizzo di consegna, cioè sul citofono che suona il valet. */}
          <label
            style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
          >
            <input
              type="checkbox"
              checked={altroDestinatario}
              onChange={(e) => setAltroDestinatario(e.target.checked)}
            />
            <span>
              <strong>Riceve un&apos;altra persona</strong> — il destinatario non è chi ordina
              (togli la spunta se il cliente ordina per sé)
            </span>
          </label>
          {altroDestinatario ? (
            <>
              <label className="campo">
                <span>Destinatario — nome</span>
                <input value={destNome} onChange={(e) => setDestNome(e.target.value)} />
              </label>
              <label className="campo">
                <span>Cognome</span>
                <input value={destCognome} onChange={(e) => setDestCognome(e.target.value)} />
              </label>
              <label className="campo">
                <span>Telefono del destinatario</span>
                <input
                  value={destTelefono}
                  onChange={(e) => setDestTelefono(e.target.value)}
                  placeholder="lo chiama il valet sotto casa"
                />
              </label>
              <p className="descrizione" style={{ gridColumn: '1 / -1', margin: 0 }}>
                Il mittente resta il cliente dell&apos;ordine (riceve il link di pagamento); il
                destinatario va sull&apos;indirizzo di consegna, e nella nota si legge chi ha
                ordinato.
              </p>
            </>
          ) : null}
          <label className="campo">
            <span>Giorno</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-invalid={giornoEsito ? !giornoEsito.ok : undefined} />
            {/* ⭐ 10/09/2026 — Orari negozi: si dice subito PERCHÉ una data non va
                (chiuso di domenica, Natale, già passata), non al momento di creare. */}
            {giornoEsito && !giornoEsito.ok ? (
              <span style={{ color: 'var(--red)', marginTop: 4 }}>{giornoEsito.motivo}</span>
            ) : fasceEsito && !fasceEsito.ok ? (
              <span style={{ color: 'var(--gold, #B8963E)', marginTop: 4 }}>{fasceEsito.motivo} Se è concordato, scrivi la fascia a mano («Flessibile»).</span>
            ) : null}
          </label>
          {/* ⭐ ECCEZIONE CONCORDATA (utente, 10/09/2026): il giorno è chiuso ma si
              consegna lo stesso. Spunta + motivo obbligatorio; il motivo va nella
              nota dell'ordine e nell'attributo Eccezione_Orari. Fuori dalla label
              del Giorno: una label dentro un'altra non è HTML valido. Una data
              passata non si concorda: qui non compare. */}
          {giornoChiusoMaConcordabile ? (
            <div className="campo" style={{ gridColumn: '1 / -1', display: 'grid', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={eccezioneOrari} onChange={(e) => setEccezioneOrari(e.target.checked)} />
                <span style={{ margin: 0, color: 'var(--text)', fontSize: 14 }}>
                  <strong>Eccezione concordata</strong> — si consegna lo stesso quel giorno
                </span>
              </label>
              {eccezioneOrari ? (
                <>
                  <input
                    value={eccezioneMotivo}
                    onChange={(e) => setEccezioneMotivo(e.target.value)}
                    maxLength={200}
                    placeholder="con chi e perché (es. concordato col fioraio, consegna anche la domenica)"
                    aria-label="Motivo dell'eccezione"
                  />
                  <span style={{ margin: 0 }}>
                    Il motivo finisce nella nota dell&apos;ordine: lo legge chi prepara e chi consegna.
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          {/* ── LA FASCIA, COME LA OFFRE IL SITO ──
              ⚠️⚠️ Chiesto dall'utente il 02/09/2026. Era testo libero, e nei
              dati veri si vede: `116-20`, `8-16`, `9-17`, «16-20 ultimo orario
              disponibile». Una fascia scritta storta arriva al fornitore senza
              un orario leggibile. Le voci sono quelle che i siti mandano
              davvero (vedi src/lib/fasce-consegna.ts).
              ⚠️ «Flessibile» resta, e non è un ripiego: le eccezioni concordate
              al telefono esistono, e senza una via d'uscita si scriverebbero
              nelle note dove non le legge il fornitore. */}
          <label className="campo">
            <span>Fascia oraria</span>
            {fasciaLibera ? (
              <input
                value={fascia}
                onChange={(e) => setFascia(e.target.value)}
                placeholder="es. 17-18, o «dopo le 20»"
              />
            ) : (
              <select
                value={fascia}
                onChange={(e) => {
                  if (e.target.value === '__libera') {
                    setFasciaLibera(true)
                    setFascia('')
                    return
                  }
                  setFascia(e.target.value)
                }}
              >
                <option value="">— scegli la fascia —</option>
                {fasceDelNegozio.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                <option value="__libera">Flessibile: la scrivo io…</option>
              </select>
            )}
            {fasciaLibera ? (
              <button
                type="button"
                className="bottone secondario mini"
                style={{ marginTop: 4, alignSelf: 'flex-start' }}
                onClick={() => {
                  setFasciaLibera(false)
                  setFascia('')
                }}
              >
                Torna alle fasce del sito
              </button>
            ) : null}
          </label>
          {/* ── CONSEGNA ANONIMA ──
              ⚠️⚠️ Chiesto dall'utente il 02/09/2026. Chi manda non vuole
              comparire: il valet non deve dire da parte di chi, e sul biglietto
              non ci va il nome. È un'informazione che serve a CHI CONSEGNA, non
              a noi — per questo viaggia anche nell'ordine e nella consegna di
              là, non solo in questa casella. */}
          <label
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              fontSize: 13,
            }}
          >
            <input type="checkbox" checked={anonima} onChange={(e) => setAnonima(e.target.checked)} />
            <span>
              <strong>Consegna anonima</strong> — chi riceve non deve sapere da parte di chi
            </span>
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

        {/* ── QUELLO CHE HAI SCELTO ──
            ⚠️⚠️ Chiesto dall'utente il 31/08/2026: «se clicco su un prodotto
            chiudi la ricerca effettuata, fai capire il prodotto scelto».
            Cercando «botticelli» escono TRENTA schede: cliccandone una, la
            riga si aggiungeva in fondo — sotto trenta risultati — e a schermo
            non cambiava niente. Chi lavora col cliente al telefono non ha modo
            di sapere se il clic è andato a segno, e clicca due volte. */}
        {scelto ? (
          <div className="avviso-ok" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {scelto.immagine ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={scelto.immagine}
                alt=""
                style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }}
              />
            ) : null}
            <span style={{ flex: 1, minWidth: 180 }}>
              Scelto: <strong>{scelto.titolo}</strong>
              {scelto.variante ? ` · ${scelto.variante}` : ''} · {soldi(scelto.prezzo)}
            </span>
            {/* ⚠️ I risultati non si BUTTANO, si nascondono: da una ricerca sola
                si prendono spesso due prodotti (il bouquet e il palloncino), e
                farla rifare ogni volta sarebbe un dispetto. */}
            <button className="bottone secondario" onClick={() => setScelto(null)}>
              Rivedi i risultati
            </button>
          </div>
        ) : null}

        {/* ── LE VARIANTI DEL PRODOTTO APERTO ──
            ⚠️⚠️ Chiesto dall'utente il 02/09/2026: «non mostrare tutti i
            prodotti con tutte le varianti: mostra i prodotti e poi una volta
            scelto il prodotto l'utente sceglie la variante». È anche l'ordine
            in cui la sceglie il cliente al telefono: prima «il Botticelli»,
            poi «grande o medio?». */}
        {aperto && !scelto ? (
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              {aperto.immagine ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={aperto.immagine}
                  alt=""
                  style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }}
                />
              ) : null}
              <span style={{ flex: 1, minWidth: 180 }}>
                <strong>{aperto.titolo}</strong> · scegli la variante
              </span>
              <button className="bottone secondario" onClick={() => setAperto(null)}>
                ← Torna ai risultati
              </button>
            </div>
            <div className="griglia-fornitori">
              {aperto.varianti.map((v) => (
                <button
                  key={v.variantId}
                  className="card riga-cliccabile"
                  style={{ padding: 8, textAlign: 'left' }}
                  onClick={() => aggiungi(v)}
                >
                  <div className="cella-nome">{v.variante || 'Unica'}</div>
                  <div className="cella-sub">
                    {[soldi(v.prezzo), v.disponibile ? '' : 'non disponibile']
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {gruppi.length && !scelto && !aperto ? (
          <div className="griglia-fornitori" style={{ marginBottom: 10 }}>
            {gruppi.map((g) => (
              <button
                // ⚠️ La chiave e' l'id della prima variante, non il titolo: due
                // prodotti diversi possono chiamarsi uguale (capita coi doppioni
                // di stagione) e React ne mostrerebbe uno solo.
                key={g.varianti[0].variantId}
                className="card riga-cliccabile"
                style={{ padding: 8, textAlign: 'left' }}
                onClick={() => {
                  // ⚠️ Con una variante sola non si fa fare un clic per niente:
                  // «Default Title» è la variante unica di Shopify, e un passo
                  // in più per scegliere l'unica cosa scegliibile è un dispetto.
                  if (g.varianti.length === 1) aggiungi(g.varianti[0])
                  else setAperto(g)
                }}
              >
                {/* ⚠️ La foto, non solo il nome: al telefono col cliente si
                    riconosce «quello con le peonie» in un colpo d'occhio, e i
                    titoli si somigliano tutti. È anche la foto che finirà
                    nell'ordine e che si manda al fornitore. */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {g.immagine ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.immagine}
                      alt=""
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }}
                    />
                  ) : null}
                  <div>
                    <div className="cella-nome">{g.titolo}</div>
                    <div className="cella-sub">{descriviGruppo(g)}</div>
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
            {/* ── SENZA COSTO DI CONSEGNA ──
                ⚠️⚠️ Chiesto dall'utente il 31/08/2026. Non basta scrivere zero
                nel campo: il prezzo lo calcola il sito e si RI-calcola da solo a
                ogni cambio di indirizzo o di carrello, quindi lo zero scritto a
                mano tornava tariffa da sé — e chi al telefono aveva detto «la
                consegna gliela offriamo» se ne accorgeva dopo, sul link già
                mandato. Con la spunta il ricalcolo non scrive più niente. */}
            <label
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '2px 0 8px' }}
            >
              <input
                type="checkbox"
                checked={senzaConsegna}
                onChange={(e) => {
                  setSenzaConsegna(e.target.checked)
                  if (e.target.checked) {
                    setSpedizioneTitolo('')
                    setSpedizionePrezzo('0')
                  }
                }}
              />
              Senza costo di consegna (sull'ordine va la riga «Consegna offerta» a 0 €, così il sito non la ricalcola)
            </label>
            {/* ⚠️ Le tariffe si continuano a CHIEDERE e a mostrare anche con la
                spunta accesa: serve sapere quanto si sta regalando. Non si
                mettono nel campo, e basta. */}
            {senzaConsegna ? (
              <p className="cella-sub" style={{ margin: 0 }}>
                Consegna offerta: nessun costo sull&apos;ordine.
                {tariffe.length
                  ? ` Il sito la calcolerebbe ${soldi(tariffe[0].prezzo)} (${tariffe[0].titolo}).`
                  : ''}
              </p>
            ) : tariffe.length && !spedizioneAMano ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  style={{ flex: 1, minWidth: 200 }}
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
                {/* ⚠️⚠️ Il pezzo che mancava: con una tariffa del sito c'era
                    SOLO la tendina, e l'importo non si poteva cambiare. La
                    bozza su Shopify lo permette da sempre — la riga di
                    spedizione la scriviamo noi, titolo e prezzo liberi. */}
                <button className="bottone secondario" onClick={() => setSpedizioneAMano(true)}>
                  Importo mio
                </button>
              </div>
            ) : (
              // Nessuna tariffa dal sito (o carrello/indirizzo non ancora
              // completi), oppure l'importo lo scrive l'operatore.
              <div>
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
                {tariffe.length && spedizioneAMano ? (
                  <p className="cella-sub" style={{ margin: '4px 0 0' }}>
                    Il sito chiederebbe {soldi(tariffe[0].prezzo)} ({tariffe[0].titolo}).{' '}
                    <button
                      className="bottone secondario mini"
                      onClick={() => {
                        setSpedizioneAMano(false)
                        setSpedizioneTitolo(tariffe[0].titolo)
                        setSpedizionePrezzo(String(tariffe[0].prezzo))
                        tariffaMessa.current = `${tariffe[0].titolo}|${tariffe[0].prezzo}`
                      }}
                    >
                      Torna alla tariffa del sito
                    </button>
                  </p>
                ) : null}
              </div>
            )}
            {/* ── FUORI ZONA: QUANTO COSTA PORTARLO LÀ ──
                ⚠️⚠️ Chiesto dall'utente il 02/09/2026. L'indirizzo libero c'era
                già; fuori dalle zone del sito restava un campo vuoto, e il
                prezzo cambiava a seconda di chi rispondeva al telefono. La
                stima ricalca il listino del sito: dentro le sue zone deluxy.it
                chiede 15 € a Milano, 45 a Monza (25,6 km) e 80 a Bergamo
                (58,6 km) — cioè la tariffa cittadina più circa un euro al
                chilometro di strada.
                ⚠️ Si MOSTRA e non si scrive: vale se usciamo noi dalla città.
                Se quella consegna la fa un fornitore del posto, i chilometri
                non li fa nessuno e questo prezzo è una stangata. */}
            {!senzaConsegna && stima ? (
              <div className="avviso-ok" style={{ marginTop: 8 }}>
                <div>
                  <strong>
                    {tariffe.length
                      ? `Consegna fuori città: il sito chiede ${soldi(tariffe[0].prezzo)}.`
                      : 'Fuori dalle zone del sito.'}
                  </strong>{' '}
                  Sono{' '}
                  <strong>{stima.km.toLocaleString('it-IT')} km</strong> di strada da{' '}
                  {stima.partenza}.
                </div>
                <div className="cella-sub" style={{ margin: '4px 0 8px' }}>
                  {stima.base > 0
                    ? `${soldi(stima.base)} (${stima.baseTitolo || 'tariffa in città'}) + ${stima.km.toLocaleString('it-IT')} km × ${soldi(stima.euroPerKm)} = `
                    : `${stima.km.toLocaleString('it-IT')} km × ${soldi(stima.euroPerKm)} = `}
                  <strong>{soldi(stima.prezzo)}</strong> (arrotondato a 5 €)
                </div>
                <button
                  className="bottone secondario"
                  onClick={() => {
                    setSpedizioneTitolo(`Consegna da ${stima.partenza} (${stima.km.toLocaleString('it-IT')} km)`)
                    setSpedizionePrezzo(String(stima.prezzo))
                    // Con una tariffa del sito a schermo servirebbe anche
                    // uscire dalla tendina, o il numero non si vedrebbe.
                    setSpedizioneAMano(true)
                    // Scelta a mano: il ricalcolo non ci scrive più sopra.
                    tariffaMessa.current = `Consegna da ${stima.partenza}|${stima.prezzo}`
                  }}
                >
                  Metti {soldi(stima.prezzo)}
                </button>
                <div className="cella-sub" style={{ marginTop: 8 }}>
                  ⚠️ Vale se la consegna <strong>la facciamo noi da {stima.partenza}</strong>. Se
                  la fa un fornitore del posto i chilometri non li fa nessuno: in quel caso il
                  prezzo è un altro, o si toglie del tutto qui sopra.
                </div>
              </div>
            ) : null}
            {/* ⚠️⚠️ Troppo lontano per andarci in auto: NON si propone un
                prezzo al km. Misurato il 02/09/2026: per Abu Dhabi Google una
                strada la trova (5.910 km) e la stima diceva 5.915 € — un numero
                così dentro un modulo è peggio di nessun numero, perché qualcuno
                lo mette. */}
            {!senzaConsegna && stimaStato === 'troppo-lontano' ? (
              <p className="cella-sub" style={{ marginTop: 8 }}>
                {stimaLontano
                  ? `Sono ${stimaLontano.km.toLocaleString('it-IT')} km da ${stimaLontano.partenza}: `
                  : ''}
                troppo lontano per uscire da noi. Là consegna un <strong>fornitore del
                posto</strong>, quindi il prezzo non è un conto al chilometro: mettilo tu, o
                spunta «senza costo di consegna».
              </p>
            ) : null}
            {!senzaConsegna && !tariffe.length && !stima && stimaStato === 'senza-chiave' ? (
              <p className="cella-sub" style={{ marginTop: 8 }}>
                Per stimare la consegna fuori zona serve la chiave Google Maps (Impostazioni).
              </p>
            ) : null}
            {!senzaConsegna && !tariffe.length && !stima && stimaStato === 'senza-strada' ? (
              <p className="cella-sub" style={{ marginTop: 8 }}>
                Google non trova una strada per questo indirizzo (fuori dall&apos;Europa, o
                indirizzo troppo vago): il prezzo lo metti tu.
              </p>
            ) : null}
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
