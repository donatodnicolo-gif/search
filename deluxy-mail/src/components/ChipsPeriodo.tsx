import Link from 'next/link'
import { PERIODI } from '@/lib/periodo'

/**
 * Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): pillole-LINK a
 * selezione singola sopra la ricerca. Sono link GET, non stato: il periodo
 * scelto sta nell'indirizzo e si può ricaricare o mandare a un collega.
 *
 * Stanno FUORI dal form di ricerca: un submit della ricerca (RicercaMail o le
 * condizioni) riparte senza `periodo` e quindi lo azzera da solo — il periodo
 * scelto a mano con dal/al vince, come nell'implementazione di riferimento
 * (deluxy-partner /fatture).
 */
export function ChipsPeriodo({
  base,
  periodo,
  altri = {},
  azzera = 'Tutto',
}: {
  /** La pagina su cui puntano i link ('/thread', '/inviata', …). */
  base: string
  /** Il periodo attivo (dal parametro `periodo` dell'URL). */
  periodo?: string
  /** Gli altri parametri da conservare cambiando periodo (q, condizioni…). */
  altri?: Record<string, string | undefined>
  /** L'etichetta del chip di azzeramento («Tutto», «Tutte le date»…). */
  azzera?: string
}) {
  const href = (p?: string) => {
    const s = new URLSearchParams()
    for (const [k, v] of Object.entries(altri)) if (v) s.set(k, v)
    if (p) s.set('periodo', p)
    const t = s.toString()
    return t ? `${base}?${t}` : base
  }
  return (
    <div className="filters riga-chips-scorri" style={{ marginBottom: 10 }}>
      {PERIODI.map((p) => (
        <Link key={p.v} href={href(p.v)} className={`chip-link${periodo === p.v ? ' attiva' : ''}`}>
          {p.l}
        </Link>
      ))}
      {periodo ? (
        <Link href={href()} className="chip-link azzera">
          {azzera}
        </Link>
      ) : null}
    </div>
  )
}
