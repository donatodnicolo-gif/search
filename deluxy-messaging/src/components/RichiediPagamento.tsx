'use client'

import { useCallback, useEffect, useState } from 'react'
import { CercaFornitore } from './CercaFornitore'
import { ibanAccorciato, type FornitoreTrovato } from '@/lib/cerca-fornitore'
import { calcolaMargine, frasiMargine, pct } from '@/lib/margine'
import { CellaCopiabile } from './CellaCopiabile'
import { ScegliOrdine, type OrdineTrovato } from './ScegliOrdine'
import {
  METODI,
  cosaManca,
  linkSicuro,
  USCITE,
  nomeMetodo,
  messaggioPagato,
  nomeUscita,
  perchePersoAvviso,
  pesoScritto,
  ricevutaAccettabile,
  TIPI_RICEVUTA,
  type Metodo,
} from '@/lib/metodo-pagamento'

// Richiedi pagamento: IBAN e intestatario si inseriscono a mano, oppure si
// fanno leggere all'AI da un messaggio incollato o da un'immagine (schermata
// di chat, foto di un bonifico). L'IBAN viene sempre verificato col checksum.

type Richiesta = {
  id: string
  iban: string
  intestatario: string
  importo: number
  valuta: string
  causale: string
  ibanValido: boolean
  origine: string
  creatoIl: string
  stringa: string
  inviataIl: string | null
  partnerStato: string
  esitoInvio: string
  metodo: string
  riferimentoPagamento: string
  ordineNumero: string
  pagataIl: string | null
  pagataDaNome: string
  ricevutaNome: string
  ricevutaTipo: string
  pagatoCon: string
  /** Quanto valeva l'ordine: serve alla colonna del margine. 0 = non lo sappiamo. */
  valoreOrdine: number
  fornitoreOrdine: string
  /** Quanti ordini portano quel numero: piu' di uno = non si mostra il margine. */
  ordiniOmonimi: number
  avvisoIl: string | null
  avvisoCanale: string
  avvisoEsito: string
}

const STATI_PARTNER: Record<string, string> = {
  in_attesa: 'in attesa',
  approvata: 'approvata',
  rifiutata: 'rifiutata',
  pagata: 'pagata',
}

const ORIGINI: Record<string, string> = {
  manuale: 'a mano',
  testo: 'da messaggio',
  immagine: 'da immagine',
}

export function RichiediPagamento() {
  const [richieste, setRichieste] = useState<Richiesta[]>([])
  const [caricato, setCaricato] = useState(false)

  // campi del modulo
  const [iban, setIban] = useState('')
  const [intestatario, setIntestatario] = useState('')
  const [importo, setImporto] = useState('')
  const [causale, setCausale] = useState('')
  const [origine, setOrigine] = useState('manuale')

  // lettura AI
  const [testo, setTesto] = useState('')
  const [immagine, setImmagine] = useState<{ dati: string; tipo: string; nome: string } | null>(null)
  const [leggo, setLeggo] = useState(false)

  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')
  const [ibanNota, setIbanNota] = useState('')
  const [copiato, setCopiato] = useState('')
  // Il nome del fornitore che arriva dal bottone «Paga» di un ordine: fa
  // partire la ricerca da sola, perché chi arriva qui vuole pagare LUI.
  const [fornitoreDaOrdine, setFornitoreDaOrdine] = useState('')
  // ⚠️ QUANTO HA PAGATO IL CLIENTE, che è un'altra cosa dall'importo qui sotto:
  // quello è quanto diamo al fornitore. La differenza fra i due è tutto il
  // guadagno di quell'ordine, e finora nessuno la vedeva.
  const [valoreOrdine, setValoreOrdine] = useState(0)
  // La quota prevista arriva da Deluxy Orders. ⚠️ `null` = non la sappiamo, e
  // allora niente verdetto: vedi src/lib/margine.ts.
  const [quotaPrevista, setQuotaPrevista] = useState<number | null>(null)
  // ⚠️ COME lo paghiamo. Non tutti i fornitori si pagano con un bonifico: chi
  // manda un link, chi dà un PayPal, chi si accorda a voce. Finché l'unica
  // forma prevista era l'IBAN, tutto il resto non si registrava affatto.
  const [metodo, setMetodo] = useState<Metodo>('iban')
  const [riferimento, setRiferimento] = useState('')
  // L'ordine a cui si riferisce: da qui viene anche il valore su cui si calcola
  // il margine. ⚠️ Il campo esisteva in tabella ed era sempre vuoto.
  const [ordineNumero, setOrdineNumero] = useState('')
  const [ordineScelto, setOrdineScelto] = useState<OrdineTrovato | null>(null)
  // La riga che si sta correggendo, e la ricevuta che si sta caricando.
  const [modificoId, setModificoId] = useState('')
  const [ricevuta, setRicevuta] = useState<{
    dati: string
    nome: string
    tipo: string
    byte: number
  } | null>(null)
  const [pagando, setPagando] = useState('')
  // L'ultima cosa incollata con Ctrl+V, e dove è finita. ⚠️ Serve per POTERLA
  // SPOSTARE: la destinazione la sceglie il codice dal contesto, e quando
  // sbaglia bisogna poter rimediare senza rifare tutto.
  const [incollata, setIncollata] = useState<{ file: File; come: 'ricevuta' | 'immagine' } | null>(
    null
  )
  // ⚠️⚠️ DA DOVE ESCE IL DENARO. Un bonifico non parte per forza da un'app
  // nostra: quasi sempre esce dal portale della banca, a mano; a volte si paga
  // in contanti, o si scala da quello che quel fornitore ci deve. Dare per
  // scontato un solo canale vorrebbe dire un registro che descrive un mondo che
  // non esiste, e che quindi nessuno tiene aggiornato.
  const [pagatoCon, setPagatoCon] = useState('')
  // ⚠️ Il pop-up si apre premendo «Pagata»: la ricevuta si carica NEL momento in
  // cui si registra il pagamento, non prima. Sceglierla in cima e poi ricordarsi
  // di premere la riga giusta è un passaggio in più che si sbaglia — e quando si
  // sbaglia la ricevuta finisce sul pagamento di un altro fornitore.
  const [chiedoPagata, setChiedoPagata] = useState<Richiesta | null>(null)
  // Il numero d'ordine che arriva dal bottone «Paga»: è più affidabile del
  // numero letto nella causale, perché non è stato scritto a mano da nessuno.
  const [ordineDaUrl, setOrdineDaUrl] = useState('')

  // Arrivando dal bottone "Richiedi pagamento" di un ordine, i campi si
  // precompilano da soli con numero, cliente e importo.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const ordine = p.get('ordine')
    if (!ordine) return
    setCausale(`Ordine ${ordine}`)
    // ⚠️ Il campo «Ordine» si riempie da qui, non dalla causale: arrivando dal
    // bottone «Paga» il numero lo sappiamo già con certezza, mentre la causale
    // è testo che qualcuno può aver riscritto.
    setOrdineDaUrl(ordine)
    const cliente = p.get('cliente')

    // ⚠️⚠️ CHI VA PAGATO È IL FORNITORE, NON IL CLIENTE.
    //
    // Finora questa pagina si apriva con l'importo del VENDUTO e l'intestatario
    // vuoto: bisognava ricordarsi chi aveva preparato l'ordine — un fatto che
    // non era scritto da nessuna parte — e ricopiarlo a mano insieme alla cifra
    // giusta. Adesso l'ordine sa a chi è stato dato, e la richiesta parte con
    // il nome e con **quanto gli è stato promesso**.
    const fornitore = p.get('fornitore')
    const costo = p.get('costo')
    if (fornitore) {
      setIntestatario(fornitore)
      setFornitoreDaOrdine(fornitore)
    }
    // ⚠️ Si tiene da parte QUANTO VALE L'ORDINE, anche quando l'importo del
    // modulo diventa il costo del fornitore: senza, la percentuale di margine
    // non si potrebbe calcolare — e con l'importo cambiato a mano nemmeno
    // ricavare.
    const venduto = Number(p.get('importo') ?? '')
    if (venduto > 0) setValoreOrdine(venduto)

    // ⚠️ Il costo concordato vince sull'importo dell'ordine: quello è quanto ha
    // pagato il cliente, e mandarlo al fornitore vorrebbe dire pagargli il
    // prezzo di vendita. È l'errore che questa riga esiste per impedire.
    if (costo && Number(costo) > 0) setImporto(costo)
    else {
      const imp = p.get('importo')
      if (imp && Number(imp) > 0) setImporto(imp)
    }

    setAvviso(
      fornitore
        ? `Pagamento a ${fornitore}, che ha preparato l'ordine ${ordine}` +
            (cliente ? ` per ${cliente}` : '') +
            (costo && Number(costo) > 0
              ? '.'
              : '. ⚠️ Il costo non era concordato: controlla l’importo prima di mandare.')
        : `Richiesta per l'ordine ${ordine}${cliente ? ` — cliente ${cliente}` : ''}. ` +
            '⚠️ Su quest’ordine non è registrato nessun fornitore: l’importo qui sotto è quello ' +
            'del venduto, non quello da pagare. Registra chi lo prepara dalla scheda dell’ordine.'
    )
  }, [])

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/pagamenti')
      if (!res.ok) return
      const d = (await res.json()) as { richieste: Richiesta[] }
      setRichieste(d.richieste)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [])

  useEffect(() => {
    carica()
  }, [carica])

  // ⚠️ La regola («quanto va al fornitore») si CHIEDE a Deluxy Orders, non si
  // scrive qui: là può cambiare, e un 60% ricopiato nel nostro codice resterebbe
  // al vecchio valore senza che nessuna delle due schermate dia errore.
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const res = await fetch('/api/quota-fornitore')
        if (!res.ok) return
        const d = (await res.json()) as { quota: number | null }
        if (vivo) setQuotaPrevista(typeof d.quota === 'number' ? d.quota : null)
      } catch {
        // Orders non raggiungibile: si resta senza verdetto, e si dice.
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const scegliImmagine = useCallback(function scegliImmagine(file: File | null) {
    if (!file) {
      setImmagine(null)
      return
    }
    const lettore = new FileReader()
    lettore.onload = () => {
      const risultato = String(lettore.result)
      // data:image/png;base64,XXXX → teniamo solo la parte dopo la virgola
      const dati = risultato.slice(risultato.indexOf(',') + 1)
      setImmagine({ dati, tipo: file.type, nome: file.name })
    }
    lettore.readAsDataURL(file)
  }, [])

  async function leggiConAi() {
    if (!testo.trim() && !immagine) {
      setErrore('Incolla un messaggio o carica un’immagine.')
      return
    }
    setLeggo(true)
    setErrore('')
    setAvviso('')
    setIbanNota('')
    try {
      const res = await fetch('/api/pagamenti/estrai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testo: testo.trim() || undefined,
          immagine: immagine ? { dati: immagine.dati, tipo: immagine.tipo } : undefined,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        dati?: { iban: string; intestatario: string; importo: number; causale: string }
        ibanValido?: boolean
        motivoIban?: string
        stringa?: string
        fornitore?: string
        errore?: string
      }
      if (!res.ok || !d.dati) {
        setErrore(d.errore || 'Lettura non riuscita.')
        return
      }
      // I campi si compilano da soli: restano modificabili prima di salvare.
      setIban(d.dati.iban)
      setIntestatario(d.dati.intestatario)
      setImporto(d.dati.importo ? String(d.dati.importo) : '')
      setCausale(d.dati.causale)
      setOrigine(immagine ? 'immagine' : 'testo')
      setAvviso(
        (d.stringa ? `Letto: ${d.stringa}` : 'Letto.') +
          (d.fornitore ? ` (${d.fornitore})` : '')
      )
      if (!d.ibanValido) {
        setIbanNota(
          d.motivoIban || 'L’IBAN letto non supera la verifica: controllalo prima di usarlo.'
        )
      }
    } catch {
      setErrore('Lettura non riuscita: problema di rete.')
    } finally {
      setLeggo(false)
    }
  }

  /**
   * Un fornitore scelto dalla ricerca: i campi si compilano da soli.
   *
   * ⚠️ L'intestatario è la RAGIONE SOCIALE quando c'è, non l'insegna: il
   * bonifico va a «Rossi S.r.l.», non a «Pasticceria Rossi», e una banca che non
   * riconosce il nome può rifiutarlo o rimandarlo indietro giorni dopo.
   * ⚠️ L'IBAN si compila SOLO se ne conosciamo uno solo: con più IBAN diversi
   * per lo stesso nome, la ricerca non ne propone nessuno e lo dice.
   * ⚠️ L'IMPORTO non si tocca mai: è quello dell'ordine da cui si arriva, e
   * sovrascriverlo con l'ultimo pagamento fatto a quella persona vorrebbe dire
   * pagare la cifra di un altro ordine.
   */
  function usaFornitore(f: FornitoreTrovato) {
    setIntestatario(f.ragioneSociale || f.nome)
    if (f.iban) {
      setIban(f.iban)
      setIbanNota('')
      setAvviso(
        `Compilato con i dati che avevamo: ${f.ragioneSociale || f.nome}, IBAN ${ibanAccorciato(f.iban)}. Controlla prima di salvare.`
      )
    } else {
      setAvviso(
        f.ibanDiversi > 1
          ? `Di ${f.nome} risultano ${f.ibanDiversi} IBAN diversi: scrivi tu quello giusto.`
          : `${f.ragioneSociale || f.nome}: il nome ce l'avevamo, l'IBAN no — va scritto a mano.`
      )
    }
    setOrigine('manuale')
  }

  /** Il file della ricevuta, letto come data URI. */
  const scegliRicevuta = useCallback(function scegliRicevuta(file: File | null) {
    if (!file) {
      setRicevuta(null)
      return
    }
    const problema = ricevutaAccettabile(file.type, file.size)
    if (problema) {
      setErrore(problema)
      setRicevuta(null)
      return
    }
    setErrore('')
    const lettore = new FileReader()
    lettore.onload = () =>
      setRicevuta({
        dati: String(lettore.result),
        nome: file.name,
        tipo: file.type,
        byte: file.size,
      })
    lettore.readAsDataURL(file)
  }, [])

  // ── SI INCOLLA, NON SI CARICA ──
  //
  // ⚠️⚠️ Sia l'IBAN che ci mandano sia la prova del bonifico nascono come una
  // SCHERMATA: si ritagliano da WhatsApp o dal portale della banca e stanno
  // negli appunti. Chiedere un file vuol dire chiedere di salvarla prima da
  // qualche parte, ritrovarla fra i download e sceglierla — tre passaggi, e
  // alla terza volta non si allega più niente.
  //
  // ⚠️ Si ascolta su tutta la pagina e non su un campo: una schermata negli
  // appunti non ha un posto dove "cliccare prima di incollare", e obbligare a
  // dare il fuoco a un riquadro riporterebbe il problema di partenza.
  //
  // ⚠️ Si interviene SOLO se negli appunti c'è davvero un file di un tipo che
  // accettiamo. Se ci fosse del testo si starebbe incollando un IBAN in un
  // campo, e rubare quel Ctrl+V romperebbe il lavoro normale della pagina.
  useEffect(() => {
    function daAppunti(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        TIPI_RICEVUTA.includes(f.type)
      )
      if (!file) return
      e.preventDefault()
      // ⚠️ Una schermata incollata si chiama «image.png» per tutti: con quel
      // nome, fra sei mesi, nessuna ricevuta si distingue dalle altre. Il nome
      // glielo diamo noi, con la data.
      const est = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1] || 'png'
      const oggi = new Date().toISOString().slice(0, 10)
      const rinominato = new File([file], `incollata-${oggi}.${est}`, { type: file.type })
      // ⚠️⚠️ DOVE finisce non si indovina: dipende da cosa si sta facendo.
      // Col pop-up «Pagata» aperto si sta registrando un'uscita di denaro e
      // quella è una ricevuta; altrimenti si sta compilando la richiesta e
      // quella è l'immagine da far leggere. Un PDF non lo sa leggere l'AI, e
      // allora è comunque una ricevuta.
      const comeRicevuta = !!chiedoPagata || file.type === 'application/pdf'
      if (comeRicevuta) scegliRicevuta(rinominato)
      else scegliImmagine(rinominato)
      // ⚠️ Si DICE dove è finita, e si può spostare. Un allegato che atterra
      // dove non ti aspetti, in silenzio, si scopre solo dopo aver salvato.
      setIncollata({ file: rinominato, come: comeRicevuta ? 'ricevuta' : 'immagine' })
    }
    document.addEventListener('paste', daAppunti)
    return () => document.removeEventListener('paste', daAppunti)
  }, [chiedoPagata, scegliRicevuta, scegliImmagine])

  /** Sposta l'ultima incollata sull'altra destinazione. */
  function spostaIncollata() {
    if (!incollata) return
    if (incollata.come === 'ricevuta') {
      scegliRicevuta(null)
      scegliImmagine(incollata.file)
      setIncollata({ ...incollata, come: 'immagine' })
    } else {
      scegliImmagine(null)
      scegliRicevuta(incollata.file)
      setIncollata({ ...incollata, come: 'ricevuta' })
    }
  }

  /**
   * Segnare che il denaro è USCITO, con la prova.
   *
   * ⚠️ Diverso da «inviata a chi approva»: l'app sapeva solo di aver CHIESTO un
   * pagamento, e con un fornitore che richiama per sapere se è stato pagato non
   * c'era niente da guardare.
   */
  async function segnaPagata(id: string, pagata: boolean) {
    setPagando(id)
    setErrore('')
    try {
      const res = await fetch(`/api/pagamenti/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          azione: pagata ? 'pagata' : 'nonpagata',
          ricevuta: pagata ? ricevuta : null,
          pagatoCon: pagata ? pagatoCon : '',
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Non è stato registrato.')
        return
      }
      setRicevuta(null)
      // ⚠️ L'esito dell'avviso si dice SUBITO e per intero: e' partito un
      // messaggio a nome nostro, e chi ha premuto deve sapere se e' arrivato.
      const av = (d as { avviso?: { canale: string; errore: string } }).avviso
      setAvviso(
        !pagata
          ? 'Tolto il segno «pagata».'
          : av && !av.errore
            ? `Registrata, e il fornitore e' stato avvisato per ${av.canale}.`
            : av && av.errore
              ? `Registrata. ⚠️ L'avviso NON e' partito: ${av.errore}`
              : 'Segnata come pagata.'
      )
      await carica()
    } catch {
      setErrore('Non è stato registrato: problema di rete.')
    } finally {
      setPagando('')
    }
  }

  /** Correggere una riga salvata. */
  async function modifica(id: string) {
    const manca = cosaManca({ metodo, iban, riferimento, intestatario })
    if (manca) {
      setErrore(manca)
      return
    }
    setErrore('')
    try {
      const res = await fetch(`/api/pagamenti/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          azione: 'modifica',
          metodo,
          iban,
          riferimentoPagamento: riferimento,
          intestatario,
          importo: Number(importo.replace(',', '.')) || 0,
          causale,
          ordineNumero: ordineScelto?.numero || ordineNumero,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string; motivoIban?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Correzione non riuscita.')
        return
      }
      if (d.motivoIban) setIbanNota(d.motivoIban)
      setModificoId('')
      setIban('')
      setRiferimento('')
      setIntestatario('')
      setImporto('')
      setCausale('')
      setOrdineNumero('')
      setOrdineScelto(null)
      setAvviso('Corretta.')
      await carica()
    } catch {
      setErrore('Correzione non riuscita: problema di rete.')
    }
  }

  /** Riporta una riga dentro il modulo per correggerla. */
  function apriPerModifica(r: Richiesta) {
    setModificoId(r.id)
    setMetodo((r.metodo || 'iban') as Metodo)
    setIban(r.iban)
    setRiferimento(r.riferimentoPagamento)
    setIntestatario(r.intestatario)
    setImporto(r.importo ? String(r.importo).replace('.', ',') : '')
    setCausale(r.causale)
    setOrdineNumero(r.ordineNumero)
    setOrdineScelto(null)
    setErrore('')
    setAvviso(`Stai correggendo la richiesta di ${r.intestatario}.`)
    // ⚠️ Si porta lo schermo sul modulo: su un telefono la tabella sta in
    // fondo, e senza questo si preme «Modifica» e non succede niente di
    // visibile — cioè sembra rotto.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salva() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/pagamenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metodo,
          iban,
          riferimentoPagamento: riferimento,
          intestatario,
          importo: Number(importo.replace(',', '.')) || 0,
          causale,
          origine,
          // ⚠️ Adesso parte davvero: prima il campo esisteva in tabella e non
          // veniva mai mandato, quindi nessuna richiesta salvata sapeva a quale
          // ordine appartenesse.
          ordineNumero: ordineScelto?.numero || ordineNumero,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        richiesta?: Richiesta
        motivoIban?: string
        invio?: { ok: boolean; messaggio: string } | null
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Salvataggio non riuscito.')
        return
      }
      setAvviso(`Salvata: ${d.richiesta?.stringa ?? ''}`)
      // L'inoltro a Partner può fallire senza far fallire il salvataggio: lo si dice.
      if (d.invio && !d.invio.ok) setErrore(d.invio.messaggio)
      else if (d.invio?.ok) setAvviso(`Salvata e inviata a Partner: ${d.richiesta?.stringa ?? ''}`)
      if (d.motivoIban) setIbanNota(d.motivoIban)
      setIban('')
      setRiferimento('')
      setIntestatario('')
      setImporto('')
      setCausale('')
      setOrdineNumero('')
      setOrdineScelto(null)
      setTesto('')
      setImmagine(null)
      setOrigine('manuale')
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    }
  }

  // Rimanda a Partner (idempotente) oppure ne aggiorna lo stato.
  async function versoPartner(id: string, azione: 'invia' | 'stato') {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch(`/api/pagamenti/${id}/invia`, {
        method: azione === 'invia' ? 'POST' : 'GET',
      })
      const d = (await res.json().catch(() => ({}))) as { stato?: string; errore?: string }
      if (!res.ok) setErrore(d.errore || 'Operazione non riuscita.')
      else setAvviso(azione === 'invia' ? 'Inviata a Partner.' : `Stato: ${d.stato ?? '—'}`)
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    }
  }

  async function elimina(id: string) {
    await fetch('/api/pagamenti?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  async function copia(testoDaCopiare: string, id: string) {
    try {
      await navigator.clipboard.writeText(testoDaCopiare)
      setCopiato(id)
      setTimeout(() => setCopiato(''), 2500)
    } catch {
      setErrore('Copia non riuscita: copia a mano dal riquadro.')
    }
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Paga fornitore</h1>
          <p className="page-sub">
            Le coordinate del fornitore <strong>da pagare</strong>. Puoi scriverle a mano oppure
            farle leggere all&apos;AI da un messaggio o da un&apos;immagine: l&apos;IBAN viene
            sempre <strong>verificato</strong> col codice di controllo, e se non torna te lo dico.
            La richiesta parte poi verso Deluxy Partner, che approva e paga — da qui non esce
            denaro.
          </p>
        </div>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="griglia-impostazioni">
        {/* Lettura AI */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Leggi da messaggio o immagine</h2>
          <p className="descrizione">
            Incolla il messaggio del cliente, oppure carica la schermata della chat o la foto del
            bonifico. L&apos;AI compila i campi qui accanto; tu li controlli prima di salvare.
          </p>
          <label className="campo">
            <span>Messaggio</span>
            <textarea
              rows={5}
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              placeholder="Es: Le lascio l'IBAN IT60 X054 2811 1010 0000 0123 456 intestato a Mario Rossi, sono 150 euro"
            />
          </label>
          <label className="campo">
            <span>Immagine o file (schermata, foto, PDF)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              onChange={(e) => scegliImmagine(e.target.files?.[0] ?? null)}
            />
            {/* ⚠️⚠️ UN PDF QUI NON SI LEGGE, e lo si dice invece di lasciarlo
                caricare e fallire: il modello che usiamo legge immagini, non
                documenti. Un file scelto e poi ignorato in silenzio è il modo
                migliore per far credere che l'AI abbia «letto male». */}
            {immagine?.tipo === 'application/pdf' ? (
              <span className="cella-sub" style={{ color: 'var(--red)' }}>
                Un PDF da qui non lo so leggere: l’AI legge immagini. Fanne una schermata,
                oppure caricalo come <strong>ricevuta</strong> qui sotto, dove il PDF va benissimo.
              </span>
            ) : null}
          </label>
          {immagine ? (
            <p className="descrizione" style={{ marginTop: -6 }}>
              Immagine pronta: <strong>{immagine.nome}</strong>
            </p>
          ) : null}
          {/* ⚠️ Dove è atterrata l'ultima incollata, e come spostarla. Un
              allegato che finisce dove non te lo aspetti, in silenzio, si
              scopre solo dopo aver salvato — cioè troppo tardi. */}
          {incollata ? (
            <p className="descrizione" style={{ marginTop: -6 }}>
              Incollata come{' '}
              <strong>{incollata.come === 'ricevuta' ? 'ricevuta' : 'immagine da leggere'}</strong>.{' '}
              <button type="button" className="btn btn-secondario small" onClick={spostaIncollata}>
                No, è {incollata.come === 'ricevuta' ? 'da leggere' : 'la ricevuta'}
              </button>
            </p>
          ) : null}
          <button className="btn" onClick={leggiConAi} disabled={leggo}>
            {leggo ? 'Leggo…' : 'Leggi con l’AI'}
          </button>
        </div>

        {/* Modulo */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Coordinate</h2>
          {/* ⚠️ La ricerca sta PRIMA dei campi, non accanto: un IBAN sono
              ventisette caratteri copiati da una chat o da una foto, e
              ribatterli è il modo classico di sbagliarne uno — un bonifico
              parte lo stesso, verso un conto che non esiste o, peggio, che
              esiste. Se quel fornitore l'abbiamo già pagato, l'IBAN giusto ce
              l'abbiamo in casa: va offerto prima che qualcuno cominci a
              digitare, non dopo. */}
          <CercaFornitore cercaSubito={fornitoreDaOrdine} onScelto={usaFornitore} />

          {/* ── COME lo paghiamo ──
              ⚠️ Non tutti i fornitori si pagano con un bonifico: chi manda un
              link, chi dà un PayPal, chi si accorda a voce. Finché l'unica
              forma prevista era l'IBAN, tutto il resto non si registrava
              affatto — restava in una chat, e sull'ordine risultava che non
              avevamo pagato nessuno. */}
          <label className="campo">
            <span>Come si paga</span>
            <select
              value={metodo}
              onChange={(e) => {
                setMetodo(e.target.value as Metodo)
                setIbanNota('')
              }}
            >
              {METODI.map((m) => (
                <option key={m.chiave} value={m.chiave}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          <p className="cella-sub" style={{ marginTop: -4 }}>
            {METODI.find((m) => m.chiave === metodo)?.aiuto}
          </p>

          {metodo === 'iban' ? (
            <>
              <label className="campo">
                <span>IBAN</span>
                <input
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="IT60X0542811101000000123456"
                />
              </label>
              {ibanNota ? <div className="avviso-errore">{ibanNota}</div> : null}
            </>
          ) : (
            <label className="campo">
              <span>
                {metodo === 'link'
                  ? 'Link di pagamento'
                  : metodo === 'paypal'
                    ? 'Indirizzo PayPal'
                    : 'Com’è stato concordato'}
              </span>
              <input
                value={riferimento}
                onChange={(e) => setRiferimento(e.target.value)}
                placeholder={METODI.find((m) => m.chiave === metodo)?.segnaposto}
              />
              {/* ⚠️ Qui non c'è niente da verificare: il codice di controllo
                  esiste solo per gli IBAN. Si dice, invece di lasciare una
                  spunta verde che non vuol dire niente. */}
              <span className="cella-sub">
                Su questo non c’è un codice di controllo: la verifica vale solo per gli IBAN.
              </span>
            </label>
          )}
          <label className="campo">
            <span>Intestatario del conto</span>
            <input
              value={intestatario}
              onChange={(e) => setIntestatario(e.target.value)}
              placeholder="Mario Rossi"
            />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <label className="campo" style={{ flex: 1 }}>
              <span>Importo</span>
              <input
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                placeholder="150,00"
              />
            </label>
            <label className="campo" style={{ flex: 2 }}>
              <span>Causale</span>
              <input
                value={causale}
                onChange={(e) => setCausale(e.target.value)}
                placeholder="Ordine #1042"
              />
            </label>
          </div>

          {/* ── L'ORDINE ──
              ⚠️ Il campo esisteva in tabella ed era **sempre vuoto**: la pagina
              non lo mandava mai. Quindi di una richiesta salvata non si sapeva a
              quale ordine appartenesse — restava la causale scritta a mano, che
              non è un collegamento: non si può contare, non porta al cliente, e
              soprattutto non dice quanto valeva quell'ordine. Da cui: niente
              margine, che è la cosa che si voleva vedere. */}
          <ScegliOrdine
            numero={ordineScelto?.numero ?? ''}
            cercaDa={ordineDaUrl || causale}
            onScelto={(o) => {
              setOrdineScelto(o)
              setOrdineNumero(o.numero)
              // ⚠️ Il valore dell'ordine arriva da qui: è quello su cui si
              // calcola il margine.
              setValoreOrdine(o.totale || 0)
            }}
            onTolto={() => {
              setOrdineScelto(null)
              setOrdineNumero('')
            }}
          />
          {/* ── QUANTO CI RESTA ──
              ⚠️ Il conto si faceva a mente, o non si faceva. Chi compila una
              richiesta ha davanti due numeri — quanto ha incassato l'ordine e
              quanto ha promesso al fornitore — e la differenza fra i due è tutto
              il guadagno di quell'ordine. Non mostrarla vuol dire scoprire una
              cifra sbagliata a fine mese, quando non si può più discutere. */}
          {(() => {
            const m = calcolaMargine(
              valoreOrdine,
              Number(importo.replace(',', '.')),
              quotaPrevista
            )
            // ⚠️ Senza il valore dell'ordine non si inventa niente: si dice
            // perché il conto non si può fare.
            if (!m) {
              if (valoreOrdine > 0 || !importo.trim()) return null
              return (
                <p className="cella-sub">
                  Non so quanto vale l&apos;ordine, quindi non posso dirti che margine resta:
                  apri questa pagina dal bottone «Paga» di un ordine.
                </p>
              )
            }
            const f = frasiMargine(m)
            return (
              <div className={`margine margine-${m.verdetto}`}>
                <div className="margine-numeri">{f.riga}</div>
                <div className="margine-verdetto">
                  <strong>
                    {m.verdetto === 'ok'
                      ? '✓ '
                      : m.verdetto === 'senza-verdetto'
                        ? ''
                        : '⚠️ '}
                  </strong>
                  {f.verdetto}
                </div>
              </div>
            )
          })()}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => (modificoId ? void modifica(modificoId) : void salva())}
              disabled={!!cosaManca({ metodo, iban, riferimento, intestatario })}
              title={cosaManca({ metodo, iban, riferimento, intestatario }) || undefined}
            >
              {modificoId ? 'Salva la correzione' : 'Salva la richiesta'}
            </button>
            {modificoId ? (
              <button
                className="btn btn-secondario"
                onClick={() => {
                  setModificoId('')
                  setIban('')
                  setRiferimento('')
                  setIntestatario('')
                  setImporto('')
                  setCausale('')
                  setOrdineNumero('')
                  setOrdineScelto(null)
                  setAvviso('')
                }}
              >
                Lascia stare
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── IL POP-UP DELLA RICEVUTA ──
          ⚠️ Si apre premendo «Pagata»: la ricevuta si carica NEL momento in cui
          si registra il pagamento, non prima. Sceglierla in cima alla pagina e
          poi ricordarsi di premere la riga giusta è un passaggio in più che si
          sbaglia — e quando si sbaglia la ricevuta finisce sul pagamento di un
          altro fornitore.
          ⚠️ Si può confermare anche SENZA ricevuta: obbligarla vorrebbe dire
          che i pagamenti fatti al telefono, senza un documento in mano, non si
          registrano affatto. */}
      {chiedoPagata ? (
        <div
          className="velo-pagata"
          role="dialog"
          aria-modal="true"
          aria-label="Registra il pagamento"
          onClick={(e) => {
            // ⚠️ Si chiude solo cliccando FUORI dal riquadro: dentro si sta
            // compilando, e un clic finito male che butta via il file caricato
            // è il modo migliore per far ricominciare da capo.
            if (e.target === e.currentTarget) setChiedoPagata(null)
          }}
        >
          <div className="finestra-pagata">
            <h3 style={{ margin: 0 }}>Pagamento a {chiedoPagata.intestatario}</h3>
            <p className="cella-sub" style={{ margin: 0 }}>
              {[
                chiedoPagata.importo
                  ? chiedoPagata.importo.toLocaleString('it-IT', {
                      style: 'currency',
                      currency: chiedoPagata.valuta || 'EUR',
                    })
                  : 'importo non indicato',
                chiedoPagata.ordineNumero,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            <label className="campo">
              <span>Ricevuta (immagine o PDF)</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                onChange={(e) => scegliRicevuta(e.target.files?.[0] ?? null)}
                autoFocus
              />
            </label>
            {ricevuta ? (
              <p className="cella-sub" style={{ margin: 0 }}>
                {ricevuta.nome} ({pesoScritto(ricevuta.byte)})
              </p>
            ) : null}

            <label className="campo">
              <span>Da dove esce</span>
              <select value={pagatoCon} onChange={(e) => setPagatoCon(e.target.value)}>
                <option value="">non indicato</option>
                {USCITE.map((u) => (
                  <option key={u.chiave} value={u.chiave}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </label>

            {/* ⚠️ Si dice PRIMA che parte un messaggio al fornitore. Un avviso
                automatico scoperto dopo è la cosa che fa perdere fiducia in un
                bottone: la prossima volta non lo si preme più. */}
            <p className="cella-sub" style={{ margin: 0 }}>
              Premendo «Registra» avviso il fornitore che il pagamento è stato disposto, se
              abbiamo un suo recapito. Ti dico com&apos;è andata.
            </p>

            {errore ? <p className="errore-riga">{errore}</p> : null}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn"
                disabled={pagando === chiedoPagata.id}
                onClick={() => {
                  const id = chiedoPagata.id
                  void segnaPagata(id, true).then(() => setChiedoPagata(null))
                }}
              >
                {pagando === chiedoPagata.id ? 'Registro…' : 'Registra il pagamento'}
              </button>
              <button
                className="btn btn-secondario"
                onClick={() => setChiedoPagata(null)}
                disabled={pagando === chiedoPagata.id}
              >
                Lascia stare
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <h2 style={{ fontSize: 17, marginTop: 26 }}>Richieste salvate</h2>

      {/* ── LA RICEVUTA DEL PAGAMENTO ──
          ⚠️ Si sceglie QUI e poi si preme «Pagata» sulla riga giusta. Un campo
          file dentro ogni riga della tabella vorrebbe dire una tabella che su un
          telefono non si legge più; e la ricevuta si carica una volta ogni
          tanto, non su ogni riga.
          ⚠️ Si accettano immagini E PDF: la prova di un bonifico è quasi sempre
          un PDF della banca, e accettare solo le foto vorrebbe dire chiedere a
          qualcuno di fotografare uno schermo. */}
      <div className="riquadro-ricevuta">
        <label className="campo" style={{ margin: 0 }}>
          {/* ⚠️ La scorciatoia si SCRIVE: una funzione che nessuno sa che
              c'è non esiste, e questa si scoprirebbe solo per caso. */}
          <span>Ricevuta da allegare — o incollala con Ctrl+V (immagine o PDF)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            onChange={(e) => scegliRicevuta(e.target.files?.[0] ?? null)}
          />
        </label>
        {/* ── DA DOVE È USCITO IL DENARO ──
            ⚠️⚠️ Un bonifico non parte per forza da un'app nostra: quasi sempre
            esce dal portale della banca, a mano; a volte si paga in contanti
            alla consegna, o si scala da quello che quel fornitore ci deve.
            Costruire il registro dando per scontato un solo canale vuol dire
            descrivere un mondo che non esiste — e nessuno lo tiene aggiornato.
            ⚠️ Si può lasciare vuoto: «non indicato» è una risposta, indovinare
            il canale di un'uscita di denaro no. */}
        <label className="campo" style={{ margin: 0 }}>
          <span>Da dove esce (facoltativo)</span>
          <select value={pagatoCon} onChange={(e) => setPagatoCon(e.target.value)}>
            <option value="">non indicato</option>
            {USCITE.map((u) => (
              <option key={u.chiave} value={u.chiave}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
        {ricevuta ? (
          <p className="cella-sub">
            Pronta: <strong>{ricevuta.nome}</strong> ({pesoScritto(ricevuta.byte)}). Adesso premi
            «Pagata» sulla riga giusta e te la allego.
          </p>
        ) : (
          <p className="cella-sub">
            Facoltativa. Puoi segnare «pagata» anche senza — ma con la ricevuta, fra sei mesi,
            si sa <em>che cosa</em> è stato pagato e non solo che qualcuno l&apos;ha spuntato.
          </p>
        )}
      </div>
      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : richieste.length === 0 ? (
        <div className="vuoto">Nessuna richiesta salvata.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Come si paga</th>
                <th>Intestatario</th>
                <th className="num">Importo</th>
                <th className="num">Margine</th>
                <th>Ordine</th>
                <th>Causale</th>
                <th>Verifica</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {richieste.map((r) => (
                <tr key={r.id} className={r.pagataIl ? 'riga-pagata' : ''}>
                  {/* ⚠️ OGNI CELLA SI COPIA TOCCANDOLA. Il caso vero: un IBAN di
                      ventisette caratteri va incollato nel portale della banca.
                      Selezionarlo col dito su un telefono — trascinare le due
                      maniglie dentro una tabella che scorre di lato — non
                      riesce quasi mai, e chi ci prova finisce per ribatterlo. */}
                  <CellaCopiabile
                    testo={r.metodo === 'iban' ? r.iban : r.riferimentoPagamento}
                    monospazio={r.metodo === 'iban'}
                    titolo={`${nomeMetodo(r.metodo || 'iban')} — tocca per copiare`}
                    mostrato={
                      <>
                        {r.metodo && r.metodo !== 'iban' ? (
                          <span className="badge" style={{ marginRight: 6 }}>
                            {nomeMetodo(r.metodo)}
                          </span>
                        ) : null}
                        {r.metodo === 'iban' ? r.iban : r.riferimentoPagamento || '—'}
                      </>
                    }
                  />
                  <CellaCopiabile testo={r.intestatario} className="cella-nome" />
                  <CellaCopiabile
                    className="cella-num"
                    testo={r.importo ? String(r.importo).replace('.', ',') : ''}
                    mostrato={
                      r.importo
                        ? r.importo.toLocaleString('it-IT', {
                            style: 'currency',
                            currency: r.valuta,
                          })
                        : '—'
                    }
                  />
                  {/* ── IL MARGINE, RIGA PER RIGA ──
                      ⚠️ Nel modulo si vede solo quello che si sta scrivendo:
                      qui si vede lo storico, ed è dove ci si accorge che a un
                      fornitore diamo sistematicamente troppo. */}
                  <td className="cella-num">
                    {(() => {
                      // ⚠️ Più ordini con lo stesso numero: NON si mostra una
                      // percentuale, perché potrebbe essere di un altro ordine.
                      // Un margine sbagliato è peggio di nessun margine.
                      if (r.ordiniOmonimi > 1) {
                        return (
                          <span
                            className="cella-sub"
                            title={`Ci sono ${r.ordiniOmonimi} ordini col numero ${r.ordineNumero}, su negozi diversi: non so su quale calcolarlo.`}
                          >
                            più ordini
                          </span>
                        )
                      }
                      const m = calcolaMargine(r.valoreOrdine, r.importo, quotaPrevista)
                      // ⚠️ Senza il valore dell'ordine non si inventa niente.
                      if (!m) return <span className="cella-sub">—</span>
                      const f = frasiMargine(m)
                      return (
                        <span
                          className={`pillola-margine margine-${m.verdetto}`}
                          title={`${f.riga} ${f.verdetto}`}
                        >
                          {pct(m.marginePct)}
                        </span>
                      )
                    })()}
                  </td>
                  {/* L'ordine collegato: si apre, non si copia — di lì si va a
                      vedere di che si tratta. */}
                  <td className="cella-muta">
                    {r.ordineNumero ? (
                      <a
                        href={`/ordini-globali?q=${encodeURIComponent(r.ordineNumero.replace('#', ''))}`}
                        className="badge"
                      >
                        {r.ordineNumero}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <CellaCopiabile testo={r.causale} className="cella-muta" />
                  <td>
                    {/* ⚠️ Su un metodo che non è un bonifico non c'è niente da
                        verificare: il codice di controllo esiste solo per gli
                        IBAN. Un «da controllare» rosso su un link di pagamento
                        sarebbe un allarme per una riga che sta benissimo. */}
                    {r.metodo && r.metodo !== 'iban' ? (
                      <span className="cella-sub">non si verifica</span>
                    ) : r.ibanValido ? (
                      <span className="badge verde">valido</span>
                    ) : (
                      <span className="badge rosso">da controllare</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {/* ⚠️ «Pagata» viene PRIMA dello stato di Partner: è il
                        fatto che conta — il denaro è uscito — mentre l'altro
                        dice solo a che punto è la pratica. */}
                    {r.pagataIl ? (
                      <span
                        className="badge verde"
                        title={`Pagata il ${new Date(r.pagataIl).toLocaleString('it-IT')}${
                          r.pagataDaNome ? ` da ${r.pagataDaNome}` : ''
                        } — ${nomeUscita(r.pagatoCon)}`}
                      >
                        {/* ⚠️ Il canale si legge SULLA RIGA, non solo nel
                            titolo: «pagata» da solo non dice dove andare a
                            cercare quel movimento, e fra sei mesi è l'unica
                            cosa che serve davvero. */}
                        pagata{r.pagatoCon ? ` · ${nomeUscita(r.pagatoCon).toLowerCase()}` : ''}
                      </span>
                    ) : r.inviataIl ? (
                      <span
                        className="badge"
                        title={`Inviata il ${new Date(r.inviataIl).toLocaleString('it-IT')}`}
                      >
                        {STATI_PARTNER[r.partnerStato] ?? r.partnerStato ?? 'inviata'}
                      </span>
                    ) : (
                      <span className="badge rosso" title={r.esitoInvio || 'Non ancora inviata'}>
                        non inviata
                      </span>
                    )}
                    {r.ricevutaNome ? (
                      <span className="badge" style={{ marginLeft: 4 }} title={r.ricevutaNome}>
                        ricevuta ✓
                      </span>
                    ) : null}
                    {/* ── AVVISARE CHI ABBIAMO PAGATO ──
                        ⚠️⚠️ Il messaggio si PREPARA, non parte da solo: si apre
                        la chat col testo già scritto e lo manda una persona. Un
                        avviso automatico su un pagamento è una promessa fatta a
                        nome nostro senza che nessuno l'abbia riletta — e se la
                        riga era sbagliata l'abbiamo appena detto al fornitore.
                        ⚠️ Dice «disposto», non «arrivato»: fra i due ci sono
                        due o tre giorni lavorativi in cui il fornitore non lo
                        vede e richiama pensando a un errore. */}
                    {/* ⚠️ L'ESITO DELL'AVVISO, sulla riga. Un avviso
                        automatico di cui non si vede l'esito è peggio di
                        nessun avviso: si crede che il fornitore sappia, e
                        quello richiama lo stesso tre giorni dopo. */}
                    {r.avvisoIl && !r.avvisoEsito ? (
                      <span
                        className="badge verde"
                        style={{ marginLeft: 4 }}
                        title={`Avvisato per ${r.avvisoCanale} il ${new Date(r.avvisoIl).toLocaleString('it-IT')}`}
                      >
                        avvisato
                      </span>
                    ) : null}
                    {r.avvisoEsito ? (
                      <span className="badge rosso" style={{ marginLeft: 4 }} title={r.avvisoEsito}>
                        {/* ⚠️ Il MOTIVO sulla riga, non solo nel titolo: sul
                            telefono il passaggio del mouse non esiste, e «non
                            avvisato» da solo non dice se si risolve in dieci
                            secondi o se bisogna telefonare. */}
                        non avvisato · {perchePersoAvviso(r.avvisoEsito)}
                      </span>
                    ) : null}
                    {r.pagataIl ? (
                      <button
                        className="btn btn-secondario small"
                        style={{ marginLeft: 6 }}
                        onClick={() => {
                          const testo = messaggioPagato({
                            chi: r.intestatario,
                            importo: r.importo,
                            ordine: r.ordineNumero,
                            quando: new Date(r.pagataIl!),
                          })
                          void copia(testo, `avviso-${r.id}`)
                          setAvviso(
                            'Avviso copiato: incollalo nella chat del fornitore. Non parte da solo — lo rileggi e lo mandi tu.'
                          )
                        }}
                        title="Copia l’avviso di pagamento da mandare al fornitore"
                      >
                        {copiato === `avviso-${r.id}` ? 'Copiato ✓' : 'Avvisa'}
                      </button>
                    ) : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondario small"
                      onClick={() => versoPartner(r.id, r.inviataIl ? 'stato' : 'invia')}
                      title={
                        r.inviataIl ? 'Chiedi a Partner a che punto è' : 'Manda la richiesta a Partner'
                      }
                    >
                      {r.inviataIl ? 'Aggiorna' : 'Invia'}
                    </button>{' '}
                    {/* ⚠️ Correggere si può solo finché non è stata mandata a
                        chi approva: dopo, quello che c'è qui e quello che hanno
                        loro divergerebbero in silenzio — si leggerebbe un
                        importo e ne verrebbe pagato un altro. */}
                    {!r.inviataIl ? (
                      <>
                        <button
                          className="btn btn-secondario small"
                          onClick={() => apriPerModifica(r)}
                          title="Correggi questa richiesta"
                        >
                          Modifica
                        </button>{' '}
                      </>
                    ) : null}
                    <button
                      className={`btn small${r.pagataIl ? ' btn-secondario' : ''}`}
                      disabled={pagando === r.id}
                      onClick={() => {
                        if (r.pagataIl) {
                          void segnaPagata(r.id, false)
                          return
                        }
                        setRicevuta(null)
                        setPagatoCon('')
                        setChiedoPagata(r)
                      }}
                      title={
                        r.pagataIl
                          ? 'Toglie il segno «pagata». La ricevuta resta: è un documento.'
                          : 'Segna che il denaro è uscito. Se hai caricato una ricevuta qui sotto, la allega.'
                      }
                    >
                      {pagando === r.id ? '…' : r.pagataIl ? 'Non pagata' : 'Pagata'}
                    </button>{' '}
                    <button
                      className="btn btn-secondario small"
                      style={{ color: 'var(--red)' }}
                      onClick={() => elimina(r.id)}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
