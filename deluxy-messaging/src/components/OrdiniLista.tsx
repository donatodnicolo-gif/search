'use client'

import { useCallback, useEffect, useState } from 'react'
import { GESTIONI, coloreGestione, nomeGestione } from '@/lib/gestione'
import {
  TIPI_CLIENTE,
  coloreTipoCliente,
  nomeTipoCliente,
  origineTipoCliente,
} from '@/lib/clienti-tipo'
import { linguaCliente, messaggioCliente, nomeLingua, oggettoCliente } from '@/lib/lingua'
import { profiloCliente, inizioSessione, arrivatoAdesso } from '@/lib/cliente-valore'
import { DettaglioOrdine } from './DettaglioOrdine'
import { ComponiMail, type BozzaMail } from './ComponiMail'

type OrdineDto = {
  id: string
  negozioId: string
  negozioNome: string
  numero: string
  data: string
  totale: number
  valuta: string
  statoPagamento: string
  clienteNome: string
  telefono: string
  email: string
  indirizzo: string
  citta: string
  contattoSalvato: boolean
  contattoEsito: string
  gestione: string
  // Chi ha cambiato lo stato l'ultima volta, e quando. Vuoto sugli ordini
  // segnati prima di questa modifica: si parte da adesso, non si indovina.
  gestioneDaNome: string
  gestioneIl: string | null
  clienteTipo: string
  clienteTipoDa: string
  // Che numero ha questo ordine per quel cliente (1 = il suo primo), contato da
  // Orders sulla storia completa. `null` = non lo sappiamo, che NON vuol dire
  // «primo». Vedi src/lib/cliente-valore.ts.
  clienteNumeroOrdine: number | null
  // Quando l'ordine è comparso DA NOI — non quando è stato fatto: regge
  // l'etichetta NUOVO di chi arriva mentre stai lavorando.
  creatoIl: string
  // C'è una nota del cliente (dentro c'è il biglietto)? Solo il sì/no: il
  // testo lo mostra il dettaglio, chiedendolo a Orders.
  haBiglietto: boolean
  // Paese di spedizione (ISO 2 lettere): decide in che lingua gli si scrive.
  paese: string
  // Quando e in che fascia oraria il cliente vuole la consegna. Arrivano da
  // Orders (attributi Shopify): 618 ordini su 922 hanno la data, gli altri no —
  // e "non indicata" è una risposta, inventarla no.
  dataConsegna: string | null
  fasciaConsegna: string
}

/**
 * La fascia oraria scritta in modo che non si possa scambiare per una data.
 *
 * ⚠️ Da Orders arriva come "08-12", cioè **dalle 8 alle 12**. Senza contesto è
 * identica a un 8 dicembre, ed è un equivoco già capitato: qui si antepone
 * sempre «ore», e si tolgono gli zeri davanti. Una fascia di forma diversa da
 * HH-HH si mostra **così com'è**, senza tentare di interpretarla.
 */
function fasciaLeggibile(f: string): string {
  const t = (f || '').trim()
  if (!t) return ''
  const m = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/.exec(t)
  if (!m) return t
  return `ore ${Number(m[1])}–${Number(m[2])}`
}

/** Mezzanotte di oggi: le date di consegna arrivano senza orario. */
function inizioGiorno(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

type Consegna = { testo: string; colore?: string; grassetto?: boolean }

/**
 * Quando va consegnato, in parole: «oggi», «domani», «mar 11 dic», e la fascia.
 * I giorni passati si segnalano, perché un ordine da gestire con la consegna di
 * ieri è la cosa più urgente che ci sia in questa schermata.
 */
function consegnaLeggibile(iso: string | null, fascia: string): Consegna {
  const f = fasciaLeggibile(fascia)
  if (!iso) {
    // Nessuna data: se almeno la fascia c'è, si dice quella e basta.
    return f
      ? { testo: `consegna ${f}, giorno non indicato`, colore: 'var(--text-tertiary)' }
      : { testo: 'consegna non indicata', colore: 'var(--text-tertiary)' }
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { testo: 'consegna non indicata', colore: 'var(--text-tertiary)' }

  const giorni = Math.round((inizioGiorno(d) - inizioGiorno(new Date())) / 86400000)
  const coda = f ? ` · ${f}` : ''
  if (giorni === 0) return { testo: `consegna OGGI${coda}`, colore: '#c93400', grassetto: true }
  if (giorni === 1) return { testo: `consegna domani${coda}`, colore: '#b8963e', grassetto: true }
  if (giorni < 0) {
    const quanti = -giorni
    return {
      testo: `consegna scaduta da ${quanti} ${quanti === 1 ? 'giorno' : 'giorni'}${coda}`,
      colore: '#d70015',
      grassetto: true,
    }
  }
  const data = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
  return { testo: `consegna ${data}${coda}` }
}

/** Il bollino "da che tipo di cliente arriva l'ordine". */
function TipoCliente({ tipo, da }: { tipo: string; da: string }) {
  if (!tipo) return null
  const origine = origineTipoCliente(da)
  return (
    <span
      className="badge"
      style={{ color: coloreTipoCliente(tipo) }}
      title={
        `Tipo di cliente: ${nomeTipoCliente(tipo)}` +
        (origine ? ` — ${origine}` : '') +
        '. Si decide nell’app Ordini.'
      }
    >
      {nomeTipoCliente(tipo)}
    </span>
  )
}

/**
 * Che cliente è: nuovo, di ritorno, affezionato.
 *
 * Non si mostra niente quando non lo sappiamo. Scrivere «nuovo cliente» perché
 * il dato manca è lo stesso errore del voto dato a chi non ha dati: sembra
 * un'informazione, è un'assenza, e ci si costruisce sopra il tono della
 * risposta.
 */
function ProfiloCliente({ numeroOrdine }: { numeroOrdine: number | null }) {
  const p = profiloCliente(numeroOrdine)
  if (!p.etichetta) return null
  return (
    <span
      className="badge"
      style={p.tono === 'oro' ? { color: 'var(--gold)', borderColor: 'var(--gold)' } : undefined}
      title={p.spiega + ' Conteggio dal registro Ordini, su tutta la storia del cliente.'}
    >
      {p.etichetta}
    </span>
  )
}

/**
 * C'è un biglietto (o comunque una nota) del cliente su questo ordine.
 *
 * Un simbolo e non una parola: sulla scheda i bollini sono già cinque, e questa
 * è un'informazione binaria che si legge meglio con un'icona. Il titolo dice
 * cosa fa, perché un'icona senza spiegazione è un indovinello.
 */
function SegnoBiglietto() {
  return (
    <span
      className="segno-biglietto"
      title="Il cliente ha lasciato un biglietto o delle note: aprilo per leggerle"
      aria-label="Con biglietto"
      role="img"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      >
        <rect x="3" y="5.5" width="18" height="13" rx="2" />
        <path d="m3.5 7 8.5 6 8.5-6" />
      </svg>
    </span>
  )
}

/**
 * Consegna con la fascia oraria ma senza il giorno.
 *
 * ⚠️ È un PROBLEMA, non un dato mancante qualsiasi: qualcuno aspetta la consegna
 * fra le 12 e le 16 e noi non sappiamo di che giorno. Spesso è oggi. Il giorno
 * non si deduce — né dal tag «Oggi» di Shopify né dalla data dell'ordine — e
 * l'unica cosa onesta è metterlo davanti agli occhi di una persona.
 */
function haProblemaConsegna(o: OrdineDto): boolean {
  return !o.dataConsegna && Boolean(o.fasciaConsegna?.trim())
}

function BollinoProblema() {
  return (
    <span
      className="badge badge-problema"
      title="C’è la fascia oraria ma non il giorno: su Shopify manca la data di consegna. Va chiesto al cliente — non si indovina."
    >
      PROBLEMA
    </span>
  )
}

/** L'ordine è arrivato mentre eri qui: non deve passare inosservato. */
function BollinoNuovo() {
  return (
    <span
      className="badge badge-nuovo"
      title="Questo ordine è comparso dopo che hai aperto l’app. Sparisce alla prossima sessione."
    >
      NUOVO
    </span>
  )
}

/**
 * TUTTI i modi per raggiungere questo cliente, non solo il primo.
 *
 * Il messaggio è già scritto NELLA LINGUA DEL CLIENTE (dal prefisso del suo
 * telefono, dal dominio della sua email, o dal paese di spedizione): scrivere
 * in italiano a un cliente di Londra è il dettaglio che fa sembrare
 * improvvisato tutto il resto. Il testo è solo l'apertura e non parte da solo —
 * l'operatore lo rilegge nella finestra di WhatsApp o della mail.
 */
//
// Prima c'era un bottone solo, «Contatta», che sceglieva da sé: WhatsApp se
// c'era un numero, l'email altrimenti. Ma non è una gerarchia vera — a un
// cliente che ha appena scritto una mail si risponde per mail, un ritardo
// grave si dice al telefono, e chi decide è chi ha in mano la situazione, non
// il codice. Quindi si mostrano i canali che esistono davvero e si sceglie.
//
// Fuori restano solo quelli impossibili: niente numero, niente WhatsApp e
// niente telefonata; niente email, niente mail.
type CanaleContatto = {
  chiave: string
  nome: string
  lingua: string
  linguaDa: string
  /** WhatsApp e telefono: un link da aprire. */
  url?: string
  /** Email: la bozza che riempie il pop-up di posta (niente `mailto:`). */
  mail?: BozzaMail
}

function canaliContatto(o: OrdineDto): CanaleContatto[] {
  const { lingua, da } = linguaCliente(o.paese, o.telefono, o.email)
  const testo = messaggioCliente(lingua, o.clienteNome, o.numero)
  const comune = { lingua, linguaDa: da }
  const canali: CanaleContatto[] = []

  const cifre = o.telefono.replace(/[^\d]/g, '')
  if (cifre.length >= 8) {
    canali.push({
      ...comune,
      chiave: 'whatsapp',
      nome: 'WhatsApp',
      url: `https://wa.me/${cifre}?text=${encodeURIComponent(testo)}`,
    })
  }
  // La telefonata vuole il numero così com'è scritto (il + conta), e non porta
  // nessun testo: il messaggio pronto lì non serve, parli tu.
  const numero = o.telefono.replace(/[^\d+]/g, '')
  if (numero.replace(/\D/g, '').length >= 6) {
    canali.push({ ...comune, chiave: 'telefono', nome: 'Chiama', url: `tel:${numero}` })
  }
  if (o.email) {
    // NIENTE `mailto:`: apriva il programma di posta del computer — dove c'è — e
    // la mail partiva da un indirizzo personale, fuori da quest'app e senza
    // lasciare traccia. Qui il bottone apre un pop-up e la mail esce dalla
    // casella aziendale via SMTP, restando registrata in Inbox.
    canali.push({
      ...comune,
      chiave: 'email',
      nome: 'Email',
      mail: {
        a: o.email,
        oggetto: oggettoCliente(lingua, o.numero),
        testo,
        clienteNome: o.clienteNome,
        ordineNumero: o.numero,
      },
    })
  }
  return canali
}

/** «Scrivi al cliente su WhatsApp, in francese (dal paese)». */
function spiegaContatto(c: { chiave: string; nome: string; lingua: string; linguaDa: string }): string {
  const perche =
    c.linguaDa === 'telefono'
      ? 'dal suo prefisso telefonico'
      : c.linguaDa === 'email'
        ? 'dal dominio della sua email'
        : c.linguaDa === 'paese'
          ? 'dal paese di spedizione — attenzione: è il destinatario, non lui'
          : c.linguaDa === 'estero-ignoto'
            ? 'recapito estero che non sappiamo tradurre: si usa l’inglese'
            : 'nessun segnale sul cliente: si usa l’italiano, come la gran parte degli ordini'
  // La telefonata non porta nessun testo scritto: la lingua serve a sapere in
  // che lingua parlare, non a precompilare un messaggio.
  if (c.chiave === 'telefono') {
    return `Chiama il cliente. Parla in ${nomeLingua(c.lingua)} (${perche}).`
  }
  return `Scrivi al cliente su ${c.nome}, in ${nomeLingua(c.lingua)} (${perche}). Il messaggio non parte da solo: lo rileggi prima.`
}

/** Pagina Pagamenti già impostata su questo ordine. */
function linkPagamento(o: OrdineDto): string {
  const p = new URLSearchParams({
    ordine: o.numero,
    cliente: o.clienteNome,
    importo: String(o.totale || ''),
  })
  return `/pagamenti?${p.toString()}`
}

/**
 * Apre una richiesta di rimborso precompilata con questo ordine.
 * Porta anche il totale (è il tetto rimborsabile) e lo stato del pagamento, che
 * serve ad avvisare se l'ordine risulta già rimborsato o mai incassato.
 */
function linkRimborso(o: OrdineDto): string {
  const p = new URLSearchParams({
    ordineId: o.id,
    ordine: o.numero,
    cliente: o.clienteNome,
    telefono: o.telefono,
    email: o.email,
    negozio: o.negozioNome,
    totale: String(o.totale || ''),
    pagamento: o.statoPagamento,
  })
  return `/rimborsi?${p.toString()}`
}

/** Apre un nuovo reclamo (Customer Service) precompilato con questo ordine. */
function linkReclamo(o: OrdineDto): string {
  const p = new URLSearchParams({
    ordineId: o.id,
    ordine: o.numero,
    cliente: o.clienteNome,
    telefono: o.telefono,
    email: o.email,
    negozio: o.negozioNome,
  })
  return `/reclami?${p.toString()}`
}

type NegozioDto = {
  id: string
  nome: string
  brandRicerca: string
  conteggio: number
  valore: number
}

type OrdineArchivio = {
  id: string
  brand: string
  brandRicerca: string
  numero: string
  data: string
  totale: number
  valuta: string
  clienteNome: string
  telefono: string
  email: string
  citta: string
}

/** Link semplice all'app Ricerca fornitori (ripiego, senza accesso automatico). */
function linkFornitoreSemplice(brandRicerca: string, numero: string): string {
  const p = new URLSearchParams({ brand: brandRicerca, ordine: numero.replace(/^#/, '').trim() })
  return `https://search-deluxy.vercel.app/?${p}`
}

/**
 * Apre Ricerca fornitori sull'ordine. La scheda si apre SUBITO (altrimenti il
 * browser la blocca come popup) e poi ci portiamo dentro il link firmato che
 * chiediamo al nostro server.
 *
 * IL LINK FIRMATO È QUELLO CHE EVITA IL LOGIN: il nostro server chiede all'app
 * un codice monouso (`?t=…`, vale 5 minuti) che il browser scambia per una
 * sessione. Senza la chiave `searchApiKey` non si può chiedere quel codice e si
 * ripiega sul link semplice — che si apre, ma **chiede la password**.
 *
 * `avvisa` serve proprio a non lasciarlo capire all'operatore davanti a una
 * schermata di login: prima ripiegava in silenzio, e sembrava un guasto dell'app
 * invece di una chiave mancante.
 */
async function apriFornitore(
  brandRicerca: string,
  numero: string,
  avvisa?: (nota: string) => void
) {
  const scheda = window.open('about:blank', '_blank', 'noopener,noreferrer')
  const ripiego = linkFornitoreSemplice(brandRicerca, numero)
  try {
    const p = new URLSearchParams({ brand: brandRicerca, ordine: numero })
    const res = await fetch('/api/fornitore/link?' + p.toString())
    const d = (await res.json()) as { url?: string; firmato?: boolean; nota?: string }
    const url = d.url || ripiego
    if (scheda) scheda.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
    if (d.firmato === false) {
      avvisa?.(
        d.nota ||
          'Ricerca fornitori chiederà la password: manca la sua chiave API. Impostala in Impostazioni → Ricerca fornitori (si crea là, come amministratore).'
      )
    }
  } catch {
    if (scheda) scheda.location.href = ripiego
    else window.open(ripiego, '_blank', 'noopener,noreferrer')
    avvisa?.('Non sono riuscito a chiedere il link di accesso: l’app chiederà la password.')
  }
}

function soldi(v: number, valuta: string): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

type EsitoContatti = {
  collegato?: boolean
  aggiunti?: number
  aggiornati?: number
  presenti?: number
  errori?: number
  rimasti?: number
  errore?: string
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "3 minuti fa", "un'ora fa": da quanto non passa l'aggiornamento automatico. */
function quantoFa(iso: string): string {
  const minuti = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(minuti) || minuti < 0) return 'poco fa'
  if (minuti < 1) return 'adesso'
  if (minuti === 1) return 'un minuto fa'
  if (minuti < 60) return `${minuti} minuti fa`
  const ore = Math.round(minuti / 60)
  if (ore === 1) return "un'ora fa"
  if (ore < 24) return `${ore} ore fa`
  const giorni = Math.round(ore / 24)
  return giorni === 1 ? 'ieri' : `${giorni} giorni fa`
}

/** Frase leggibile sull'esito del salvataggio automatico dei contatti. */
function riepilogoContatti(c: EsitoContatti | undefined): string {
  if (!c) return ''
  if (c.errore) return ` Contatti non salvati: ${c.errore}`
  if (!c.collegato) return ' Contatti non salvati: Google non è collegato.'
  const parti: string[] = []
  if (c.aggiunti) parti.push(`${c.aggiunti} aggiunti`)
  if (c.aggiornati) parti.push(`${c.aggiornati} aggiornati`)
  if (c.presenti) parti.push(`${c.presenti} già in rubrica`)
  if (c.errori) parti.push(`${c.errori} errori`)
  if (!parti.length) return ' Nessun contatto nuovo da salvare.'
  const coda = c.rimasti ? ` — ne restano ${c.rimasti}, ripremi per continuare.` : ''
  return ` Contatti: ${parti.join(', ')}.${coda}`
}

// Due modalità, stessa tabella:
//  · **aperti** — la lista di lavoro: solo ciò che non è gestito, e senza gli
//    ordini su cui è già stato aperto un rimborso (quelli si lavorano in
//    Rimborsi, non qui);
//  · **globali** — tutto l'archivio, gestiti e rimborsati compresi, per
//    cercare. Non è una lista di lavoro: è l'indice.
export function OrdiniLista({ modalita = 'aperti' }: { modalita?: 'aperti' | 'globali' } = {}) {
  const globale = modalita === 'globali'
  // Da quando sei qui. Si fissa al primo disegno e non cambia più: gli ordini
  // comparsi dopo questo istante prendono l'etichetta NUOVO.
  //
  // ⚠️ Va letto in un effetto e non durante il render: `sessionStorage` sul
  // server non esiste, e leggerlo direttamente darebbe due valori diversi fra
  // HTML del server e primo disegno del browser (errore di idratazione).
  // Finché resta 0 nessun ordine è «nuovo», che è il ripiego giusto.
  const [sessioneDa, setSessioneDa] = useState(0)
  useEffect(() => setSessioneDa(inizioSessione()), [])

  const [ordini, setOrdini] = useState<OrdineDto[]>([])
  const [negozi, setNegozi] = useState<NegozioDto[]>([])
  // Vista: colonne per brand (come Deluxy Orders) o elenco in tabella.
    // Negli ordini globali si cerca, quindi si parte dalla tabella; in quelli
  // aperti si lavora, e le colonne per brand dicono di più a colpo d'occhio.
  const [vista, setVista] = useState<'colonne' | 'elenco'>(globale ? 'elenco' : 'colonne')
  const [totale, setTotale] = useState(0)
  const [googleCollegato, setGoogleCollegato] = useState(false)
  const [caricato, setCaricato] = useState(false)
  const [occupato, setOccupato] = useState('') // 'sync' | 'tutti' | id ordine
  // Quando ha girato l'ultima volta l'aggiornamento automatico (ogni 15 minuti),
  // com'è andato, e quando Orders ha scaricato da Shopify: sono i tre anelli
  // della catena, e vanno visti tutti e tre.
  const [ultimaSync, setUltimaSync] = useState('')
  const [esitoSync, setEsitoSync] = useState('')
  const [importOrders, setImportOrders] = useState('')
  // Quando questa pagina ha riletto l'elenco: si aggiorna da sola, e chi guarda
  // deve sapere se quello che vede è di adesso o di venti minuti fa.
  const [vistoIl, setVistoIl] = useState('')
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')
  // Quale ordine è aperto nel pannello di dettaglio ('' = nessuno).
  const [dettaglio, setDettaglio] = useState('')
  // La bozza aperta nel pop-up di posta (null = chiuso). Il pop-up sostituisce
  // il vecchio `mailto:`, che apriva il programma di posta del computer.
  const [mail, setMail] = useState<BozzaMail | null>(null)

  // Ricerca e filtri (la ricerca vera avviene sul server: cerca su TUTTI gli
  // ordini, non solo quelli già in pagina).
  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('') // `q` ritardata, per non chiamare a ogni tasto
  const [negozio, setNegozio] = useState('')
  const [filtroContatto, setFiltroContatto] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [perTipoCliente, setPerTipoCliente] = useState<Record<string, number>>({})
  // Quante consegne oggi, domani e scadute da poco: l'elenco è già ordinato per
  // urgenza, questi numeri dicono quanto è grande la coda.
  const [urgenza, setUrgenza] = useState({ oggi: 0, domani: 0, scaduteRecenti: 0 })
  // Vista di lavoro: di default si mostrano solo gli ordini non ancora gestiti.
  const [filtroGestione, setFiltroGestione] = useState(globale ? '' : 'aperti')

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (qCercata) p.set('q', qCercata)
      if (negozio) p.set('negozio', negozio)
      if (filtroContatto) p.set('contatto', filtroContatto)
      if (filtroGestione) p.set('gestione', filtroGestione)
      if (filtroTipo) p.set('tipoCliente', filtroTipo)
      // Gli ordini con un rimborso vivo escono solo dalla lista di lavoro.
      if (!globale) p.set('rimborsi', 'nascondi')
      const res = await fetch('/api/ordini?' + p.toString())
      if (!res.ok) return
      const dati = (await res.json()) as {
        ordini: OrdineDto[]
        totale: number
        negozi: NegozioDto[]
        googleCollegato: boolean
        ultimaSync?: string
        esitoSync?: string
        ultimoImportOrders?: string
        perTipoCliente?: Record<string, number>
        urgenza?: { oggi: number; domani: number; scaduteRecenti: number }
      }
      setOrdini(dati.ordini)
      setTotale(dati.totale)
      setNegozi(dati.negozi)
      setGoogleCollegato(dati.googleCollegato)
      setUltimaSync(dati.ultimaSync ?? '')
      setEsitoSync(dati.esitoSync ?? '')
      setImportOrders(dati.ultimoImportOrders ?? '')
      setPerTipoCliente(dati.perTipoCliente ?? {})
      setUrgenza(dati.urgenza ?? { oggi: 0, domani: 0, scaduteRecenti: 0 })
      setVistoIl(new Date().toISOString())
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [qCercata, negozio, filtroContatto, filtroGestione, filtroTipo, globale])

  /**
   * Cambia lo stato di lavorazione. `poi` è l'azione da fare dopo (aprire
   * WhatsApp, la mail, la pagina Pagamenti): la apriamo SUBITO e in modo
   * sincrono, altrimenti il browser la blocca come popup.
   */
  async function segna(id: string, gestione: string, poi?: () => void) {
    poi?.()
    // aggiornamento ottimistico: il pallino cambia subito
    setOrdini((prec) => prec.map((o) => (o.id === id ? { ...o, gestione } : o)))
    try {
      await fetch(`/api/ordini/${id}/gestione`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gestione }),
      })
      await carica()
    } catch {
      setErrore('Stato non salvato: problema di rete.')
      await carica()
    }
  }

  // Aspetta che l'utente smetta di digitare prima di interrogare il server.
  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    carica()
  }, [carica])

  /**
   * L'elenco si rilegge DA SOLO ogni minuto: il cron porta gli ordini nel
   * database ogni quarto d'ora, ma senza questo bisognerebbe ricaricare la
   * pagina a mano per vederli — e chi la tiene aperta tutto il giorno resterebbe
   * a guardare un elenco fermo, credendolo aggiornato.
   *
   * Un minuto e non quindici: i giri del cron non sono allineati a quando hai
   * aperto la pagina, quindi con un solo controllo ogni quarto d'ora un ordine
   * appena arrivato potrebbe aspettarne quasi trenta. È una lettura leggera,
   * filtri compresi.
   *
   * Si ferma quando la scheda non è in primo piano: aggiornare una pagina che
   * nessuno sta guardando è lavoro sprecato sul database, e al ritorno si
   * rilegge subito.
   */
  useEffect(() => {
    const rileggi = () => {
      if (document.visibilityState === 'visible') carica()
    }
    const t = setInterval(rileggi, 60000)
    document.addEventListener('visibilitychange', rileggi)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', rileggi)
    }
  }, [carica])

  // Fa scorrere i "3 minuti fa" senza aspettare la lettura successiva.
  const [, ridisegna] = useState(0)
  useEffect(() => {
    const t = setInterval(() => ridisegna((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  // Archivio storico (app Deluxy Orders): interrogato solo quando si cerca.
  const [archivio, setArchivio] = useState<OrdineArchivio[]>([])
  const [archivioTotale, setArchivioTotale] = useState(0)
  const [archivioNota, setArchivioNota] = useState('')

  useEffect(() => {
    if (!qCercata) {
      setArchivio([])
      setArchivioTotale(0)
      setArchivioNota('')
      return
    }
    let annullato = false
    ;(async () => {
      try {
        const res = await fetch('/api/ordini/archivio?q=' + encodeURIComponent(qCercata))
        const d = (await res.json()) as {
          stato: string
          totale?: number
          ordini?: OrdineArchivio[]
          messaggio?: string
        }
        if (annullato) return
        if (d.stato === 'ok') {
          setArchivio(d.ordini ?? [])
          setArchivioTotale(d.totale ?? 0)
          setArchivioNota('')
        } else {
          setArchivio([])
          setArchivioTotale(0)
          setArchivioNota(
            d.stato === 'non-configurato'
              ? '' // niente rumore finché la chiave non è impostata
              : d.messaggio || 'Archivio non raggiungibile.'
          )
        }
      } catch {
        if (!annullato) setArchivioNota('Archivio non raggiungibile.')
      }
    })()
    return () => {
      annullato = true
    }
  }, [qCercata])

  // L'ultimo giro è andato male? `annotaSync` scrive "ok: …" quando è riuscito.
  const syncFallito = !!esitoSync && !esitoSync.startsWith('ok')
  // Fermo da più di un'ora: il giro è ogni 15 minuti, quindi quattro mancati di
  // fila non sono un ritardo, sono un guasto.
  const syncFermo =
    syncFallito ||
    (!!ultimaSync && Date.now() - new Date(ultimaSync).getTime() > 60 * 60 * 1000)

  const filtriAttivi = !!(
    qCercata ||
    negozio ||
    filtroContatto ||
    filtroTipo ||
    filtroGestione !== 'aperti'
  )

  // Da che tipo di cliente arrivano gli ordini mostrati, dal più frequente.
  // I '' (tipo non rilevato) si contano a parte: dire "3 senza tipo" è
  // un'informazione, metterli fra i privati sarebbe un'invenzione.
  const rigaTipi = Object.entries(perTipoCliente)
    .filter(([t, n]) => t && n)
    .sort((a, b) => b[1] - a[1])
  const senzaTipo = perTipoCliente[''] ?? 0

  async function scarica() {
    setOccupato('sync')
    setAvviso('')
    setErrore('')
    try {
      const res = await fetch('/api/ordini/sync', { method: 'POST' })
      const dati = (await res.json().catch(() => ({}))) as {
        scaricati?: number
        nuovi?: number
        errore?: string
        risultati?: { negozio: string; ok: boolean; scaricati: number; errore: string }[]
        contatti?: EsitoContatti
      }
      if (!res.ok) {
        setErrore(dati.errore || 'Scarico non riuscito.')
      } else {
        setAvviso(
          `Scaricati ${dati.scaricati ?? 0} ordini (${dati.nuovi ?? 0} nuovi).` +
            riepilogoContatti(dati.contatti)
        )
        // Se qualche negozio è andato in errore, lo mostriamo negozio per negozio.
        const falliti = (dati.risultati ?? []).filter((r) => !r.ok)
        if (falliti.length) {
          setErrore(falliti.map((r) => `${r.negozio}: ${r.errore}`).join(' — '))
        }
      }
      await carica()
    } catch {
      setErrore('Scarico non riuscito: problema di rete.')
    } finally {
      setOccupato('')
    }
  }

  async function salvaContatto(id: string) {
    setOccupato(id)
    setErrore('')
    try {
      const res = await fetch(`/api/ordini/${id}/contatto`, { method: 'POST' })
      const dati = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) setErrore(dati.errore || 'Salvataggio non riuscito.')
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    } finally {
      setOccupato('')
    }
  }

  async function salvaTutti() {
    setOccupato('tutti')
    setAvviso('')
    setErrore('')
    try {
      const res = await fetch('/api/ordini/contatti-tutti', { method: 'POST' })
      const dati = (await res.json().catch(() => ({}))) as EsitoContatti
      if (!res.ok) setErrore(dati.errore || 'Operazione non riuscita.')
      else setAvviso(riepilogoContatti(dati).trim())
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    } finally {
      setOccupato('')
    }
  }

  return (
    <>
      {/* UNA SOLA RIGA IN TESTA: titolo, urgenza, stato della catena e azioni.
          Prima erano quattro blocchi impilati e il primo ordine cominciava a
          ~430px dall'alto: su un portatile si vedeva una fila di schede. Il
          dettaglio della catena (Shopify → Ordini → qui) è nel titolo del
          pallino, così resta consultabile senza occupare una riga sua. */}
      <div className="testa-ordini">
        <h1>{globale ? 'Ordini globali' : 'Ordini aperti'}</h1>

        {/* L'urgenza per prima: è la ragione per cui si apre questa pagina. */}
        {urgenza.oggi > 0 ? (
          <span className="pillola oggi" title="Ordini da consegnare oggi: sono in cima all'elenco">
            {urgenza.oggi} da consegnare oggi
          </span>
        ) : (
          <span className="pillola calma">nessuna consegna oggi</span>
        )}
        {urgenza.domani > 0 ? (
          <span className="pillola domani">{urgenza.domani} domani</span>
        ) : null}
        {urgenza.scaduteRecenti > 0 ? (
          <span
            className="pillola scadute"
            title="Consegne scadute negli ultimi giorni: forse sono ancora lavoro aperto"
          >
            {urgenza.scaduteRecenti} scadute di recente
          </span>
        ) : null}

        <span className="testa-spazio" />

        <span
          className={`pallino-sync${syncFermo ? ' fermo' : ''}`}
          aria-hidden="true"
          title={
            (ultimaSync ? `Ordini aggiornati ${quantoFa(ultimaSync)}` : 'Aggiornamento ogni 15 minuti') +
            (importOrders ? `\nOrdini ha scaricato da Shopify ${quantoFa(importOrders)}` : '') +
            (vistoIl ? `\nQuesta pagina si rilegge da sola, ultima lettura ${quantoFa(vistoIl)}` : '')
          }
        />
        <span className="testa-quando">
          {ultimaSync ? `aggiornati ${quantoFa(ultimaSync)}` : 'aggiornamento ogni 15 minuti'}
        </span>
        <button
          className="bottone secondario"
          onClick={scarica}
          disabled={!!occupato}
          title="Riprende subito gli ordini dal registro Ordini, senza aspettare il giro automatico"
        >
          {occupato === 'sync' ? 'Aggiorno…' : 'Aggiorna'}
        </button>
        <button
          className="bottone"
          onClick={salvaTutti}
          disabled={!!occupato || !googleCollegato}
          title={googleCollegato ? '' : 'Collega Google Contacts nelle Impostazioni'}
        >
          {occupato === 'tutti' ? 'Salvo…' : 'Salva contatti'}
        </button>
      </div>
      {/* Un giro fallito non deve nascondersi dietro un orario rassicurante. */}
      {syncFallito ? (
        <div className="avviso-errore">Ultimo aggiornamento non riuscito: {esitoSync}</div>
      ) : null}
      {syncFermo && !syncFallito ? (
        <div className="avviso-errore">
          Gli ordini non si aggiornano da più di un&apos;ora: il giro automatico potrebbe essersi
          fermato. Premi <strong>Aggiorna adesso</strong> e, se non cambia, controlla il cron.
        </div>
      ) : null}

      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per numero ordine, cliente, telefono, email o indirizzo…"
          aria-label="Cerca ordini"
        />
        <select value={negozio} onChange={(e) => setNegozio(e.target.value)} aria-label="Negozio">
          <option value="">Tutti i negozi</option>
          {negozi.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nome}
            </option>
          ))}
        </select>
        <select
          value={filtroGestione}
          onChange={(e) => setFiltroGestione(e.target.value)}
          aria-label="Stato di lavorazione"
        >
          <option value="aperti">Da gestire (non gestiti)</option>
          <option value="">Tutti gli ordini</option>
          {GESTIONI.map((g) => (
            <option key={g.chiave} value={g.chiave}>
              Solo: {g.nome}
            </option>
          ))}
        </select>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          aria-label="Tipo di cliente"
        >
          <option value="">Tipo cliente: tutti</option>
          {TIPI_CLIENTE.map((t) => (
            <option key={t.chiave} value={t.chiave}>
              {t.nome}
            </option>
          ))}
          <option value="ignoto">Tipo non rilevato</option>
        </select>
        <select
          value={filtroContatto}
          onChange={(e) => setFiltroContatto(e.target.value)}
          aria-label="Stato contatto"
        >
          <option value="">Contatto: tutti</option>
          <option value="no">Da salvare</option>
          <option value="si">Salvati</option>
        </select>
        {filtriAttivi ? (
          <button
            className="bottone secondario"
            onClick={() => {
              setQ('')
              setNegozio('')
              setFiltroContatto('')
              setFiltroTipo('')
              setFiltroGestione('aperti')
            }}
          >
            Azzera
          </button>
        ) : null}
        <button
          className="bottone secondario"
          onClick={() => setVista(vista === 'colonne' ? 'elenco' : 'colonne')}
          title="Cambia vista"
        >
          {vista === 'colonne' ? 'Elenco' : 'Colonne'}
        </button>
      </div>

      {caricato && filtriAttivi ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
          {totale === 0
            ? 'Nessun ordine corrisponde alla ricerca.'
            : `${totale} ${totale === 1 ? 'ordine trovato' : 'ordini trovati'}` +
              (totale > ordini.length ? ` — mostrati i ${ordini.length} più recenti` : '')}
        </p>
      ) : null}

      {/* Da che tipo di cliente arrivano gli ordini in elenco. */}
      {caricato && rigaTipi.length ? (
        <div className="riga-tipi">
          <span>Da che clienti:</span>
          {rigaTipi.map(([tipo, n]) => (
            <button
              key={tipo}
              className="badge"
              onClick={() => setFiltroTipo(filtroTipo === tipo ? '' : tipo)}
              style={{
                color: coloreTipoCliente(tipo),
                border: filtroTipo === tipo ? '1px solid currentColor' : '1px solid transparent',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: 12,
                fontWeight: 500,
              }}
              title={`Mostra solo gli ordini da ${nomeTipoCliente(tipo)}`}
            >
              {nomeTipoCliente(tipo)} {n.toLocaleString('it-IT')}
            </button>
          ))}
          {senzaTipo ? (
            <button
              className="badge"
              onClick={() => setFiltroTipo(filtroTipo === 'ignoto' ? '' : 'ignoto')}
              style={{
                color: 'var(--text-tertiary)',
                border: filtroTipo === 'ignoto' ? '1px solid currentColor' : '1px solid transparent',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: 12,
              }}
              title="Ordini senza email, telefono né nome: Orders non può dire che cliente è"
            >
              tipo non rilevato {senzaTipo.toLocaleString('it-IT')}
            </button>
          ) : null}
        </div>
      ) : null}

      {!googleCollegato && caricato ? (
        <div className="avviso-errore">
          Google Contacts non è collegato: vai in Impostazioni → Google Contacts per collegarlo.
        </div>
      ) : null}
      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {!caricato ? (
        <p style={{ color: 'var(--text-secondary)' }}>Carico…</p>
      ) : ordini.length === 0 ? (
        <div className="card">
          {filtriAttivi ? (
            <>
              Nessun ordine corrisponde ai filtri. Prova con un altro testo o premi{' '}
              <strong>Azzera</strong>.
            </>
          ) : (
            <>
              Nessun ordine ancora. Premi <strong>Aggiorna da Ordini</strong> per portare qui gli
              ordini recenti dal registro Deluxy Orders.
            </>
          )}
        </div>
      ) : vista === 'colonne' ? (
        <div className="colonne-brand">
          {negozi
            .filter((n) => !negozio || n.id === negozio)
            .map((n) => {
              const suoi = ordini.filter((o) => o.negozioId === n.id)
              return (
                <div className="colonna" key={n.id}>
                  <div className="colonna-testata">
                    <span className="pallino" aria-hidden="true" />
                    <span className="nome">{n.nome}</span>
                    <span className="conteggio">{n.conteggio.toLocaleString('it-IT')}</span>
                  </div>
                  <div className="colonna-valore">{soldi(n.valore, 'EUR')}</div>

                  {suoi.length === 0 ? (
                    <p className="colonna-vuota">Nessun ordine.</p>
                  ) : (
                    suoi.map((o) => (
                      /**
                       * Tutta la scheda apre il dettaglio. La riga delle azioni
                       * ferma la propagazione (vedi `azioni-ordine` più sotto),
                       * altrimenti premere "Reclamo" aprirebbe anche il pannello.
                       * `role="button"` + Invio/Spazio perché un div cliccabile
                       * che la tastiera non raggiunge è un pulsante solo per il
                       * mouse.
                       */
                      <div
                        className="scheda-ordine cliccabile"
                        key={o.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDettaglio(o.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setDettaglio(o.id)
                          }
                        }}
                        title="Apri il dettaglio dell'ordine"
                      >
                        <div className="riga-alta">
                          <span className="numero">{o.numero}</span>
                          <span className="importo">{soldi(o.totale, o.valuta)}</span>
                        </div>
                        <div className="cliente">
                          {o.clienteNome || '—'}
                          {o.citta ? ` · ${o.citta}` : ''}
                        </div>
                        {/* Quando va consegnato: per chi lavora l'ordine conta
                            più della data in cui è stato fatto. */}
                        {(() => {
                          const c = consegnaLeggibile(o.dataConsegna, o.fasciaConsegna)
                          return (
                            <div
                              className="consegna-riga"
                              style={{ color: c.colore, fontWeight: c.grassetto ? 600 : 400 }}
                            >
                              {c.testo}
                            </div>
                          )
                        })()}
                        {/* La data dell'ORDINE non sta piu' qui: quella che serve a
                            chi lavora e' la CONSEGNA, riga sopra. Averle entrambe
                            mandava i badge a capo, 27px per scheda; la data
                            dell'ordine si legge nel dettaglio. */}
                        <div className="riga-bassa" style={{ flexWrap: 'wrap', gap: 6 }}>
                          {/* Il PROBLEMA vince sul NUOVO: se la consegna non si
                              sa quando è, quello viene prima di «è appena
                              arrivato» — due bollini pieni uno accanto
                              all'altro si annullerebbero a vicenda. */}
                          {haProblemaConsegna(o) ? (
                            <BollinoProblema />
                          ) : arrivatoAdesso(o.creatoIl, sessioneDa) ? (
                            <BollinoNuovo />
                          ) : null}
                          {o.haBiglietto ? <SegnoBiglietto /> : null}
                          <ProfiloCliente numeroOrdine={o.clienteNumeroOrdine} />
                          <TipoCliente tipo={o.clienteTipo} da={o.clienteTipoDa} />
                          <span
                            className="badge"
                            style={{
                              color: coloreGestione(o.gestione),
                              background: 'var(--fill)',
                            }}
                            title={
                              o.gestioneDaNome
                                ? `${nomeGestione(o.gestione)} — segnato da ${o.gestioneDaNome}${
                                    o.gestioneIl
                                      ? ' il ' + new Date(o.gestioneIl).toLocaleString('it-IT')
                                      : ''
                                  }`
                                : 'Come stiamo lavorando questo ordine'
                            }
                          >
                            {nomeGestione(o.gestione)}
                          </span>
                        </div>
                        {/* TUTTE le azioni restano qui: sono il lavoro, non un
                            ornamento. Lo spazio si recupera con etichette corte
                            (il significato pieno sta nel title) e con i bottoni
                            più compatti, non togliendo funzioni.
                            Non aprono il dettaglio: chi preme "Reclamo" vuole il
                            reclamo, non il pannello. */}
                        <div className="azioni-ordine" onClick={(e) => e.stopPropagation()}>
                          <a
                            className="bottone secondario mini"
                            href={linkPagamento(o)}
                            onClick={() => segna(o.id, 'in_pagamento')}
                            title="Paga fornitore: chiedi il pagamento del fornitore per questo ordine"
                          >
                            Paga
                          </a>
                          {/* Un bottone per ogni canale che questo cliente ha
                              davvero: sceglie chi sta lavorando l'ordine, non
                              il codice. Senza recapiti resta scritto perché. */}
                          {(() => {
                            const canali = canaliContatto(o)
                            if (canali.length === 0) {
                              return (
                                <span
                                  className="bottone secondario mini"
                                  style={{ pointerEvents: 'none', opacity: 0.4 }}
                                  title="Ordine senza telefono né email: non c'è modo di contattarlo"
                                >
                                  Nessun recapito
                                </span>
                              )
                            }
                            return canali.map((c) =>
                              c.mail ? (
                                <button
                                  key={c.chiave}
                                  className="bottone secondario mini"
                                  onClick={() => {
                                    setMail(c.mail!)
                                    segna(o.id, 'comunicazione')
                                  }}
                                  title={spiegaContatto(c)}
                                >
                                  {c.nome}
                                </button>
                              ) : (
                              <a
                                key={c.chiave}
                                className="bottone secondario mini"
                                href={c.url}
                                target={c.chiave === 'telefono' ? undefined : '_blank'}
                                rel="noopener noreferrer"
                                onClick={() => segna(o.id, 'comunicazione')}
                                title={spiegaContatto(c)}
                              >
                                {c.nome}
                              </a>
                              )
                            )
                          })()}
                          <a
                            className="bottone secondario mini"
                            href={linkReclamo(o)}
                            title="Apri un reclamo su questo ordine"
                          >
                            Reclamo
                          </a>
                          <a
                            className="bottone secondario mini"
                            href={linkRimborso(o)}
                            title="Chiedi il rimborso di questo ordine (lo approva poi una persona)"
                          >
                            Rimborso
                          </a>
                          {o.gestione === 'gestito' ? (
                            <button
                              className="bottone secondario mini"
                              onClick={() => segna(o.id, 'da_gestire')}
                              title="Rimetti tra quelli da gestire"
                            >
                              Riapri
                            </button>
                          ) : (
                            <button
                              className="bottone secondario mini"
                              onClick={() => segna(o.id, 'gestito')}
                              title="Segna come gestito"
                            >
                              Gestito ✓
                            </button>
                          )}
                          {!o.contattoSalvato ? (
                            <button
                              className="bottone secondario mini"
                              onClick={() => salvaContatto(o.id)}
                              disabled={!!occupato || !googleCollegato || (!o.telefono && !o.email)}
                              title={
                                !o.telefono && !o.email
                                  ? 'Ordine senza telefono né email'
                                  : googleCollegato
                                    ? 'Salva il contatto in rubrica Google'
                                    : 'Collega Google Contacts nelle Impostazioni'
                              }
                            >
                              {occupato === o.id ? 'Salvo…' : 'Rubrica'}
                            </button>
                          ) : null}
                          {n.brandRicerca ? (
                            <button
                              className="bottone secondario mini"
                              onClick={() => apriFornitore(n.brandRicerca, o.numero, setErrore)}
                              title={`Cerca il fornitore per ${o.numero} su Ricerca fornitori`}
                            >
                              Fornitore ↗
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )
            })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tabella">
            <thead>
              <tr>
                <th>Ordine</th>
                <th>Negozio</th>
                <th>Data</th>
                <th>Consegna</th>
                <th>Cliente</th>
                <th>Tipo cliente</th>
                <th>Telefono</th>
                <th style={{ textAlign: 'right' }}>Totale</th>
                <th>Lavorazione</th>
                <th>Azioni</th>
                <th>Fornitore</th>
              </tr>
            </thead>
            <tbody>
              {ordini.map((o) => (
                // Anche la riga apre il dettaglio: la colonna Azioni ferma il clic.
                <tr
                  key={o.id}
                  className="riga-cliccabile"
                  onClick={() => setDettaglio(o.id)}
                  title="Apri il dettaglio dell'ordine"
                >
                  <td>{o.numero}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{o.negozioNome || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{dataBreve(o.data)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {o.dataConsegna ? (
                      <>
                        <div style={{ fontWeight: 500 }}>
                          {new Date(o.dataConsegna).toLocaleDateString('it-IT', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </div>
                        {/* «ore» davanti: "08-12" da solo si legge come 8 dicembre */}
                        {o.fasciaConsegna ? (
                          <div className="cella-sub">{fasciaLeggibile(o.fasciaConsegna)}</div>
                        ) : (
                          <div className="cella-sub">fascia non indicata</div>
                        )}
                      </>
                    ) : o.fasciaConsegna ? (
                      <>
                        <div style={{ color: 'var(--text-tertiary)' }}>giorno non indicato</div>
                        <div className="cella-sub">{fasciaLeggibile(o.fasciaConsegna)}</div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {o.clienteNome || '—'}
                    {o.haBiglietto ? (
                      <>
                        {' '}
                        <SegnoBiglietto />
                      </>
                    ) : null}
                    {haProblemaConsegna(o) ? (
                      <>
                        {' '}
                        <BollinoProblema />
                      </>
                    ) : arrivatoAdesso(o.creatoIl, sessioneDa) ? (
                      <>
                        {' '}
                        <BollinoNuovo />
                      </>
                    ) : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {o.clienteTipo ? (
                        <TipoCliente tipo={o.clienteTipo} da={o.clienteTipoDa} />
                      ) : null}
                      <ProfiloCliente numeroOrdine={o.clienteNumeroOrdine} />
                      {!o.clienteTipo && o.clienteNumeroOrdine === null ? (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{o.telefono || '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {o.totale.toLocaleString('it-IT', { style: 'currency', currency: o.valuta })}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span
                      className="badge"
                      style={{ color: coloreGestione(o.gestione), background: 'var(--fill)' }}
                    >
                      {nomeGestione(o.gestione)}
                    </span>
                  </td>
                  <td>
                    <span className="azioni-ordine" onClick={(e) => e.stopPropagation()}>
                      <a
                        className="bottone secondario mini"
                        href={linkPagamento(o)}
                        onClick={() => segna(o.id, 'in_pagamento')}
                        title="Chiedi il pagamento del fornitore per questo ordine"
                      >
                        Paga fornitore
                      </a>
                      {(() => {
                        const canali = canaliContatto(o)
                        if (canali.length === 0) {
                          return (
                            <span
                              className="bottone secondario mini"
                              style={{ pointerEvents: 'none', opacity: 0.4 }}
                              title="Ordine senza telefono né email: non c'è modo di contattarlo"
                            >
                              Nessun recapito
                            </span>
                          )
                        }
                        return canali.map((c) => (
                          <a
                            key={c.chiave}
                            className="bottone secondario mini"
                            href={c.url}
                            target={c.chiave === 'telefono' ? undefined : '_blank'}
                            rel="noopener noreferrer"
                            onClick={() => segna(o.id, 'comunicazione')}
                            title={spiegaContatto(c)}
                          >
                            {c.nome}
                          </a>
                        ))
                      })()}
                      <a
                        className="bottone secondario mini"
                        href={linkReclamo(o)}
                        title="Apri un reclamo su questo ordine"
                      >
                        Reclamo
                      </a>
                      <a
                        className="bottone secondario mini"
                        href={linkRimborso(o)}
                        title="Chiedi il rimborso di questo ordine"
                      >
                        Rimborso
                      </a>
                      {o.gestione === 'gestito' ? (
                        <button
                          className="bottone secondario mini"
                          onClick={() => segna(o.id, 'da_gestire')}
                        >
                          Riapri
                        </button>
                      ) : (
                        <button
                          className="bottone secondario mini"
                          onClick={() => segna(o.id, 'gestito')}
                        >
                          Gestito ✓
                        </button>
                      )}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const brand = negozi.find((n) => n.id === o.negozioId)?.brandRicerca
                      return brand ? (
                        <button
                          className="bottone secondario mini"
                          onClick={() => apriFornitore(brand, o.numero, setErrore)}
                          title={`Cerca il fornitore per ${o.numero}`}
                        >
                          Cerca ↗
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ordini storici: vivono nell'app Ordini, qui si cercano soltanto. */}
      {qCercata && (archivio.length > 0 || archivioNota) ? (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Archivio storico</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>
            {archivioNota
              ? archivioNota
              : `${archivioTotale.toLocaleString('it-IT')} ordini nell'app Ordini` +
                (archivioTotale > archivio.length ? ` — mostrati i primi ${archivio.length}` : '') +
                '. Qui trovi anche gli ordini più vecchi di quelli scaricati da Shopify.'}
          </p>
          {archivio.length > 0 ? (
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="tabella">
                <thead>
                  <tr>
                    <th>Ordine</th>
                    <th>Brand</th>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Telefono</th>
                    <th style={{ textAlign: 'right' }}>Totale</th>
                    <th>Fornitore</th>
                  </tr>
                </thead>
                <tbody>
                  {archivio.map((o) => (
                    <tr key={o.id}>
                      <td>{o.numero}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{o.brand}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{dataBreve(o.data)}</td>
                      <td>
                        {o.clienteNome || '—'}
                        {o.citta ? ` · ${o.citta}` : ''}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{o.telefono || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {soldi(o.totale, o.valuta)}
                      </td>
                      <td>
                        <button
                          className="bottone secondario mini"
                          onClick={() => apriFornitore(o.brandRicerca || o.brand, o.numero, setErrore)}
                          title={`Cerca il fornitore per ${o.numero}`}
                        >
                          Cerca ↗
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Il dettaglio dell'ordine, aperto cliccando la scheda o la riga.
          Alla chiusura si rilegge l'elenco: dal pannello si può aver segnato
          qualcosa, e tornare a un elenco vecchio sarebbe confondente. */}
      {dettaglio ? (
        <DettaglioOrdine
          ordineId={dettaglio}
          onChiudi={() => {
            setDettaglio('')
            carica()
          }}
          onScriviMail={(b) => setMail(b)}
        />
      ) : null}

      {/* Il pop-up di posta: si scrive e si manda dalla casella aziendale. */}
      {mail ? <ComponiMail bozza={mail} onChiudi={() => setMail(null)} /> : null}
    </>
  )
}
