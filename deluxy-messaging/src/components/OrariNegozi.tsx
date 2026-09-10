'use client'
import { useCallback, useEffect, useState } from 'react'
import { chiediJson, frasePerEsito } from '@/lib/leggi-json'
import { Conferma } from '@/components/Conferma'
import {
  adessoRoma,
  calendarioConsegna,
  GIORNI_IN_ORDINE,
  NOMI_GIORNI,
  NOMI_GIORNI_CORTI,
  REGOLE_DELUXY,
  REGOLE_FASCE_AMPIE,
  scriviDataBreve,
  validaOrario,
  type OrarioNegozioDati,
  type RegoleConsegna,
} from '@/lib/orari-regole'

// ⭐ 10/09/2026 — ORARI NEGOZI (richiesta dell'utente: «crea una sezione ORARI
// NEGOZI dove impostiamo per i negozi shopify apertura del negozio (quindi se
// la data è selezionabile), fasce orarie di consegna con orario minimo e
// massimo, giorni di chiusura»; poi, la sera: «prepara le version to work di
// Shopify in modo tale che tutte le tabelle recepiscano le date da te»).
//
// Una scheda per negozio, tre blocchi: i giorni della settimana in cui è
// aperto, le REGOLE delle fasce (finestra della giornata, durata per oggi /
// domani / oltre, quante fasce saltare dopo quella in corso, ora limite per
// oggi), i giorni di chiusura (data, motivo, «ogni anno»). Sotto, l'anteprima
// dei prossimi 14 giorni CALCOLATA ADESSO: le stesse fasce che vedono il
// cliente sul sito e l'operatore in Nuovo ordine.
//
// ⚠️ Le regole (validazione, «si può scegliere?», quali fasce) NON stanno qui:
// stanno in src/lib/orari-regole.ts, usate anche dal server e dall'API
// pubblica dei siti. Qui si chiamano soltanto.

type Riga = {
  negozio: { id: string; nome: string; dominio: string; attivo: boolean }
  orario: OrarioNegozioDati
  configurato: boolean
  modificatoDa: string | null
  aggiornatoIl: string | null
}

export function OrariNegozi({ amministratore }: { amministratore: boolean }) {
  const [righe, setRighe] = useState<Riga[] | null>(null)
  const [nota, setNota] = useState('')
  const carica = useCallback(async () => {
    const e = await chiediJson<{ negozi: Riga[] }>('/api/orari-negozi')
    if (e.stato !== 'ok') return setNota(frasePerEsito(e))
    setRighe(e.dati.negozi)
    setNota(e.dati.negozi.length ? '' : 'Nessun negozio: si aggiungono dalla pagina Negozi.')
  }, [])
  useEffect(() => {
    carica()
  }, [carica])

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Orari negozi</h1>
          <p className="page-sub">
            Quando si può consegnare, negozio per negozio: i giorni in cui è aperto (cioè quali date si
            possono scegliere), le regole delle fasce orarie (finestra, durata, anticipo, ora limite) e i
            giorni di chiusura. Le stesse regole le legge il sito Shopify per il suo calendario e il modulo
            «Nuovo ordine». Un negozio senza orari salvati non ha regole: il sito tiene le sue.
          </p>
        </div>
      </div>
      {!amministratore ? (
        <p className="descrizione" style={{ marginTop: 0 }}>
          Puoi leggere gli orari; a cambiarli è un amministratore.
        </p>
      ) : null}
      {nota ? <div className="avviso-errore">{nota}</div> : null}
      {righe === null && !nota ? <p style={{ color: 'var(--text-secondary)' }}>Carico…</p> : null}
      <div style={{ display: 'grid', gap: 18 }}>
        {(righe ?? []).map((r) => (
          <SchedaNegozio key={r.negozio.id} riga={r} amministratore={amministratore} onSalvata={carica} />
        ))}
      </div>
    </div>
  )
}

function SchedaNegozio({ riga, amministratore, onSalvata }: { riga: Riga; amministratore: boolean; onSalvata: () => void }) {
  const [dati, setDati] = useState<OrarioNegozioDati>(riga.orario)
  const [sporco, setSporco] = useState(false)
  const [errori, setErrori] = useState<string[]>([])
  const [esito, setEsito] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [chiediAzzera, setChiediAzzera] = useState(false)
  const [oraProva, setOraProva] = useState('')

  useEffect(() => {
    if (!sporco) setDati(riga.orario)
  }, [riga.orario, sporco])

  const cambia = (f: (d: OrarioNegozioDati) => OrarioNegozioDati) => {
    setDati((d) => f(d))
    setSporco(true)
    setEsito('')
  }
  const cambiaRegole = (f: (r: RegoleConsegna) => RegoleConsegna) => cambia((d) => ({ ...d, regole: f(d.regole) }))
  const soloLettura = !amministratore

  async function salva() {
    const controllo = validaOrario(dati)
    if (!controllo.ok) return setErrori(controllo.errori)
    setErrori([])
    setSalvando(true)
    try {
      const r = await fetch('/api/orari-negozi', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negozioId: riga.negozio.id, ...controllo.dati }),
      })
      const d = (await r.json().catch(() => ({}))) as { errore?: string; errori?: string[] }
      if (!r.ok) return setErrori(d.errori?.length ? d.errori : [d.errore ?? 'Non salvato.'])
      setSporco(false)
      setEsito('Salvato: il sito e Nuovo ordine leggono già queste regole.')
      onSalvata()
    } catch {
      setErrori(['Non salvato: problema di rete.'])
    } finally {
      setSalvando(false)
    }
  }

  async function azzera() {
    setChiediAzzera(false)
    setSalvando(true)
    try {
      const r = await fetch('/api/orari-negozi?negozio=' + encodeURIComponent(riga.negozio.id), { method: 'DELETE' })
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { errore?: string }
        return setErrori([d.errore ?? 'Non ripristinato.'])
      }
      setSporco(false)
      setErrori([])
      setEsito('Orari cancellati: il negozio è di nuovo senza regole.')
      onSalvata()
    } finally {
      setSalvando(false)
    }
  }

  // L'anteprima si calcola con l'ora italiana di ADESSO, oppure con un'ora di
  // prova scritta dall'amministratore («cosa vede un cliente alle 19:30?»).
  const adesso = adessoRoma()
  const adessoProva = /^([01]\d|2[0-3]):([0-5]\d)$/.test(oraProva)
    ? { data: adesso.data, minuti: Number(oraProva.slice(0, 2)) * 60 + Number(oraProva.slice(3, 5)) }
    : adesso
  const anteprima = calendarioConsegna(dati, adessoProva, {}, 14)
  const aperti = anteprima.filter((g) => g.ok).length
  const r = dati.regole
  const campoNum = (etichetta: string, valore: number, onChange: (n: number) => void, min: number, max: number) => (
    <label className="campo" style={{ marginBottom: 0 }}>
      <span>{etichetta}</span>
      <input type="number" min={min} max={max} value={Number.isFinite(valore) ? valore : ''} disabled={soloLettura} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 90 }} />
    </label>
  )
  const campoOra = (etichetta: string, valore: string, onChange: (s: string) => void) => (
    <label className="campo" style={{ marginBottom: 0 }}>
      <span>{etichetta}</span>
      <input type="time" value={valore} disabled={soloLettura} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
  const stesseRegole = (a: RegoleConsegna, b: RegoleConsegna) => JSON.stringify(a) === JSON.stringify(b)

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, flex: 1, minWidth: 160 }}>{riga.negozio.nome || riga.negozio.dominio}</h2>
        <span className={`badge ${riga.configurato ? 'verde' : ''}`}>{riga.configurato ? 'impostato' : 'senza orari'}</span>
        {!riga.negozio.attivo ? <span className="badge">negozio sospeso</span> : null}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
        {riga.negozio.dominio}
        {riga.configurato && riga.aggiornatoIl
          ? ` · ultima modifica ${new Date(riga.aggiornatoIl).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}${riga.modificatoDa ? ` di ${riga.modificatoDa}` : ''}`
          : ' · nessuno ha ancora impostato niente: finché non salvi, il sito tiene le sue regole e Nuovo ordine usa le fasce storiche del marchio. Qui sotto un punto di partenza da correggere.'}
      </p>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {/* ── 1. GIORNI DI APERTURA ── */}
        <section>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Giorni di apertura</h3>
          <p className="descrizione" style={{ margin: '0 0 10px' }}>
            Nei giorni spenti la data non si può scegliere.
          </p>
          <div className="filtri" role="group" aria-label="Giorni della settimana">
            {GIORNI_IN_ORDINE.map((g) => {
              const acceso = dati.giorniApertura.includes(g)
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={acceso}
                  disabled={soloLettura}
                  className={`bottone mini ${acceso ? '' : 'secondario'}`}
                  title={NOMI_GIORNI[g]}
                  onClick={() =>
                    cambia((d) => ({
                      ...d,
                      giorniApertura: acceso ? d.giorniApertura.filter((x) => x !== g) : [...d.giorniApertura, g].sort(),
                    }))
                  }
                >
                  {NOMI_GIORNI_CORTI[g]}
                </button>
              )
            })}
          </div>

          <h3 style={{ margin: '18px 0 4px', fontSize: 15 }}>Giorni di chiusura</h3>
          <p className="descrizione" style={{ margin: '0 0 10px' }}>
            Una data e il motivo. «Ogni anno» per le feste fisse (Natale, Ferragosto).
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {dati.giorniChiusura.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={c.data}
                  disabled={soloLettura}
                  aria-label={`Chiusura ${i + 1}: data`}
                  onChange={(e) => cambia((d) => ({ ...d, giorniChiusura: d.giorniChiusura.map((x, j) => (j === i ? { ...x, data: e.target.value } : x)) }))}
                />
                <input
                  value={c.motivo}
                  disabled={soloLettura}
                  placeholder="motivo (es. Natale)"
                  aria-label={`Chiusura ${i + 1}: motivo`}
                  style={{ flex: 1, minWidth: 120 }}
                  onChange={(e) => cambia((d) => ({ ...d, giorniChiusura: d.giorniChiusura.map((x, j) => (j === i ? { ...x, motivo: e.target.value } : x)) }))}
                />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={c.ogniAnno}
                    disabled={soloLettura}
                    onChange={(e) => cambia((d) => ({ ...d, giorniChiusura: d.giorniChiusura.map((x, j) => (j === i ? { ...x, ogniAnno: e.target.checked } : x)) }))}
                  />
                  ogni anno
                </label>
                {!soloLettura ? (
                  <button type="button" className="bottone secondario mini" aria-label={`Togli la chiusura ${i + 1}`} onClick={() => cambia((d) => ({ ...d, giorniChiusura: d.giorniChiusura.filter((_, j) => j !== i) }))}>
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
            {!dati.giorniChiusura.length ? (
              <p className="descrizione" style={{ margin: 0 }}>
                Nessun giorno di chiusura.
              </p>
            ) : null}
            {!soloLettura ? (
              <button type="button" className="bottone secondario mini" style={{ alignSelf: 'flex-start' }} onClick={() => cambia((d) => ({ ...d, giorniChiusura: [...d.giorniChiusura, { data: '', motivo: '', ogniAnno: false }] }))}>
                + Aggiungi giorno
              </button>
            ) : null}
          </div>
        </section>

        {/* ── 2. REGOLE DELLE FASCE ── */}
        <section>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Regole delle fasce orarie</h3>
          <p className="descrizione" style={{ margin: '0 0 10px' }}>
            Le fasce si calcolano da queste regole, per oggi, domani e i giorni dopo. Sull&apos;ordine si
            scrivono come le scrivono i siti (es. «14-16»).
          </p>
          {!soloLettura ? (
            <div className="filtri" style={{ marginBottom: 10 }}>
              <button type="button" className={`bottone mini ${stesseRegole(r, REGOLE_DELUXY) ? '' : 'secondario'}`} onClick={() => cambiaRegole(() => ({ ...REGOLE_DELUXY, oggi: { ...REGOLE_DELUXY.oggi }, domani: { ...REGOLE_DELUXY.domani }, oltre: { ...REGOLE_DELUXY.oltre } }))} title="Oggi a 2 ore dalla seconda fascia dopo quella in corso, limite 20:00; domani a 2 ore; oltre a 1 ora; finestra 08-22">
                Regole deluxy.it
              </button>
              <button type="button" className={`bottone mini ${stesseRegole(r, REGOLE_FASCE_AMPIE) ? '' : 'secondario'}`} onClick={() => cambiaRegole(() => ({ ...REGOLE_FASCE_AMPIE, oggi: { ...REGOLE_FASCE_AMPIE.oggi }, domani: { ...REGOLE_FASCE_AMPIE.domani }, oltre: { ...REGOLE_FASCE_AMPIE.oltre } }))} title="Tre fasce ampie 08-12 · 12-16 · 16-20, limite 16:00">
                Tre fasce ampie
              </button>
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {campoOra('Si consegna dalle', r.finestraDa, (s) => cambiaRegole((x) => ({ ...x, finestraDa: s })))}
            {campoOra('alle', r.finestraA, (s) => cambiaRegole((x) => ({ ...x, finestraA: s })))}
          </div>
          <h4 style={{ margin: '14px 0 6px', fontSize: 13.5 }}>Oggi (consegna in giornata)</h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 8 }}>
            <input type="checkbox" checked={r.oggi.attivo} disabled={soloLettura} onChange={(e) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, attivo: e.target.checked } }))} />
            si consegna anche in giornata
          </label>
          {r.oggi.attivo ? (
            <>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                {campoNum('Fasce di (ore)', r.oggi.durataOre, (n) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, durataOre: n } })), 1, 12)}
                {campoNum('Fasce da saltare dopo quella in corso', r.oggi.saltaFasce, (n) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, saltaFasce: n } })), 0, 6)}
                {campoOra('Non si ordina più dalle', r.oggi.limiteOra, (s) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, limiteOra: s } })))}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 8 }}>
                <input type="checkbox" checked={r.oggi.ultimaFasciaFinoAlLimite} disabled={soloLettura} onChange={(e) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, ultimaFasciaFinoAlLimite: e.target.checked } }))} />
                l&apos;ultima fascia della giornata resta ordinabile fino all&apos;ora limite
              </label>
              <p className="descrizione" style={{ margin: '6px 0 0' }}>
                Con «2 fasce da saltare»: alle 10:30 la fascia in corso è 10-12, si salta 12-14, la prima è 14-16. Di notte si
                conta dall&apos;apertura.
              </p>
            </>
          ) : null}
          <h4 style={{ margin: '14px 0 6px', fontSize: 13.5 }}>Domani</h4>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {campoNum('Fasce di (ore)', r.domani.durataOre, (n) => cambiaRegole((x) => ({ ...x, domani: { ...x.domani, durataOre: n } })), 1, 12)}
            {campoNum('Prime fasce da saltare se si ordina dopo il limite', r.domani.dopoLimiteSaltaFasce, (n) => cambiaRegole((x) => ({ ...x, domani: { ...x.domani, dopoLimiteSaltaFasce: n } })), 0, 6)}
          </div>
          <h4 style={{ margin: '14px 0 6px', fontSize: 13.5 }}>Dopodomani e oltre</h4>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {campoNum('Fasce di (ore)', r.oltre.durataOre, (n) => cambiaRegole((x) => ({ ...x, oltre: { durataOre: n } })), 1, 12)}
            {campoNum('Giorni mostrati sul sito', r.giorniMostrati, (n) => cambiaRegole((x) => ({ ...x, giorniMostrati: n })), 7, 365)}
          </div>
          <p className="descrizione" style={{ margin: '8px 0 0' }}>
            L&apos;orario di disponibilità minima dei prodotti nel carrello (metafield <code>minimo_orario</code>) e il loro
            preavviso lo passa il sito: tolgono le fasce che cominciano prima e i giorni troppo vicini.
          </p>
        </section>
      </div>

      <label className="campo" style={{ marginTop: 16 }}>
        <span>Nota (facoltativa, la legge chi apre questa pagina)</span>
        <input value={dati.nota} disabled={soloLettura} maxLength={500} placeholder="es. d'estate si consegna solo la mattina" onChange={(e) => cambia((d) => ({ ...d, nota: e.target.value }))} />
      </label>

      {/* ── ANTEPRIMA: i prossimi 14 giorni come li vede chi ordina ADESSO ── */}
      <div style={{ marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Prossimi 14 giorni: <strong style={{ color: 'var(--text)' }}>{aperti}</strong> in cui si può consegnare, calcolati alle{' '}
            <strong style={{ color: 'var(--text)' }}>{String(Math.floor(adessoProva.minuti / 60)).padStart(2, '0')}:{String(adessoProva.minuti % 60).padStart(2, '0')}</strong> (ora italiana)
          </p>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            prova come se fossero le
            <input type="time" value={oraProva} onChange={(e) => setOraProva(e.target.value)} aria-label="Ora di prova" />
            {oraProva ? (
              <button type="button" className="bottone secondario mini" onClick={() => setOraProva('')}>
                adesso
              </button>
            ) : null}
          </label>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {anteprima.map((g) => (
            <div key={g.data} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className={`badge ${g.ok ? 'verde' : 'rosso'}`} style={{ minWidth: 150 }}>
                {g.quando === 'oggi' ? 'Oggi, ' : g.quando === 'domani' ? 'Domani, ' : ''}
                {scriviDataBreve(g.data).slice(0, 9)}
              </span>
              <span style={{ fontSize: 13, color: g.ok ? 'var(--text)' : 'var(--text-secondary)' }}>
                {g.ok ? g.etichette.join(' · ') : g.motivo}
              </span>
            </div>
          ))}
        </div>
      </div>

      {errori.length ? (
        <div className="avviso-errore" style={{ marginTop: 14 }}>
          {errori.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      ) : null}
      {esito ? <div className="avviso-ok" style={{ marginTop: 14 }}>{esito}</div> : null}

      {amministratore ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" className="bottone" disabled={salvando || !sporco} onClick={salva}>
            {salvando ? 'Salvo…' : 'Salva'}
          </button>
          {sporco ? (
            <button
              type="button"
              className="bottone secondario"
              disabled={salvando}
              onClick={() => {
                setDati(riga.orario)
                setSporco(false)
                setErrori([])
              }}
            >
              Annulla le modifiche
            </button>
          ) : null}
          {riga.configurato ? (
            <button type="button" className="bottone secondario" disabled={salvando} onClick={() => setChiediAzzera(true)} style={{ marginLeft: 'auto' }}>
              Cancella gli orari
            </button>
          ) : null}
        </div>
      ) : null}

      {chiediAzzera ? (
        <Conferma titolo={`Cancellare gli orari di ${riga.negozio.nome || riga.negozio.dominio}?`} verbo="Cancella gli orari" pericoloso onConferma={azzera} onAnnulla={() => setChiediAzzera(false)}>
          Si cancellano i giorni di apertura, le regole delle fasce e le chiusure scritte per questo negozio. Il negozio
          resta senza regole: il sito torna alle sue e Nuovo ordine alle fasce storiche del marchio.
        </Conferma>
      ) : null}
    </div>
  )
}
