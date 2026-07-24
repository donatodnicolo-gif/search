'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvaAlias } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * Assegna un alias a un contatto direttamente dalla rubrica. L'alias è un nome
 * tuo per un indirizzo ("Nicolò Deluxy"): compare in rubrica e lo capisce anche
 * l'AI, così «invia a Nicolò Deluxy» risolve l'indirizzo.
 */
export function EditaAlias({ email, alias }: { email: string; alias: string }) {
  const [valore, setValore] = useState(alias)
  const [modifica, setModifica] = useState(false)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const salva = (a: string) =>
    start(async () => {
      const esito = await salvaAlias(email, a)
      mostraFlash(esito.messaggio)
      if (esito.ok) setValore(a.trim())
      setModifica(false)
      router.refresh()
    })

  if (modifica) {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={valore}
          onChange={(e) => setValore(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              salva(valore)
            }
            if (e.key === 'Escape') {
              setValore(alias)
              setModifica(false)
            }
          }}
          placeholder="Es. Nicolò Deluxy"
          maxLength={80}
          autoFocus
          style={{ width: 150, padding: '4px 8px', fontSize: 13 }}
        />
        <button type="button" className="azione-riga" disabled={inCorso} onClick={() => salva(valore)}>
          {inCorso ? '…' : 'Salva'}
        </button>
      </span>
    )
  }

  return valore ? (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
      <span className="badge gold">
        <span className="dot" />
        {valore}
      </span>
      <button type="button" className="azione-riga" onClick={() => setModifica(true)}>
        Cambia
      </button>
    </span>
  ) : (
    <button
      type="button"
      className="azione-riga"
      onClick={(e) => {
        e.stopPropagation()
        setModifica(true)
      }}
    >
      + Alias
    </button>
  )
}
