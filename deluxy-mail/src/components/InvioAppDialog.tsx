'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { proponiPerApp, eseguiInvioApp, type PropostaApp } from '@/lib/actions'
import type { AzioneDescritta } from '@/lib/appDeluxy'

/**
 * Il dialogo APP DELUXY, montato una volta sola nella pagina della posta.
 * Si apre con l'evento `aimail:app` (lo lanciano le carte del pannello al
 * drop e il bottone "→ App" sulla riga). Flusso: l'AI prepara i dati dalla
 * mail → l'utente li controlla (e può ritoccarli) → conferma → invio vero.
 */
export function InvioAppDialog({ azioni }: { azioni: AzioneDescritta[] }) {
  const [messaggioId, setMessaggioId] = useState<string | null>(null)
  const [proposta, setProposta] = useState<PropostaApp | null>(null)
  const [dati, setDati] = useState('')
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string; link?: string } | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const prepara = (id: string, azioneId?: string) =>
    start(async () => {
      setEsito(null)
      const p = await proponiPerApp(id, azioneId)
      setProposta(p)
      setDati(p.dati ?? '')
    })

  useEffect(() => {
    const su = (e: Event) => {
      const { messaggioId: id, azioneId } = (e as CustomEvent).detail as {
        messaggioId: string
        azioneId?: string
      }
      setMessaggioId(id)
      setProposta(null)
      setEsito(null)
      prepara(id, azioneId)
    }
    window.addEventListener('aimail:app', su)
    return () => window.removeEventListener('aimail:app', su)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const invia = () =>
    start(async () => {
      if (!messaggioId || !proposta?.azione) return
      const r = await eseguiInvioApp(messaggioId, proposta.azione.id, dati)
      setEsito(r)
      if (r.ok) router.refresh()
    })

  function chiudi() {
    setMessaggioId(null)
    setProposta(null)
    setEsito(null)
  }

  if (!messaggioId) return null

  return (
    <div className="modal-scrim" onClick={chiudi}>
      <div className="modal" role="dialog" aria-label="APP Deluxy" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {proposta?.azione ? `${proposta.azione.app} — ${proposta.azione.nome}` : 'APP Deluxy'}
        </div>

        {/* Sto preparando */}
        {inCorso && !esito && (
          <div className="ai-domanda">
            <span className="ai-mark">AI</span>
            <span>Leggo la mail e preparo i dati…</span>
          </div>
        )}

        {/* Nessuna regola: si sceglie l'app a mano */}
        {!inCorso && proposta && !proposta.ok && proposta.scegli && (
          <>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{proposta.messaggio}</p>
            <div className="scelta-nuova">
              {azioni.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="scelta-voce"
                  disabled={!a.configurata}
                  title={a.configurata ? undefined : 'Da collegare: manca la chiave API sul server.'}
                  onClick={() => prepara(messaggioId, a.id)}
                >
                  <span className={`badge ${a.colore}`} style={{ flex: '0 0 auto' }}>
                    <span className="dot" />
                    {a.app}
                  </span>
                  <span>
                    <span className="scelta-titolo">{a.nome}</span>
                    <span className="scelta-sub">
                      {a.configurata ? a.descrizione : 'Da collegare (chiave API mancante).'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Errore secco */}
        {!inCorso && proposta && !proposta.ok && !proposta.scegli && (
          <div style={{ fontSize: 13, color: 'var(--red)' }}>{proposta.messaggio}</div>
        )}

        {/* La proposta: dati estratti, modificabili prima dell'invio */}
        {!inCorso && proposta?.ok && proposta.azione && !esito?.ok && (
          <>
            <div className="ai-domanda">
              <span className="ai-mark">AI</span>
              <span>
                Ho preparato i dati per «{proposta.azione.nome}». Controllali (puoi correggerli):
                parte solo quando confermi tu.
              </span>
            </div>
            <textarea
              value={dati}
              onChange={(e) => setDati(e.target.value)}
              rows={Math.min(16, Math.max(6, dati.split('\n').length))}
              spellCheck={false}
              style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.5 }}
            />
          </>
        )}

        {/* Esito dell'invio */}
        {esito && (
          <div
            className={esito.ok ? 'ai-domanda' : undefined}
            style={{ marginTop: 10, fontSize: 13, color: esito.ok ? undefined : 'var(--red)' }}
          >
            {esito.ok && <span className="ai-mark">OK</span>}
            <span>
              {esito.messaggio}{' '}
              {esito.link && (
                <a href={esito.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                  Apri l’app
                </a>
              )}
            </span>
          </div>
        )}

        <div className="form-footer" style={{ marginTop: 14 }}>
          <button className="btn secondary" type="button" onClick={chiudi} disabled={inCorso}>
            {esito?.ok ? 'Chiudi' : 'Annulla'}
          </button>
          {proposta?.ok && proposta.azione && !esito?.ok && (
            <button className="btn primary" type="button" onClick={invia} disabled={inCorso || !dati.trim()}>
              {inCorso ? 'Invio…' : `Conferma e invia a ${proposta.azione.app}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
