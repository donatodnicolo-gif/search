'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessaggiOrdine } from './MessaggiOrdine'
import { DiarioOrdine } from './DiarioOrdine'
import { CHIUSURA, PASSI, coloreGestione, nomeGestione } from '@/lib/gestione'
import { coloreTipoCliente, nomeTipoCliente } from '@/lib/clienti-tipo'
import { fasciaRitiro, messaggioFornitore } from '@/lib/ritiro'
import { richiestaFornitore } from '@/lib/messaggio-fornitore'
import { linguaCliente, messaggioCliente, nomeLingua, oggettoCliente } from '@/lib/lingua'
import type { BozzaMail } from './ComponiMail'

// Il dettaglio di un ordine, che si apre cliccando la sua scheda.
//
// Serve a una cosa precisa: guardare il prodotto e chiedere al fornitore se è
// fattibile. Per questo la foto è grande, si scarica con un clic, e il messaggio
// («Per mercoledì 29 luglio possibile questo prodotto con ritiro 15-19?») è già
// scritto e si copia — il ritiro è la fascia di consegna meno un'ora, perché il
// valet deve avere il prodotto in mano prima di partire.

type FornitoreZona = {
  id: string
  nome: string
  categoria: string
  /**
   * «Partner» (ci lavoriamo) o «Prospect» (censito, mai usato), come lo chiama
   * il registro. ⚠️ Va scritto: a un prospect non si promettono le condizioni
   * di un partner, e chi telefona deve sapere con chi sta parlando.
   */
  stato: string
  citta: string
  indirizzo: string
  telefono: string
  email: string
  /** Se il recapito è di una persona e non dell'insegna, si dice chi. */
  recapitoDa: string
}

type Riga = {
  titolo: string
  variante: string
  sku: string
  quantita: number
  prezzo: number
  proprieta: string[]
  immagine: string
}

type OrdineDettaglio = {
  id: string
  numero: string
  negozioNome: string
  brandRicerca: string
  data: string
  totale: number
  valuta: string
  statoPagamento: string
  clienteNome: string
  telefono: string
  email: string
  indirizzo: string
  citta: string
  paese: string
  dataConsegna: string | null
  fasciaConsegna: string
  /** La consegna è stata spostata da noi: allora diverge da quella di Shopify. */
  consegnaSpostata?: boolean
  dataConsegnaOriginale?: string | null
  fasciaConsegnaOriginale?: string
  consegnaSpostataDa?: string
  statoNome: string
  statoColore: string
  note: string
  gestione: string
  clienteTipo: string
  clienteTipoDa: string
}

/**
 * La lettera che segna il biglietto. La stessa busta che compare sugli ordini in
 * elenco: se l'icona in lista e quella nel dettaglio fossero diverse, nessuno
 * capirebbe che parlano della stessa cosa.
 */
function IconaLettera() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
      style={{ verticalAlign: '-2px', marginRight: 4, color: 'var(--gold)' }}
      aria-hidden="true"
    >
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  )
}

function soldi(v: number, valuta: string): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Data **e ora** in cui l'ordine è arrivato.
 *
 * ⚠️ L'ora non è un dettaglio decorativo: su una consegna per oggi dice se
 * l'ordine è entrato stamattina o cinque minuti fa, cioè quanto tempo resta
 * davvero per trovare il fornitore. La sola data non distingue le due cose.
 *
 * ⚠️ È il momento in cui il CLIENTE ha ordinato (`data`, da Shopify), non
 * quando l'abbiamo scaricato noi: al primo scarico di un negozio entrano insieme
 * due mesi di ordini, e quell'orario direbbe solo quando è girato il sync.
 */
function dataOraBreve(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })} · ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
}

/** URL della nostra rotta di scarico: il CDN Shopify non si può scaricare diretto. */
function linkScarico(immagine: string, titolo: string): string {
  const p = new URLSearchParams({ url: immagine, nome: titolo })
  return `/api/immagine?${p.toString()}`
}

/**
 * Copia la FOTO negli appunti, così si incolla dritta in WhatsApp o in una mail
 * senza passare dal file.
 *
 * Due vincoli del browser da cui nasce tutto il giro:
 *  1. negli appunti si può mettere **solo PNG** — `ClipboardItem` con `image/jpeg`
 *     viene rifiutato da Chrome — quindi qualunque foto va ridisegnata su un
 *     canvas ed esportata in PNG;
 *  2. il canvas si "sporca" con un'immagine di un altro dominio e `toBlob` non
 *     funziona più, perciò la foto si carica passando dalla NOSTRA rotta
 *     (`/api/immagine`), che è stessa origine.
 *
 * Non tutti i browser sanno scrivere immagini negli appunti (Firefox e Safari
 * più vecchi). Il motivo del fallimento si restituisce invece di appiattirlo:
 * «il browser non sa farlo» e «la finestra non era in primo piano» si risolvono
 * in modi diversi, e un messaggio d'errore sbagliato manda a cercare la cosa
 * sbagliata.
 */
type EsitoCopia = { ok: true } | { ok: false; motivo: string }

async function copiaFoto(immagine: string, titolo: string): Promise<EsitoCopia> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return {
      ok: false,
      motivo: 'Questo browser non sa copiare immagini: usa «Scarica foto» e allegala.',
    }
  }
  try {
    const risposta = await fetch(linkScarico(immagine, titolo))
    if (!risposta.ok) return { ok: false, motivo: 'La foto non si è scaricata: riprova.' }
    const originale = await risposta.blob()

    const png = await new Promise<Blob | null>((risolvi) => {
      const img = new Image()
      const oggetto = URL.createObjectURL(originale)
      img.onload = () => {
        const tela = document.createElement('canvas')
        tela.width = img.naturalWidth
        tela.height = img.naturalHeight
        const ctx = tela.getContext('2d')
        if (!ctx) return risolvi(null)
        // Sfondo bianco: un PNG con trasparenza incollato in chat diventa nero.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, tela.width, tela.height)
        ctx.drawImage(img, 0, 0)
        tela.toBlob((b) => {
          URL.revokeObjectURL(oggetto)
          risolvi(b)
        }, 'image/png')
      }
      img.onerror = () => {
        URL.revokeObjectURL(oggetto)
        risolvi(null)
      }
      img.src = oggetto
    })

    if (!png) return { ok: false, motivo: 'Non sono riuscito a convertire la foto.' }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    return { ok: true }
  } catch (e) {
    const err = e as Error
    // `NotAllowedError` con «not focused» non è un browser che non sa copiare: è
    // la finestra che non era in primo piano. Dirlo giusto evita di far cercare
    // un permesso che non c'entra.
    if (err.name === 'NotAllowedError') {
      return {
        ok: false,
        motivo: /focus/i.test(err.message)
          ? 'La finestra non era in primo piano: clicca sulla pagina e riprova.'
          : 'Il browser ha negato l’accesso agli appunti: usa «Scarica foto».',
      }
    }
    return { ok: false, motivo: `Copia non riuscita: ${err.message}` }
  }
}

type Spedizione = {
  nome: string
  indirizzo: string
  citta: string
  cap: string
  provincia: string
  paese: string
}

export function DettaglioOrdine({
  ordineId = '',
  archivio,
  onChiudi,
  onScriviMail,
  linkShopify = '',
}: {
  /** L'ordine che abbiamo in casa. */
  ordineId?: string
  /**
   * L'ordine dell'ARCHIVIO STORICO (più vecchio dei 60 giorni scaricati): si
   * chiede a Orders per numero + gid Shopify. Se poi risulta che ce l'abbiamo
   * anche in casa, il server torna la versione locale — completa di azioni.
   */
  archivio?: { numero: string; orderId: string }
  onChiudi: () => void
  /** Apre il pop-up di posta con la bozza già scritta (niente `mailto:`). */
  onScriviMail?: (bozza: BozzaMail) => void
  /**
   * L'indirizzo della scheda dentro Shopify. Vuoto = non si può costruire
   * (manca il gid o il dominio del negozio), e allora **il bottone non si
   * mostra**: uno che porta a una pagina d'errore è peggio di uno assente.
   */
  linkShopify?: string
}) {
  const [ordine, setOrdine] = useState<OrdineDettaglio | null>(null)
  const [righe, setRighe] = useState<Riga[]>([])
  const [righeNota, setRigheNota] = useState('')
  // Il destinatario arriva da Orders insieme alle righe: qui in casa c'è solo
  // chi compra, e nei regali sono due persone diverse.
  const [spedizione, setSpedizione] = useState<Spedizione | null>(null)
  // La nota che il cliente ha lasciato all'ordine. Arriva da Orders e NON si
  // tiene in copia qui, come il destinatario: la fonte è il registro.
  const [biglietto, setBiglietto] = useState('')
  /** I partner del registro che stanno nella provincia di consegna. */
  const [zona, setZona] = useState<FornitoreZona[]>([])
  const [zonaProvincia, setZonaProvincia] = useState('')
  const [zonaNota, setZonaNota] = useState('')
  const [zonaCaricata, setZonaCaricata] = useState(false)
  /**
   * Che mestiere cercare: vuoto = lo decide il negozio (Cake → pasticcerie,
   * Flowers → fiorai).
   *
   * ⚠️ Serve perché il negozio non sempre lo dice: sugli ordini **Deluxy** —
   * che vende di tutto — non si può dedurre niente, e su un ordine di una torta
   * comparivano anche i fiorai. Meglio farlo scegliere che indovinare dal nome
   * del prodotto: «Numbers», «Millefoglie», «Bouquet» sono nomi di listino, e
   * una parola fraintesa qui manda a chiamare il fornitore sbagliato.
   */
  const [mestiere, setMestiere] = useState('')
  /** Il mestiere che il server ha davvero usato: vuoto = nessuno, cioè tutti. */
  const [zonaMestiere, setZonaMestiere] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')
  const [copiato, setCopiato] = useState('')
  // Copiare una foto passa da rete e canvas: qualche decimo di secondo in cui il
  // bottone deve dire che sta lavorando.
  const [copiando, setCopiando] = useState('')

  // I due campi dell'archivio si tengono sciolti: se la dipendenza fosse
  // l'oggetto, un genitore che lo ricrea a ogni disegno rifarebbe la chiamata
  // all'infinito.
  const archNumero = archivio?.numero ?? ''
  const archOrderId = archivio?.orderId ?? ''

  const carica = useCallback(async () => {
    try {
      const indirizzo = archNumero
        ? `/api/ordini/archivio/dettaglio?numero=${encodeURIComponent(archNumero)}&orderId=${encodeURIComponent(archOrderId)}`
        : `/api/ordini/${ordineId}/dettaglio`
      const res = await fetch(indirizzo)
      const d = (await res.json().catch(() => ({}))) as {
        ordine?: OrdineDettaglio
        righe?: Riga[]
        righeNota?: string
        spedizione?: Spedizione | null
        biglietto?: string
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Dettaglio non disponibile.')
        return
      }
      setOrdine(d.ordine ?? null)
      setRighe(d.righe ?? [])
      setRigheNota(d.righeNota ?? '')
      setSpedizione(d.spedizione ?? null)
      setBiglietto(d.biglietto ?? '')
    } catch {
      setErrore('Dettaglio non disponibile: problema di rete.')
    } finally {
      setCaricato(true)
    }
  }, [ordineId, archNumero, archOrderId])

  useEffect(() => {
    carica()
  }, [carica])

  // Esc chiude: aperto un pannello, è il gesto che tutti provano per primo.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi()
    }
    document.addEventListener('keydown', tasto)
    return () => document.removeEventListener('keydown', tasto)
  }, [onChiudi])

  const [spostaAperto, setSpostaAperto] = useState(false)
  const [spostaData, setSpostaData] = useState('')
  const [spostaFascia, setSpostaFascia] = useState('')
  const [spostando, setSpostando] = useState(false)

  /**
   * Sposta la consegna (o rimette quella di Shopify).
   *
   * ⚠️ Dopo il salvataggio si ricarica il dettaglio: la data nuova cambia anche
   * il messaggio per il fornitore e il ritiro — mostrarne una e lasciare gli
   * altri fermi vorrebbe dire mandare al fornitore l'orario vecchio.
   */
  async function spostaConsegna(ripristina = false) {
    if (!ordine?.id || spostando) return
    setSpostando(true)
    setErrore('')
    try {
      const res = await fetch(`/api/ordini/${ordine.id}/consegna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          ripristina ? { ripristina: true } : { data: spostaData, fascia: spostaFascia }
        ),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Consegna non spostata.')
        return
      }
      setSpostaAperto(false)
      await carica()
    } catch {
      setErrore('Consegna non spostata: problema di rete.')
    } finally {
      setSpostando(false)
    }
  }

  /** Segna l'ordine gestito (o lo riapre) senza chiudere il pannello. */
  async function cambiaGestione(gestione: string) {
    if (!ordine?.id) return
    setErrore('')
    // Il pallino cambia subito, poi si conferma col server.
    setOrdine((prec) => (prec ? { ...prec, gestione } : prec))
    try {
      const res = await fetch(`/api/ordini/${ordine.id}/gestione`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gestione }),
      })
      if (!res.ok) {
        setErrore('Stato non salvato.')
        await carica()
      }
    } catch {
      setErrore('Stato non salvato: problema di rete.')
      await carica()
    }
  }

  async function copia(testo: string, quale: string) {
    try {
      await navigator.clipboard.writeText(testo)
      setCopiato(quale)
      setTimeout(() => setCopiato(''), 2500)
    } catch {
      setErrore('Copia non riuscita: seleziona il testo e copialo a mano.')
    }
  }

  // L'ordine c'è ma non è nella nostra tabella: viene dall'archivio di Orders.
  // Si legge tutto — prodotti, foto, biglietto, destinatario — ma le azioni che
  // scriverebbero su una riga inesistente non si offrono. È il dato caricato a
  // dirlo, non il parametro con cui è stato aperto: l'archivio pesca anche
  // ordini recenti, che in casa ci sono e vanno aperti per intero.

  // ── I fornitori in provincia ──
  //
  // Si chiede solo quando si sa DOVE va l'ordine: la provincia arriva con la
  // spedizione, che è un secondo giro verso Orders. Prima di allora non c'è
  // niente da chiedere — e una lista «nazionale» proporrebbe fornitori a 400 km.
  useEffect(() => {
    const provincia = spedizione?.provincia || ''
    if (!provincia || !ordine) return
    let vivo = true
    ;(async () => {
      const p = new URLSearchParams({ provincia, negozio: ordine.negozioNome })
      if (mestiere) p.set('mestiere', mestiere)
      const res = await fetch('/api/fornitori-zona?' + p.toString())
      const d = (await res.json().catch(() => ({}))) as {
        fornitori?: FornitoreZona[]
        provincia?: string
        mestiere?: string
        nota?: string
        errore?: string
      }
      if (!vivo) return
      setZona(d.fornitori ?? [])
      setZonaProvincia(d.provincia ?? '')
      setZonaMestiere(d.mestiere ?? '')
      setZonaNota(d.errore || d.nota || '')
      setZonaCaricata(true)
    })().catch(() => {
      if (vivo) setZonaCaricata(true)
    })
    return () => {
      vivo = false
    }
  }, [spedizione?.provincia, ordine, mestiere])

  const soloArchivio = Boolean(ordine && !ordine.id)

  const msg = ordine ? messaggioFornitore(ordine.dataConsegna, ordine.fasciaConsegna) : null
  const ritiro = ordine ? fasciaRitiro(ordine.fasciaConsegna) : null
  const lingua = ordine ? linguaCliente(ordine.paese, ordine.telefono, ordine.email) : null
  // La bozza della mail, calcolata una volta sola: la usano sia il bottone
  // «Email» sia l'indirizzo cliccabile fra i recapiti. Prima viveva dentro
  // l'IIFE dei canali, e l'indirizzo non poteva raggiungerla.
  const bozzaMail: BozzaMail | null =
    ordine && lingua && ordine.email
      ? {
          a: ordine.email,
          oggetto: oggettoCliente(lingua.lingua, ordine.numero),
          testo: messaggioCliente(lingua.lingua, ordine.clienteNome, ordine.numero),
          clienteNome: ordine.clienteNome,
          ordineNumero: ordine.numero,
        }
      : null

  return (
    <div className="velo" onClick={onChiudi} role="presentation">
      {/* Il clic dentro il pannello non deve chiuderlo. */}
      <div
        className="pannello pannello-ordine"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Ordine ${ordine?.numero ?? ''}`}
      >
        <div className="pannello-testa">
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{ordine?.numero || 'Ordine'}</h2>
            <div className="cella-sub">
              {ordine ? `${ordine.negozioNome} · ordine ${dataOraBreve(ordine.data)}` : ''}
              {/* Perché mancano alcune azioni: detto qui, non scoperto dopo il
                  clic su un bottone che non c'è. */}
              {soloArchivio ? ' · archivio storico (sola lettura)' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* ── Apri in Shopify ──
                Una parte del lavoro non si fa da qui e non deve farsi da qui:
                rimborsi veri, modifica delle righe, rispedizione della
                conferma, pagamenti. Prima chi doveva aprire l'ordine vero
                andava su Shopify a mano, sceglieva il negozio giusto fra tre e
                cercava il numero — e `#1733` esiste su più negozi, quindi ogni
                tanto si finiva sull'ordine di un altro marchio. Qui il
                collegamento nasce dal gid, che quell'ambiguità non ce l'ha.
                ⚠️ Se il link non si può costruire il bottone NON c'è: uno che
                porta a una pagina d'errore è peggio di uno assente. */}
            {linkShopify ? (
              <a
                className="btn btn-secondario small"
                href={linkShopify}
                target="_blank"
                rel="noreferrer noopener"
                title="Apre la scheda di questo ordine nell'amministrazione di Shopify, in una scheda nuova"
              >
                Apri in Shopify ↗
              </a>
            ) : null}
            <button className="btn btn-secondario small" onClick={onChiudi}>
              Chiudi
            </button>
          </div>
        </div>

        {errore ? <div className="avviso-errore">{errore}</div> : null}
        {!caricato ? <p style={{ color: 'var(--text-secondary)' }}>Carico…</p> : null}

        {ordine ? (
          /* ⚠️ A COLONNE, non una pila.
             Nel dettaglio ci sono cinque riquadri — fornitore, messaggi del
             cliente, dati dell'ordine, destinatario, azioni — e in una colonna
             sola stanno su due schermate: si scorre, e quello che serve resta
             sopra o sotto il bordo. Affiancati si vedono insieme.
             I riquadri hanno altezze molto diverse, quindi si allineano in alto
             invece di allungarsi a vuoto per pareggiare il vicino. */
          <div className="griglia-dettaglio">
            {/* IL FORM RAPIDO: foto + messaggio da mandare al fornitore. */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Chiedi al fornitore</h3>

              {righeNota ? <div className="avviso-errore">{righeNota}</div> : null}

              {righe.length === 0 && !righeNota && caricato ? (
                <p className="descrizione">Nessun prodotto sull&apos;ordine.</p>
              ) : null}

              <div className="prodotti">
                {righe.map((r, i) => (
                  <div className="prodotto" key={`${r.sku}-${i}`}>
                    {r.immagine ? (
                      // <img> e non next/image: l'URL è del CDN Shopify e non
                      // vogliamo dichiarare domini remoti solo per una miniatura.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.immagine} alt={r.titolo} className="prodotto-foto" />
                    ) : (
                      <div className="prodotto-foto vuota">nessuna foto</div>
                    )}
                    <div className="prodotto-dati">
                      <div className="cella-nome">{r.titolo || '—'}</div>
                      <div className="cella-sub">
                        {r.quantita > 1 ? `${r.quantita} × ` : ''}
                        {soldi(r.prezzo, ordine.valuta)}
                        {r.variante ? ` · ${r.variante}` : ''}
                      </div>
                      {/* Le personalizzazioni del cliente: chi prepara le deve vedere. */}
                      {r.proprieta.length ? (
                        <ul className="prodotto-prop">
                          {r.proprieta.map((p, k) => (
                            <li key={k}>{p}</li>
                          ))}
                        </ul>
                      ) : null}
                      {r.immagine ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-secondario small"
                            onClick={async () => {
                              setErrore('')
                              setCopiando(`foto-${i}`)
                              const esito = await copiaFoto(r.immagine, r.titolo)
                              setCopiando('')
                              if (esito.ok) {
                                setCopiato(`foto-${i}`)
                                setTimeout(() => setCopiato(''), 2500)
                              } else {
                                setErrore(esito.motivo)
                              }
                            }}
                            disabled={copiando === `foto-${i}`}
                            title="Copia la foto negli appunti: si incolla in WhatsApp o in una mail"
                          >
                            {copiando === `foto-${i}`
                              ? 'Copio…'
                              : copiato === `foto-${i}`
                                ? 'Copiata ✓'
                                : 'Copia foto'}
                          </button>
                          <a className="btn btn-secondario small" href={linkScarico(r.immagine, r.titolo)}>
                            Scarica foto
                          </a>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Il biglietto: la NOTA dell'ordine ──
                *
                * ⚠️ LA FONTE È LA NOTA, non l'attributo «biglietto». Misurato su
                * 800 ordini del registro: la nota ha testo su 680 (85%),
                * l'attributo su 71 — e dei 70 con entrambi, 67 sono lo stesso
                * testo. Leggendo solo l'attributo, nove ordini su dieci
                * risultavano «senza biglietto» pur avendolo scritto: era il caso
                * dell'ordine #12663, dove la nota diceva «They say the best
                * trips… Bien à toi, Arthur» e la sezione non compariva.
                *
                * SI MOSTRA INTERA E NON SI INTERPRETA. Sembrerebbe comodo
                * estrarne «il messaggio del biglietto» e offrire quello, ma su
                * ordini veri questo campo contiene il messaggio INSIEME a
                * indirizzo del destinatario, due numeri di telefono, il budget
                * e le specifiche della torta — e in un caso un «30 Luglio
                * 08/12», dove 08/12 è la fascia oraria e non l'8 dicembre.
                * Qualunque taglio automatico o stampa un telefono sul biglietto
                * o butta via metà del messaggio. Legge una persona, che vede
                * tutto e copia il pezzo giusto.
                */}
              {/* ⚠️ LA SEZIONE C'È SEMPRE, anche quando il biglietto non c'è.
                *
                * Prima spariva quando il campo era vuoto, e nascondere una
                * sezione è ambiguo: chi apre un ordine senza biglietto non
                * capisce se non c'è, se l'app non l'ha caricato o se va cercato
                * altrove. Scritto «non indicato» la domanda non nasce. */}
              <div style={{ marginTop: 14 }}>
                {biglietto.trim() ? (
                  <>
                    <label className="campo" style={{ marginBottom: 6 }}>
                      <span>
                        <IconaLettera /> Biglietto e note del cliente
                      </span>
                      <textarea
                        rows={Math.min(12, Math.max(4, biglietto.split('\n').length + 1))}
                        readOnly
                        value={biglietto}
                        style={{ fontFamily: 'inherit', lineHeight: 1.55 }}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </label>
                    <div
                      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <button className="btn" onClick={() => copia(biglietto, 'biglietto')}>
                        {copiato === 'biglietto' ? 'Copiato ✓' : 'Copia biglietto'}
                      </button>
                    </div>
                    <p className="descrizione" style={{ marginTop: 6, marginBottom: 0 }}>
                      Sono le <strong>note dell&apos;ordine</strong>, così come le ha scritte il
                      cliente. Di solito è il messaggio del biglietto, ma a volte contiene anche
                      indirizzi, numeri di telefono e istruzioni per il fornitore:{' '}
                      <strong>rileggile prima di copiarle</strong> — sul cartoncino va solo la
                      parte del messaggio.
                    </p>
                  </>
                ) : (
                  <div className="campo" style={{ marginBottom: 0 }}>
                    <span>
                      <IconaLettera /> Biglietto e note del cliente
                    </span>
                    <p className="descrizione" style={{ margin: 0 }}>
                      {caricato
                        ? 'Nessun biglietto: su questo ordine il cliente non ha scritto note.'
                        : 'Carico…'}
                    </p>
                  </div>
                )}
              </div>

              {/* Il messaggio pronto. */}
              <label className="campo" style={{ marginTop: 14 }}>
                <span>Messaggio per il fornitore</span>
                <textarea rows={2} readOnly value={msg?.testo ?? ''} />
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => copia(msg?.testo ?? '', 'msg')}>
                  {copiato === 'msg' ? 'Copiato ✓' : 'Copia messaggio'}
                </button>
                {ordine.brandRicerca ? (
                  <a
                    className="btn btn-secondario"
                    href={`https://search-deluxy.vercel.app/?brand=${encodeURIComponent(ordine.brandRicerca)}&ordine=${encodeURIComponent(ordine.numero.replace(/^#/, ''))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Cerca fornitore ↗
                  </a>
                ) : null}
              </div>
              <p className="descrizione" style={{ marginBottom: 0 }}>
                {ritiro ? (
                  <>
                    Il ritiro è <strong>{ritiro}</strong>, un&apos;ora prima della consegna (
                    {ordine.fasciaConsegna}): il valet deve avere il prodotto prima di partire.
                  </>
                ) : msg?.mancante === 'fascia' || msg?.mancante === 'entrambe' ? (
                  <>
                    Non c&apos;è una fascia di consegna in forma <em>ore-ore</em>, quindi il ritiro
                    resta <strong>da concordare</strong>: meglio che un orario inventato.
                  </>
                ) : null}
                {msg?.mancante === 'data' || msg?.mancante === 'entrambe' ? (
                  <>
                    {' '}
                    Manca anche la <strong>data di consegna</strong>: completala prima di mandarlo.
                  </>
                ) : null}
              </p>
            </div>

            {/* Cosa si sono detti: mail e chat collegate a questo ordine, con la
                risposta a portata di mano. Uscire, cercare la conversazione in
                Inbox e tornare indietro è il modo migliore per non rispondere. */}
            {ordine.id ? <MessaggiOrdine ordineId={ordine.id} /> : null}

            {/* I dati dell'ordine. */}
            <div className="card">
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Ordine</h3>
              <dl className="coppie">
                <dt>Mittente (chi ordina)</dt>
                <dd>
                  {ordine.clienteNome || '—'}
                  {ordine.clienteTipo ? (
                    <span
                      className="badge"
                      style={{ color: coloreTipoCliente(ordine.clienteTipo), marginLeft: 8 }}
                    >
                      {nomeTipoCliente(ordine.clienteTipo)}
                    </span>
                  ) : null}
                </dd>
                <dt>Recapiti del mittente</dt>
                <dd>
                  {ordine.telefono ? <a href={`tel:${ordine.telefono}`}>{ordine.telefono}</a> : '—'}
                  {/* L'indirizzo email SI TOCCA e apre il modulo di posta.
                      Prima era testo e basta: su un telefono è la cosa più
                      naturale su cui premere — è scritto lì, sembra un link — e
                      non succedeva niente. Chi lo prova conclude che la mail
                      non funziona, non che ha premuto il posto sbagliato. */}
                  {ordine.email ? (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="come-link"
                        onClick={() => bozzaMail && onScriviMail?.(bozzaMail)}
                        disabled={!onScriviMail || !bozzaMail}
                        title="Scrivi una mail a questo indirizzo: si apre il modulo, non parte da sola."
                      >
                        {ordine.email}
                      </button>
                    </>
                  ) : null}
                  {lingua ? (
                    <div className="cella-sub">
                      gli si scrive in <strong>{nomeLingua(lingua.lingua)}</strong>
                    </div>
                  ) : null}
                </dd>
                <dt>Consegna</dt>
                <dd>
                  {ordine.dataConsegna
                    ? new Date(ordine.dataConsegna).toLocaleDateString('it-IT', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })
                    : 'non indicata'}
                  {ordine.fasciaConsegna ? ` · ${ordine.fasciaConsegna}` : ''}
                  {/* ── Spostare la consegna ──
                      Il cliente chiama e chiede un altro giorno: prima si
                      andava su Shopify, si cambiava là e si aspettava il
                      reimport — e intanto qui l'ordine restava in cima al
                      lavoro di oggi. ⚠️ Solo sugli ordini che abbiamo in casa:
                      su uno dell'archivio non c'è una riga da aggiornare. */}
                  {soloArchivio ? null : (
                    <>
                      {' '}
                      <button
                        className="bottone secondario mini"
                        onClick={() => {
                          setSpostaData(
                            ordine.dataConsegna
                              ? new Date(ordine.dataConsegna).toISOString().slice(0, 10)
                              : ''
                          )
                          setSpostaFascia(ordine.fasciaConsegna || '')
                          setSpostaAperto(!spostaAperto)
                        }}
                        title="Sposta il giorno o la fascia di consegna"
                      >
                        {spostaAperto ? 'Chiudi' : 'Sposta'}
                      </button>
                    </>
                  )}
                  {/* ⚠️ La divergenza si DICE: finché Shopify non è allineato,
                      chi guarda deve capire in due secondi che le due date non
                      coincidono — è l'unico modo perché qualcuno vada a
                      sistemarla anche alla fonte. */}
                  {ordine.consegnaSpostata ? (
                    <div className="cella-sub" style={{ marginTop: 4 }}>
                      Spostata{ordine.consegnaSpostataDa ? ` da ${ordine.consegnaSpostataDa}` : ''}
                      {ordine.dataConsegnaOriginale
                        ? ` · su Shopify resta ${new Date(
                            ordine.dataConsegnaOriginale
                          ).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}${
                            ordine.fasciaConsegnaOriginale
                              ? ' · ' + ordine.fasciaConsegnaOriginale
                              : ''
                          }`
                        : ''}
                    </div>
                  ) : null}
                  {spostaAperto ? (
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        marginTop: 6,
                      }}
                    >
                      <input
                        type="date"
                        value={spostaData}
                        onChange={(e) => setSpostaData(e.target.value)}
                        aria-label="Giorno di consegna"
                      />
                      <input
                        type="text"
                        value={spostaFascia}
                        onChange={(e) => setSpostaFascia(e.target.value)}
                        placeholder="16-20"
                        style={{ width: 90 }}
                        aria-label="Fascia oraria"
                      />
                      <button className="bottone mini" onClick={() => spostaConsegna()}>
                        {spostando ? 'Salvo…' : 'Salva'}
                      </button>
                      {ordine.consegnaSpostata ? (
                        <button
                          className="bottone secondario mini"
                          onClick={() => spostaConsegna(true)}
                          title="Torna alla data che dice Shopify"
                        >
                          Rimetti quella di Shopify
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </dd>
                {/* Mittente e destinatario sono due persone diverse quasi
                    sempre: in un regalo chi paga non è chi riceve. Tenerli
                    separati evita l'errore che si paga di più — scrivere o
                    telefonare alla persona sbagliata. */}
                <dt>Destinatario (chi riceve)</dt>
                <dd>
                  {spedizione?.nome ? (
                    <>
                      <strong>{spedizione.nome}</strong>
                      {spedizione.nome.trim().toLowerCase() === ordine.clienteNome.trim().toLowerCase() ? (
                        <div className="cella-sub">è la stessa persona che ordina</div>
                      ) : null}
                    </>
                  ) : (
                    <span className="cella-sub">
                      {righeNota ? `non disponibile — ${righeNota}` : 'non indicato'}
                    </span>
                  )}
                </dd>
                <dt>Indirizzo di consegna</dt>
                <dd>
                  {spedizione
                    ? [
                        spedizione.indirizzo,
                        [spedizione.cap, spedizione.citta, spedizione.provincia].filter(Boolean).join(' '),
                        spedizione.paese,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'
                    : [ordine.indirizzo, ordine.citta, ordine.paese].filter(Boolean).join(', ') || '—'}
                  {!spedizione && (ordine.indirizzo || ordine.citta) ? (
                    <div className="cella-sub">indirizzo in copia locale, senza CAP e provincia</div>
                  ) : null}
                </dd>
                <dt>Totale</dt>
                <dd>
                  {soldi(ordine.totale, ordine.valuta)}
                  {ordine.statoPagamento ? (
                    <span className="cella-sub"> · {ordine.statoPagamento}</span>
                  ) : null}
                </dd>
                <dt>Lavorazione</dt>
                <dd>
                  {/* Lo stato di lavorazione è NOSTRO e vale sugli ordini che
                      lavoriamo: su uno dell'archivio non esiste, e mostrargli
                      «Da gestire» lo metterebbe in coda dopo mesi. */}
                  {soloArchivio ? (
                    <span className="cella-sub">
                      Ordine dell&apos;archivio: qui non si lavora.
                    </span>
                  ) : (
                    <>
                      {/* ── I passi, cliccabili anche da qui ──
                          Il pannello è dove si LAVORA l'ordine: si guarda la
                          foto, si copia il messaggio, si cerca il fornitore. È
                          lì che ci si accorge di essere passati al punto dopo,
                          e chiudere il pannello per cambiare stato sulla scheda
                          è un giro che non fa nessuno — lo stato resta indietro
                          e la bacheca smette di dire il vero.
                          ⚠️ Lo stato in corso è pieno: la fila dice **dove
                          siamo**, non «cosa posso fare». */}
                      <span className="passi-ordine">
                        {PASSI.map((k) => (
                          <button
                            key={k}
                            className={
                              ordine.gestione === k ? 'bottone mini' : 'bottone secondario mini'
                            }
                            onClick={() => cambiaGestione(k)}
                            title={`Segna che l'ordine è a questo punto: ${nomeGestione(k)}`}
                          >
                            {nomeGestione(k)}
                          </button>
                        ))}
                        {/* La chiusura sta accanto ai passi ma non è uno di
                            loro: dice che abbiamo finito, non dove siamo. */}
                        <span className="passi-chiusura">
                          <button
                            className={
                              ordine.gestione === CHIUSURA
                                ? 'bottone mini verde'
                                : 'bottone secondario mini'
                            }
                            onClick={() =>
                              cambiaGestione(ordine.gestione === CHIUSURA ? 'da_gestire' : CHIUSURA)
                            }
                            title={
                              ordine.gestione === CHIUSURA
                                ? 'Riapri: rimette l ordine fra quelli da lavorare'
                                : 'Segna come gestito: l ordine esce dalla lista di lavoro'
                            }
                          >
                            {ordine.gestione === CHIUSURA ? 'Gestito ✓ — riapri' : 'Gestito ✓'}
                          </button>
                        </span>
                      </span>
                      {/* Gli stati che non sono passi — «Comunicazione con
                          cliente», scritto dall'app quando scrivi al cliente, e
                          «Gestito» — restano visibili come bollino: altrimenti
                          un ordine in quello stato sembrerebbe non averne
                          nessuno. */}
                      {PASSI.includes(ordine.gestione as (typeof PASSI)[number]) ? null : (
                        <span
                          className="badge"
                          style={{ color: coloreGestione(ordine.gestione), marginLeft: 6 }}
                        >
                          {nomeGestione(ordine.gestione)}
                        </span>
                      )}
                    </>
                  )}
                  {ordine.statoNome ? (
                    <span className="badge" style={{ marginLeft: 6 }}>
                      {ordine.statoNome}
                    </span>
                  ) : null}
                </dd>
                {ordine.note ? (
                  <>
                    <dt>Note</dt>
                    <dd style={{ whiteSpace: 'pre-wrap' }}>{ordine.note}</dd>
                  </>
                ) : null}
              </dl>

              {/* TUTTE le azioni dell'ordine stanno qui. Sulla scheda ne sono
                  rimaste due (Contatta e Gestito): le altre occupavano 97px per
                  scheda su 237, e con la scheda cliccabile questo è il posto
                  giusto — ma devono esserci TUTTE, altrimenti spostarle è
                  togliere funzioni. */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <a
                  className="btn btn-secondario small"
                  href={`/pagamenti?ordine=${encodeURIComponent(ordine.numero)}&cliente=${encodeURIComponent(ordine.clienteNome)}&importo=${ordine.totale || ''}`}
                >
                  Paga fornitore
                </a>
                {/* La scheda del cliente: conversazioni, storico e reclami in un
                    posto solo. La chiave e email o telefono, mai il nome. */}
                <a
                  className="btn btn-secondario small"
                  href={`/clienti/scheda?email=${encodeURIComponent(ordine.email)}&telefono=${encodeURIComponent(ordine.telefono)}&paese=${encodeURIComponent(ordine.paese)}`}
                >
                  Scheda cliente
                </a>
                <a className="btn btn-secondario small" href={`/reclami?ordineId=${ordine.id}&ordine=${encodeURIComponent(ordine.numero)}&cliente=${encodeURIComponent(ordine.clienteNome)}&telefono=${encodeURIComponent(ordine.telefono)}&email=${encodeURIComponent(ordine.email)}&negozio=${encodeURIComponent(ordine.negozioNome)}`}>
                  Apri reclamo
                </a>
                <a className="btn btn-secondario small" href={`/rimborsi?ordineId=${ordine.id}&ordine=${encodeURIComponent(ordine.numero)}&cliente=${encodeURIComponent(ordine.clienteNome)}&totale=${ordine.totale}&pagamento=${encodeURIComponent(ordine.statoPagamento)}&negozio=${encodeURIComponent(ordine.negozioNome)}`}>
                  Chiedi rimborso
                </a>
                {/* Un bottone per ogni canale che questo cliente ha davvero.
                    Sceglie chi sta lavorando l'ordine: a chi ha appena scritto
                    una mail si risponde per mail, un ritardo grave si dice al
                    telefono. Il messaggio è già nella sua lingua e non parte da
                    solo; la telefonata, ovviamente, non porta nessun testo. */}
                {lingua
                  ? (() => {
                      const testo = messaggioCliente(lingua.lingua, ordine.clienteNome, ordine.numero)
                      const cifre = ordine.telefono.replace(/[^\d]/g, '')
                      const numero = ordine.telefono.replace(/[^\d+]/g, '')
                      const canali: {
                        chiave: string
                        nome: string
                        titolo: string
                        url?: string
                        mail?: BozzaMail
                      }[] = []
                      if (cifre.length >= 8) {
                        canali.push({
                          chiave: 'whatsapp',
                          nome: 'WhatsApp',
                          url: `https://wa.me/${cifre}?text=${encodeURIComponent(testo)}`,
                          titolo: `Scrivi su WhatsApp, in ${nomeLingua(lingua.lingua)}. Il messaggio non parte da solo.`,
                        })
                      }
                      if (cifre.length >= 6) {
                        canali.push({
                          chiave: 'telefono',
                          nome: 'Chiama',
                          url: `tel:${numero}`,
                          titolo: `Chiama il cliente. Parla in ${nomeLingua(lingua.lingua)}.`,
                        })
                      }
                      if (ordine.email) {
                        // Niente `mailto:`: il pop-up manda dalla casella
                        // aziendale e la mail resta registrata in Inbox.
                        canali.push({
                          chiave: 'email',
                          nome: 'Email',
                          titolo: `Scrivi una mail in ${nomeLingua(lingua.lingua)}: si apre il modulo, non parte da sola.`,
                          mail: {
                            a: ordine.email,
                            oggetto: oggettoCliente(lingua.lingua, ordine.numero),
                            testo,
                            clienteNome: ordine.clienteNome,
                            ordineNumero: ordine.numero,
                          },
                        })
                      }
                      return canali.map((c) =>
                        c.mail ? (
                          <button
                            key={c.chiave}
                            className="btn btn-secondario small"
                            onClick={() => onScriviMail?.(c.mail!)}
                            title={c.titolo}
                            disabled={!onScriviMail}
                          >
                            {c.nome}
                          </button>
                        ) : (
                          <a
                            key={c.chiave}
                            className="btn btn-secondario small"
                            href={c.url}
                            target={c.chiave === 'telefono' ? undefined : '_blank'}
                            rel="noopener noreferrer"
                            title={c.titolo}
                          >
                            {c.nome}
                          </a>
                        )
                      )
                    })()
                  : null}
              {/* ── IL DIARIO DI QUESTO ORDINE ──
                  ⚠️ È il motivo per cui il diario esiste: prima queste righe
                  stavano in una chat interna e chi apriva l'ordine non
                  sapeva che ci fosse scritto «pagamento su cs, concordato
                  cambio fiori con mittente». Qui si leggono dove si lavora.
                  ⚠️ Solo sugli ordini che abbiamo in casa: su uno
                  dell'archivio la riga si scriverebbe e non si ritroverebbe
                  più. */}
              {soloArchivio ? null : <DiarioOrdine numero={ordine.numero} />}
              </div>
            </div>

            {/* ── FORNITORI IN ZONA: un riquadro suo ──
                Stava incastrato in fondo alla prima colonna, sotto il
                messaggio: una lista di nomi con tre bottoni ciascuno, letta in
                una striscia stretta, è un elenco che non si guarda. Qui prende
                tutta la larghezza sotto le altre tre.
                ⚠️ Ricerca fornitori cerca su Google chi non conosciamo; questi
                sono i partner e i prospect già censiti in Anagrafiche, che
                prima non venivano mai proposti. */}
            {spedizione?.provincia ? (
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>
                  Fornitori in provincia di {zonaProvincia || spedizione.provincia}
                </h3>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginBottom: 10,
                  }}
                >
                  <span className="cella-sub">
                    Dal registro Anagrafiche — partner e prospect, prima quelli con cui
                    lavoriamo già.
                  </span>
                  {/* ⚠️ Il mestiere si sceglie perché il negozio non sempre lo
                      dice: su un ordine Deluxy comparivano pasticcerie e fiorai
                      insieme, e su una torta i fiorai non servono a niente. */}
                  <select
                    className="bottone secondario mini"
                    value={mestiere}
                    onChange={(e) => {
                      setZonaCaricata(false)
                      setMestiere(e.target.value)
                    }}
                    aria-label="Che fornitori cercare"
                  >
                    <option value="">
                      {zonaMestiere === 'pasticceria'
                        ? 'Dal negozio: pasticcerie'
                        : zonaMestiere === 'fioraio'
                          ? 'Dal negozio: fiorai'
                          : 'Dal negozio: tutti'}
                    </option>
                    <option value="pasticceria">Solo pasticcerie</option>
                    <option value="fioraio">Solo fiorai</option>
                  </select>
                </div>
                {!zonaCaricata ? (
                  <p className="descrizione">Cerco…</p>
                ) : zona.length === 0 ? (
                  <p className="descrizione">
                    {zonaNota ||
                      `Nessun fornitore censito in provincia di ${zonaProvincia || spedizione.provincia}. Usa «Cerca fornitore» per trovarne di nuovi.`}
                  </p>
                ) : (
                  <div className="griglia-fornitori">
                    {zona.map((fz) => {
                      const richiesta = richiestaFornitore({
                        prodotto: righe[0]?.titolo ?? '',
                        variante: righe[0]?.variante ?? '',
                        quantita: righe[0]?.quantita ?? 1,
                        dataConsegna: ordine.dataConsegna,
                        fascia: ordine.fasciaConsegna,
                        indirizzo: [spedizione.indirizzo, spedizione.cap, spedizione.citta]
                          .filter(Boolean)
                          .join(' '),
                      })
                      const cifre = (fz.telefono || '').replace(/[^\d]/g, '')
                      return (
                        <div key={fz.id} className="card" style={{ padding: 10 }}>
                          <div className="cella-nome">{fz.nome}</div>
                          <div className="cella-sub">
                            {[fz.categoria, fz.citta, fz.stato].filter(Boolean).join(' · ')}
                            {fz.recapitoDa ? ` · recapito di ${fz.recapitoDa}` : ''}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            {cifre.length >= 8 ? (
                              <a
                                className="btn btn-secondario small"
                                href={`https://wa.me/${cifre}?text=${encodeURIComponent(richiesta)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                WhatsApp
                              </a>
                            ) : null}
                            {fz.email && onScriviMail ? (
                              <button
                                className="btn btn-secondario small"
                                onClick={() =>
                                  onScriviMail({
                                    a: fz.email,
                                    oggetto: `Richiesta disponibilità — ordine ${ordine.numero}`,
                                    testo: richiesta,
                                    clienteNome: fz.nome,
                                    ordineNumero: ordine.numero,
                                    // La foto del prodotto viaggia con la
                                    // richiesta: è quello che il fornitore deve
                                    // guardare per dire sì o no.
                                    allegatoUrl: righe[0]?.immagine ?? '',
                                    allegatoNome: righe[0]?.titolo ?? '',
                                  })
                                }
                              >
                                Email
                              </button>
                            ) : null}
                            <button
                              className="btn btn-secondario small"
                              onClick={() => copia(richiesta, `zona-${fz.id}`)}
                            >
                              {copiato === `zona-${fz.id}` ? 'Copiato ✓' : 'Copia richiesta'}
                            </button>
                            {!cifre.length && !fz.email ? (
                              <span className="cella-sub">nessun recapito nel registro</span>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
