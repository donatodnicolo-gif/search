'use client'
import { useCallback, useEffect, useState } from 'react'

// ⭐ 06/09/2026 — VENDITE (nuova architettura): tre aree in una pagina.
//  · Sconti per provincia: la regola del territorio (40 senza partner; 20 Milano
//    / 30 altrove con partner) con la personalizzazione per provincia.
//  · Partner per provincia: chi c'è, letto dalla piattaforma consegne.
//  · Liste di priorità per area commerciale: importate dalla piattaforma,
//    riordinabili qui. Una lista toccata a mano non viene più sovrascritta
//    dall'importazione finché non la si ripristina.

type Sconto = { provincia: string; nome: string; conPartner: number | null; senzaPartner: number | null; predefinitoConPartner: number; predefinitoSenzaPartner: number; nota: string; aggiornatoIl: string | null }
type Partner = { id: string; insegna: string; citta: string | null; mestieri: string[]; consegnaDaPartner: boolean; esclusoDalleProposte?: boolean; consegnaInProvincia: boolean; minimoOrdine: number | null; raggioKm: number | null; areeCommerciali: string[] }
type Stato = { provincia: string; nome: string; conPartner: boolean; partner: Partner[]; listePriorita: { id: string; mestiere: string | null; categoria: string | null; partner: { posizione: number; insegna: string }[] }[]; areeCommerciali: { nome: string; province: number }[]; sconto: { sconto: number; quota: number; regola: string; motivo: string } }
type Lista = { id: string; area: string; province: string[]; mestiere: string; partner: { id: string; insegna: string }[]; origine: string; importataIl: string | null; modificataIl: string | null; modificataDa: string | null }

export function VenditeConfig({ amministratore }: { amministratore: boolean }) {
  const [area, setArea] = useState<'sconti' | 'partner' | 'liste' | 'prodotti'>('sconti')
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Vendite</h1>
          <p className="page-sub">Chi decide a chi proporre un ordine e con che sconto è questa app: Orders tiene solo l&apos;ordine, la piattaforma consegne dice chi c&apos;è in ogni provincia.</p>
        </div>
      </div>
      <div className="filtri" role="tablist" style={{ marginBottom: 16 }}>
        {(
          [
            ['sconti', 'Sconti per provincia'],
            ['partner', 'Partner per provincia'],
            ['liste', 'Liste di priorità per area'],
            ['prodotti', 'Liste di prodotto'],
          ] as const
        ).map(([k, nome]) => (
          <button key={k} type="button" role="tab" aria-selected={area === k} className={`bottone ${area === k ? '' : 'secondario'} mini`} onClick={() => setArea(k)}>
            {nome}
          </button>
        ))}
      </div>
      {area === 'sconti' && <Sconti amministratore={amministratore} />}
      {area === 'partner' && <PartnerPerProvincia />}
      {area === 'liste' && <Liste amministratore={amministratore} />}
      {area === 'prodotti' && <ListeProdotto amministratore={amministratore} />}
    </div>
  )
}

function Sconti({ amministratore }: { amministratore: boolean }) {
  const [righe, setRighe] = useState<Sconto[]>([])
  const [predefiniti, setPredefiniti] = useState<{ senzaPartner: number; milanoConPartner: number; provinciaConPartner: number } | null>(null)
  const [errore, setErrore] = useState('')
  const [cerca, setCerca] = useState('')
  const [salvando, setSalvando] = useState('')
  const carica = useCallback(async () => {
    const r = await fetch('/api/vendite/sconti')
    const d = await r.json()
    if (!r.ok) return setErrore(d.errore ?? 'Errore')
    setRighe(d.province)
    setPredefiniti(d.predefiniti)
  }, [])
  useEffect(() => { void carica() }, [carica])
  const salva = async (s: Sconto) => {
    setSalvando(s.provincia)
    const r = await fetch('/api/vendite/sconti', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provincia: s.provincia, conPartner: s.conPartner, senzaPartner: s.senzaPartner, nota: s.nota }) })
    const d = await r.json()
    setSalvando('')
    if (!r.ok) return setErrore(d.errore ?? 'Errore')
    setErrore('')
    void carica()
  }
  const q = cerca.trim().toLowerCase()
  const visibili = righe.filter((r) => !q || r.provincia.toLowerCase().includes(q) || r.nome.toLowerCase().includes(q))
  const personalizzate = righe.filter((r) => r.conPartner !== null || r.senzaPartner !== null).length
  return (
    <div className="card">
      {predefiniti && (
        <p className="descrizione">
          Regola del territorio: <strong>{predefiniti.senzaPartner}%</strong> di sconto sul prezzo pubblico dove non abbiamo partner; dove ce l&apos;abbiamo <strong>{predefiniti.milanoConPartner}%</strong> a Milano e <strong>{predefiniti.provinciaConPartner}%</strong> nelle altre province. Il prezzo al fornitore si arrotonda a 5 o a 0. Qui si personalizza una provincia: vuoto = predefinito. Personalizzate: {personalizzate}.
        </p>
      )}
      {errore && <p className="avviso-errore">{errore}</p>}
      <div className="filtri"><input className="campo" placeholder="Cerca provincia…" value={cerca} onChange={(e) => setCerca(e.target.value)} /></div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left' }}>Provincia</th><th>Con partner %</th><th>Senza partner %</th><th style={{ textAlign: 'left' }}>Nota</th><th></th></tr></thead>
        <tbody>
          {visibili.map((s) => (
            <tr key={s.provincia}>
              <td><strong>{s.provincia}</strong> <span className="cella-muta">{s.nome}</span></td>
              <td style={{ textAlign: 'center' }}>
                <input className="campo" type="number" min={0} max={100} style={{ width: 90 }} disabled={!amministratore} placeholder={String(s.predefinitoConPartner)} value={s.conPartner ?? ''} onChange={(e) => setRighe((rs) => rs.map((r) => (r.provincia === s.provincia ? { ...r, conPartner: e.target.value === '' ? null : Number(e.target.value) } : r)))} />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input className="campo" type="number" min={0} max={100} style={{ width: 90 }} disabled={!amministratore} placeholder={String(s.predefinitoSenzaPartner)} value={s.senzaPartner ?? ''} onChange={(e) => setRighe((rs) => rs.map((r) => (r.provincia === s.provincia ? { ...r, senzaPartner: e.target.value === '' ? null : Number(e.target.value) } : r)))} />
              </td>
              <td><input className="campo" style={{ width: '100%' }} disabled={!amministratore} value={s.nota} onChange={(e) => setRighe((rs) => rs.map((r) => (r.provincia === s.provincia ? { ...r, nota: e.target.value } : r)))} /></td>
              <td>{amministratore && <button type="button" className="bottone secondario mini" disabled={salvando === s.provincia} onClick={() => salva(s)}>Salva</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PartnerPerProvincia() {
  const [provincia, setProvincia] = useState('MI')
  const [stato, setStato] = useState<Stato | null>(null)
  const [errore, setErrore] = useState('')
  const [caricando, setCaricando] = useState(false)
  const carica = useCallback(async (fresco = false) => {
    setCaricando(true)
    setErrore('')
    const r = await fetch(`/api/vendite/partner?provincia=${encodeURIComponent(provincia)}${fresco ? '&fresco=1' : ''}`)
    const d = await r.json()
    setCaricando(false)
    if (!r.ok) { setStato(null); return setErrore(d.errore ?? 'Errore') }
    setStato(d)
  }, [provincia])
  useEffect(() => { void carica() }, [carica])
  return (
    <div className="card">
      <div className="filtri">
        <input className="campo" style={{ width: 90 }} value={provincia} onChange={(e) => setProvincia(e.target.value.toUpperCase())} placeholder="MI" />
        <button type="button" className="bottone secondario mini" onClick={() => carica(true)} disabled={caricando}>Rileggi dalla piattaforma</button>
      </div>
      {errore && <p className="avviso-errore">{errore}</p>}
      {stato && (
        <>
          <p className="descrizione">
            <strong>{stato.provincia} · {stato.nome}</strong> — {stato.conPartner ? 'CON partner (ha una lista con un partner attivo)' : 'SENZA partner (nessuna lista con partner attivi)'} → sconto <strong>{stato.sconto.sconto}%</strong> ({stato.sconto.regola}: {stato.sconto.motivo}). Aree commerciali: {stato.areeCommerciali.map((a) => a.nome).join(', ') || '—'}.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Partner</th><th style={{ textAlign: 'left' }}>Mestieri</th><th>Consegna da solo</th><th>Qui</th><th>Minimo €</th><th>Raggio km</th><th style={{ textAlign: 'left' }}>Aree</th></tr></thead>
            <tbody>
              {stato.partner.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.insegna}</strong> <span className="cella-muta">{p.citta ?? ''}</span>{p.esclusoDalleProposte && <> <span className="badge">escluso dalle proposte</span></>}</td>
                  <td>{p.mestieri.join(', ')}</td>
                  <td style={{ textAlign: 'center' }}>{p.consegnaDaPartner ? <span className="badge verde">sì</span> : <span className="badge">no</span>}</td>
                  <td style={{ textAlign: 'center' }}>{p.consegnaDaPartner ? (p.consegnaInProvincia ? <span className="badge verde">sì</span> : <span className="badge rosso">no</span>) : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{p.minimoOrdine ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>{p.raggioKm ?? '—'}</td>
                  <td>{p.areeCommerciali.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stato.listePriorita.length > 0 && (
            <p className="descrizione" style={{ marginTop: 12 }}>
              Liste della provincia (piattaforma): {stato.listePriorita.map((l) => `${l.mestiere ?? l.categoria}: ${l.partner.map((x) => x.insegna).join(' › ')}`).join(' · ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Liste({ amministratore }: { amministratore: boolean }) {
  const [liste, setListe] = useState<Lista[]>([])
  const [errore, setErrore] = useState('')
  const [esito, setEsito] = useState('')
  const [lavoro, setLavoro] = useState(false)
  const [mestiere, setMestiere] = useState('')
  const carica = useCallback(async () => {
    const r = await fetch('/api/vendite/liste')
    const d = await r.json()
    if (!r.ok) return setErrore(d.errore ?? 'Errore')
    setListe(d.liste)
  }, [])
  useEffect(() => { void carica() }, [carica])
  const importa = async () => {
    setLavoro(true); setErrore(''); setEsito('')
    const r = await fetch('/api/vendite/liste', { method: 'POST' })
    const d = await r.json()
    setLavoro(false)
    if (!r.ok) return setErrore(d.errore ?? 'Errore')
    setEsito(`Importate dalla piattaforma: ${d.aree} aree, ${d.create} liste nuove, ${d.aggiornate} aggiornate, ${d.lasciate} lasciate perché modificate a mano.`)
    setListe(d.liste)
  }
  const salva = async (l: Lista, partner: Lista['partner']) => {
    setLavoro(true)
    const r = await fetch('/api/vendite/liste', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: l.id, partner }) })
    const d = await r.json()
    setLavoro(false)
    if (!r.ok) return setErrore(d.errore ?? 'Errore')
    setListe(d.liste)
  }
  const ripristina = async (l: Lista) => {
    const r = await fetch('/api/vendite/liste', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: l.id, ripristina: true }) })
    const d = await r.json()
    if (!r.ok) return setErrore(d.errore ?? 'Errore')
    setListe(d.liste)
  }
  const sposta = (l: Lista, i: number, verso: -1 | 1) => {
    const p = [...l.partner]
    const j = i + verso
    if (j < 0 || j >= p.length) return
    ;[p[i], p[j]] = [p[j], p[i]]
    void salva(l, p)
  }
  const togli = (l: Lista, i: number) => void salva(l, l.partner.filter((_, k) => k !== i))
  const mestieri = [...new Set(liste.map((l) => l.mestiere))].sort()
  const visibili = liste.filter((l) => !mestiere || l.mestiere === mestiere)
  return (
    <div className="card">
      <p className="descrizione">Le liste dicono a chi proporre per primo un ordine, per <strong>area commerciale</strong> (gruppo di province della piattaforma) e mestiere. Si importano dalla piattaforma consegne; una lista riordinata qui non viene più sovrascritta finché non la ripristini. Per ora si smistano da qui solo i <strong>fiori</strong>.</p>
      <div className="filtri">
        {amministratore && <button type="button" className="bottone mini" onClick={importa} disabled={lavoro}>Importa dalla piattaforma</button>}
        <select className="campo" value={mestiere} onChange={(e) => setMestiere(e.target.value)}>
          <option value="">Tutti i mestieri</option>
          {mestieri.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {errore && <p className="avviso-errore">{errore}</p>}
      {esito && <p className="avviso-ok">{esito}</p>}
      {visibili.length === 0 && <p className="descrizione">Nessuna lista: importa dalla piattaforma.</p>}
      {visibili.map((l) => (
        <div key={l.id} className="card" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <div><strong>{l.area}</strong> · {l.mestiere} <span className="cella-muta">({l.province.join(', ')})</span></div>
            <div className="cella-muta">
              {l.modificataIl ? `modificata a mano da ${l.modificataDa ?? '?'}` : `da ${l.origine}`}
              {amministratore && l.modificataIl && <> · <button type="button" className="bottone secondario mini" onClick={() => ripristina(l)}>ripristina all&apos;importazione</button></>}
            </div>
          </div>
          <ol style={{ margin: '8px 0 0', paddingLeft: 22 }}>
            {l.partner.map((p, i) => (
              <li key={p.id} style={{ margin: '2px 0' }}>
                {p.insegna}
                {amministratore && (
                  <>
                    {' '}<button type="button" className="bottone secondario mini" disabled={lavoro || i === 0} onClick={() => sposta(l, i, -1)} title="Su">↑</button>
                    {' '}<button type="button" className="bottone secondario mini" disabled={lavoro || i === l.partner.length - 1} onClick={() => sposta(l, i, 1)} title="Giù">↓</button>
                    {' '}<button type="button" className="bottone secondario mini" disabled={lavoro} onClick={() => togli(l, i)} title="Togli">✕</button>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

// ⭐ 06/09/2026 sera — LISTE DI PRODOTTO (regola utente).
// Due tipologie sole: «a quantità» (il prezzo è quello unitario del partner) e «a preventivo»
// (nessuno ha un prezzo: si chiede, e la risposta resta scritta qui per le prossime vendite).
// I «mix» non entrano: là il prezzo lo fa la regola del territorio, e una lista di prodotto
// sarebbe una seconda verità sullo stesso numero.
type RigaProdotto = { id: string; codice: string; prodotto: string; variante: string; tipologia: string; mestiere: string; provincia: string; partnerId: string; partner: string; prezzo: number; unita: string; pubblico: number | null; fonte: string; nota: string; rispostoIl: string | null }
type RigaLista = { partnerId: string; partner: string; posizione: number; prezzo: number | null; unita: string; fonte: string | null; chiestoIl: string | null; rispostoIl: string | null; nota: string }

function ListeProdotto({ amministratore }: { amministratore: boolean }) {
  const [righe, setRighe] = useState<RigaProdotto[]>([])
  const [tipologia, setTipologia] = useState('')
  const [cerca, setCerca] = useState('')
  const [errore, setErrore] = useState('')
  const [esito, setEsito] = useState('')
  const [lavoro, setLavoro] = useState(false)
  const [aperto, setAperto] = useState<{ codice: string; prodotto: string; mestiere: string; provincia: string } | null>(null)
  const [lista, setLista] = useState<RigaLista[]>([])
  const [nuovo, setNuovo] = useState<Record<string, string>>({})

  const carica = useCallback(async () => {
    const q = new URLSearchParams()
    if (tipologia) q.set('tipologia', tipologia)
    if (cerca.trim()) q.set('cerca', cerca.trim())
    const r = await fetch(`/api/vendite/prodotti?${q}`)
    const d = await r.json()
    if (!r.ok) return setErrore(d.errore ?? 'Errore')
    setErrore('')
    setRighe(d.righe)
  }, [tipologia, cerca])
  useEffect(() => { void carica() }, [carica])

  const importa = async () => {
    setLavoro(true); setErrore(''); setEsito('')
    const r = await fetch('/api/vendite/prodotti', { method: 'POST' })
    const d = await r.json()
    setLavoro(false)
    if (!r.ok) return setErrore(d.errore ?? 'Errore')
    setEsito(`Letti ${d.letti} prezzi dalla piattaforma: ${d.create} nuovi, ${d.aggiornate} aggiornati, ${d.lasciate} lasciati perché sono preventivi scritti qui.`)
    void carica()
  }

  const apriLista = async (codice: string, prodotto: string, mestiere: string, provincia: string) => {
    setAperto({ codice, prodotto, mestiere, provincia })
    const q = new URLSearchParams({ codice, provincia })
    if (mestiere) q.set('mestiere', mestiere)
    const res = await fetch(`/api/vendite/prodotti?${q}`)
    const d = await res.json()
    if (!res.ok) return setErrore(d.errore ?? 'Errore')
    setLista(d.righe)
    if (d.piattaforma !== 'ok') setErrore('La piattaforma consegne non ha risposto: i partner della provincia non sono stati letti.')
  }

  const apri = async (r: RigaProdotto) => {
    const prov = r.provincia || (typeof window !== 'undefined' ? window.prompt('Per quale provincia? (sigla, es. MI)')?.trim().toUpperCase() ?? '' : '')
    if (!prov) return
    await apriLista(r.codice, r.prodotto, r.mestiere, prov)
  }

  const scriviPreventivo = async (partnerId: string, partner: string) => {
    if (!aperto) return
    const prezzo = Number((nuovo[partnerId] ?? '').replace(',', '.'))
    if (!Number.isFinite(prezzo) || prezzo <= 0) return setErrore('Il preventivo è un prezzo maggiore di zero.')
    setLavoro(true)
    const r = await fetch('/api/vendite/prodotti', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ codice: aperto.codice, prodotto: aperto.prodotto, mestiere: aperto.mestiere, provincia: aperto.provincia, partnerId, partner, prezzo, tipologia: 'preventivo' }),
    })
    const d = await r.json()
    setLavoro(false)
    if (!r.ok) return setErrore(d.errore ?? 'Errore')
    setErrore('')
    setNuovo({ ...nuovo, [partnerId]: '' })
    await apriLista(aperto.codice, aperto.prodotto, aperto.mestiere, aperto.provincia)
    void carica()
  }

  const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

  return (
    <div className="card">
      <p className="descrizione">
        Qui stanno i prezzi che un <strong>partner</strong> fa su un <strong>prodotto</strong>, per i due casi in cui la percentuale di sconto non basta:
        i prodotti <strong>a quantità</strong> (12 rose = 12 × il suo prezzo a stelo) e quelli <strong>a preventivo</strong> (una torta di cake design).
        La tipologia la decide Merchandising. I preventivi scritti qui restano e valgono per le prossime vendite: l&apos;importazione dalla piattaforma non li tocca.
      </p>
      <div className="filtri">
        {amministratore && <button type="button" className="bottone mini" onClick={importa} disabled={lavoro}>Importa i prezzi dalla piattaforma</button>}
        <select className="campo" value={tipologia} onChange={(e) => setTipologia(e.target.value)}>
          <option value="">Tutte e due le tipologie</option>
          <option value="quantita">A quantità</option>
          <option value="preventivo">A preventivo</option>
        </select>
        <input className="campo" placeholder="Cerca prodotto, codice o partner" value={cerca} onChange={(e) => setCerca(e.target.value)} />
      </div>
      {errore && <p className="avviso-errore">{errore}</p>}
      {esito && <p className="avviso-ok">{esito}</p>}

      {aperto && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="page-head">
            <div>
              <h3 style={{ margin: 0 }}>{aperto.prodotto}</h3>
              <p className="page-sub">{aperto.codice} · {aperto.provincia}{aperto.mestiere ? ` · ${aperto.mestiere}` : ''} — i partner in ordine di priorità. Chi non ha un prezzo è chi devi ancora sentire.</p>
            </div>
            <button type="button" className="bottone secondario mini" onClick={() => setAperto(null)}>Chiudi</button>
          </div>
          <table className="tabella">
            <thead><tr><th>#</th><th>Partner</th><th>Prezzo</th><th>Da dove</th><th>Preventivo</th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.partnerId}>
                  <td>{r.posizione}</td>
                  <td>{r.partner}</td>
                  <td>{r.prezzo != null ? `${euro(r.prezzo)}${r.unita ? ` ${r.unita}` : ''}` : '—'}</td>
                  <td>{r.fonte === 'preventivo' ? 'preventivo dato dal partner' : r.fonte === 'piattaforma' ? 'prezzo già praticato' : 'mai chiesto'}</td>
                  <td>
                    {amministratore ? (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <input className="campo mini" style={{ width: 90 }} inputMode="decimal" placeholder="€" value={nuovo[r.partnerId] ?? ''} onChange={(e) => setNuovo({ ...nuovo, [r.partnerId]: e.target.value })} />
                        <button type="button" className="bottone mini" disabled={lavoro} onClick={() => scriviPreventivo(r.partnerId, r.partner)}>Scrivi</button>
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td colSpan={5}>Nessun partner con questo mestiere in {aperto.provincia}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <table className="tabella">
        <thead><tr><th>Prodotto</th><th>Codice</th><th>Tipologia</th><th>Partner</th><th>Provincia</th><th>Prezzo</th><th>Da dove</th><th></th></tr></thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.id}>
              <td>{r.prodotto}{r.variante ? ` · ${r.variante}` : ''}</td>
              <td className="mono">{r.codice}</td>
              <td>{r.tipologia === 'quantita' ? 'A quantità' : r.tipologia === 'preventivo' ? 'A preventivo' : r.tipologia}</td>
              <td>{r.partner}</td>
              <td>{r.provincia || 'ovunque'}</td>
              <td>{euro(r.prezzo)}{r.unita ? ` ${r.unita}` : ''}</td>
              <td>{r.fonte === 'preventivo' ? 'preventivo' : 'già praticato'}</td>
              <td><button type="button" className="bottone secondario mini" onClick={() => apri(r)}>Chi altro</button></td>
            </tr>
          ))}
          {righe.length === 0 && <tr><td colSpan={8}>Nessuna riga: importa i prezzi dalla piattaforma, o scrivi il primo preventivo da un ordine.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
