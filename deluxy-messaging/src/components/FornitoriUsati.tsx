'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { linkOrdine } from '@/lib/link-ordine'
import { nomeMetodo } from '@/lib/metodo-pagamento'
import type { EsitoFornitoriUsati, FornitorePagato, PagamentoAlFornitore } from '@/lib/fornitori-usati'

// A CHI ABBIAMO PAGATO, E QUANTO.
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «metti solo fornitori a cui abbiamo
// fatto pagamenti e l'importo totale dei pagamenti fatti». L'elenco dei partner
// qui accanto dice CHI ESISTE (lo legge dal registro Anagrafiche); questa dice
// **a chi sono usciti i soldi**, e la seconda non si ricava dalla prima.
//
// ⚠️ «Pagato» vuol dire pagato: le richieste ancora aperte non entrano nel
// totale — fra il salvataggio e il bonifico passano giorni, e contarle come
// denaro uscito direbbe che abbiamo speso quello che dobbiamo ancora spendere.
// Ma si DICONO, perché un elenco che tace su una richiesta aperta si legge come
// «con lui abbiamo chiuso».

function euro(v: number, valuta = 'EUR'): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

function giorno(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * Il margine di UN pagamento, in percentuale.
 *
 * ⚠️ `null` quando non sappiamo quanto ha pagato il cliente, e allora si scrive
 * «—»: una percentuale calcolata su un valore che non conosciamo è un numero
 * inventato che sembra un dato, ed è accanto a cifre che sono uscite dalla banca.
 */
function marginePct(p: PagamentoAlFornitore): number | null {
  if (!p.valoreOrdine || !p.importo) return null
  return ((p.valoreOrdine - p.importo) / p.valoreOrdine) * 100
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
    // ⚠️ Si cerca anche nei NUMERI D'ORDINE e nelle causali: la domanda vera è
    // spesso «chi abbiamo pagato per il 2799?», non «dov'è Passiflora».
    return f.filter(
      (x) =>
        x.nome.toLowerCase().includes(t) ||
        x.altriNomi.some((n) => n.toLowerCase().includes(t)) ||
        x.pagamenti.some(
          (p) =>
            p.ordineNumero.toLowerCase().includes(t) ||
            p.cliente.toLowerCase().includes(t) ||
            p.causale.toLowerCase().includes(t)
        )
    )
  }, [dati, q])

  function apriChiudi(k: string) {
    setAperti((p) => {
      const n = new Set(p)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }

  const valuta = dati?.valuteDiverse?.[0] ?? 'EUR'
  const piuValute = (dati?.valuteDiverse?.length ?? 0) > 1

  return (
    <>
      <p className="page-sub">
        I fornitori a cui abbiamo <strong>pagato</strong> qualcosa, con il totale di quello che è
        uscito. Viene dalle richieste di pagamento di quest&apos;app, segnate come pagate: non è
        una copia della contabilità, è quello che questa app ha registrato.
      </p>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* ⚠️⚠️ Valute diverse: NON si somma. Un totale unico su due valute è un
          numero che non esiste, e sarebbe il tipo di numero che qualcuno porta
          in una riunione. */}
      {piuValute ? (
        <div className="avviso-errore">
          Ci sono pagamenti in {dati?.valuteDiverse.join(', ')}: i totali qui sotto sommano importi
          di valute diverse e <strong>non vanno letti come una cifra sola</strong>.
        </div>
      ) : null}

      <div className="kpi-riga">
        <div className="kpi">
          <span className="kpi-etichetta">Fornitori pagati</span>
          <span className="kpi-valore">{dati?.fornitori.length ?? 0}</span>
        </div>
        <div className="kpi">
          <span className="kpi-etichetta">Totale pagato</span>
          <span className="kpi-valore">{euro(dati?.totalePagato ?? 0, valuta)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-etichetta">Pagamenti fatti</span>
          <span className="kpi-valore">{dati?.pagamenti ?? 0}</span>
        </div>
        <div className="kpi">
          {/* ⚠️ Le aperte NON sono nel totale: sono soldi che dobbiamo ancora
              far uscire, e sommarle direbbe che li abbiamo già fatti uscire. */}
          <span className="kpi-etichetta">Ancora da pagare</span>
          <span className="kpi-valore">{euro(dati?.importoAperte ?? 0, valuta)}</span>
        </div>
      </div>

      {dati && dati.aperte > 0 ? (
        <p className="cella-sub" style={{ marginTop: -8, marginBottom: 14 }}>
          ⚠️ {dati.aperte} {dati.aperte === 1 ? 'richiesta' : 'richieste'} per{' '}
          {euro(dati.importoAperte, valuta)} {dati.aperte === 1 ? 'è' : 'sono'} ancora da pagare:{' '}
          {dati.aperte === 1 ? 'non è' : 'non sono'} in questo elenco e{' '}
          {dati.aperte === 1 ? 'non entra' : 'non entrano'} nel totale.{' '}
          <a href="/pagamenti">Vedile in Pagamenti</a>.
        </p>
      ) : null}

      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un fornitore, un numero d’ordine, una causale…"
          aria-label="Cerca fra i fornitori pagati"
        />
        {q ? (
          <button className="btn btn-secondario" onClick={() => setQ('')}>
            Azzera
          </button>
        ) : null}
      </div>

      {!caricato ? (
        <div className="vuoto">Conto quanto è uscito e a chi…</div>
      ) : filtrati.length === 0 ? (
        <div className="vuoto">
          {q
            ? `Nessun fornitore e nessun pagamento per «${q}».`
            : 'Nessun pagamento a fornitori risulta ancora fatto.'}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Fornitore</th>
                <th className="num">Pagamenti</th>
                <th className="num">Totale pagato</th>
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
    </>
  )
}

function RigaFornitore({
  f,
  aperto,
  onApri,
}: {
  f: FornitorePagato
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
            // righe unite in una sembrano un errore.
            <div className="cella-sub">scritto anche: {f.altriNomi.join(' · ')}</div>
          ) : null}
        </td>
        <td className="num">{f.pagamenti.length}</td>
        <td className="num">
          <strong>{euro(f.totalePagato, f.valuta)}</strong>
        </td>
        <td>{giorno(f.ultimoIl)}</td>
        <td className="num">
          <button className="btn btn-secondario small" onClick={onApri} aria-expanded={aperto}>
            {aperto ? 'Chiudi' : `Dettaglio (${f.pagamenti.length})`}
          </button>
        </td>
      </tr>
      {aperto ? (
        <tr>
          {/* ⚠️⚠️ NIENTE TABELLA DENTRO LA TABELLA. Una `<table>` dentro un `<td>`
              non ha una larghezza contro cui restringersi, quindi
              `overflow-x: auto` non si accende mai: la cella cresce e basta.
              Misurato a 375px sulla prima versione di questa schermata: tabella
              interna larga 564 dentro una cella da 373, e tutta la pagina
              scorreva di lato. Qui ogni pagamento è un blocco che VA A CAPO —
              largo sta in fila, stretto si impila — e ogni valore porta la sua
              etichetta, così non servono intestazioni sopra. */}
          <td colSpan={5} className="ordini-fornitore">
            {f.pagamenti.map((p) => {
              const m = marginePct(p)
              return (
                <div className="ordine-riga" key={p.id}>
                  <span className="ordine-numero">
                    {p.ordineNumero ? (
                      <a href={linkOrdine(p.ordineNumero)} target="_blank" rel="noreferrer">
                        {p.ordineNumero}
                      </a>
                    ) : (
                      // ⚠️ Un pagamento senza ordine collegato non è un errore
                      // (un canone, un rimborso spese): si dice com'è.
                      <span className="cella-sub">senza ordine</span>
                    )}
                  </span>
                  <span className="ordine-dove">
                    {[p.negozio, p.cliente].filter(Boolean).join(' · ') ||
                      p.causale ||
                      '—'}
                  </span>
                  <span className="ordine-dato">
                    <span className="cella-sub">pagato</span>{' '}
                    <strong>{euro(p.importo, p.valuta)}</strong>
                  </span>
                  <span className="ordine-dato">
                    <span className="cella-sub">venduto</span>{' '}
                    {p.valoreOrdine ? euro(p.valoreOrdine, p.valuta) : <em>non indicato</em>}
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
                    <span className="cella-sub">{giorno(p.pagatoIl)}</span>{' '}
                    {p.pagatoCon || nomeMetodo(p.metodo)}
                    {p.pagatoDa ? ` · ${p.pagatoDa}` : ''}
                  </span>
                  {/* ⚠️⚠️ Il fornitore dell'ordine diverso da chi abbiamo pagato
                      è la cosa più importante di questa riga: o l'ordine è
                      sbagliato, o il bonifico è andato a qualcun altro. Non si
                      nasconde in un sottotitolo grigio. */}
                  {p.fornitoreDellOrdine ? (
                    <span className="ordine-dato">
                      <strong style={{ color: '#c93400' }}>
                        ⚠️ sull’ordine risulta «{p.fornitoreDellOrdine}»
                      </strong>
                    </span>
                  ) : null}
                </div>
              )
            })}
          </td>
        </tr>
      ) : null}
    </>
  )
}
