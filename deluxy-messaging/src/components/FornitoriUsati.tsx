'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { linkOrdine } from '@/lib/link-ordine'
import type { EsitoFornitoriUsati, FornitoreUsato, OrdineDelFornitore } from '@/lib/fornitori-usati'

// CHI HA PREPARATO CHE COSA.
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «una sezione fornitori dove fai vedere
// quali fornitori sono stati utilizzati per quali ordini». L'elenco dei partner
// qui accanto dice CHI ESISTE (lo legge dal registro Anagrafiche); questa dice
// CHI HA LAVORATO, e la seconda non si ricava dalla prima.
//
// ⚠️⚠️ E DICE SUBITO QUANTO POCO SA. Su 1.380 ordini, 22 dicono chi li ha
// preparati. Una tabella con ventidue righe e nient'altro si legge «abbiamo
// usato ventidue fornitori»: è falso, e il numero grande accanto è l'unica cosa
// che lo impedisce ([[trappola-percentuale-senza-la-sua-base]]).

function euro(v: number, valuta = 'EUR'): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

function giorno(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * Il margine di UN ordine, in percentuale.
 *
 * ⚠️ `null` quando manca uno dei due numeri, e allora si scrive «—»: una
 * percentuale calcolata su un valore che non conosciamo è un numero inventato
 * che sembra un dato, ed è accanto a cifre che vanno in banca.
 */
function marginePct(o: OrdineDelFornitore): number | null {
  if (!o.valore || o.costo == null) return null
  return ((o.valore - o.costo) / o.valore) * 100
}

export function FornitoriUsati() {
  const [dati, setDati] = useState<EsitoFornitoriUsati | null>(null)
  const [errore, setErrore] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [q, setQ] = useState('')
  // ⚠️ Le schede aperte sono un INSIEME e non un id solo: confrontare due
  // fornitori vuol dire vederli aperti insieme, ed è il gesto per cui questa
  // pagina esiste.
  const [aperti, setAperti] = useState<Set<string>>(new Set())

  const carica = useCallback(async () => {
    setErrore('')
    try {
      const res = await fetch('/api/fornitori/usati')
      // ⚠️ Senza sessione il middleware NON risponde 401: fa un 307 verso
      // /login, che `fetch` segue restituendo HTML con stato 200. Guardare solo
      // `res.ok` direbbe «va tutto bene» su una pagina di login.
      if (res.redirected || !(res.headers.get('content-type') ?? '').includes('json')) {
        setErrore('Sessione scaduta: ricarica la pagina e rientra.')
        return
      }
      const d = (await res.json().catch(() => ({}))) as EsitoFornitoriUsati & { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Elenco non disponibile.')
        return
      }
      setDati(d)
    } catch {
      setErrore('Elenco non raggiungibile: problema di rete.')
    } finally {
      setCaricato(true)
    }
  }, [])

  useEffect(() => {
    carica()
  }, [carica])

  const filtrati = useMemo(() => {
    const f = dati?.fornitori ?? []
    const t = q.trim().toLowerCase()
    if (!t) return f
    // ⚠️ Si cerca anche nei NUMERI D'ORDINE e negli altri modi in cui il nome è
    // stato scritto: la domanda vera è spesso «chi ha fatto il 2799?», non «dov'è
    // Passiflora».
    return f.filter(
      (x) =>
        x.nome.toLowerCase().includes(t) ||
        x.citta.toLowerCase().includes(t) ||
        x.altriNomi.some((n) => n.toLowerCase().includes(t)) ||
        x.ordini.some((o) => o.numero.toLowerCase().includes(t) || o.cliente.toLowerCase().includes(t))
    )
  }, [dati, q])

  const totali = useMemo(() => {
    const f = dati?.fornitori ?? []
    return {
      fornitori: f.length,
      ordini: f.reduce((s, x) => s + x.ordini.length, 0),
      speso: f.reduce((s, x) => s + x.totaleCosto, 0),
      muti: f.reduce((s, x) => s + x.senzaCosto, 0),
    }
  }, [dati])

  function apriChiudi(k: string) {
    setAperti((p) => {
      const n = new Set(p)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }

  const scoperti = dati ? dati.ordiniTotali - dati.ordiniConFornitore : 0
  const pctCoperti = dati && dati.ordiniTotali ? (dati.ordiniConFornitore / dati.ordiniTotali) * 100 : 0

  return (
    <>
      <p className="page-sub">
        Chi ha <strong>preparato</strong> i nostri ordini, e quali. Il dato lo scrive il riquadro
        «chi prepara quest&apos;ordine» sulla scheda dell&apos;ordine, e i pagamenti aggiungono
        quello che l&apos;ordine non dice: qui non si ricopia niente da altre app.
      </p>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* ── QUANTO SAPPIAMO ──
          ⚠️⚠️ Sta PRIMA della tabella e non dopo, ed è l'unica ragione per cui
          questa pagina non mente: ventidue righe senza «su 1.380» si leggono
          come «abbiamo usato ventidue fornitori». */}
      {dati && scoperti > 0 ? (
        <div className="avviso-errore" style={{ background: 'var(--gold-soft)', color: 'var(--gold-strong)', borderColor: 'var(--gold)' }}>
          <strong>
            {dati.ordiniConFornitore} ordini su {dati.ordiniTotali} dicono chi li ha preparati
            ({pctCoperti.toFixed(1)}%).
          </strong>{' '}
          Gli altri <strong>{scoperti}</strong> un fornitore l&apos;hanno avuto, ma non è scritto
          da nessuna parte: di quelli non si può sapere né chi ha lavorato né quanto è costato.
          Si riempie dalla scheda dell&apos;ordine, nel riquadro «chi prepara quest&apos;ordine».
        </div>
      ) : null}

      <div className="kpi-riga">
        <div className="kpi">
          <span className="kpi-etichetta">Fornitori usati</span>
          <span className="kpi-valore">{totali.fornitori}</span>
        </div>
        <div className="kpi">
          <span className="kpi-etichetta">Ordini preparati</span>
          <span className="kpi-valore">{totali.ordini}</span>
        </div>
        <div className="kpi">
          <span className="kpi-etichetta">Dato ai fornitori</span>
          <span className="kpi-valore">{euro(totali.speso)}</span>
        </div>
        <div className="kpi">
          {/* ⚠️ Gli ordini senza costo non valgono zero: valgono «non lo so», e
              sommarli come zero farebbe leggere un totale più basso del vero. */}
          <span className="kpi-etichetta">Senza costo scritto</span>
          <span className="kpi-valore">{totali.muti}</span>
        </div>
      </div>

      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un fornitore, un numero d’ordine, un cliente…"
          aria-label="Cerca fra i fornitori usati"
        />
        {q ? (
          <button className="btn btn-secondario" onClick={() => setQ('')}>
            Azzera
          </button>
        ) : null}
      </div>

      {!caricato ? (
        <div className="vuoto">Conto chi ha preparato che cosa…</div>
      ) : filtrati.length === 0 ? (
        <div className="vuoto">
          {q
            ? `Nessun fornitore e nessun ordine per «${q}».`
            : 'Nessun ordine dice ancora chi lo ha preparato.'}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Fornitore</th>
                <th>Dove</th>
                <th className="num">Ordini</th>
                <th className="num">Dato a lui</th>
                <th>Ultimo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrati.map((f) => (
                <RigaFornitore
                  key={f.chiave}
                  f={f}
                  aperto={aperti.has(f.chiave)}
                  onApri={() => apriChiudi(f.chiave)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dati && dati.soloDaPagamento > 0 ? (
        <p className="cella-sub" style={{ marginTop: 12 }}>
          ⚠️ {dati.soloDaPagamento}{' '}
          {dati.soloDaPagamento === 1 ? 'riga viene' : 'righe vengono'} solo dalla richiesta di
          pagamento: sull&apos;ordine il fornitore non è scritto, quindi la cifra è quella del
          bonifico e non il costo concordato — e potrebbe essere un acconto.
        </p>
      ) : null}
    </>
  )
}

function RigaFornitore({
  f,
  aperto,
  onApri,
}: {
  f: FornitoreUsato
  aperto: boolean
  onApri: () => void
}) {
  return (
    <>
      <tr>
        <td>
          <strong>{f.nome}</strong>
          {f.altriNomi.length ? (
            // ⚠️ Gli altri modi in cui è stato scritto si DICONO: senza, due
            // righe unite sembrano un errore («SO'FLEUR» e «So Fleur» sono uno).
            <div className="cella-sub">scritto anche: {f.altriNomi.join(' · ')}</div>
          ) : null}
        </td>
        <td>{f.citta || <span className="cella-sub">non indicata</span>}</td>
        <td className="num">{f.ordini.length}</td>
        <td className="num">
          {f.totaleCosto ? euro(f.totaleCosto) : <span className="cella-sub">—</span>}
          {f.senzaCosto ? (
            <div className="cella-sub">{f.senzaCosto} senza costo</div>
          ) : null}
        </td>
        <td>{giorno(f.ultimoIl)}</td>
        <td className="num">
          <button className="btn btn-secondario small" onClick={onApri} aria-expanded={aperto}>
            {aperto ? 'Chiudi' : `Ordini (${f.ordini.length})`}
          </button>
        </td>
      </tr>
      {aperto ? (
        <tr>
          {/* ⚠️⚠️ NIENTE TABELLA DENTRA LA TABELLA. La prima versione metteva qui
              una `<table>` con le sue intestazioni, ed era sbagliata in un modo
              che si vede solo misurando: una tabella dentro un `<td>` **non ha
              una larghezza contro cui restringersi**, quindi `overflow-x: auto`
              non si accende mai — la cella cresce e basta. Misurato a 375px:
              la tabella interna larga 564 dentro una cella da 373, e **tutta la
              pagina scorreva di lato** (389 contro 375). E anche quando funziona
              è uno scorrimento dentro uno scorrimento, che sul telefono nessuno
              governa.
              Adesso ogni ordine è un blocco che VA A CAPO: su uno schermo largo
              i campi stanno in fila, su uno stretto si impilano. Nessuna
              seconda barra di scorrimento, e le intestazioni non servono perché
              ogni valore porta la sua etichetta. */}
          <td colSpan={6} className="ordini-fornitore">
            {f.ordini.map((o) => {
              const m = marginePct(o)
              return (
                <div className="ordine-riga" key={`${o.id}-${o.numero}`}>
                  <span className="ordine-numero">
                    <a href={linkOrdine(o.numero)} target="_blank" rel="noreferrer">
                      {o.numero}
                    </a>
                    {o.annullato ? <span className="badge">annullato</span> : null}
                    {o.fonte === 'pagamento' ? (
                      <span className="badge">solo dal pagamento</span>
                    ) : null}
                  </span>
                  <span className="ordine-dove">
                    {[o.negozio, o.cliente].filter(Boolean).join(' · ') || '—'}
                  </span>
                  <span className="ordine-dato">
                    <span className="cella-sub">venduto</span>{' '}
                    {o.valore ? euro(o.valore, o.valuta) : <em>non indicato</em>}
                  </span>
                  <span className="ordine-dato">
                    <span className="cella-sub">al fornitore</span>{' '}
                    {o.costo == null ? <em>non scritto</em> : euro(o.costo, o.valuta)}
                  </span>
                  <span className="ordine-dato">
                    <span className="cella-sub">margine</span>{' '}
                    {m == null ? (
                      <em>—</em>
                    ) : (
                      <strong style={{ color: m < 0 ? '#c93400' : undefined }}>
                        {m.toFixed(0)}%
                      </strong>
                    )}
                  </span>
                  <span className="ordine-dato">
                    <span className="cella-sub">registrato</span> {giorno(o.registratoIl)}
                    {o.registratoDa ? ` da ${o.registratoDa}` : ''}
                  </span>
                </div>
              )
            })}
          </td>
        </tr>
      ) : null}
    </>
  )
}
