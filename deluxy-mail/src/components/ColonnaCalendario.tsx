import Link from 'next/link'
import { db } from '@/lib/db'
import { FUSO } from '@/lib/format'

// Giorno YYYY-MM-DD e ora HH:MM in ora italiana (gli eventi sono salvati in UTC).
function giornoIt(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: FUSO })
}
function oraIt(d: Date): string {
  return d.toLocaleTimeString('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
}

/**
 * I prossimi appuntamenti del calendario, in cima alla colonna destra della
 * posta in arrivo: l'agenda resta sott'occhio senza aprire /calendario.
 * Solo desktop (come "Da fare"): sotto i 1100px resta la pagina Calendario.
 */
export async function ColonnaCalendario({ utenteId }: { utenteId: string }) {
  // Dall'inizio di OGGI (ora italiana), così si vedono anche gli eventi
  // "giornata intera" di oggi (salvati a mezzanotte UTC) e quelli in corso.
  const daQuando = new Date(`${giornoIt(new Date())}T00:00:00Z`)
  const finoA = new Date(daQuando.getTime() + 30 * 24 * 60 * 60 * 1000)

  let eventi: Awaited<ReturnType<typeof db.evento.findMany<{ include: { messaggio: { select: { id: true } } } }>>> = []
  try {
    eventi = await db.evento.findMany({
      where: { utenteId, inizio: { gte: daQuando, lt: finoA } },
      orderBy: { inizio: 'asc' },
      take: 6,
      include: { messaggio: { select: { id: true } } },
    })
  } catch {
    // Tabella non ancora migrata: la colonna semplicemente non si mostra.
  }

  // Niente in agenda: nessun riquadro vuoto a occupare la colonna.
  if (eventi.length === 0) return null

  const oggi = giornoIt(new Date())
  const domani = giornoIt(new Date(Date.now() + 24 * 60 * 60 * 1000))

  return (
    <aside className="col-attivita" style={{ marginBottom: 22 }}>
      <div className="col-attivita-head">
        <span className="nav-label" style={{ padding: 0 }}>
          Prossimi appuntamenti
        </span>
        <Link href="/calendario" className="azione-riga" style={{ fontSize: 12 }}>
          Calendario →
        </Link>
      </div>

      <div className="card tight">
        {eventi.map((e) => {
          const giorno = giornoIt(e.inizio)
          const quando =
            giorno === oggi ? 'oggi' : giorno === domani ? 'domani' : e.inizio.toLocaleDateString('it-IT', { timeZone: FUSO, weekday: 'short', day: 'numeric', month: 'short' })
          return (
            <div key={e.id} className="col-task">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="col-task-titolo">
                  {e.messaggio ? (
                    <Link href={`/messaggio/${e.messaggio.id}`}>{e.titolo}</Link>
                  ) : (
                    e.titolo
                  )}
                </div>
                <div className="col-task-meta">
                  <span className={`badge ${giorno === oggi ? 'blue' : 'neutral'}`}>
                    <span className="dot" />
                    {quando}
                  </span>
                  <span className="muted">
                    {e.giornataIntera
                      ? 'tutto il giorno'
                      : `${oraIt(e.inizio)}${e.fine ? `–${oraIt(e.fine)}` : ''}`}
                  </span>
                  {e.luogo && <span className="muted">· {e.luogo}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
