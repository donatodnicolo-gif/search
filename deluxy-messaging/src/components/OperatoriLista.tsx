'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// Quanto lavoro ha fatto ciascun operatore, nel periodo scelto.
//
// ⚠️⚠️ I confini del periodo si calcolano QUI, nel browser, e si mandano al
// server come istanti. Sembra un dettaglio e non lo è: il server su Vercel sta
// a UTC, e «oggi» calcolato là comincerebbe alle 02:00 italiane — due ore di
// lavoro di ogni mattina finirebbero nel giorno prima, senza che nulla desse
// errore.
//
// ⚠️ Il periodo risolto si scrive sempre a schermo («21 ago 00:00 → adesso»).
// «Trimestre» vuol dire cose diverse per persone diverse: mostrarlo toglie
// l'unica ambiguità che resterebbe.

type Riga = {
  utenteId: string
  nome: string
  ruolo: string
  uscito: boolean
  ordiniPresi: number
  ordiniChiusi: number
  chatPrese: number
  chatRisposte: number
  messaggiInviati: number
  linkPagamento: number
  ordiniCreati: number
  /** Il margine generato, letto da Deluxy Orders (netto IVA). */
  margine: number
  ordiniConMargine: number
  ordiniSenzaMargine: number
  giorniLavorati: number
}

type Esito = {
  da: string
  a: string
  righe: Riga[]
  daQuando: { chiave: string; il: string | null }[]
  /** Perché il totale dei margini potrebbe non essere completo. */
  notaMargini?: string
}

// ⚠️ `ordiniConMargine` e `ordiniSenzaMargine` NON sono colonne: sono il
// contorno del margine, e messe in tabella sarebbero due colonne di numeri che
// nessuno sa leggere. Si mostrano sotto la cifra del margine.
type ChiaveMisura = Exclude<
  keyof Riga,
  'utenteId' | 'nome' | 'ruolo' | 'uscito' | 'giorniLavorati' | 'ordiniConMargine' | 'ordiniSenzaMargine'
>

const COLONNE: { chiave: ChiaveMisura; nome: string; spiega: string }[] = [
  {
    chiave: 'ordiniPresi',
    nome: 'Ordini presi',
    spiega: 'Ordini di cui si è preso carico: il bollino col suo nome sulla bacheca.',
  },
  {
    chiave: 'ordiniChiusi',
    nome: 'Ordini chiusi',
    spiega:
      'Ordini portati a «Gestito», cioè tolti dalla lista di lavoro. Vale l’ultimo cambio di stato: se qualcuno riapre l’ordine, quella chiusura non si conta più a nessuno.',
  },
  {
    chiave: 'chatPrese',
    nome: 'Chat prese',
    spiega: 'Conversazioni di cui si è preso carico in Inbox.',
  },
  {
    chiave: 'chatRisposte',
    nome: 'Chat risposte',
    spiega:
      'Conversazioni diverse in cui ha scritto almeno un messaggio. È la misura più onesta di «quante chat ha seguito»: prendere in carico è un clic, rispondere è il lavoro.',
  },
  {
    chiave: 'messaggiInviati',
    nome: 'Messaggi inviati',
    spiega:
      'Messaggi partiti col suo nome, su tutti i canali. Le risposte automatiche non contano: nascono senza operatore, apposta.',
  },
  {
    chiave: 'linkPagamento',
    nome: 'Link di pagamento',
    spiega:
      'Ordini creati da «Nuovo ordine» col link di pagamento da mandare al cliente, invece che già pagati.',
  },
  {
    chiave: 'ordiniCreati',
    nome: 'Ordini creati',
    spiega: 'Tutti gli ordini creati al telefono: sia col link di pagamento, sia già pagati.',
  },
  {
    chiave: 'margine',
    nome: 'Margine generato',
    spiega:
      'La somma dei margini degli ordini a cui ha assegnato il fornitore nel periodo. Il margine è quello di Deluxy Orders, al netto IVA: qui si legge, non si rifà. Va a chi sceglie il fornitore, perché è lì che si decide il costo; le assegnazioni fatte dalla riconciliazione automatica non contano per nessuno. Gli ordini senza costo scritto non valgono zero e restano fuori dal totale.',
  },
]

// ── I PERIODI ──
//
// ⚠️ «Mese», «trimestre» e «anno» sono di CALENDARIO (dal primo del mese, del
// trimestre, dell'anno); «7 giorni» e «30 giorni» sono mobili, a ritroso da
// adesso. È la differenza che rende utili tutti e due: il mese è quello che si
// chiude in contabilità, i 30 giorni sono quanto si è lavorato ultimamente.
type ChiavePeriodo =
  | 'oggi'
  | 'ieri'
  | 'g7'
  | 'mese'
  | 'g30'
  | 'trimestre'
  | 'anno'
  | 'personalizzato'

const PERIODI: { chiave: ChiavePeriodo; nome: string }[] = [
  { chiave: 'oggi', nome: 'Oggi' },
  { chiave: 'ieri', nome: 'Ieri' },
  { chiave: 'g7', nome: '7 giorni' },
  { chiave: 'mese', nome: 'Questo mese' },
  { chiave: 'g30', nome: '30 giorni' },
  { chiave: 'trimestre', nome: 'Trimestre' },
  { chiave: 'anno', nome: 'Anno' },
  { chiave: 'personalizzato', nome: 'Date a scelta' },
]

function mezzanotte(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** L'intervallo di un periodo: `da` incluso, `a` escluso. */
function intervallo(p: ChiavePeriodo, dal: string, al: string): { da: Date; a: Date } | null {
  const ora = new Date()
  const oggi = mezzanotte(ora)
  const piuGiorni = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)

  switch (p) {
    case 'oggi':
      return { da: oggi, a: ora }
    case 'ieri':
      // ⚠️ Ieri è il giorno INTERO di ieri, non «le ultime 24 ore»: chi chiede
      // «ieri quanto ha fatto» vuole un giorno chiuso, da confrontare con altri.
      return { da: piuGiorni(oggi, -1), a: oggi }
    case 'g7':
      return { da: piuGiorni(oggi, -6), a: ora }
    case 'g30':
      return { da: piuGiorni(oggi, -29), a: ora }
    case 'mese':
      return { da: new Date(ora.getFullYear(), ora.getMonth(), 1), a: ora }
    case 'trimestre':
      return { da: new Date(ora.getFullYear(), Math.floor(ora.getMonth() / 3) * 3, 1), a: ora }
    case 'anno':
      return { da: new Date(ora.getFullYear(), 0, 1), a: ora }
    case 'personalizzato': {
      if (!dal || !al) return null
      const da = new Date(`${dal}T00:00:00`)
      // ⚠️ Il giorno finale è COMPRESO: chi scrive «dal 1 al 15» intende anche
      // il 15. Si prende quindi la mezzanotte del 16 come confine escluso —
      // altrimenti l'ultimo giorno sparirebbe e nessuno se ne accorgerebbe.
      const a = piuGiorni(new Date(`${al}T00:00:00`), 1)
      if (Number.isNaN(da.getTime()) || Number.isNaN(a.getTime()) || a <= da) return null
      return { da, a }
    }
  }
}

const GIORNO_MESE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }

function quandoBreve(d: Date, finePeriodo = false): string {
  const oggi = mezzanotte(new Date())
  const suoGiorno = mezzanotte(d)
  const aMezzanotte = d.getHours() === 0 && d.getMinutes() === 0
  const data = d.toLocaleDateString('it-IT', {
    ...GIORNO_MESE,
    ...(d.getFullYear() === oggi.getFullYear() ? {} : { year: 'numeric' }),
  })
  if (finePeriodo && suoGiorno.getTime() === oggi.getTime() && !aMezzanotte) return 'adesso'
  if (aMezzanotte) return data
  return `${data} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function OperatoriLista({ amministratore }: { amministratore: boolean }) {
  const [periodo, setPeriodo] = useState<ChiavePeriodo>('g7')
  /**
   * Totali oppure media per giornata lavorata.
   *
   * ⚠️ «Al giorno» rende confrontabili persone che lavorano un numero diverso
   * di giorni: senza, chi c'è due giorni su sette risulta sempre l'ultimo. Ma
   * il totale resta il modo predefinito, perché è il numero che non ha bisogno
   * di essere spiegato.
   */
  const [alGiorno, setAlGiorno] = useState(false)
  const [dal, setDal] = useState(iso(new Date(Date.now() - 6 * 86400000)))
  const [al, setAl] = useState(iso(new Date()))
  const [esito, setEsito] = useState<Esito | null>(null)
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState('')

  const finestra = useMemo(() => intervallo(periodo, dal, al), [periodo, dal, al])

  const carica = useCallback(async () => {
    if (!finestra) {
      setErrore('Scegli due date: la fine deve venire dopo l’inizio.')
      return
    }
    setCaricando(true)
    setErrore('')
    const p = new URLSearchParams({
      da: finestra.da.toISOString(),
      a: finestra.a.toISOString(),
      // ⚠️ Il fuso serve al server per sapere dove comincia un giorno: senza,
      // i giorni lavorati si conterebbero a UTC.
      fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome',
    })
    try {
      const res = await fetch('/api/operatori?' + p.toString())
      const d = (await res.json()) as Esito & { errore?: string }
      if (!res.ok) {
        setErrore(d.errore ?? 'Non sono riuscito a leggere i numeri.')
        setEsito(null)
      } else {
        setEsito(d)
      }
    } catch {
      setErrore('Non sono riuscito a leggere i numeri: riprova.')
    } finally {
      setCaricando(false)
    }
  }, [finestra])

  useEffect(() => {
    if (amministratore) void carica()
  }, [carica, amministratore])

  const daQuando = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const d of esito?.daQuando ?? []) m.set(d.chiave, d.il)
    return m
  }, [esito])

  if (!amministratore) {
    return (
      <main>
        <h1 className="page-title">Operatori</h1>
        <div className="card" style={{ maxWidth: 640 }}>
          <p className="descrizione" style={{ marginBottom: 0 }}>
            Questa pagina mette a confronto il lavoro dei colleghi, e la vede solo un{' '}
            <strong>amministratore</strong>. Il tuo è un account operatore: puoi usare tutta
            l’app, ma non guardare i numeri di chi lavora con te.
          </p>
        </div>
      </main>
    )
  }

  const totali = COLONNE.map((c) =>
    (esito?.righe ?? []).reduce((s, r) => s + (r[c.chiave] as number), 0)
  )
  const tuttoVuoto = totali.every((t) => t === 0)
  // ⚠️ Per la riga «Tutti» il divisore è la somma delle giornate di tutti, non
  // il numero di giorni del periodo: se tre persone lavorano lo stesso giorno,
  // quel giorno vale tre giornate di lavoro.
  const giornateTotali = (esito?.righe ?? []).reduce((s, r) => s + r.giorniLavorati, 0)

  /**
   * Il numero da mettere in cella.
   *
   * ⚠️ **Zero giornate non fa zero: fa «—».** Dividere per zero darebbe
   * `Infinity` o `NaN` a schermo, e un numero impossibile in una tabella di
   * prestazioni è peggio di una cella vuota.
   * ⚠️ Una cifra dopo la virgola e non due: «2,3 ordini al giorno» è una
   * media, e la seconda cifra darebbe una precisione che il dato non ha.
   */
  function cella(valore: number, giornate: number, euro = false) {
    // ⚠️⚠️ Il margine è DENARO e va scritto come denaro: «81,97 €», non «81,97»
    // in mezzo a colonne di conteggi. Un numero senza unità in una tabella di
    // numeri si legge come «ordini», ed è la lettura sbagliata più facile.
    const scrivi = (n: number) =>
      euro
        ? n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
        : n.toLocaleString('it-IT')
    if (!alGiorno) {
      return valore === 0 ? <span className="cella-muta">—</span> : scrivi(valore)
    }
    if (!giornate || valore === 0) return <span className="cella-muta">—</span>
    if (euro) return scrivi(valore / giornate)
    return (valore / giornate).toLocaleString('it-IT', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Operatori</h1>
          <p className="page-sub">
            Quanto lavoro ha fatto ciascuno nel periodo scelto: ordini presi e chiusi, chat
            seguite, messaggi partiti col suo nome, link di pagamento mandati ai clienti.
          </p>
        </div>
      </div>

      <div className="filtri">
        <span className="etichetta-ordina">Periodo</span>
        {PERIODI.map((p) => (
          <button
            key={p.chiave}
            className={periodo === p.chiave ? 'bottone mini' : 'bottone secondario mini'}
            onClick={() => setPeriodo(p.chiave)}
          >
            {p.nome}
          </button>
        ))}
        {/* ⚠️ L'interruttore sta ACCANTO ai periodi e non altrove: «7 giorni» e
            «al giorno» si leggono insieme, e separarli farebbe confondere il
            periodo con il divisore. */}
        <span className="etichetta-ordina" style={{ marginLeft: 12 }}>
          Come
        </span>
        <button
          className={!alGiorno ? 'bottone mini' : 'bottone secondario mini'}
          onClick={() => setAlGiorno(false)}
        >
          Totali
        </button>
        <button
          className={alGiorno ? 'bottone mini' : 'bottone secondario mini'}
          onClick={() => setAlGiorno(true)}
          title="Diviso i giorni in cui quella persona ha fatto almeno una cosa"
        >
          Al giorno
        </button>
        {periodo === 'personalizzato' ? (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input
              type="date"
              value={dal}
              max={al || undefined}
              onChange={(e) => setDal(e.target.value)}
              aria-label="Dal giorno"
            />
            <span className="cella-sub">al</span>
            <input
              type="date"
              value={al}
              min={dal || undefined}
              onChange={(e) => setAl(e.target.value)}
              aria-label="Al giorno (compreso)"
            />
          </span>
        ) : null}
      </div>

      {/* ⚠️ Il periodo risolto, sempre a schermo: «trimestre» non vuol dire la
          stessa cosa per tutti, e un numero senza il suo intervallo davanti si
          confronta con quello sbagliato. */}
      <p className="descrizione" style={{ marginTop: -8 }}>
        {finestra ? (
          <>
            Dal <strong>{quandoBreve(finestra.da)}</strong> a{' '}
            <strong>{quandoBreve(finestra.a, true)}</strong>
            {periodo === 'personalizzato' ? ' (ultimo giorno compreso)' : ''}.
          </>
        ) : (
          'Scegli le due date.'
        )}
        {caricando ? ' · conto…' : ''}
      </p>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* ⚠️⚠️ Se il totale dei margini è parziale — perché nel periodo ci sono
          più ordini del tetto, o perché Orders non ha risposto su qualcuno — si
          DICE, sopra la tabella. Un parziale che sembra completo, in una pagina
          di numeri con cui si giudicano delle persone, è la cosa peggiore. */}
      {esito?.notaMargini ? (
        <p className="cella-sub" style={{ color: 'var(--red)' }}>
          ⚠️ {esito.notaMargini}
        </p>
      ) : null}

      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              {/* ⚠️⚠️ Il DIVISORE si vede sempre, anche coi totali: una media
                  senza il suo denominatore davanti non si può controllare, e
                  un numero che non si può controllare in una tabella di
                  prestazioni non andrebbe mostrato affatto. */}
              <th className="cella-num" title="I giorni in cui quella persona ha fatto almeno una cosa, nel periodo. Non i giorni di calendario: chi c'è stato due giorni su sette non deve risultare lento per i cinque in cui non c'era.">
                Giorni
              </th>
              {COLONNE.map((c) => (
                <th key={c.chiave} className="cella-num" title={c.spiega}>
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(esito?.righe ?? []).map((r) => (
              <tr key={r.utenteId}>
                <td>
                  <div className="cella-nome">{r.nome}</div>
                  <div className="cella-sub">
                    {r.uscito
                      ? 'non ha più un accesso — i suoi numeri restano'
                      : r.ruolo === 'admin'
                        ? 'amministratore'
                        : 'operatore'}
                  </div>
                </td>
                <td className="cella-num">
                  {r.giorniLavorati === 0 ? (
                    <span className="cella-muta">—</span>
                  ) : (
                    r.giorniLavorati
                  )}
                </td>
                {COLONNE.map((c) => (
                  <td key={c.chiave} className="cella-num">
                    {cella(r[c.chiave] as number, r.giorniLavorati, c.chiave === 'margine')}
                    {/* ⚠️ Gli ordini di cui NON si sa il margine si dicono
                        sotto la cifra: un totale che tace quello che non sa
                        vale meno di uno che lo ammette. */}
                    {c.chiave === 'margine' && r.ordiniSenzaMargine ? (
                      <div className="cella-sub">{r.ordiniSenzaMargine} senza costo</div>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
            {esito && esito.righe.length > 1 ? (
              <tr>
                <td className="cella-nome">Tutti</td>
                <td className="cella-num cella-nome">
                  {giornateTotali === 0 ? <span className="cella-muta">—</span> : giornateTotali}
                </td>
                {totali.map((t, i) => (
                  <td key={COLONNE[i].chiave} className="cella-num cella-nome">
                    {cella(t, giornateTotali)}
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {esito && tuttoVuoto ? (
        <p className="descrizione" style={{ marginTop: 12 }}>
          In questo periodo non risulta niente. Prima di leggerlo come «non ha lavorato
          nessuno», guarda qui sotto da quando ciascuna misura esiste.
        </p>
      ) : null}

      {/* ⚠️ QUESTO RIQUADRO NON È UNA NOTA A PIÈ DI PAGINA: è quello che rende
          leggibili gli zeri. Una colonna che ha cominciato a misurare ieri
          mostra zero su tutto il trimestre, e senza questa riga sembrerebbe una
          persona che non ha fatto niente. */}
      <div className="card" style={{ marginTop: 20, maxWidth: 900 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Che cosa si conta, e da quando</h2>
        <p className="descrizione">
          Si contano solo i gesti che lasciano un nome nel database. Leggere una chat, cercare
          un ordine, aiutare un collega al telefono non lasciano traccia e{' '}
          <strong>non sono qui dentro</strong>: questa pagina misura il lavoro che si può
          contare, non quanto vale una persona.
        </p>
        <ul className="descrizione" style={{ paddingLeft: 18, marginBottom: 0 }}>
          {COLONNE.map((c) => {
            const il = daQuando.get(c.chiave)
            return (
              <li key={c.chiave} style={{ marginBottom: 6 }}>
                <strong>{c.nome}</strong> — {c.spiega}{' '}
                {il ? (
                  <em>
                    Si misura dal{' '}
                    {new Date(il).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    .
                  </em>
                ) : (
                  <em>Non è ancora successo mai.</em>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
