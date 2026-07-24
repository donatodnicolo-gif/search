'use client'

import { NUOVO_EVENTO_GIORNO } from './NuovoEvento'

/**
 * Una cella del calendario. Con doppio clic su un giorno da OGGI in poi apre il
 * form «Nuovo appuntamento» già sulla data cliccata. I giorni passati non si
 * aprono: un appuntamento nel passato non ha senso.
 *
 * Il contenuto (eventi, attività) resta reso lato server e passato come figli:
 * qui si aggiunge solo l'interazione, senza appesantire la cella.
 */
export function CellaGiorno({
  chiave,
  giorno,
  oggi,
  className,
  children,
}: {
  /** La data della cella, "YYYY-MM-DD". */
  chiave: string
  giorno: number
  /** Oggi in ora italiana, "YYYY-MM-DD". */
  oggi: string
  className: string
  children: React.ReactNode
}) {
  const apribile = chiave >= oggi // confronto fra "YYYY-MM-DD": ordine = data

  return (
    <div
      className={`${className}${apribile ? ' cal-cella-apribile' : ''}`}
      title={apribile ? 'Doppio clic per un nuovo appuntamento' : undefined}
      onDoubleClick={
        apribile
          ? (e) => {
              // Non scatenare se si è fatto doppio clic su un evento/attività
              // dentro la cella: quelli hanno già la loro azione.
              if ((e.target as HTMLElement).closest('.cal-evento, .cal-task')) return
              window.dispatchEvent(
                new CustomEvent(NUOVO_EVENTO_GIORNO, { detail: { giorno: chiave } })
              )
            }
          : undefined
      }
    >
      <div className="cal-numero">{giorno}</div>
      {children}
    </div>
  )
}
