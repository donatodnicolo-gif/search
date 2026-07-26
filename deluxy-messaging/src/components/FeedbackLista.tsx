'use client'

import { useCallback, useEffect, useState } from 'react'

// I FEEDBACK ricevuti su valet e partner, e gli ORARI delle consegne dei valet.
// Sono i due dati che riempiono le voci "Feedback" e "Puntualità" della pagella:
// senza questi, il punteggio si regge solo sui reclami.

type Feedback = {
  id: string
  soggettoTipo: string
  soggettoId: string
  soggettoNome: string
  voto: number
  testo: string
  clienteNome: string
  ordineNumero: string
  origine: string
  creatoIl: string
}

type RigaPuntualita = {
  id: string
  valetId: string
  valetNome: string
  ordineNumero: string
  minutiRitardo: number
  note: string
  creatoIl: string
}

type Valet = { id: string; nome: string; zona: string }
type Partner = { id: string; nome: string; citta: string }

const ORIGINI = [
  { chiave: 'telefono', nome: 'Telefonata' },
  { chiave: 'whatsapp', nome: 'WhatsApp' },
  { chiave: 'email', nome: 'Email' },
  { chiave: 'reclamo', nome: 'Da un reclamo' },
  { chiave: 'altro', nome: 'Altro' },
]

const FB_VUOTO = {
  id: '',
  soggettoTipo: 'valet',
  soggettoId: '',
  soggettoNome: '',
  voto: 5,
  testo: '',
  clienteNome: '',
  ordineNumero: '',
  origine: 'telefono',
}

const PU_VUOTA = {
  valetId: '',
  valetNome: '',
  ordineNumero: '',
  minutiRitardo: 0,
  note: '',
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "in orario", "12 min di ritardo", "5 min in anticipo". */
function testoRitardo(m: number): string {
  if (m === 0) return 'in orario'
  if (m < 0) return `${-m} min in anticipo`
  return `${m} min di ritardo`
}

export function FeedbackLista() {
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [righe, setRighe] = useState<RigaPuntualita[]>([])
  const [valet, setValet] = useState<Valet[]>([])
  const [partner, setPartner] = useState<Partner[]>([])
  const [partnerErrore, setPartnerErrore] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  const [fb, setFb] = useState<typeof FB_VUOTO>(FB_VUOTO)
  const [pu, setPu] = useState<typeof PU_VUOTA>(PU_VUOTA)

  const carica = useCallback(async () => {
    try {
      const [rf, rp] = await Promise.all([fetch('/api/feedback'), fetch('/api/puntualita')])
      if (rf.ok) setFeedback(((await rf.json()) as { feedback: Feedback[] }).feedback)
      if (rp.ok) setRighe(((await rp.json()) as { righe: RigaPuntualita[] }).righe)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [])

  useEffect(() => {
    carica()
  }, [carica])

  // Valet subito (servono a entrambi i riquadri); partner solo se serve.
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/valet?attivi=1')
        if (r.ok) setValet(((await r.json()) as { valet: Valet[] }).valet)
      } catch {
        // rete assente
      }
    })()
  }, [])

  async function caricaPartner() {
    if (partner.length) return
    setPartnerErrore('')
    try {
      const res = await fetch('/api/partner')
      const d = (await res.json().catch(() => ({}))) as { partner?: Partner[]; errore?: string }
      if (!res.ok) {
        setPartnerErrore(d.errore || 'Partner non raggiungibili.')
        return
      }
      setPartner(d.partner ?? [])
    } catch {
      setPartnerErrore('Partner non raggiungibili: problema di rete.')
    }
  }

  function cambiaTipo(tipo: string) {
    setFb({ ...fb, soggettoTipo: tipo, soggettoId: '', soggettoNome: '' })
    if (tipo === 'partner') caricaPartner()
  }

  function scegliSoggetto(id: string) {
    const elenco = fb.soggettoTipo === 'valet' ? valet : partner
    const trovato = elenco.find((x) => x.id === id)
    setFb({ ...fb, soggettoId: id, soggettoNome: trovato?.nome ?? '' })
  }

  async function salvaFeedback() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fb, id: fb.id || undefined }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Feedback non salvato.')
        return
      }
      setAvviso('Feedback registrato.')
      setFb({ ...FB_VUOTO, soggettoTipo: fb.soggettoTipo })
      await carica()
    } catch {
      setErrore('Feedback non salvato: problema di rete.')
    }
  }

  async function eliminaFeedback(id: string) {
    await fetch('/api/feedback?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  async function salvaPuntualita() {
    setErrore('')
    setAvviso('')
    try {
      const v = valet.find((x) => x.id === pu.valetId)
      const res = await fetch('/api/puntualita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pu, valetNome: v?.nome ?? '' }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Consegna non salvata.')
        return
      }
      setAvviso('Consegna registrata.')
      setPu({ ...PU_VUOTA, valetId: pu.valetId })
      await carica()
    } catch {
      setErrore('Consegna non salvata: problema di rete.')
    }
  }

  async function eliminaPuntualita(id: string) {
    await fetch('/api/puntualita?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  const elencoSoggetti = fb.soggettoTipo === 'valet' ? valet : partner

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Feedback e orari</h1>
          <p className="page-sub">
            I voti ricevuti dai clienti e gli orari reali delle consegne. Sono i dati che riempiono
            le voci <strong>Feedback</strong> e <strong>Puntualità</strong> della pagella: senza
            questi, il punteggio si regge solo sui reclami.
          </p>
        </div>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="griglia-impostazioni">
        {/* Nuovo feedback */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Registra un feedback</h2>
          <p className="descrizione">
            Il voto di una persona su un valet o su un partner: da una telefonata, da WhatsApp o
            raccolto chiudendo un reclamo.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Su chi</span>
              <select value={fb.soggettoTipo} onChange={(e) => cambiaTipo(e.target.value)}>
                <option value="valet">Un valet</option>
                <option value="partner">Un partner</option>
              </select>
            </label>
            <label className="campo">
              <span>{fb.soggettoTipo === 'valet' ? 'Quale valet' : 'Quale partner'}</span>
              <select value={fb.soggettoId} onChange={(e) => scegliSoggetto(e.target.value)}>
                <option value="">— scegli —</option>
                {elencoSoggetti.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {fb.soggettoTipo === 'partner' && partnerErrore ? (
            <p className="descrizione" style={{ marginTop: -4, color: 'var(--red)' }}>
              {partnerErrore}
            </p>
          ) : null}
          {fb.soggettoTipo === 'valet' && valet.length === 0 ? (
            <p className="descrizione" style={{ marginTop: -4 }}>
              Nessun valet in elenco:{' '}
              <a href="/reclami/valet" style={{ textDecoration: 'underline' }}>
                aggiungine
              </a>{' '}
              prima.
            </p>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Voto</span>
              <select value={fb.voto} onChange={(e) => setFb({ ...fb, voto: Number(e.target.value) })}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {'★'.repeat(n)} ({n})
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Come è arrivato</span>
              <select value={fb.origine} onChange={(e) => setFb({ ...fb, origine: e.target.value })}>
                {ORIGINI.map((o) => (
                  <option key={o.chiave} value={o.chiave}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Cliente</span>
              <input
                value={fb.clienteNome}
                onChange={(e) => setFb({ ...fb, clienteNome: e.target.value })}
                placeholder="Chi ha dato il voto"
              />
            </label>
            <label className="campo">
              <span>Ordine</span>
              <input
                value={fb.ordineNumero}
                onChange={(e) => setFb({ ...fb, ordineNumero: e.target.value })}
                placeholder="#1042"
              />
            </label>
          </div>
          <label className="campo">
            <span>Cosa ha detto</span>
            <textarea
              rows={3}
              value={fb.testo}
              onChange={(e) => setFb({ ...fb, testo: e.target.value })}
              placeholder="Le parole del cliente, se val la pena tenerle"
            />
          </label>
          <button className="btn" onClick={salvaFeedback} disabled={!fb.soggettoId}>
            Registra feedback
          </button>
        </div>

        {/* Nuova consegna misurata */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Registra gli orari di una consegna</h2>
          <p className="descrizione">
            Si salva il <strong>ritardo in minuti</strong>: 0 = in orario, un numero negativo = in
            anticipo. La tolleranza (entro quanti minuti si è &laquo;in orario&raquo;) si imposta
            sulla voce Puntualità, così cambiandola gli stessi dati si rileggono da soli.
          </p>
          <label className="campo">
            <span>Valet</span>
            <select value={pu.valetId} onChange={(e) => setPu({ ...pu, valetId: e.target.value })}>
              <option value="">— scegli —</option>
              {valet.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                  {v.zona ? ` · ${v.zona}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Ritardo in minuti</span>
              <input
                type="number"
                value={pu.minutiRitardo}
                onChange={(e) => setPu({ ...pu, minutiRitardo: Number(e.target.value) })}
              />
            </label>
            <label className="campo">
              <span>Ordine</span>
              <input
                value={pu.ordineNumero}
                onChange={(e) => setPu({ ...pu, ordineNumero: e.target.value })}
                placeholder="#1042"
              />
            </label>
          </div>
          <label className="campo">
            <span>Note</span>
            <input
              value={pu.note}
              onChange={(e) => setPu({ ...pu, note: e.target.value })}
              placeholder="Traffico, citofono non funzionante…"
            />
          </label>
          <button className="btn" onClick={salvaPuntualita} disabled={!pu.valetId}>
            Registra consegna
          </button>
        </div>
      </div>

      {/* Elenco feedback */}
      <h2 style={{ fontSize: 17, marginTop: 28, marginBottom: 10 }}>Feedback ricevuti</h2>
      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : feedback.length === 0 ? (
        <div className="vuoto">Nessun feedback ancora.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Su chi</th>
                <th>Voto</th>
                <th>Cliente</th>
                <th>Cosa ha detto</th>
                <th>Quando</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {feedback.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="cella-nome">{f.soggettoNome || '(senza nome)'}</div>
                    <div className="cella-sub">
                      {f.soggettoTipo === 'valet' ? 'Valet' : 'Partner'}
                      {f.ordineNumero ? ` · ${f.ordineNumero}` : ''}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        color: f.voto >= 4 ? 'var(--green)' : f.voto <= 2 ? 'var(--red)' : 'var(--gold-strong)',
                      }}
                    >
                      {'★'.repeat(f.voto)}
                    </span>
                  </td>
                  <td className="cella-muta">{f.clienteNome || '—'}</td>
                  <td className="cella-muta" style={{ maxWidth: 320 }}>
                    {f.testo ? (f.testo.length > 120 ? f.testo.slice(0, 120) + '…' : f.testo) : '—'}
                  </td>
                  <td className="cella-muta" style={{ whiteSpace: 'nowrap' }}>
                    {dataBreve(f.creatoIl)}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondario small"
                      style={{ color: 'var(--red)' }}
                      onClick={() => eliminaFeedback(f.id)}
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

      {/* Elenco consegne misurate */}
      <h2 style={{ fontSize: 17, marginTop: 28, marginBottom: 10 }}>Consegne misurate</h2>
      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : righe.length === 0 ? (
        <div className="vuoto">
          Nessuna consegna misurata. Senza questi dati la voce Puntualità resta esclusa dal
          punteggio dei valet.
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Valet</th>
                <th>Esito</th>
                <th>Ordine</th>
                <th>Note</th>
                <th>Quando</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <td className="cella-nome">{r.valetNome || '(senza nome)'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        color:
                          r.minutiRitardo <= 0
                            ? 'var(--green)'
                            : r.minutiRitardo > 30
                              ? 'var(--red)'
                              : 'var(--gold-strong)',
                        fontWeight: 500,
                      }}
                    >
                      {testoRitardo(r.minutiRitardo)}
                    </span>
                  </td>
                  <td className="cella-muta">{r.ordineNumero || '—'}</td>
                  <td className="cella-muta" style={{ maxWidth: 260 }}>
                    {r.note || '—'}
                  </td>
                  <td className="cella-muta" style={{ whiteSpace: 'nowrap' }}>
                    {dataBreve(r.creatoIl)}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondario small"
                      style={{ color: 'var(--red)' }}
                      onClick={() => eliminaPuntualita(r.id)}
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
