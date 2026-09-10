'use client'
import { useCallback, useEffect, useState } from 'react'
import { chiediJson, frasePerEsito } from '@/lib/leggi-json'
import { Conferma } from '@/components/Conferma'
import {
  etichettaFascia,
  GIORNI_IN_ORDINE,
  NOMI_GIORNI,
  NOMI_GIORNI_CORTI,
  prossimiGiorni,
  scriviDataBreve,
  validaOrario,
  type OrarioNegozioDati,
} from '@/lib/orari-regole'

// ⭐ 10/09/2026 — ORARI NEGOZI (richiesta dell'utente: «crea una sezione ORARI
// NEGOZI dove impostiamo per i negozi shopify apertura del negozio (quindi se
// la data è selezionabile), fasce orarie di consegna con orario minimo e
// massimo, giorni di chiusura»).
//
// Una scheda per negozio, tre blocchi: i giorni della settimana in cui è
// aperto, le fasce orarie (ognuna con orario minimo e massimo), i giorni di
// chiusura (data, motivo, «ogni anno»). Sotto, l'anteprima dei prossimi 14
// giorni: si vede subito che cosa il cliente — e il modulo Nuovo ordine —
// potranno scegliere.
//
// ⚠️ Le regole (validazione, «si può scegliere?») NON stanno qui: stanno in
// src/lib/orari-regole.ts, usate anche dal server. Qui si chiamano soltanto,
// prima di salvare, per dire gli errori senza un giro di rete.

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
            possono scegliere), le fasce orarie di consegna con orario minimo e massimo, e i giorni di
            chiusura. Le stesse regole valgono nel modulo «Nuovo ordine»: una data chiusa non passa. Un
            negozio senza orari salvati non ha regole: nessuna data si blocca.
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

  // Se il server ci manda una versione nuova (dopo il salvataggio, o un
  // ripristino), la si prende — ma non sopra a quello che si sta scrivendo.
  useEffect(() => {
    if (!sporco) setDati(riga.orario)
  }, [riga.orario, sporco])

  const cambia = (f: (d: OrarioNegozioDati) => OrarioNegozioDati) => {
    setDati((d) => f(d))
    setSporco(true)
    setEsito('')
  }
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
      setEsito('Salvato.')
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

  const anteprima = prossimiGiorni(dati, 14)
  const aperti = anteprima.filter((g) => g.ok).length

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
          : ' · nessuno ha ancora impostato niente: finché non salvi, ogni data si può scegliere e Nuovo ordine usa le fasce storiche del marchio. Qui sotto un punto di partenza da correggere.'}
      </p>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
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
        </section>

        {/* ── 2. FASCE ORARIE ── */}
        <section>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Fasce orarie di consegna</h3>
          <p className="descrizione" style={{ margin: '0 0 10px' }}>
            Ogni fascia ha un orario minimo e uno massimo. Sull&apos;ordine si scrive come la scrivono i siti
            (es. «08-12»).
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {dati.fasce.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>dalle</span>
                <input
                  type="time"
                  value={f.da}
                  disabled={soloLettura}
                  aria-label={`Fascia ${i + 1}: orario minimo`}
                  onChange={(e) => cambia((d) => ({ ...d, fasce: d.fasce.map((x, j) => (j === i ? { ...x, da: e.target.value } : x)) }))}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>alle</span>
                <input
                  type="time"
                  value={f.a}
                  disabled={soloLettura}
                  aria-label={`Fascia ${i + 1}: orario massimo`}
                  onChange={(e) => cambia((d) => ({ ...d, fasce: d.fasce.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) }))}
                />
                <span className="badge" title="Come si legge sull'ordine">
                  {f.da && f.a ? etichettaFascia(f) : '—'}
                </span>
                {!soloLettura ? (
                  <button
                    type="button"
                    className="bottone secondario mini"
                    aria-label={`Togli la fascia ${i + 1}`}
                    onClick={() => cambia((d) => ({ ...d, fasce: d.fasce.filter((_, j) => j !== i) }))}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
            {!dati.fasce.length ? (
              <p className="descrizione" style={{ margin: 0 }}>
                Nessuna fascia: nel modulo Nuovo ordine restano le voci storiche del marchio.
              </p>
            ) : null}
            {!soloLettura ? (
              <button
                type="button"
                className="bottone secondario mini"
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  cambia((d) => {
                    const ultima = d.fasce[d.fasce.length - 1]
                    return { ...d, fasce: [...d.fasce, ultima ? { da: ultima.a, a: '' } : { da: '08:00', a: '12:00' }] }
                  })
                }
              >
                + Aggiungi fascia
              </button>
            ) : null}
          </div>
        </section>

        {/* ── 3. GIORNI DI CHIUSURA ── */}
        <section>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Giorni di chiusura</h3>
          <p className="descrizione" style={{ margin: '0 0 10px' }}>
            Una data e il motivo. «Ogni anno» per le feste fisse (Natale, Ferragosto): vale anche negli
            anni a venire.
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
                  <button
                    type="button"
                    className="bottone secondario mini"
                    aria-label={`Togli la chiusura ${i + 1}`}
                    onClick={() => cambia((d) => ({ ...d, giorniChiusura: d.giorniChiusura.filter((_, j) => j !== i) }))}
                  >
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
              <button
                type="button"
                className="bottone secondario mini"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => cambia((d) => ({ ...d, giorniChiusura: [...d.giorniChiusura, { data: '', motivo: '', ogniAnno: false }] }))}
              >
                + Aggiungi giorno
              </button>
            ) : null}
          </div>
        </section>
      </div>

      <label className="campo" style={{ marginTop: 16 }}>
        <span>Nota (facoltativa, la legge chi apre questa pagina)</span>
        <input
          value={dati.nota}
          disabled={soloLettura}
          maxLength={500}
          placeholder="es. d'estate si consegna solo la mattina"
          onChange={(e) => cambia((d) => ({ ...d, nota: e.target.value }))}
        />
      </label>

      {/* ── ANTEPRIMA: i prossimi 14 giorni come li vedrà chi ordina ── */}
      <div style={{ marginTop: 6 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Prossimi 14 giorni: <strong style={{ color: 'var(--text)' }}>{aperti}</strong> in cui si può consegnare
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {anteprima.map((g) => (
            <span key={g.data} className={`badge ${g.ok ? 'verde' : 'rosso'}`} title={g.ok ? 'si può scegliere' : g.motivo}>
              {scriviDataBreve(g.data).slice(0, 9)}
            </span>
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
        <Conferma
          titolo={`Cancellare gli orari di ${riga.negozio.nome || riga.negozio.dominio}?`}
          verbo="Cancella gli orari"
          pericoloso
          onConferma={azzera}
          onAnnulla={() => setChiediAzzera(false)}
        >
          Si cancellano i giorni di apertura, le fasce e le chiusure scritte per questo negozio. Il negozio
          resta senza regole: ogni data si potrà scegliere e Nuovo ordine tornerà alle fasce storiche del marchio.
        </Conferma>
      ) : null}
    </div>
  )
}
