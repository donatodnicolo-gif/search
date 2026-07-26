'use client'

import { useCallback, useEffect, useState } from 'react'
import { AMBITI, PALETTI, nomeAmbito } from '@/lib/cs-ai'

// CS AI — dove si scrive COME l'AI parla ai clienti.
//
// Non è il posto dei testi da mandare (quelli sono gli Script): qui stanno le
// regole di comportamento — tono, firma, cosa non promettere, cosa cambia fra
// chat e mail. Vanno a finire nel prompt di ogni risposta suggerita.

type Istruzione = {
  id: string
  titolo: string
  categoria: string
  testo: string
  ambito: string
  ordine: number
  attiva: boolean
}

const VUOTA = {
  id: '',
  titolo: '',
  categoria: '',
  testo: '',
  ambito: 'tutti',
  ordine: 0,
  attiva: true,
}

export function CsAiLista() {
  const [istruzioni, setIstruzioni] = useState<Istruzione[]>([])
  const [caricato, setCaricato] = useState(false)
  const [q, setQ] = useState('')
  const [filtroAmbito, setFiltroAmbito] = useState('')
  const [bozza, setBozza] = useState<typeof VUOTA>(VUOTA)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')
  const [occupato, setOccupato] = useState(false)

  // L'anteprima di quello che legge davvero il modello.
  const [anteprima, setAnteprima] = useState('')
  const [contestoAnteprima, setContestoAnteprima] = useState<'chat' | 'email'>('chat')
  const [anteprimaAperta, setAnteprimaAperta] = useState(false)

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (q) p.set('q', q)
      if (filtroAmbito) p.set('ambito', filtroAmbito)
      const res = await fetch('/api/cs-ai?' + p.toString())
      if (!res.ok) return
      const d = (await res.json()) as { istruzioni: Istruzione[] }
      setIstruzioni(d.istruzioni)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [q, filtroAmbito])

  useEffect(() => {
    const t = setTimeout(carica, 250)
    return () => clearTimeout(t)
  }, [carica])

  const caricaAnteprima = useCallback(async () => {
    try {
      const res = await fetch('/api/cs-ai/anteprima?contesto=' + contestoAnteprima)
      if (!res.ok) return
      const d = (await res.json()) as { prompt: string }
      setAnteprima(d.prompt)
    } catch {
      setAnteprima('')
    }
  }, [contestoAnteprima])

  useEffect(() => {
    if (anteprimaAperta) caricaAnteprima()
  }, [anteprimaAperta, caricaAnteprima, istruzioni])

  async function salva() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/cs-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bozza.id ? bozza : { ...bozza, id: undefined }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Salvataggio non riuscito.')
        return
      }
      setAvviso(bozza.id ? 'Istruzione aggiornata.' : 'Istruzione aggiunta.')
      setBozza(VUOTA)
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    }
  }

  async function elimina(id: string) {
    await fetch('/api/cs-ai?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  async function creaIniziali() {
    setOccupato(true)
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/cs-ai/iniziali', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as { aggiunte?: number; saltate?: number }
      setAvviso(
        `Istruzioni di partenza: ${d.aggiunte ?? 0} aggiunte` +
          (d.saltate ? `, ${d.saltate} già presenti.` : '.')
      )
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    } finally {
      setOccupato(false)
    }
  }

  const categorie = [...new Set(istruzioni.map((i) => i.categoria))]
  const attive = istruzioni.filter((i) => i.attiva).length

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">CS AI</h1>
          <p className="page-sub">
            Come l&apos;AI parla ai clienti: il tono, la firma, cosa non promettere mai, cosa
            cambia fra una chat e una mail. Queste istruzioni finiscono nel prompt di ogni
            risposta suggerita. Sono il <strong>come</strong>: i testi da mandare sono gli{' '}
            <a href="/script" style={{ textDecoration: 'underline' }}>
              Script
            </a>
            , che sono il <strong>cosa</strong>.
          </p>
        </div>
        <button className="btn btn-secondario" onClick={() => setAnteprimaAperta(!anteprimaAperta)}>
          {anteprimaAperta ? 'Chiudi anteprima' : 'Cosa legge l’AI'}
        </button>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* I paletti: si vedono, non si toccano. */}
      <div className="card paletti">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Regole che valgono sempre</h2>
        <p className="descrizione">
          Queste sono scritte nel codice e <strong>non si possono togliere da qui</strong>: sono
          ciò che impedisce all&apos;AI di promettere a un cliente cose che l&apos;azienda non ha
          deciso. Le istruzioni che scrivi si aggiungono a queste, non le sostituiscono — e se
          una le contraddicesse, vincono queste.
        </p>
        <ul className="elenco-paletti">
          {PALETTI.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>

      {/* Anteprima del prompt vero. */}
      {anteprimaAperta ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Cosa legge davvero l&apos;AI</h2>
            <select
              value={contestoAnteprima}
              onChange={(e) => setContestoAnteprima(e.target.value as 'chat' | 'email')}
              aria-label="Contesto"
            >
              <option value="chat">quando risponde in chat</option>
              <option value="email">quando scrive una mail</option>
            </select>
          </div>
          <p className="descrizione">
            È il blocco esatto che finisce nel prompt. Serve a vedere se un&apos;istruzione è
            arrivata davvero e in che ordine: una regola che credi attiva e non lo è, è peggio di
            una che manca.
          </p>
          <pre className="anteprima-prompt">{anteprima || 'Carico…'}</pre>
        </div>
      ) : null}

      {/* Nuova / modifica */}
      <div className="card" style={{ maxWidth: 760 }}>
        <h2 style={{ marginTop: 0 }}>
          {bozza.id ? 'Modifica istruzione' : 'Aggiungi un’istruzione'}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <label className="campo">
            <span>Titolo</span>
            <input
              value={bozza.titolo}
              onChange={(e) => setBozza({ ...bozza, titolo: e.target.value })}
              placeholder="Dare del lei, con calore"
            />
          </label>
          <label className="campo">
            <span>Categoria</span>
            <input
              value={bozza.categoria}
              onChange={(e) => setBozza({ ...bozza, categoria: e.target.value })}
              placeholder="Tono di voce"
              list="categorie-csai"
            />
            <datalist id="categorie-csai">
              {categorie.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="campo">
          <span>Istruzione (è quello che legge l’AI)</span>
          <textarea
            rows={4}
            value={bozza.testo}
            onChange={(e) => setBozza({ ...bozza, testo: e.target.value })}
            placeholder="Si dà sempre del lei. Il tono è cortese e caldo, mai sbrigativo…"
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="campo">
            <span>Quando vale</span>
            <select
              value={bozza.ambito}
              onChange={(e) => setBozza({ ...bozza, ambito: e.target.value })}
            >
              {AMBITI.map((a) => (
                <option key={a.chiave} value={a.chiave}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Ordine (le più importanti per prime)</span>
            <input
              type="number"
              value={bozza.ordine}
              onChange={(e) => setBozza({ ...bozza, ordine: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="descrizione" style={{ marginTop: -4 }}>
          {AMBITI.find((a) => a.chiave === bozza.ambito)?.spiega}
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={bozza.attiva}
            onChange={(e) => setBozza({ ...bozza, attiva: e.target.checked })}
          />
          <span>Attiva</span>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={salva} disabled={!bozza.titolo || !bozza.testo}>
            {bozza.id ? 'Salva modifiche' : 'Aggiungi istruzione'}
          </button>
          {bozza.id ? (
            <button className="btn btn-secondario" onClick={() => setBozza(VUOTA)}>
              Annulla
            </button>
          ) : null}
        </div>
      </div>

      <div className="barra-ricerca" style={{ marginTop: 20 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca fra le istruzioni…"
          aria-label="Cerca istruzioni"
        />
        <select
          value={filtroAmbito}
          onChange={(e) => setFiltroAmbito(e.target.value)}
          aria-label="Ambito"
        >
          <option value="">Chat e mail</option>
          {AMBITI.map((a) => (
            <option key={a.chiave} value={a.chiave}>
              {a.nome}
            </option>
          ))}
        </select>
        {caricato && istruzioni.length > 0 ? (
          <span className="cella-sub" style={{ alignSelf: 'center' }}>
            {attive} attive su {istruzioni.length}
          </span>
        ) : null}
      </div>

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : istruzioni.length === 0 ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Non c&apos;è ancora nessuna istruzione</h2>
          <p className="descrizione">
            Senza istruzioni l&apos;AI segue solo le regole di sicurezza qui sopra: risponde
            correttamente, ma senza il tono di Deluxy. Puoi partire da un gruppo di istruzioni
            già scritte — tono, reclami, chat, firma della mail — e poi riscriverle con le
            parole dell&apos;azienda.
          </p>
          <button className="btn" onClick={creaIniziali} disabled={occupato}>
            {occupato ? 'Creo…' : 'Crea le istruzioni di partenza'}
          </button>
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Istruzione</th>
                <th>Categoria</th>
                <th>Quando vale</th>
                <th className="num">Ordine</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {istruzioni.map((i) => (
                <tr key={i.id} style={i.attiva ? undefined : { opacity: 0.55 }}>
                  <td>
                    <div className="cella-nome">{i.titolo}</div>
                    <div className="cella-sub" style={{ maxWidth: 460 }}>
                      {i.testo.length > 150 ? i.testo.slice(0, 150) + '…' : i.testo}
                    </div>
                  </td>
                  <td className="cella-muta">{i.categoria}</td>
                  <td className="cella-muta">{nomeAmbito(i.ambito)}</td>
                  <td className="cella-num">{i.ordine}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondario small"
                      onClick={() =>
                        setBozza({
                          id: i.id,
                          titolo: i.titolo,
                          categoria: i.categoria,
                          testo: i.testo,
                          ambito: i.ambito,
                          ordine: i.ordine,
                          attiva: i.attiva,
                        })
                      }
                    >
                      Modifica
                    </button>{' '}
                    <button
                      className="btn btn-secondario small"
                      style={{ color: 'var(--red)' }}
                      onClick={() => elimina(i.id)}
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
