'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { FONTI, SOGGETTI_VOCE, etichettaSoglia, nomeFonte } from '@/lib/punteggi'
import { nomeColpa } from '@/lib/reclami'

// LA PAGELLA di valet e partner. Il punteggio non è una formula fissa: è la media
// pesata delle VOCI configurate qui sotto. Ogni riga si può aprire per vedere da
// cosa nasce il numero, voce per voce.

type Fascia = { chiave: string; nome: string; colore: string }
type Sotto = {
  voceId: string
  nome: string
  fonte: string
  peso: number
  valore: number | null
  dettaglio: string
}
type Pagella = {
  tipo: string
  id: string
  nome: string
  punteggio: number | null
  fascia: Fascia | null
  sotto: Sotto[]
  vociUsate: number
  vociSenzaDati: number
  copertura: number
  attendibile: boolean
}
type Voce = {
  id: string
  nome: string
  descrizione: string
  soggetto: string
  fonte: string
  peso: number
  soglia: number
  attiva: boolean
}

const VOCE_VUOTA = {
  id: '',
  nome: '',
  descrizione: '',
  soggetto: 'tutti',
  fonte: 'manuale',
  peso: 2,
  soglia: 0,
  attiva: true,
}

export function PunteggiLista() {
  const [pagelle, setPagelle] = useState<Pagella[]>([])
  const [voci, setVoci] = useState<Voce[]>([])
  const [registroNota, setRegistroNota] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [tipo, setTipo] = useState('')
  // Di default si mostrano solo i soggetti su cui abbiamo prove sufficienti:
  // con 41 partner in registro, l'elenco completo è quasi tutto "da misurare".
  const [soloValutabili, setSoloValutabili] = useState(true)
  const [valutabili, setValutabili] = useState(0)
  const [totale, setTotale] = useState(0)
  const [aperta, setAperta] = useState('') // "tipo:id" della riga espansa
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [configAperta, setConfigAperta] = useState(false)
  const [bozza, setBozza] = useState<typeof VOCE_VUOTA>(VOCE_VUOTA)

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams(tipo ? { tipo } : {})
      if (soloValutabili) p.set('soloValutabili', '1')
      const [rp, rv] = await Promise.all([
        fetch('/api/punteggi?' + p.toString()),
        fetch('/api/punteggi/voci'),
      ])
      if (rp.ok) {
        const d = (await rp.json()) as {
          pagelle: Pagella[]
          registroNota: string
          valutabili: number
          totale: number
        }
        setPagelle(d.pagelle)
        setRegistroNota(d.registroNota ?? '')
        setValutabili(d.valutabili ?? 0)
        setTotale(d.totale ?? 0)
      }
      if (rv.ok) setVoci(((await rv.json()) as { voci: Voce[] }).voci)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [tipo, soloValutabili])

  useEffect(() => {
    carica()
  }, [carica])

  async function creaIniziali() {
    setOccupato(true)
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/punteggi/voci/iniziali', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as { aggiunte?: number; saltate?: number }
      setAvviso(
        `Voci di partenza: ${d.aggiunte ?? 0} aggiunte` + (d.saltate ? `, ${d.saltate} già presenti.` : '.')
      )
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    } finally {
      setOccupato(false)
    }
  }

  async function salvaVoce() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/punteggi/voci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bozza.id ? bozza : { ...bozza, id: undefined }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Salvataggio non riuscito.')
        return
      }
      setAvviso(bozza.id ? 'Voce aggiornata.' : 'Voce aggiunta.')
      setBozza(VOCE_VUOTA)
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    }
  }

  async function eliminaVoce(id: string) {
    await fetch('/api/punteggi/voci?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  async function salvaManuale(p: Pagella, voceId: string, valore: string) {
    setErrore('')
    const num = Number(valore)
    try {
      if (valore.trim() === '') {
        // Svuotare = "nessun dato", che è diverso da zero.
        const q = new URLSearchParams({ voceId, soggettoTipo: p.tipo, soggettoId: p.id })
        await fetch('/api/punteggi/manuale?' + q.toString(), { method: 'DELETE' })
      } else {
        const res = await fetch('/api/punteggi/manuale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voceId, soggettoTipo: p.tipo, soggettoId: p.id, valore: num }),
        })
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { errore?: string }
          setErrore(d.errore || 'Valore non salvato.')
          return
        }
      }
      await carica()
    } catch {
      setErrore('Valore non salvato: problema di rete.')
    }
  }

  const vociManuali = voci.filter((v) => v.fonte === 'manuale' && v.attiva)
  const totaleVociAttive = voci.filter((v) => v.attiva).length

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Punteggi</h1>
          <p className="page-sub">
            La pagella di valet e partner. Il punteggio è la media pesata delle voci che imposti tu:
            i reclami ricevuti, i feedback dei clienti, la puntualità delle consegne e qualunque
            altra variabile vuoi aggiungere. Dal peggiore al migliore.
          </p>
        </div>
        <button className="btn btn-secondario" onClick={() => setConfigAperta(!configAperta)}>
          {configAperta ? 'Chiudi le voci' : `Voci e pesi (${totaleVociAttive})`}
        </button>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}
      {registroNota ? <div className="avviso-errore">{registroNota}</div> : null}

      {voci.length === 0 && caricato ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Non c&apos;è ancora nessuna voce</h2>
          <p className="descrizione">
            Senza voci non c&apos;è punteggio. Parti da quelle consigliate — <strong>Reclami</strong>{' '}
            e <strong>Feedback dei clienti</strong> per tutti, <strong>Puntualità</strong> per i
            valet, più una variabile a mano d&apos;esempio per i partner — poi cambiane pesi e soglie
            come vuoi.
          </p>
          <button className="btn" onClick={creaIniziali} disabled={occupato}>
            {occupato ? 'Creo…' : 'Crea le voci di partenza'}
          </button>
        </div>
      ) : null}

      {/* Configurazione delle voci */}
      {configAperta ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginTop: 0 }}>Voci del punteggio</h2>
          <p className="descrizione">
            Ogni voce dà un valore da 0 a 100; il punteggio finale è la loro media pesata. Il{' '}
            <strong>peso</strong> è un numero puro: contano solo i rapporti (peso 4 conta il doppio
            di peso 2). Peso <strong>0</strong> = la voce resta ma non entra nel conto. Una voce
            <strong> senza dati</strong> per un soggetto viene esclusa, non contata come zero.
          </p>

          {voci.length ? (
            <div className="tabella-wrap" style={{ marginBottom: 20 }}>
              <table>
                <thead>
                  <tr>
                    <th>Voce</th>
                    <th>Si applica a</th>
                    <th>Fonte</th>
                    <th className="num">Peso</th>
                    <th>Soglia</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {voci.map((v) => (
                    <tr key={v.id} style={v.attiva ? undefined : { opacity: 0.55 }}>
                      <td>
                        <div className="cella-nome">{v.nome}</div>
                        {v.descrizione ? <div className="cella-sub">{v.descrizione}</div> : null}
                      </td>
                      <td className="cella-muta">
                        {SOGGETTI_VOCE.find((s) => s.chiave === v.soggetto)?.nome ?? v.soggetto}
                      </td>
                      <td className="cella-muta">{nomeFonte(v.fonte)}</td>
                      <td className="cella-num">{v.peso}</td>
                      <td className="cella-muta">
                        {etichettaSoglia(v.fonte) ? (
                          <>
                            {v.soglia}
                            <div className="cella-sub">{etichettaSoglia(v.fonte)}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          className="btn btn-secondario small"
                          onClick={() =>
                            setBozza({
                              id: v.id,
                              nome: v.nome,
                              descrizione: v.descrizione,
                              soggetto: v.soggetto,
                              fonte: v.fonte,
                              peso: v.peso,
                              soglia: v.soglia,
                              attiva: v.attiva,
                            })
                          }
                        >
                          Modifica
                        </button>{' '}
                        <button
                          className="btn btn-secondario small"
                          style={{ color: 'var(--red)' }}
                          onClick={() => eliminaVoce(v.id)}
                        >
                          Elimina
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* Nuova / modifica voce */}
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>
            {bozza.id ? 'Modifica voce' : 'Aggiungi una voce'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Nome</span>
              <input
                value={bozza.nome}
                onChange={(e) => setBozza({ ...bozza, nome: e.target.value })}
                placeholder="Cura del confezionamento"
              />
            </label>
            <label className="campo">
              <span>Si applica a</span>
              <select
                value={bozza.soggetto}
                onChange={(e) => setBozza({ ...bozza, soggetto: e.target.value })}
              >
                {SOGGETTI_VOCE.map((s) => (
                  <option key={s.chiave} value={s.chiave}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Peso</span>
              <input
                type="number"
                min={0}
                value={bozza.peso}
                onChange={(e) => setBozza({ ...bozza, peso: Number(e.target.value) })}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Da dove prende il dato</span>
              <select
                value={bozza.fonte}
                onChange={(e) => setBozza({ ...bozza, fonte: e.target.value })}
              >
                {FONTI.map((f) => (
                  <option key={f.chiave} value={f.chiave}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
            {etichettaSoglia(bozza.fonte) ? (
              <label className="campo">
                <span>{etichettaSoglia(bozza.fonte)}</span>
                <input
                  type="number"
                  min={0}
                  value={bozza.soglia}
                  onChange={(e) => setBozza({ ...bozza, soglia: Number(e.target.value) })}
                />
              </label>
            ) : (
              <div />
            )}
          </div>
          <p className="descrizione" style={{ marginTop: -4 }}>
            {FONTI.find((f) => f.chiave === bozza.fonte)?.aiuto}
          </p>
          <label className="campo">
            <span>Descrizione</span>
            <input
              value={bozza.descrizione}
              onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
              placeholder="A cosa serve questa voce"
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={bozza.attiva}
              onChange={(e) => setBozza({ ...bozza, attiva: e.target.checked })}
            />
            <span>Attiva</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={salvaVoce} disabled={!bozza.nome}>
              {bozza.id ? 'Salva modifiche' : 'Aggiungi voce'}
            </button>
            {bozza.id ? (
              <button className="btn btn-secondario" onClick={() => setBozza(VOCE_VUOTA)}>
                Annulla
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="barra-ricerca">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo soggetto">
          <option value="">Valet e partner</option>
          <option value="valet">Solo valet</option>
          <option value="partner">Solo partner</option>
        </select>
        <select
          value={soloValutabili ? '1' : ''}
          onChange={(e) => setSoloValutabili(e.target.value === '1')}
          aria-label="Chi mostrare"
        >
          <option value="1">Solo chi ha prove sufficienti</option>
          <option value="">Tutti, anche i non valutabili</option>
        </select>
      </div>

      {caricato && totale > 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
          {valutabili} su {totale} {totale === 1 ? 'soggetto ha' : 'soggetti hanno'} prove
          sufficienti per un giudizio
          {totale - valutabili > 0
            ? ` — sugli altri ${totale - valutabili} manca troppo: registra feedback o consegne in `
            : '.'}
          {totale - valutabili > 0 ? (
            <a href="/reclami/feedback" style={{ textDecoration: 'underline' }}>
              Feedback e orari
            </a>
          ) : null}
          {totale - valutabili > 0 ? '.' : ''}
        </p>
      ) : null}

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : pagelle.length === 0 ? (
        <div className="vuoto">
          Nessun soggetto in pagella. Compaiono qui i valet e i partner attivi: aggiungi un valet o
          collega il registro Anagrafiche.
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Soggetto</th>
                <th className="num">Punteggio</th>
                <th>Giudizio</th>
                <th>Su cosa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagelle.map((p) => {
                const chiave = `${p.tipo}:${p.id}`
                const espansa = aperta === chiave
                return (
                  <Fragment key={chiave}>
                    <tr>
                      <td>
                        <div className="cella-nome">{p.nome}</div>
                        <div className="cella-sub">{nomeColpa(p.tipo)}</div>
                      </td>
                      <td
                        className="cella-num"
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          // Un numero su prove scarse si mostra, ma non si urla.
                          color: p.attendibile ? undefined : 'var(--text-tertiary)',
                        }}
                        title={p.attendibile ? '' : 'Prove insufficienti: leggi il dettaglio'}
                      >
                        {p.punteggio === null ? (
                          <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>—</span>
                        ) : (
                          p.punteggio
                        )}
                      </td>
                      <td>
                        {p.fascia ? (
                          <span className="badge" style={{ color: p.fascia.colore, fontWeight: 600 }}>
                            {p.fascia.nome}
                          </span>
                        ) : p.punteggio === null ? (
                          <span className="cella-muta">nessun dato</span>
                        ) : (
                          // C'è un numero ma copre troppo poco per farne un
                          // giudizio: dirlo è più utile che scrivere "Ottimo".
                          <span
                            className="badge"
                            style={{ color: 'var(--text-secondary)' }}
                            title={`Solo il ${Math.round(p.copertura * 100)}% di quello che conta è stato misurato`}
                          >
                            Da valutare
                          </span>
                        )}
                      </td>
                      <td className="cella-muta">
                        {/* Su quante voci si basa il giudizio: un punteggio alto
                            costruito su una voce sola vale meno di uno su tre. */}
                        {p.punteggio === null
                          ? 'niente da misurare'
                          : `${p.vociUsate} ${p.vociUsate === 1 ? 'voce' : 'voci'} su ${
                              p.vociUsate + p.vociSenzaDati
                            } · ${Math.round(p.copertura * 100)}% del peso`}
                        {p.vociSenzaDati > 0 && p.punteggio !== null ? (
                          <div
                            className="cella-sub"
                            style={{ color: p.attendibile ? 'var(--gold-strong)' : 'var(--red)' }}
                          >
                            {p.attendibile
                              ? p.vociSenzaDati === 1
                                ? '1 voce senza dati, esclusa'
                                : `${p.vociSenzaDati} voci senza dati, escluse`
                              : 'troppo poco per dare un giudizio'}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          className="btn btn-secondario small"
                          onClick={() => setAperta(espansa ? '' : chiave)}
                        >
                          {espansa ? 'Chiudi' : 'Dettaglio'}
                        </button>
                      </td>
                    </tr>
                    {espansa ? (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--fill)' }}>
                          <div style={{ padding: '4px 0 8px' }}>
                            <strong style={{ fontSize: 13 }}>Da cosa nasce il punteggio</strong>
                            <table style={{ width: '100%', marginTop: 8, fontSize: 13 }}>
                              <tbody>
                                {p.sotto.map((s) => (
                                  <tr key={s.voceId}>
                                    <td style={{ padding: '4px 8px 4px 0' }}>{s.nome}</td>
                                    <td
                                      className="cella-muta"
                                      style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}
                                    >
                                      peso {s.peso}
                                    </td>
                                    <td
                                      style={{
                                        padding: '4px 8px',
                                        textAlign: 'right',
                                        fontVariantNumeric: 'tabular-nums',
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {s.valore === null ? (
                                        <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                                          esclusa
                                        </span>
                                      ) : (
                                        s.valore
                                      )}
                                    </td>
                                    <td className="cella-muta" style={{ padding: '4px 8px' }}>
                                      {s.dettaglio}
                                    </td>
                                    <td style={{ padding: '4px 0 4px 8px' }}>
                                      {/* Le voci manuali si impostano da qui */}
                                      {s.fonte === 'manuale' ? (
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          defaultValue={s.valore ?? ''}
                                          placeholder="0-100"
                                          onBlur={(e) => salvaManuale(p, s.voceId, e.target.value)}
                                          title="Scrivi un valore da 0 a 100, o svuota per togliere il dato"
                                          style={{
                                            width: 80,
                                            padding: '4px 8px',
                                            border: '1px solid var(--hairline-strong)',
                                            borderRadius: 8,
                                            font: 'inherit',
                                            fontSize: 12.5,
                                          }}
                                        />
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {vociManuali.length === 0 ? null : (
                              <p className="descrizione" style={{ margin: '8px 0 0' }}>
                                I valori delle voci a mano si scrivono nella colonna a destra
                                (0-100). Svuotare la casella toglie il dato: la voce viene esclusa,
                                che non è come metterla a zero.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
