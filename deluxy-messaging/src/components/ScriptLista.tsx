'use client'

import { useCallback, useEffect, useState } from 'react'

// Gli script: le risposte pronte da dare ai clienti. Sono anche la memoria da
// cui l'AI impara a rispondere come rispondiamo noi (vedi /api/script/suggerisci).

type Script = {
  id: string
  titolo: string
  categoria: string
  testo: string
  quando: string
  attivo: boolean
  usi: number
}

const VUOTO = { id: '', titolo: '', categoria: '', testo: '', quando: '', attivo: true }

export function ScriptLista() {
  const [script, setScript] = useState<Script[]>([])
  const [caricato, setCaricato] = useState(false)
  const [q, setQ] = useState('')
  const [bozza, setBozza] = useState<typeof VUOTO>(VUOTO)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')
  const [copiato, setCopiato] = useState('')

  // banco di prova: si incolla un messaggio e si vede cosa risponderebbe l'AI
  const [prova, setProva] = useState('')
  const [provando, setProvando] = useState(false)
  const [esitoProva, setEsitoProva] = useState<{
    titolo?: string
    risposta?: string
    motivo?: string
    fornitore?: string
  } | null>(null)

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/script?' + new URLSearchParams(q ? { q } : {}))
      if (!res.ok) return
      const d = (await res.json()) as { script: Script[] }
      setScript(d.script)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [q])

  useEffect(() => {
    const t = setTimeout(carica, 250)
    return () => clearTimeout(t)
  }, [carica])

  async function salva() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bozza.id ? bozza : { ...bozza, id: undefined }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Salvataggio non riuscito.')
        return
      }
      setAvviso(bozza.id ? 'Script aggiornato.' : 'Script aggiunto.')
      setBozza(VUOTO)
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    }
  }

  async function elimina(id: string) {
    await fetch('/api/script?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  async function copia(testo: string, id: string) {
    try {
      await navigator.clipboard.writeText(testo)
      setCopiato(id)
      setTimeout(() => setCopiato(''), 2500)
    } catch {
      setErrore('Copia non riuscita: seleziona il testo e copialo a mano.')
    }
  }

  async function provaAi() {
    if (!prova.trim()) return
    setProvando(true)
    setEsitoProva(null)
    setErrore('')
    try {
      const res = await fetch('/api/script/suggerisci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaggio: prova.trim() }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        suggerimento?: { titolo: string; risposta: string; motivo: string } | null
        fornitore?: string
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Prova non riuscita.')
        return
      }
      setEsitoProva(
        d.suggerimento
          ? { ...d.suggerimento, fornitore: d.fornitore }
          : { motivo: 'Nessuno script adatto a questo messaggio.', fornitore: d.fornitore }
      )
    } catch {
      setErrore('Prova non riuscita: problema di rete.')
    } finally {
      setProvando(false)
    }
  }

  const categorie = [...new Set(script.map((s) => s.categoria))]

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Script</h1>
          <p className="page-sub">
            Le risposte pronte per i clienti. Servono a rispondere in fretta, e sono anche la
            memoria da cui l&apos;AI impara: quando suggerisce una risposta sceglie fra questi e la
            adatta al messaggio, invece di inventarsela.
          </p>
        </div>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="griglia-impostazioni">
        {/* Nuovo / modifica */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{bozza.id ? 'Modifica script' : 'Nuovo script'}</h2>
          <label className="campo">
            <span>Titolo</span>
            <input
              value={bozza.titolo}
              onChange={(e) => setBozza({ ...bozza, titolo: e.target.value })}
              placeholder="Ritardo nella consegna"
            />
          </label>
          <label className="campo">
            <span>Categoria</span>
            <input
              value={bozza.categoria}
              onChange={(e) => setBozza({ ...bozza, categoria: e.target.value })}
              placeholder="Consegne"
              list="categorie-script"
            />
            <datalist id="categorie-script">
              {categorie.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="campo">
            <span>Quando usarlo (lo legge l&apos;AI per scegliere)</span>
            <input
              value={bozza.quando}
              onChange={(e) => setBozza({ ...bozza, quando: e.target.value })}
              placeholder="Il cliente chiede dov'è l'ordine o segnala un ritardo"
            />
          </label>
          <label className="campo">
            <span>Testo della risposta</span>
            <textarea
              rows={6}
              value={bozza.testo}
              onChange={(e) => setBozza({ ...bozza, testo: e.target.value })}
              placeholder="Buongiorno, la ringraziamo per la pazienza…"
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={salva} disabled={!bozza.titolo || !bozza.testo}>
              {bozza.id ? 'Salva modifiche' : 'Aggiungi script'}
            </button>
            {bozza.id ? (
              <button className="btn btn-secondario" onClick={() => setBozza(VUOTO)}>
                Annulla
              </button>
            ) : null}
          </div>
        </div>

        {/* Banco di prova */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Prova la risposta automatica</h2>
          <p className="descrizione">
            Incolla il messaggio di un cliente: l&apos;AI sceglie lo script più adatto e lo adatta.
            Se nessuno va bene te lo dice, invece di inventare.
          </p>
          <label className="campo">
            <span>Messaggio del cliente</span>
            <textarea
              rows={4}
              value={prova}
              onChange={(e) => setProva(e.target.value)}
              placeholder="Buongiorno, il mio ordine 1042 doveva arrivare ieri e non è ancora arrivato"
            />
          </label>
          <button className="btn" onClick={provaAi} disabled={provando || !prova.trim()}>
            {provando ? 'Penso…' : 'Suggerisci risposta'}
          </button>

          {esitoProva ? (
            <div style={{ marginTop: 14 }}>
              {esitoProva.risposta ? (
                <>
                  <p className="descrizione" style={{ marginBottom: 6 }}>
                    Script scelto: <strong>{esitoProva.titolo}</strong>
                    {esitoProva.fornitore ? ` · ${esitoProva.fornitore}` : ''}
                  </p>
                  <div className="codice" style={{ whiteSpace: 'pre-wrap' }}>
                    {esitoProva.risposta}
                  </div>
                  <button
                    className="btn btn-secondario small"
                    style={{ marginTop: 8 }}
                    onClick={() => copia(esitoProva.risposta ?? '', 'prova')}
                  >
                    {copiato === 'prova' ? 'Copiato ✓' : 'Copia la risposta'}
                  </button>
                </>
              ) : (
                <div className="avviso-errore" style={{ marginBottom: 0 }}>
                  {esitoProva.motivo}
                </div>
              )}
              {esitoProva.risposta && esitoProva.motivo ? (
                <p className="descrizione" style={{ marginTop: 8, marginBottom: 0 }}>
                  Perché: {esitoProva.motivo}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="barra-ricerca" style={{ marginTop: 24 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca fra gli script…"
          aria-label="Cerca script"
        />
      </div>

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : script.length === 0 ? (
        <div className="vuoto">
          {q
            ? `Nessuno script per «${q}».`
            : 'Nessuno script ancora: aggiungi le risposte che dai più spesso.'}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Titolo</th>
                <th>Categoria</th>
                <th>Risposta</th>
                <th className="num">Usi</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {script.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="cella-nome">{s.titolo}</div>
                    {s.quando ? <div className="cella-sub">{s.quando}</div> : null}
                  </td>
                  <td className="cella-muta">{s.categoria}</td>
                  <td className="cella-muta" style={{ maxWidth: 420 }}>
                    {s.testo.length > 160 ? s.testo.slice(0, 160) + '…' : s.testo}
                  </td>
                  <td className="cella-num">{s.usi}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondario small"
                      onClick={() => copia(s.testo, s.id)}
                    >
                      {copiato === s.id ? 'Copiato ✓' : 'Copia'}
                    </button>{' '}
                    <button
                      className="btn btn-secondario small"
                      onClick={() =>
                        setBozza({
                          id: s.id,
                          titolo: s.titolo,
                          categoria: s.categoria,
                          testo: s.testo,
                          quando: s.quando,
                          attivo: s.attivo,
                        })
                      }
                    >
                      Modifica
                    </button>{' '}
                    <button
                      className="btn btn-secondario small"
                      style={{ color: 'var(--red)' }}
                      onClick={() => elimina(s.id)}
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
