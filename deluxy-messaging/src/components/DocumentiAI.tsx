'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AMBITI, nomeAmbito } from '@/lib/cs-ai'

// ⚠️ I formati sono ricopiati qui e NON importati da `@/lib/documenti-ai`: quel
// modulo tira dentro pdf-parse e mammoth, che sono roba da server. Importarlo da
// un componente client se li porterebbe nel bundle del browser — megabyte per
// scrivere una riga di testo.
const FORMATI = ['PDF', 'Word (.docx)', 'testo (.txt, .md)', '.csv', '.html']

// I documenti da cui l'AI ricava le istruzioni: manuale del servizio clienti,
// brand voice, regole di consegna.
//
// ⚠️ Il giro è caricare → far leggere → SCEGLIERE. Il documento non diventa
// un'istruzione da solo, e non viene allegato a ogni risposta: da trenta pagine
// si tengono poche regole, approvate da una persona.

export type Brand = { id: string; nome: string }

type Documento = {
  id: string
  nome: string
  tipo: string
  dimensione: number
  pagine: number
  nota: string
  caratteri: number
  assaggio: string
  creatoIl: string
  negozio: Brand | null
  _count: { istruzioni: number }
}

type Proposta = {
  titolo: string
  categoria: string
  testo: string
  ambito: string
  citazione: string
}

const peso = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

export function DocumentiAI({ brand, onCambio }: { brand: Brand[]; onCambio: () => void }) {
  const [documenti, setDocumenti] = useState<Documento[]>([])
  const [caricato, setCaricato] = useState(false)
  const [caricando, setCaricando] = useState(false)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')
  const [negozioId, setNegozioId] = useState('')
  const [nota, setNota] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Le proposte dell'AI, per documento. Vivono solo qui finché non si salvano.
  const [apertoId, setApertoId] = useState('')
  const [leggendo, setLeggendo] = useState(false)
  const [proposte, setProposte] = useState<Proposta[]>([])
  const [scelte, setScelte] = useState<Set<number>>(new Set())
  const [avvisoLettura, setAvvisoLettura] = useState('')

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/cs-ai/documenti')
      if (!res.ok) return
      const d = (await res.json()) as { documenti: Documento[] }
      setDocumenti(d.documenti)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [])

  useEffect(() => {
    carica()
  }, [carica])

  async function invia(file: File) {
    setCaricando(true)
    setErrore('')
    setAvviso('')
    try {
      const form = new FormData()
      form.append('file', file)
      if (negozioId) form.append('negozioId', negozioId)
      if (nota.trim()) form.append('nota', nota.trim())
      const res = await fetch('/api/cs-ai/documenti', { method: 'POST', body: form })
      const d = (await res.json().catch(() => ({}))) as { errore?: string; avviso?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Caricamento non riuscito.')
        return
      }
      setAvviso(
        `«${file.name}» caricato.` +
          (d.avviso ? ' ' + d.avviso : '') +
          ' Ora puoi far leggere il documento all’AI.'
      )
      setNota('')
      if (fileRef.current) fileRef.current.value = ''
      await carica()
    } catch {
      setErrore('Caricamento non riuscito: problema di rete.')
    } finally {
      setCaricando(false)
    }
  }

  async function elimina(d: Documento) {
    const res = await fetch('/api/cs-ai/documenti?id=' + encodeURIComponent(d.id), {
      method: 'DELETE',
    })
    const r = (await res.json().catch(() => ({}))) as { avviso?: string }
    if (r.avviso) setAvviso(r.avviso)
    if (apertoId === d.id) chiudiProposte()
    await carica()
    onCambio()
  }

  function chiudiProposte() {
    setApertoId('')
    setProposte([])
    setScelte(new Set())
    setAvvisoLettura('')
  }

  async function leggi(d: Documento) {
    setLeggendo(true)
    setErrore('')
    setAvviso('')
    setApertoId(d.id)
    setProposte([])
    setScelte(new Set())
    setAvvisoLettura('')
    try {
      const res = await fetch('/api/cs-ai/documenti/proposte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentoId: d.id }),
      })
      const r = (await res.json().catch(() => ({}))) as {
        proposte?: Proposta[]
        errore?: string
        avviso?: string
        vuoto?: boolean
      }
      if (!res.ok) {
        setErrore(r.errore || 'Lettura non riuscita.')
        setApertoId('')
        return
      }
      setProposte(r.proposte ?? [])
      // Preselezionate tutte: si tolgono quelle che non vanno, che è il gesto
      // più raro. Ma la spunta resta, perché salvarle senza guardarle no.
      setScelte(new Set((r.proposte ?? []).map((_, i) => i)))
      setAvvisoLettura(
        r.vuoto
          ? 'L’AI non ha trovato regole su come parlare ai clienti in questo documento. Può essere giusto: non tutti i documenti ne contengono.'
          : r.avviso ?? ''
      )
    } catch {
      setErrore('Lettura non riuscita: problema di rete.')
      setApertoId('')
    } finally {
      setLeggendo(false)
    }
  }

  async function salvaScelte() {
    const scelti = proposte.filter((_, i) => scelte.has(i))
    if (!scelti.length) return
    setLeggendo(true)
    try {
      const res = await fetch('/api/cs-ai/documenti/proposte', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentoId: apertoId, proposte: scelti }),
      })
      const r = (await res.json().catch(() => ({}))) as {
        aggiunte?: number
        saltate?: number
        errore?: string
      }
      if (!res.ok) {
        setErrore(r.errore || 'Salvataggio non riuscito.')
        return
      }
      setAvviso(
        `${r.aggiunte ?? 0} istruzion${r.aggiunte === 1 ? 'e aggiunta' : 'i aggiunte'}` +
          (r.saltate ? `, ${r.saltate} saltate perché esistevano già con lo stesso titolo.` : '.')
      )
      chiudiProposte()
      await carica()
      onCambio()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    } finally {
      setLeggendo(false)
    }
  }

  function spunta(i: number) {
    const s = new Set(scelte)
    if (s.has(i)) s.delete(i)
    else s.add(i)
    setScelte(s)
  }

  function modificaProposta(i: number, campo: keyof Proposta, valore: string) {
    setProposte(proposte.map((p, k) => (k === i ? { ...p, [campo]: valore } : p)))
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 15 }}>Documenti da cui imparare</h2>
      <p className="descrizione">
        Carica il manuale del servizio clienti, la brand voice, le regole di consegna:{' '}
        {FORMATI.join(', ')}, fino a 4 MB. L&apos;AI li legge e <strong>propone</strong> delle
        istruzioni; tu scegli quali tenere. Il documento non viene allegato a ogni risposta — da
        trenta pagine restano poche regole, e sono quelle che approvi tu.
      </p>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label className="campo">
          <span>Brand a cui si riferisce</span>
          <select value={negozioId} onChange={(e) => setNegozioId(e.target.value)}>
            <option value="">Tutti i brand</option>
            {brand.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Nota (facoltativa)</span>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Versione approvata a luglio"
          />
        </label>
      </div>

      <label className="campo">
        <span>Documento</span>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv,.html,.htm,application/pdf,text/plain,text/markdown"
          disabled={caricando}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) invia(f)
          }}
        />
      </label>
      {caricando ? <p className="descrizione">Leggo il documento…</p> : null}

      {!caricato ? null : documenti.length === 0 ? (
        <p className="descrizione" style={{ marginBottom: 0 }}>
          Nessun documento caricato.
        </p>
      ) : (
        <div className="tabella-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Brand</th>
                <th className="num">Testo</th>
                <th className="num">Istruzioni</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documenti.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="cella-nome">{d.nome}</div>
                    <div className="cella-sub" style={{ maxWidth: 420 }}>
                      {d.assaggio}
                    </div>
                    {d.nota ? <div className="cella-sub">{d.nota}</div> : null}
                  </td>
                  <td className="cella-muta">{d.negozio?.nome ?? 'Tutti'}</td>
                  <td className="cella-num">
                    {d.caratteri.toLocaleString('it-IT')}
                    <div className="cella-sub">
                      {peso(d.dimensione)}
                      {d.pagine ? ` · ${d.pagine} pag.` : ''}
                    </div>
                  </td>
                  <td className="cella-num">{d._count.istruzioni || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondario small"
                      onClick={() => (apertoId === d.id ? chiudiProposte() : leggi(d))}
                      disabled={leggendo}
                    >
                      {leggendo && apertoId === d.id
                        ? 'Leggo…'
                        : apertoId === d.id
                          ? 'Chiudi'
                          : 'Ricava istruzioni'}
                    </button>{' '}
                    <button
                      className="btn btn-secondario small"
                      style={{ color: 'var(--red)' }}
                      onClick={() => elimina(d)}
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

      {/* Le proposte: si guardano, si correggono, si scelgono. */}
      {apertoId && !leggendo ? (
        <div className="card" style={{ marginTop: 14, background: '#FAFAFA' }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>
            Regole trovate nel documento
            {proposte.length ? ` (${scelte.size} di ${proposte.length} selezionate)` : ''}
          </h3>
          {avvisoLettura ? <div className="avviso-ok">{avvisoLettura}</div> : null}
          {proposte.length ? (
            <>
              <p className="descrizione">
                Le proposte dell&apos;AI: leggile, correggile se serve, togli la spunta a quelle
                che non vanno. Diventano istruzioni solo quando premi Salva. Sotto ognuna c&apos;è
                la frase del documento da cui nasce, così puoi controllare che non se la sia
                inventata.
              </p>
              {proposte.map((p, i) => (
                <div
                  key={i}
                  style={{
                    borderTop: '1px solid var(--bordo, #E5E5E7)',
                    padding: '12px 0',
                    opacity: scelte.has(i) ? 1 : 0.5,
                  }}
                >
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={scelte.has(i)}
                      onChange={() => spunta(i)}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1 }}>
                      <input
                        value={p.titolo}
                        onChange={(e) => modificaProposta(i, 'titolo', e.target.value)}
                        style={{ width: '100%', fontWeight: 600, marginBottom: 6 }}
                        aria-label="Titolo della regola"
                      />
                      <textarea
                        rows={3}
                        value={p.testo}
                        onChange={(e) => modificaProposta(i, 'testo', e.target.value)}
                        style={{ width: '100%' }}
                        aria-label="Testo della regola"
                      />
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          marginTop: 6,
                        }}
                      >
                        <input
                          value={p.categoria}
                          onChange={(e) => modificaProposta(i, 'categoria', e.target.value)}
                          style={{ width: 150 }}
                          aria-label="Categoria"
                        />
                        <select
                          value={p.ambito}
                          onChange={(e) => modificaProposta(i, 'ambito', e.target.value)}
                          aria-label="Quando vale"
                        >
                          {AMBITI.map((a) => (
                            <option key={a.chiave} value={a.chiave}>
                              {nomeAmbito(a.chiave)}
                            </option>
                          ))}
                        </select>
                      </div>
                      {p.citazione ? (
                        <p
                          className="cella-sub"
                          style={{ marginTop: 8, fontStyle: 'italic', maxWidth: 620 }}
                        >
                          Dal documento: «{p.citazione}»
                        </p>
                      ) : (
                        <p className="cella-sub" style={{ marginTop: 8 }}>
                          ⚠️ L&apos;AI non ha indicato la frase da cui nasce: controlla nel
                          documento prima di tenerla.
                        </p>
                      )}
                    </div>
                  </label>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={salvaScelte} disabled={!scelte.size}>
                  Salva {scelte.size} istruzion{scelte.size === 1 ? 'e' : 'i'}
                </button>
                <button className="btn btn-secondario" onClick={chiudiProposte}>
                  Annulla
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
