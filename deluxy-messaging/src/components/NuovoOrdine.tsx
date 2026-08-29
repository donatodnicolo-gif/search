'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { chiediJson, frasePerEsito } from '@/lib/leggi-json'
import { regolaConsegna } from '@/lib/regole-consegna'

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
   * L'ultima spedizione messa da una REGOLA (marchio/città), in forma
   * `titolo|prezzo`. Serve a distinguere «lo ha scelto la regola» da «lo ha
   * scritto l'operatore»: se l'operatore cambia il prezzo a mano, la regola
   * non deve più sovrascriverglielo al primo tasto della città.
   */
  const regolaMessa = useRef('')

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

  // ⚠️ A ogni cambio di negozio si rileggono i metodi di pagamento, e come
  // RIPIEGO la spedizione più usata da quel negozio: serve solo per i casi
  // fuori regola (Deluxy in una città senza tariffa). Dove una regola c'è, la
  // regola qui sopra la sovrascrive.
  useEffect(() => {
    if (!negozioId) return
    // ⚠️ I metodi si rileggono a ogni cambio di negozio, come le spedizioni:
    // sono del negozio, non dell'azienda — «Bank Deposit» ce l'ha solo Cake.
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
    fetch('/api/nuovo-ordine/spedizioni?negozio=' + encodeURIComponent(negozioId))
      .then((r) => (r.ok ? r.json() : { spedizioni: [] }))
      .then((d: { spedizioni?: { titolo: string; prezzo: number; usata: number }[] }) => {
        const s = d.spedizioni ?? []
        // ⚠️ Solo se una regola non ha già scritto: la regola vince sempre sul
        // ripiego storico. `regolaMessa` vuoto = nessuna regola ha ancora deciso.
        if (s.length && regolaMessa.current === '') {
          setSpedizioneTitolo(s[0].titolo)
          setSpedizionePrezzo(String(s[0].prezzo))
        }
      })
      .catch(() => {})
  }, [negozioId])

  // ── LA REGOLA DI CONSEGNA, per marchio e città ──
  //
  // ⚠️⚠️ Chiesto dall'utente il 28/08/2026: Flowers gratuita, Cake 10 €, Deluxy
  // a città (Milano 15 €, Roma/Firenze 25 €). Le regole stanno in
  // `src/lib/regole-consegna.ts`, in un posto solo.
  //
  // ⚠️ La regola SCRIVE nei campi spedizione, ma non calpesta l'operatore: se
  // lui ha cambiato a mano dopo che una regola aveva scritto, non gli si
  // sovrascrive al primo tasto della città (`regolaMessa`).
  const nomeNegozio = negozi.find((x) => x.id === negozioId)?.nome ?? ''
  const regola = negozioId ? regolaConsegna(nomeNegozio, citta) : null
  useEffect(() => {
    if (!regola || !regola.certa) return
    const attuale = `${spedizioneTitolo}|${spedizionePrezzo}`
    // Applica se: non è mai stata messa una regola, oppure il campo è ancora
    // quello che aveva messo l'ultima regola (cioè l'operatore non l'ha toccato).
    const manoLibera = regolaMessa.current === '' || attuale === regolaMessa.current
    if (!manoLibera) return
    setSpedizioneTitolo(regola.titolo)
    setSpedizionePrezzo(String(regola.prezzo))
    regolaMessa.current = `${regola.titolo}|${regola.prezzo}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regola?.titolo, regola?.prezzo, regola?.certa])

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
        </span>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

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
            {/* ⚠️⚠️ IL PREZZO LO DECIDE LA REGOLA (marchio/città), non la storia
                degli ordini: Flowers gratuita, Cake 10 €, Deluxy a città
                (Milano 15 €, Roma/Firenze 25 €). Vedi src/lib/regole-consegna.ts.
                Resta modificabile a mano per i casi fuori regola. */}
            <span>Spedizione</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={spedizioneTitolo}
                onChange={(e) => setSpedizioneTitolo(e.target.value)}
                placeholder={negozioId ? 'Titolo della spedizione' : 'Scegli prima il negozio'}
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
            {/* La regola che ha deciso il prezzo, o perché non ce n'è una. */}
            {regola ? (
              <span className="cella-sub" style={regola.certa ? { color: 'var(--gold, #B8963E)' } : undefined}>
                {regola.certa
                  ? `Regola applicata: ${regola.etichetta}`
                  : regola.etichetta}
              </span>
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
