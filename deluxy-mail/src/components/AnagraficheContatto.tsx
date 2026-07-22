'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cercaPartnerAnagrafiche, associaContattoAnagrafiche } from '@/lib/actions'

type Partner = { id: string; nome: string; stato: string | null; citta: string | null; categoria: string | null }

/**
 * Nella scheda contatto della Rubrica: dice se l'email è già un'azienda in
 * Anagrafiche (e se è un CLIENTE, stato "attivo"), oppure permette di associarla
 * a un'azienda esistente cercandola nel registro.
 */
export function AnagraficheContatto({
  email,
  nome,
  partner,
  link,
}: {
  email: string
  nome: string | null
  /** L'azienda a cui l'email è già associata, se c'è. */
  partner: { nome: string; stato: string | null; citta: string | null; link: string } | null
  /** Base link ad Anagrafiche (per "apri il registro"). */
  link: string
}) {
  const [aperto, setAperto] = useState(false)
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState<Partner[] | null>(null)
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const cerca = () =>
    start(async () => {
      setStato(null)
      setRisultati(await cercaPartnerAnagrafiche(query))
    })

  const associa = (p: Partner) =>
    start(async () => {
      const esito = await associaContattoAnagrafiche(p.id, email, nome ?? '')
      setStato(esito.messaggio)
      if (esito.ok) {
        setAperto(false)
        router.refresh()
      }
    })

  const cliente = partner?.stato === 'attivo'

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="nav-label" style={{ padding: 0 }}>Anagrafiche</span>
        {partner ? (
          <>
            <span className={`badge ${cliente ? 'green' : 'blue'}`}>
              <span className="dot" />
              {cliente ? 'Cliente' : 'In anagrafiche'}
            </span>
            <strong style={{ fontSize: 14 }}>{partner.nome}</strong>
            {partner.citta && <span className="muted" style={{ fontSize: 12.5 }}>{partner.citta}</span>}
            <a href={partner.link} target="_blank" rel="noreferrer" className="azione-riga" style={{ marginLeft: 'auto' }}>
              Apri nel registro →
            </a>
          </>
        ) : (
          <>
            <span className="badge neutral"><span className="dot" />Non in anagrafiche</span>
            <button type="button" className="btn secondary small" style={{ marginLeft: 'auto' }} onClick={() => setAperto((v) => !v)}>
              {aperto ? 'Chiudi' : 'Associa a un’azienda'}
            </button>
          </>
        )}
      </div>

      {aperto && !partner && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Cerca l’azienda nel registro e associa a lei questo indirizzo ({email}).
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); cerca() } }}
              placeholder="Nome azienda, città…"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn primary small" onClick={cerca} disabled={inCorso || query.trim().length < 2}>
              {inCorso ? 'Cerco…' : 'Cerca'}
            </button>
          </div>

          {stato && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 8 }}>{stato}</div>}

          {risultati && (
            <div style={{ marginTop: 10 }}>
              {risultati.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  Nessuna azienda trovata. (Puoi anche registrarla con “→ App” su una sua mail.)
                </div>
              ) : (
                risultati.map((p) => (
                  <div key={p.id} className="aggancio-riga">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {p.nome}{' '}
                        {p.stato === 'attivo' && <span className="badge green" style={{ marginLeft: 6 }}><span className="dot" />Cliente</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {[p.categoria, p.citta].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <button type="button" className="btn secondary small" onClick={() => associa(p)} disabled={inCorso}>
                      Associa
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
