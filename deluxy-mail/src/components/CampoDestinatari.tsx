'use client'

import { useMemo, useRef, useState } from 'react'

export type ContattoRubrica = { email: string; nome: string | null }

/** Il dominio di un indirizzo, minuscolo ('' se non è un indirizzo). */
export function dominioDi(email: string): string {
  const parti = (email || '').toLowerCase().trim().split('@')
  return parti.length === 2 ? parti[1] : ''
}

/**
 * Il dominio della controparte, leggendo il primo indirizzo COMPLETO scritto
 * in un campo destinatari.
 *
 * ⚠️ Si guarda il primo, non l'ultimo: in «rispondi a tutti» il primo è quello
 * a cui stai davvero rispondendo, gli altri sono le copie.
 */
export function dominioControparteDa(campo: string): string | null {
  for (const pezzo of (campo || '').split(/[,;]/)) {
    const d = dominioDi(pezzo.trim())
    if (d && d.includes('.')) return d
  }
  return null
}

/** Ordina per nome, e chi non ha nome per indirizzo: nessuno finisce in fondo
 *  solo perché la rubrica non sa come si chiama. */
function perNome(a: ContattoRubrica, b: ContattoRubrica): number {
  const na = (a.nome || a.email).trim()
  const nb = (b.nome || b.email).trim()
  return na.localeCompare(nb, 'it', { sensitivity: 'base' })
}

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
  nostriDomini = [],
  dominioControparte = null,
  placeholder,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  contatti: ContattoRubrica[]
  /**
   * I domini di casa (quelli delle tue caselle): chi ci scrive dentro è il
   * TEAM, e va in cima.
   */
  nostriDomini?: string[]
  /**
   * Il dominio della CONTROPARTE di questo scambio, cioè di chi stai
   * scrivendo. I suoi colleghi vengono subito dopo il team.
   */
  dominioControparte?: string | null
  placeholder?: string
  autoFocus?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLInputElement>(null)

  // A quale dei tre gruppi appartiene un contatto (più basso = più in alto).
  const gruppo = (c: ContattoRubrica): number => {
    const d = dominioDi(c.email)
    if (!d) return 2
    if (nostriDomini.some((n) => n.toLowerCase() === d)) return 0
    if (dominioControparte && dominioControparte.toLowerCase() === d) return 1
    return 2
  }

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
      // ⚠️⚠️ L'ORDINE NON È QUELLO DELLA RUBRICA. Prima uscivano nell'ordine in
      // cui capitavano, e in cima finiva chi capitava: per scrivere a un
      // collega bisognava digitare mezzo indirizzo. Adesso, in tre gruppi:
      //   1. il TEAM (i domini di casa) — sono quelli che si mettono in copia
      //      tutti i giorni;
      //   2. i COLLEGHI DELLA CONTROPARTE (stesso dominio di chi stai
      //      scrivendo): l'altra metà dei casi veri, quando si aggiunge in
      //      copia il capo o l'amministrazione di chi ti ha scritto;
      //   3. tutto il resto.
      // Dentro ogni gruppo, per NOME (e chi il nome non ce l'ha si ordina per
      // indirizzo, invece di finire tutto in fondo).
      .sort((a, b) => gruppo(a) - gruppo(b) || perNome(a, b))
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
        // ⚠️ NON `type="email"`: qui dentro sta una LISTA separata da virgole,
        // che la validazione del browser rifiuterebbe. Si chiede la tastiera
        // giusta senza cambiare il tipo: su iOS, prima, il campo più importante
        // di un client di posta si scriveva con la tastiera alfabetica (nessun
        // `@`), la maiuscola automatica sulla prima lettera e il correttore
        // attivo su un indirizzo.
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
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
