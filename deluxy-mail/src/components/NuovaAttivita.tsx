'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attivitaDaComando, creaAttivitaManuale } from '@/lib/actions'
import { PRIORITA } from '@/lib/format'

/**
 * Due modi per aggiungere attività:
 *  - "Chiedi all'AI": scrivi un obiettivo a parole, l'AI lo scompone in attività.
 *  - "A mano": scrivi tu il compito; se lo colleghi a un contatto, l'AI può eseguirlo.
 */
export function NuovaAttivita() {
  const [comando, setComando] = useState('')
  const [manuale, setManuale] = useState(false)
  const [stato, setStato] = useState<{ ok: boolean; testo: string } | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const chiediAI = () =>
    start(async () => {
      setStato(null)
      const esito = await attivitaDaComando(comando)
      setStato({ ok: esito.ok, testo: esito.messaggio })
      if (esito.ok) setComando('')
      router.refresh()
    })

  const salvaManuale = (form: FormData) =>
    start(async () => {
      setStato(null)
      const esito = await creaAttivitaManuale(form)
      setStato({ ok: esito.ok, testo: esito.messaggio })
      if (esito.ok) {
        setManuale(false)
        router.refresh()
      }
    })

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea
          value={comando}
          onChange={(e) => setComando(e.target.value)}
          placeholder="Chiedi all’AI: es. “Prepara le mail di auguri di Natale per i partner”"
          rows={2}
          style={{ flex: 1, resize: 'vertical', fontSize: 14 }}
        />
        <button
          className="btn primary"
          onClick={chiediAI}
          disabled={inCorso || !comando.trim()}
          style={{ whiteSpace: 'nowrap' }}
        >
          {inCorso ? 'Penso…' : 'Chiedi all’AI'}
        </button>
      </div>

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn secondary small" type="button" onClick={() => setManuale((v) => !v)}>
          {manuale ? 'Chiudi' : '+ Nuova attività a mano'}
        </button>
        {stato && (
          <span style={{ fontSize: 12.5, color: stato.ok ? 'var(--text-secondary)' : 'var(--red)' }}>
            {stato.testo}
          </span>
        )}
      </div>

      {manuale && (
        <form
          action={salvaManuale}
          style={{ marginTop: 12, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}
        >
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">Titolo *</label>
            <input type="text" name="titolo" required placeholder="Es. Chiamare il fornitore per i tempi" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">Dettaglio</label>
            <input type="text" name="dettaglio" placeholder="Cosa fare, in pratica (opzionale)" />
          </div>
          <div>
            <label className="field-label">Priorità</label>
            <select name="priorita" defaultValue="P2">
              {PRIORITA.map((p) => (
                <option key={p.codice} value={p.codice}>
                  {p.codice} — {p.quando}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Scadenza</label>
            <input type="date" name="scadenza" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">Collega a un contatto (email, opzionale)</label>
            <input type="email" name="contattoEmail" placeholder="Così l’AI può eseguirla scrivendo la mail" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn primary" type="submit" disabled={inCorso}>
              {inCorso ? 'Salvo…' : 'Crea attività'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
