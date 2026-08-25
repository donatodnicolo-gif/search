'use client'

import { useCallback, useEffect, useState } from 'react'
import { SoldiReclamo } from './SoldiReclamo'
import { FiloReclamo } from './FiloReclamo'
import {
  STATI_RECLAMO,
  COLPA_TIPI,
  GRAVITA,
  coloreStatoReclamo,
  nomeColpa,
  nomeGravita,
  coloreGravita,
} from '@/lib/reclami'

type Reclamo = {
  id: string
  ordineId: string
  ordineNumero: string
  negozioNome: string
  clienteNome: string
  telefono: string
  email: string
  casisticaId: string
  casistica: string
  colpaTipo: string
  colpaId: string
  colpaNome: string
  gravita: number
  descrizione: string
  azioni: string
  stato: string
  esito: string
  creatoIl: string
}

type Casistica = {
  id: string
  nome: string
  colpaTipica: string
  gravita: number
  azioni: string
}

type Valet = { id: string; nome: string; zona: string }
type Partner = { id: string; nome: string; citta: string }

export type PrefillReclamo = {
  ordineId?: string
  ordineNumero?: string
  negozioNome?: string
  clienteNome?: string
  telefono?: string
  email?: string
}

const VUOTO = {
  id: '',
  ordineId: '',
  ordineNumero: '',
  negozioNome: '',
  clienteNome: '',
  telefono: '',
  email: '',
  casisticaId: '',
  casistica: '',
  colpaTipo: 'nessuno',
  colpaId: '',
  colpaNome: '',
  gravita: 2,
  descrizione: '',
  azioni: '',
  stato: 'aperto',
  esito: '',
}

type Bozza = typeof VUOTO

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ReclamiLista({ prefill, apri }: { prefill?: PrefillReclamo; apri?: string }) {
  const [reclami, setReclami] = useState<Reclamo[]>([])
  const [perStato, setPerStato] = useState<Record<string, number>>({})
  /** Quante domande del filo aspettano ancora una risposta, per reclamo. */
  const [domandeAperte, setDomandeAperte] = useState<Record<string, number>>({})
  const [caricato, setCaricato] = useState(false)
  const [casistiche, setCasistiche] = useState<Casistica[]>([])
  const [valet, setValet] = useState<Valet[]>([])
  const [partner, setPartner] = useState<Partner[]>([])
  const [partnerErrore, setPartnerErrore] = useState('')

  const [bozza, setBozza] = useState<Bozza>(VUOTO)
  const [formAperto, setFormAperto] = useState(false)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  // Filtri
  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('')
  const [filtroStato, setFiltroStato] = useState('aperti')
  const [filtroColpa, setFiltroColpa] = useState('')
  const [filtroGravita, setFiltroGravita] = useState('')

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (qCercata) p.set('q', qCercata)
      if (filtroStato) p.set('stato', filtroStato)
      if (filtroColpa) p.set('colpa', filtroColpa)
      if (filtroGravita) p.set('gravita', filtroGravita)
      const res = await fetch('/api/reclami?' + p.toString())
      if (!res.ok) return
      const d = (await res.json()) as {
        reclami: Reclamo[]
        perStato: Record<string, number>
        domandeAperte?: Record<string, number>
      }
      setReclami(d.reclami)
      setPerStato(d.perStato)
      setDomandeAperte(d.domandeAperte ?? {})
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [qCercata, filtroStato, filtroColpa, filtroGravita])

  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    carica()
  }, [carica])

  // ── `?apri=<id>`: si arriva dalla schermata «Oggi» su UN reclamo preciso ──
  //
  // Prima il clic portava all'elenco e basta: con dodici reclami aperti si
  // ricominciava a cercare a occhio quello che si era appena letto — e la riga
  // di partenza spariva, perché nell'elenco l'ordine è un altro.
  const [evidenziato, setEvidenziato] = useState('')
  // ⚠️ Il filtro si allarga UNA VOLTA SOLA. `carica()` rigira a ogni cambio di
  // filtro: senza questa guardia, un id che non esiste più (reclamo cancellato)
  // farebbe rimbalzare i filtri all'infinito.
  const [allargato, setAllargato] = useState(false)

  useEffect(() => {
    if (!apri || !caricato) return
    if (reclami.some((r) => r.id === apri)) {
      setEvidenziato(apri)
      return
    }
    // ⚠️ Non c'è nell'elenco perché il filtro di partenza è «aperti» e quel
    // reclamo nel frattempo è stato chiuso. Un link che porta a una pagina dove
    // la cosa promessa non si vede è peggio di nessun link: si allarga il
    // filtro e lo si mostra comunque.
    if (!allargato && filtroStato !== 'tutti') {
      setAllargato(true)
      setFiltroStato('tutti')
    }
  }, [apri, caricato, reclami, allargato, filtroStato])

  // Portare la riga sotto gli occhi. Si aspetta il disegno (`requestAnimationFrame`),
  // altrimenti si cerca un elemento che non c'è ancora.
  useEffect(() => {
    if (!evidenziato) return
    const t = requestAnimationFrame(() => {
      document
        .getElementById(`reclamo-${evidenziato}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    // L'evidenziazione si spegne da sola: serve a farsi trovare, non a restare
    // accesa mentre si lavora.
    const spegni = setTimeout(() => setEvidenziato(''), 4000)
    return () => {
      cancelAnimationFrame(t)
      clearTimeout(spegni)
    }
  }, [evidenziato])

  // Casistiche e valet: si caricano una volta (servono al form).
  useEffect(() => {
    ;(async () => {
      try {
        const [rc, rv] = await Promise.all([
          fetch('/api/reclami/casistiche?attive=1'),
          fetch('/api/valet?attivi=1'),
        ])
        if (rc.ok) setCasistiche(((await rc.json()) as { casistiche: Casistica[] }).casistiche)
        if (rv.ok) setValet(((await rv.json()) as { valet: Valet[] }).valet)
      } catch {
        // rete assente
      }
    })()
  }, [])

  // I partner si caricano dal registro solo quando servono (colpa = partner).
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

  // Se si arriva da un ordine (prefill), apre subito il form riempito.
  useEffect(() => {
    if (prefill && (prefill.ordineNumero || prefill.clienteNome)) {
      setBozza({
        ...VUOTO,
        ordineId: prefill.ordineId ?? '',
        ordineNumero: prefill.ordineNumero ?? '',
        negozioNome: prefill.negozioNome ?? '',
        clienteNome: prefill.clienteNome ?? '',
        telefono: prefill.telefono ?? '',
        email: prefill.email ?? '',
      })
      setFormAperto(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scegliCasistica(id: string) {
    const c = casistiche.find((x) => x.id === id)
    if (!c) {
      setBozza((b) => ({ ...b, casisticaId: '', casistica: '' }))
      return
    }
    setBozza((b) => ({
      ...b,
      casisticaId: c.id,
      casistica: c.nome,
      gravita: c.gravita,
      // propone la colpa tipica solo se non è già stata scelta
      colpaTipo: b.colpaTipo === 'nessuno' && c.colpaTipica ? c.colpaTipica : b.colpaTipo,
      // riempie le azioni se sono ancora vuote (checklist di partenza)
      azioni: b.azioni.trim() ? b.azioni : c.azioni,
    }))
    if (c.colpaTipica === 'partner') caricaPartner()
  }

  function cambiaColpaTipo(tipo: string) {
    setBozza((b) => ({ ...b, colpaTipo: tipo, colpaId: '', colpaNome: '' }))
    if (tipo === 'partner') caricaPartner()
  }

  function scegliColpaSoggetto(id: string) {
    if (bozza.colpaTipo === 'valet') {
      const v = valet.find((x) => x.id === id)
      setBozza((b) => ({ ...b, colpaId: id, colpaNome: v?.nome ?? '' }))
    } else if (bozza.colpaTipo === 'partner') {
      const pa = partner.find((x) => x.id === id)
      setBozza((b) => ({ ...b, colpaId: id, colpaNome: pa?.nome ?? '' }))
    }
  }

  function nuovo() {
    setBozza(VUOTO)
    setFormAperto(true)
    setAvviso('')
    setErrore('')
  }

  function modifica(r: Reclamo) {
    setBozza({
      id: r.id,
      ordineId: r.ordineId,
      ordineNumero: r.ordineNumero,
      negozioNome: r.negozioNome,
      clienteNome: r.clienteNome,
      telefono: r.telefono,
      email: r.email,
      casisticaId: r.casisticaId,
      casistica: r.casistica,
      colpaTipo: r.colpaTipo || 'nessuno',
      colpaId: r.colpaId,
      colpaNome: r.colpaNome,
      gravita: r.gravita,
      descrizione: r.descrizione,
      azioni: r.azioni,
      stato: r.stato,
      esito: r.esito,
    })
    setFormAperto(true)
    if (r.colpaTipo === 'partner') caricaPartner()
    setAvviso('')
    setErrore('')
  }

  async function salva() {
    setErrore('')
    setAvviso('')
    if (!bozza.casistica.trim()) {
      setErrore('Scegli una casistica per il reclamo.')
      return
    }
    try {
      const res = await fetch('/api/reclami', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bozza.id ? bozza : { ...bozza, id: undefined }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Salvataggio non riuscito.')
        return
      }
      setAvviso(bozza.id ? 'Reclamo aggiornato.' : 'Reclamo aperto.')
      setBozza(VUOTO)
      setFormAperto(false)
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    }
  }

  async function cambiaStato(id: string, stato: string) {
    setReclami((prec) => prec.map((r) => (r.id === id ? { ...r, stato } : r)))
    try {
      await fetch(`/api/reclami/${id}/stato`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato }),
      })
      await carica()
    } catch {
      setErrore('Stato non salvato: problema di rete.')
      await carica()
    }
  }

  async function elimina(id: string) {
    await fetch('/api/reclami?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  const filtriAttivi = !!(qCercata || filtroColpa || filtroGravita || filtroStato !== 'aperti')
  const totaleTutti = Object.values(perStato).reduce((s, n) => s + n, 0)
  const aperti = (perStato['aperto'] ?? 0) + (perStato['in_lavorazione'] ?? 0)

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Reclami</h1>
          <p className="page-sub">
            I reclami aperti sugli ordini. Ognuno ha una casistica, le azioni da eseguire e una
            colpa (valet o partner): da qui nascono i giudizi.
          </p>
        </div>
        <button className="btn" onClick={nuovo}>
          Nuovo reclamo
        </button>
      </div>

      {casistiche.length === 0 ? (
        <div className="avviso-errore">
          Non ci sono ancora casistiche: aprine prima qualcuna in{' '}
          <a href="/reclami/casistiche" style={{ textDecoration: 'underline' }}>
            Casistiche
          </a>{' '}
          (c&apos;è un pulsante per caricare quelle di esempio).
        </div>
      ) : null}
      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="kpi-riga" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-valore">{totaleTutti}</div>
          <div className="kpi-etichetta">Reclami totali</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: '#c93400' }}>
            {aperti}
          </div>
          <div className="kpi-etichetta">Da lavorare</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: '#248a3d' }}>
            {perStato['risolto'] ?? 0}
          </div>
          <div className="kpi-etichetta">Risolti</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={{ color: '#6e6e73' }}>
            {perStato['chiuso'] ?? 0}
          </div>
          <div className="kpi-etichetta">Chiusi</div>
        </div>
      </div>

      {/* Form nuovo/modifica */}
      {formAperto ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginTop: 0 }}>{bozza.id ? 'Modifica reclamo' : 'Nuovo reclamo'}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Ordine</span>
              <input
                value={bozza.ordineNumero}
                onChange={(e) => setBozza({ ...bozza, ordineNumero: e.target.value })}
                placeholder="#1042"
              />
            </label>
            <label className="campo">
              <span>Negozio</span>
              <input
                value={bozza.negozioNome}
                onChange={(e) => setBozza({ ...bozza, negozioNome: e.target.value })}
                placeholder="Deluxy Flowers"
              />
            </label>
            <label className="campo">
              <span>Cliente</span>
              <input
                value={bozza.clienteNome}
                onChange={(e) => setBozza({ ...bozza, clienteNome: e.target.value })}
                placeholder="Mario Rossi"
              />
            </label>
            <label className="campo">
              <span>Telefono</span>
              <input
                value={bozza.telefono}
                onChange={(e) => setBozza({ ...bozza, telefono: e.target.value })}
                placeholder="+39 333 1234567"
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Casistica</span>
              <select
                value={bozza.casisticaId}
                onChange={(e) => scegliCasistica(e.target.value)}
              >
                <option value="">— scegli —</option>
                {casistiche.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Gravità</span>
              <select
                value={bozza.gravita}
                onChange={(e) => setBozza({ ...bozza, gravita: Number(e.target.value) })}
              >
                {GRAVITA.map((g) => (
                  <option key={g.livello} value={g.livello}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Colpa: tipo + soggetto */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Colpa</span>
              <select value={bozza.colpaTipo} onChange={(e) => cambiaColpaTipo(e.target.value)}>
                {COLPA_TIPI.map((c) => (
                  <option key={c.chiave} value={c.chiave}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            {bozza.colpaTipo === 'valet' ? (
              <label className="campo">
                <span>Quale valet</span>
                <select value={bozza.colpaId} onChange={(e) => scegliColpaSoggetto(e.target.value)}>
                  <option value="">— scegli —</option>
                  {valet.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                      {v.zona ? ` · ${v.zona}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : bozza.colpaTipo === 'partner' ? (
              <label className="campo">
                <span>Quale partner</span>
                <select value={bozza.colpaId} onChange={(e) => scegliColpaSoggetto(e.target.value)}>
                  <option value="">— scegli —</option>
                  {partner.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {p.citta ? ` · ${p.citta}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div />
            )}
          </div>
          {bozza.colpaTipo === 'valet' && valet.length === 0 ? (
            <p className="descrizione" style={{ marginTop: -4 }}>
              Nessun valet in elenco:{' '}
              <a href="/reclami/valet" style={{ textDecoration: 'underline' }}>
                aggiungine
              </a>{' '}
              per attribuire la colpa a una persona.
            </p>
          ) : null}
          {bozza.colpaTipo === 'partner' && partnerErrore ? (
            <p className="descrizione" style={{ marginTop: -4, color: 'var(--red)' }}>
              {partnerErrore}
            </p>
          ) : null}

          <label className="campo">
            <span>Descrizione del problema</span>
            <textarea
              rows={3}
              value={bozza.descrizione}
              onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
              placeholder="Cosa ha segnalato il cliente"
            />
          </label>
          <label className="campo">
            <span>Azioni da eseguire (una per riga)</span>
            <textarea
              rows={4}
              value={bozza.azioni}
              onChange={(e) => setBozza({ ...bozza, azioni: e.target.value })}
              placeholder="Scelta una casistica, qui compaiono le azioni consigliate"
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <label className="campo">
              <span>Stato</span>
              <select
                value={bozza.stato}
                onChange={(e) => setBozza({ ...bozza, stato: e.target.value })}
              >
                {STATI_RECLAMO.map((s) => (
                  <option key={s.chiave} value={s.chiave}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Esito (come è andata a finire)</span>
              <input
                value={bozza.esito}
                onChange={(e) => setBozza({ ...bozza, esito: e.target.value })}
                placeholder="Rimborso spedizione, riordino a nostro carico…"
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={salva} disabled={!bozza.casistica}>
              {bozza.id ? 'Salva modifiche' : 'Apri reclamo'}
            </button>
            <button
              className="btn btn-secondario"
              onClick={() => {
                setFormAperto(false)
                setBozza(VUOTO)
              }}
            >
              Annulla
            </button>
          </div>

          {/* ── QUELLO CHE STA INTORNO AL RECLAMO ──
              ⚠️ Solo su un reclamo che ESISTE già: un filo di domande e i soldi
              di un ordine non hanno senso su un modulo ancora da salvare, e
              mostrarli vuoti insegnerebbe a ignorarli.
              ⚠️⚠️ I soldi stanno QUI e non in fondo alla pagina perché servono
              nel momento in cui si decide: rimborsare 250 € su un ordine che ce
              ne ha lasciati 40 non è la stessa decisione che rimborsarli su uno
              che ne ha lasciati 120. */}
          {bozza.id ? (
            <>
              <SoldiReclamo reclamoId={bozza.id} />
              <FiloReclamo reclamoId={bozza.id} />
            </>
          ) : null}
        </div>
      ) : null}

      {/* Filtri */}
      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per ordine, cliente, telefono, casistica o colpa…"
          aria-label="Cerca reclami"
        />
        <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)} aria-label="Stato">
          <option value="aperti">Da lavorare</option>
          <option value="">Tutti gli stati</option>
          {STATI_RECLAMO.map((s) => (
            <option key={s.chiave} value={s.chiave}>
              Solo: {s.nome}
            </option>
          ))}
        </select>
        <select value={filtroColpa} onChange={(e) => setFiltroColpa(e.target.value)} aria-label="Colpa">
          <option value="">Colpa: tutte</option>
          {COLPA_TIPI.map((c) => (
            <option key={c.chiave} value={c.chiave}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          value={filtroGravita}
          onChange={(e) => setFiltroGravita(e.target.value)}
          aria-label="Gravità"
        >
          <option value="">Gravità: tutte</option>
          {GRAVITA.map((g) => (
            <option key={g.livello} value={String(g.livello)}>
              {g.nome}
            </option>
          ))}
        </select>
        {filtriAttivi ? (
          <button
            className="bottone secondario"
            onClick={() => {
              setQ('')
              setFiltroStato('aperti')
              setFiltroColpa('')
              setFiltroGravita('')
            }}
          >
            Azzera
          </button>
        ) : null}
      </div>

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : reclami.length === 0 ? (
        <div className="vuoto">
          {filtriAttivi
            ? 'Nessun reclamo corrisponde ai filtri.'
            : 'Nessun reclamo aperto. Aprine uno da qui o dal pulsante “Reclamo” su un ordine.'}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Ordine</th>
                <th>Casistica</th>
                <th>Colpa</th>
                <th>Gravità</th>
                <th>Stato</th>
                <th>Aperto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reclami.map((r) => (
                <tr
                  key={r.id}
                  id={`reclamo-${r.id}`}
                  className={r.id === evidenziato ? 'riga-evidenziata' : undefined}
                >
                  <td>
                    <div className="cella-nome">{r.ordineNumero || '—'}</div>
                    <div className="cella-sub">
                      {r.clienteNome || '—'}
                      {r.negozioNome ? ` · ${r.negozioNome}` : ''}
                    </div>
                  </td>
                  <td>
                    <div>
                      {r.casistica}
                      {/* ⚠️⚠️ Una domanda senza risposta si vede DALL'ELENCO. Un
                          reclamo fermo perché aspetta una risposta non è un
                          reclamo trascurato, ed è l'unica cosa che si può
                          sbloccare andando a cercare qualcuno: tenerla dentro la
                          scheda vorrebbe dire aprirne sei per scoprirlo. */}
                      {domandeAperte[r.id] ? (
                        <span className="badge" style={{ marginLeft: 6, color: 'var(--red)' }}>
                          {domandeAperte[r.id]}{' '}
                          {domandeAperte[r.id] === 1 ? 'domanda aperta' : 'domande aperte'}
                        </span>
                      ) : null}
                    </div>
                    {r.descrizione ? (
                      <div className="cella-sub" style={{ maxWidth: 260 }}>
                        {r.descrizione.length > 90 ? r.descrizione.slice(0, 90) + '…' : r.descrizione}
                      </div>
                    ) : null}
                  </td>
                  <td className="cella-muta">
                    {r.colpaNome ? (
                      <>
                        <div>{r.colpaNome}</div>
                        <div className="cella-sub">{nomeColpa(r.colpaTipo)}</div>
                      </>
                    ) : (
                      nomeColpa(r.colpaTipo)
                    )}
                  </td>
                  <td>
                    <span className="badge" style={{ color: coloreGravita(r.gravita) }}>
                      {nomeGravita(r.gravita)}
                    </span>
                  </td>
                  <td>
                    <select
                      className="mini-select"
                      value={r.stato}
                      onChange={(e) => cambiaStato(r.id, e.target.value)}
                      style={{ color: coloreStatoReclamo(r.stato), fontWeight: 600 }}
                      title="Cambia stato"
                    >
                      {STATI_RECLAMO.map((s) => (
                        <option key={s.chiave} value={s.chiave}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="cella-muta" style={{ whiteSpace: 'nowrap' }}>
                    {dataBreve(r.creatoIl)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-secondario small" onClick={() => modifica(r)}>
                      Apri
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
