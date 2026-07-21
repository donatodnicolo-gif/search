'use client'

import { useMemo, useRef, useState } from 'react'

export type ContattoRubrica = { email: string; nome: string | null }

/**
 * Campo destinatari con autocompletamento dalla RUBRICA. Si può scrivere
 * liberamente (più indirizzi separati da virgola); mentre scrivi l'ultimo pezzo
 * compaiono i contatti che combaciano (per nome o email) e ne scegli uno con
 * clic, frecce+Invio o Tab. Non vincola: puoi comunque digitare un indirizzo
 * che non è in rubrica.
 */
export function CampoDestinatari({
  value,
  onChange,
  contatti,
  placeholder,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  contatti: ContattoRubrica[]
  placeholder?: string
  autoFocus?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLInputElement>(null)

  // Il "token" corrente è quello che stai scrivendo ora: dopo l'ultima virgola
  // o punto e virgola. I precedenti sono destinatari già scelti.
  const parti = value.split(/[,;]/)
  const corrente = (parti[parti.length - 1] ?? '').trim()

  const suggeriti = useMemo(() => {
    const q = corrente.toLowerCase()
    if (q.length < 1) return []
    const gia = new Set(parti.slice(0, -1).map((p) => p.trim().toLowerCase()))
    return contatti
      .filter((c) => !gia.has(c.email.toLowerCase()))
      .filter((c) => c.email.toLowerCase().includes(q) || (c.nome ?? '').toLowerCase().includes(q))
      .slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, contatti])

  function scegli(c: ContattoRubrica) {
    const base = parti
      .slice(0, -1)
      .map((p) => p.trim())
      .filter(Boolean)
    onChange([...base, c.email].join(', ') + ', ')
    setAperto(false)
    setIdx(0)
    ref.current?.focus()
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={ref}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setAperto(true)
          setIdx(0)
        }}
        onFocus={() => setAperto(true)}
        // Il clic su un suggerimento avviene dopo il blur: si ritarda la chiusura.
        onBlur={() => setTimeout(() => setAperto(false), 150)}
        onKeyDown={(e) => {
          if (!aperto || suggeriti.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setIdx((i) => Math.min(i + 1, suggeriti.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIdx((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (suggeriti[idx]) {
              e.preventDefault()
              scegli(suggeriti[idx])
            }
          } else if (e.key === 'Escape') {
            setAperto(false)
          }
        }}
      />
      {aperto && suggeriti.length > 0 && (
        <div className="rubrica-suggerimenti" role="listbox">
          {suggeriti.map((c, i) => (
            <button
              key={c.email}
              type="button"
              role="option"
              aria-selected={i === idx}
              className={`rubrica-voce ${i === idx ? 'attiva' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => scegli(c)}
            >
              {c.nome ? (
                <>
                  <strong>{c.nome}</strong> <span className="muted">{c.email}</span>
                </>
              ) : (
                c.email
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
