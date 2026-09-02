'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { creaUtente } from '@/lib/auth-actions'

export function FormUtente() {
  const [stato, setStato] = useState<{ ok: boolean; messaggio: string } | null>(null)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function invia(form: FormData) {
    setStato(null)
    startTransition(async () => {
      const esito = await creaUtente(form)
      setStato(esito)
      if (esito.ok) router.refresh()
    })
  }

  return (
    <form action={invia}>
      <div className="form-grid">
        <div>
          <label className="field-label">Nome <span className="req">*</span></label>
          <input type="text" name="nome" required placeholder="Mario Rossi" />
        </div>
        <div>
          <label className="field-label">Email <span className="req">*</span></label>
          <input type="email" name="email" required placeholder="mario@deluxy.it" />
        </div>
        <div>
          <label className="field-label">Password <span className="req">*</span></label>
          {/* ⚠️ Il numero qui e MIN_PASSWORD in auth-actions.ts devono dire la
              stessa cosa: questo segnaposto prometteva «almeno 6» mentre il
              server ne pretende 10, e chi seguiva il suggerimento si vedeva
              rifiutare la creazione (26/08: «non riesco a creare l'utenza»).
              minLength ferma l'errore già nel browser, col messaggio suo. */}
          <input type="text" name="password" required minLength={10} placeholder="almeno 10 caratteri" />
        </div>
        <div>
          <label className="field-label">Ruolo</label>
          <select name="ruolo" defaultValue="utente">
            <option value="utente">Utente</option>
            <option value="admin">Amministratore</option>
          </select>
        </div>
      </div>

      {stato && (
        <div style={{ fontSize: 13, marginTop: 14, color: stato.ok ? 'var(--green)' : 'var(--red)' }}>
          {stato.messaggio}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
        La password la vede solo l’utente: comunicagliela tu. Potrà usarla per entrare con la
        sua email. Non ne teniamo copia leggibile.
      </div>

      <div className="form-footer">
        <button className="btn primary" type="submit" disabled={inCorso}>
          {inCorso ? 'Creo…' : 'Crea utente'}
        </button>
      </div>
    </form>
  )
}
