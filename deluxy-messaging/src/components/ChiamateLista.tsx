'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChipsPeriodo } from './ChipsPeriodo'
import { nelPeriodo, type Periodo } from '@/lib/periodo'

// LE CHIAMATE RICEVUTE.
//
// Il centralino manda una notifica a chiamate@deluxy.it per ogni telefonata:
// qui diventano righe, con una domanda sola — **richiamato o no**.
//
// ⚠️⚠️ Perché non in Inbox: una chiamata non è un messaggio. Non c'è un testo da
// leggere né una risposta da scrivere, c'è una persona che voleva parlare e non
// ha parlato. In mezzo alle mail sarebbe finita in fondo a una colonna.

type Chiamata = {
  id: string
  quando: string
  numero: string
  numeroChiamato: string
  chiamante: string
  oggetto: string
  testo: string
  esito: 'ordine' | 'cliente' | 'sconosciuto'
  ordineId: string
  ordineNumero: string
  clienteNome: string
  email: string
  negozioId: string
  negozioNome: string
  richiamataIl: string | null
  richiamataDaNome: string
  esitoRichiamata: string
}

type Marchio = { negozioId: string; nome: string; daRichiamare: number; totale: number }

function quandoBreve(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Come si presenta chi ha chiamato.
 *
 * ⚠️⚠️ «NON è un nostro cliente» si scrive in chiaro e in rosso, e non è un
 * dettaglio grafico: chi richiama apre la bocca con «buongiorno, per il suo
 * ordine» e si trova davanti uno che non ha mai comprato niente. Sapere chi NON
 * si ha davanti vale quanto sapere chi si ha.
 */
function Riconoscimento({ c }: { c: Chiamata }) {
  if (c.esito === 'ordine') {
    return (
      <span className="badge verde" title="Ha un ordine aperto: la chiamata è attaccata a quello">
        {c.clienteNome || 'cliente'} · ordine {c.ordineNumero}
      </span>
    )
  }
  if (c.esito === 'cliente') {
    return (
      <span className="badge" title="Nostro cliente: ha già comprato, ma non ha ordini aperti">
        {c.clienteNome || 'cliente'} · ultimo ordine {c.ordineNumero}
      </span>
    )
  }
  return (
    <span
      className="badge rosso"
      title="Il numero non risulta fra i nostri clienti: va richiamato, ma non è un ordine"
    >
      Non risulta nostro cliente
    </span>
  )
}

export function ChiamateLista() {
  const [chiamate, setChiamate] = useState<Chiamata[]>([])
  const [perMarchio, setPerMarchio] = useState<Marchio[]>([])
  const [daRichiamare, setDaRichiamare] = useState(0)
  const [caricato, setCaricato] = useState(false)
  const [soloAperte, setSoloAperte] = useState(true)
  const [marchio, setMarchio] = useState('')
  // Ricerca e periodo (Libro v1.9 §8-bis). La ricerca filtra in memoria le
  // chiamate caricate; il periodo è su QUANDO HA SQUILLATO il telefono
  // (`quando`). ⚠️ Con una chip accesa si chiede al server la finestra a un
  // anno (`giorni=366`) invece dei 30 giorni di serie: una chip «Anno» sopra
  // una finestra di un mese mostrerebbe un anno con i buchi.
  const [q, setQ] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('')
  const [notifica, setNotifica] = useState('')
  const [esitoDi, setEsitoDi] = useState('')
  const [testoEsito, setTestoEsito] = useState('')
  const [numeroDi, setNumeroDi] = useState('')
  const [testoNumero, setTestoNumero] = useState('')
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (soloAperte) p.set('aperte', '1')
      if (marchio) p.set('negozio', marchio)
      if (periodo) p.set('giorni', '366')
      const res = await fetch(`/api/chiamate?${p}`, { cache: 'no-store' })
      const d = (await res.json().catch(() => ({}))) as {
        chiamate?: Chiamata[]
        perMarchio?: Marchio[]
        daRichiamare?: number
      }
      setChiamate(d.chiamate ?? [])
      setPerMarchio(d.perMarchio ?? [])
      setDaRichiamare(d.daRichiamare ?? 0)
    } catch {
      setErrore('Elenco non caricato: problema di rete.')
    } finally {
      setCaricato(true)
    }
  }, [soloAperte, marchio, periodo])

  useEffect(() => {
    void carica()
  }, [carica])

  async function segna(id: string) {
    setErrore('')
    try {
      const res = await fetch(`/api/chiamate/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ azione: 'richiamata', esito: testoEsito }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Non salvato.')
        return
      }
      setEsitoDi('')
      setTestoEsito('')
      await carica()
    } catch {
      setErrore('Non salvato: problema di rete.')
    }
  }

  async function salvaNumero(id: string) {
    setErrore('')
    try {
      const res = await fetch(`/api/chiamate/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ azione: 'numero', numero: testoNumero }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Numero non salvato.')
        return
      }
      setNumeroDi('')
      setTestoNumero('')
      await carica()
    } catch {
      setErrore('Numero non salvato: problema di rete.')
    }
  }

  // Il filtro in memoria: periodo su `quando`, ricerca sui campi con cui si
  // riconosce la chiamata.
  const cercato = q.trim().toLowerCase()
  const visibili = chiamate.filter((c) => {
    if (!nelPeriodo(c.quando, periodo)) return false
    if (!cercato) return true
    return [c.numero, c.chiamante, c.clienteNome, c.ordineNumero, c.negozioNome, c.oggetto]
      .join(' ')
      .toLowerCase()
      .includes(cercato)
  })

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Chiamate</h1>
          <p className="page-sub">
            Le telefonate che arrivano su <code>chiamate@deluxy.it</code>. Ogni chiamata apre un
            promemoria <strong>«richiamare»</strong> in Oggi, e quando il numero è di un cliente
            con un ordine aperto <strong>si vede anche sull&apos;ordine</strong>. Se il numero non
            è nostro, la riga lo dice: si richiama lo stesso, ma sapendo che non c&apos;è nessun
            ordine di cui parlare.
          </p>
        </div>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="kpi-riga" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: daRichiamare ? '#c93400' : undefined }}>
            {daRichiamare}
          </div>
          <div className="kpi-etichetta">Da richiamare</div>
        </div>
        {/* ⚠️ Le colonne per MARCHIO sono la richiesta: «registri le notifiche
            per brand». Il marchio di una chiamata si sa dall'ordine del
            chiamante o dal nostro numero che ha squillato — quando non si sa,
            la riga sta in «Senza marchio» invece di finire in un brand a caso. */}
        {perMarchio.map((m) => (
          <button
            key={m.negozioId || 'senza'}
            className="kpi"
            onClick={() => setMarchio(marchio === m.negozioId ? '' : m.negozioId)}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              borderColor: marchio === m.negozioId ? 'var(--oro)' : undefined,
            }}
            title={`${m.totale} chiamate in tutto · clicca per filtrare`}
          >
            <div className="kpi-valore" style={{ color: m.daRichiamare ? '#c93400' : undefined }}>
              {m.daRichiamare}
            </div>
            <div className="kpi-etichetta">{m.nome}</div>
          </button>
        ))}
      </div>

      {/* La ricerca (Libro v1.9 §8-bis): come si riconosce una chiamata — il
          numero, chi era, l'ordine o il marchio. Filtra le chiamate caricate. */}
      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per numero, cliente, ordine o marchio…"
          aria-label="Cerca chiamate"
        />
      </div>

      {/* Le scorciatoie di periodo (Libro v1.9 §8-bis): su quando ha squillato
          il telefono. */}
      <ChipsPeriodo valore={periodo} cambia={setPeriodo} campo="la data della chiamata" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button
          className={`btn ${soloAperte ? '' : 'btn-secondario'} small`}
          onClick={() => setSoloAperte(true)}
        >
          Da richiamare
        </button>
        <button
          className={`btn ${soloAperte ? 'btn-secondario' : ''} small`}
          onClick={() => setSoloAperte(false)}
        >
          {/* ⚠️ Con una chip di periodo accesa la finestra non è più di 30
              giorni: scriverlo mentirebbe. */}
          {periodo ? 'Tutte' : 'Tutte (30 giorni)'}
        </button>
        {marchio ? (
          <button className="btn btn-secondario small" onClick={() => setMarchio('')}>
            Togli il filtro marchio
          </button>
        ) : null}
      </div>

      {!caricato ? (
        <p className="colonna-vuota">Carico…</p>
      ) : visibili.length === 0 ? (
        <p className="colonna-vuota">
          {cercato || periodo
            ? 'Nessuna chiamata corrisponde ai filtri.'
            : soloAperte
              ? 'Nessuno da richiamare.'
              : 'Nessuna chiamata registrata.'}
        </p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {visibili.map((c) => (
            <div key={c.id} className="chiamata">
              {/* ⚠️ Ora e marchio sulla STESSA riga: sono due parole corte, e su
                  un telefono ogni blocco che si prende una riga sua costa 20px
                  moltiplicati per il numero di chiamate. */}
              <div className="chiamata-quando">
                <span>{quandoBreve(c.quando)}</span>
                <span className="chiamata-marchio">{c.negozioNome || 'senza marchio'}</span>
              </div>

              <div className="chiamata-numero">
                {c.numero ? (
                  <a href={`tel:${c.numero}`}>{c.numero}</a>
                ) : (
                  // ⚠️ Numero non riconosciuto: non si inventa. Si dice, e si dà
                  // il modo di scriverlo leggendo la notifica qui sotto.
                  <span className="chiamata-senza-numero">numero non riconosciuto</span>
                )}
                {c.numeroChiamato ? (
                  <span className="cella-sub"> · ha chiamato il {c.numeroChiamato}</span>
                ) : null}
              </div>

              <div className="chiamata-chi">
                <Riconoscimento c={c} />
                {c.richiamataIl ? (
                  <div className="cella-sub" style={{ marginTop: 4 }}>
                    Richiamato il {quandoBreve(c.richiamataIl)}
                    {c.richiamataDaNome ? ` da ${c.richiamataDaNome}` : ''}
                    {c.esitoRichiamata ? ` — ${c.esitoRichiamata}` : ''}
                  </div>
                ) : null}
              </div>

              {/* ⚠️ «Richiamato» PRIMO e pieno: è l'unica cosa che si fa davvero
                  su questa riga. Gli altri due sono contorno, e «Correggi
                  numero» è finito dentro la notifica — è la via d'eccezione, e
                  da telefono i suoi 133px mandavano i bottoni a capo. */}
              <div className="chiamata-azioni">
                {!c.richiamataIl ? (
                  <button className="btn small" onClick={() => setEsitoDi(esitoDi === c.id ? '' : c.id)}>
                    Richiamato
                  </button>
                ) : null}
                {c.ordineId ? (
                  <a
                    className="btn btn-secondario small"
                    href={`/ordini?apri=${encodeURIComponent(c.ordineId)}`}
                  >
                    Ordine {c.ordineNumero}
                  </a>
                ) : null}
                <button
                  className="btn btn-secondario small"
                  onClick={() => {
                    setNotifica(notifica === c.id ? '' : c.id)
                    setTestoNumero(c.numero)
                    setNumeroDi('')
                  }}
                  title="Il testo della notifica, come è arrivato"
                >
                  Notifica
                </button>
              </div>

              {esitoDi === c.id ? (
                <div className="chiamata-pannello">
                  <input
                    placeholder="Com'è andata (facoltativo)"
                    value={testoEsito}
                    onChange={(e) => setTestoEsito(e.target.value)}
                  />
                  <button className="btn small" onClick={() => void segna(c.id)}>
                    Salva
                  </button>
                </div>
              ) : null}

              {notifica === c.id ? (
                <div className="chiamata-pannello chiamata-notifica">
                  <div className="cella-sub">{c.oggetto}</div>
                  {/* ⚠️ Il testo della notifica si conserva e si mostra: il
                      riconoscimento del numero è un'interpretazione, e quando
                      sbaglia l'unica difesa di chi guarda è leggere quello che è
                      arrivato davvero. */}
                  <pre>{c.testo || '(la notifica non aveva testo)'}</pre>
                  {numeroDi === c.id ? (
                    <div className="chiamata-pannello">
                      <input
                        placeholder="+39 349 885 3209"
                        value={testoNumero}
                        onChange={(e) => setTestoNumero(e.target.value)}
                      />
                      <button className="btn small" onClick={() => void salvaNumero(c.id)}>
                        Salva e riconosci
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondario small"
                      onClick={() => setNumeroDi(c.id)}
                      style={{ marginTop: 8 }}
                    >
                      Il numero è sbagliato: correggilo
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
