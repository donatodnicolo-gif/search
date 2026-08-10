'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type Condizioni = {
  q?: string
  da?: string
  a?: string
  dal?: string
  al?: string
  allegati?: string
  dove?: string
  sezione?: string
}

/**
 * LE CONDIZIONI DI RICERCA: chi ha scritto, a chi, in che periodo, con
 * allegati, e dove cercare le parole.
 *
 * ⚠️ Stanno tutte nell'INDIRIZZO (`?q=…&da=…&dal=…`), non in uno stato del
 * componente: una ricerca costruita in sei mosse si può ricaricare, mandare a
 * un collega e tenere fra i preferiti. Una ricerca che esiste solo finché non
 * ricarichi la pagina è una ricerca che rifarai a mano.
 * ⚠️ Le condizioni valgono anche SENZA parole da cercare: «tutto quello che mi
 * ha mandato Martina a settembre, con allegati» è una domanda completa. Per
 * questo la pagina entra in modalità ricerca se c'è `q` **oppure** una qualsiasi
 * condizione.
 */
const ETICHETTE: Record<string, string> = {
  da: 'da',
  a: 'a',
  dal: 'dal',
  al: 'al',
  allegati: 'con allegati',
  dove: 'cerca in',
}

export function CondizioniRicerca({ valori, sezioni }: { valori: Condizioni; sezioni: { id: string; nome: string }[] }) {
  const router = useRouter()
  const attive = Object.entries(valori).filter(([k, v]) => k !== 'q' && v)
  const [aperto, setAperto] = useState(attive.length > 0)
  const [c, setC] = useState<Condizioni>(valori)

  const applica = (prossime: Condizioni) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(prossime)) if (v) p.set(k, String(v))
    router.push(p.toString() ? `/?${p}` : '/')
  }

  const togli = (chiave: string) => {
    const prossime = { ...valori, [chiave]: undefined }
    setC(prossime)
    applica(prossime)
  }

  const nomeSezione = (id: string) => sezioni.find((s) => s.id === id)?.nome ?? 'sezione'

  return (
    <div style={{ margin: '10px 0 4px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="azione-riga" onClick={() => setAperto((v) => !v)}>
          {aperto ? '▾' : '+'} Condizioni di ricerca
        </button>

        {/* Le condizioni attive, ognuna con la sua ✕: si vede a colpo d'occhio
            perché quel risultato è quello che è. */}
        {attive.map(([k, v]) => (
          <span key={k} className="badge neutral" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {ETICHETTE[k] ?? k}
            {k === 'allegati' ? '' : `: ${k === 'sezione' ? nomeSezione(String(v)) : v}`}
            <button
              type="button"
              onClick={() => togli(k)}
              title="Togli questa condizione"
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {aperto && (
        <div className="card tight" style={{ padding: 14, marginTop: 8 }}>
          <div className="form-grid">
            <div>
              <label className="field-label">Da (mittente)</label>
              <input
                type="text"
                value={c.da ?? ''}
                onChange={(e) => setC({ ...c, da: e.target.value })}
                placeholder="nome o indirizzo"
              />
            </div>
            <div>
              <label className="field-label">A (destinatario)</label>
              <input
                type="text"
                value={c.a ?? ''}
                onChange={(e) => setC({ ...c, a: e.target.value })}
                placeholder="nome o indirizzo"
              />
            </div>
            <div>
              <label className="field-label">Dal</label>
              <input type="date" value={c.dal ?? ''} onChange={(e) => setC({ ...c, dal: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Al</label>
              <input type="date" value={c.al ?? ''} onChange={(e) => setC({ ...c, al: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Cerca le parole in</label>
              <select value={c.dove ?? ''} onChange={(e) => setC({ ...c, dove: e.target.value })}>
                <option value="">Ovunque (oggetto, testo, persone)</option>
                <option value="oggetto">Solo nell’oggetto</option>
                <option value="corpo">Solo nel testo</option>
                <option value="persone">Solo fra mittente e destinatari</option>
              </select>
            </div>
            <div>
              <label className="field-label">Sezione</label>
              <select value={c.sezione ?? ''} onChange={(e) => setC({ ...c, sezione: e.target.value })}>
                <option value="">Tutte</option>
                {sezioni.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="full">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={c.allegati === '1'}
                  onChange={(e) => setC({ ...c, allegati: e.target.checked ? '1' : undefined })}
                />
                Solo mail con allegati
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary small" onClick={() => applica({ ...c, q: valori.q })}>
              Cerca
            </button>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => {
                setC({ q: valori.q })
                applica({ q: valori.q })
              }}
            >
              Azzera le condizioni
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Le condizioni valgono anche senza parole da cercare, e restano nell’indirizzo:
            questa ricerca la puoi ricaricare o tenere fra i preferiti.
          </div>
        </div>
      )}
    </div>
  )
}
