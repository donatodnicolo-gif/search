'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { proponiPerApp, eseguiInvioApp, cercaPartnerAnagrafiche, type PropostaApp } from '@/lib/actions'
import type { AzioneDescritta, CampoAzione } from '@/lib/appDeluxy'

type AziendaTrovata = { id: string; nome: string; citta: string | null; categoria: string | null; stato: string | null }

/**
 * Il MODULO con cui si controllano i dati prima di mandarli all'app: un campo
 * per voce, invece del JSON grezzo. Lavora sempre sul JSON (che resta la forma
 * con cui i dati viaggiano): lo legge all'apertura e lo riscrive a ogni
 * modifica, così il resto del dialogo non cambia.
 */
function FormAzione({
  campi,
  cercaAzienda,
  json,
  onJson,
}: {
  campi: CampoAzione[]
  cercaAzienda?: boolean
  json: string
  onJson: (v: string) => void
}) {
  // Se il JSON non è leggibile si riparte da un oggetto vuoto (meglio di un
  // modulo rotto: i campi restano compilabili a mano).
  const valori = (() => {
    try {
      const v = JSON.parse(json)
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  })()

  const scrivi = (nome: string, valore: string) => {
    // Campo svuotato = null (è così che il registro capisce "non lo so"),
    // non stringa vuota.
    onJson(JSON.stringify({ ...valori, [nome]: valore === '' ? null : valore }, null, 2))
  }

  const [q, setQ] = useState('')
  const [risultati, setRisultati] = useState<AziendaTrovata[] | null>(null)
  const [cercando, setCercando] = useState(false)
  const partnerId = typeof valori.partnerId === 'string' ? valori.partnerId : ''
  const partnerNome = typeof valori.partnerNome === 'string' ? valori.partnerNome : ''

  const cerca = async () => {
    setCercando(true)
    try {
      setRisultati(await cercaPartnerAnagrafiche(q))
    } catch {
      setRisultati([])
    } finally {
      setCercando(false)
    }
  }

  const scegliAzienda = (a: AziendaTrovata | null) => {
    const nuovo = { ...valori }
    if (a) {
      nuovo.partnerId = a.id
      nuovo.partnerNome = a.nome
    } else {
      delete nuovo.partnerId
      delete nuovo.partnerNome
    }
    onJson(JSON.stringify(nuovo, null, 2))
    setRisultati(null)
    setQ('')
  }

  return (
    <div>
      {cercaAzienda && (
        <div className="aggancio-azienda">
          <label className="field-label">Azienda già in Anagrafiche</label>
          {partnerId ? (
            <div className="aggancio-scelto">
              <span className="badge green">
                <span className="dot" />
                {partnerNome || 'Azienda scelta'}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                I dati aggiorneranno questa scheda: nessun doppione.
              </span>
              <button type="button" className="azione-riga" onClick={() => scegliAzienda(null)}>
                Togli
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                Cercala per agganciare il contatto a un’azienda che c’è già. Se non la scegli, in
                Anagrafiche viene creata una scheda nuova.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (q.trim().length >= 2) cerca()
                    }
                  }}
                  placeholder="Nome dell’azienda, città…"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={cerca}
                  disabled={cercando || q.trim().length < 2}
                >
                  {cercando ? 'Cerco…' : 'Cerca'}
                </button>
              </div>
              {risultati && (
                <div style={{ marginTop: 8 }}>
                  {risultati.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                      Nessuna azienda trovata: confermando si crea una scheda nuova.
                    </div>
                  ) : (
                    risultati.map((a) => (
                      <div key={a.id} className="aggancio-riga">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{a.nome}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {[a.categoria, a.citta, a.stato].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                        <button type="button" className="btn secondary small" onClick={() => scegliAzienda(a)}>
                          Aggancia
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="form-grid" style={{ marginTop: cercaAzienda ? 14 : 0 }}>
        {campi.map((c) => {
          const v = valori[c.nome]
          const valore = v === null || v === undefined ? '' : String(v)
          return (
            <div key={c.nome} className={c.largo ? 'full' : undefined}>
              <label className="field-label">
                {c.etichetta} {c.obbligatorio && <span className="req">*</span>}
              </label>
              {c.tipo === 'lungo' ? (
                <textarea value={valore} onChange={(e) => scrivi(c.nome, e.target.value)} rows={2} />
              ) : (
                <input
                  type={c.tipo === 'email' ? 'email' : c.tipo === 'telefono' ? 'tel' : 'text'}
                  value={valore}
                  onChange={(e) => scrivi(c.nome, e.target.value)}
                  placeholder={c.aiuto}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
  // Modulo (predefinito) oppure JSON grezzo, per chi lo preferisce.
  const [comeJson, setComeJson] = useState(false)
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
      setComeJson(false)
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

            {/* Con i campi dichiarati si mostra un FORM vero; il JSON resta
                disponibile per chi vuole (e per le azioni con dati annidati). */}
            {proposta.azione.campi && !comeJson ? (
              <FormAzione
                campi={proposta.azione.campi}
                cercaAzienda={proposta.azione.cercaAzienda}
                json={dati}
                onJson={setDati}
              />
            ) : (
              <textarea
                value={dati}
                onChange={(e) => setDati(e.target.value)}
                rows={Math.min(16, Math.max(6, dati.split('\n').length))}
                spellCheck={false}
                style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.5 }}
              />
            )}

            {proposta.azione.campi && (
              <button
                type="button"
                className="azione-riga"
                style={{ marginTop: 8 }}
                onClick={() => setComeJson((v) => !v)}
              >
                {comeJson ? '← Torna al modulo' : 'Modifica come JSON'}
              </button>
            )}
          </>
        )}

        {/* Esito dell'invio */}
        {esito && (
          <div
            className={esito.ok ? 'ai-domanda' : undefined}
            style={{ marginTop: 10, fontSize: 13, color: esito.ok ? undefined : 'var(--red)' }}
          >
            {esito.ok && <span className="ai-mark">OK</span>}
            <span style={{ whiteSpace: 'pre-wrap' }}>
              {esito.messaggio}
              {esito.link && (
                <>
                  {'\n'}
                  <a href={esito.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                    Apri l’app
                  </a>
                </>
              )}
            </span>
          </div>
        )}
        {esito?.ok && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            La risposta resta salvata sulla mail, in fondo, sotto «Risposte dalle app».
          </p>
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
