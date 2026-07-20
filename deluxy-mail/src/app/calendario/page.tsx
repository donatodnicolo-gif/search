import Link from 'next/link'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { FUSO } from '@/lib/format'
import { NuovoEvento } from '@/components/NuovoEvento'
import { EliminaEvento } from '@/components/EliminaEvento'
import { FeedCalendario } from '@/components/FeedCalendario'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ m?: string }> }

/** "YYYY-MM-DD" di una data, vista nel fuso italiano. */
function giornoIt(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: FUSO })
}

function oraIt(d: Date): string {
  return d.toLocaleTimeString('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
}

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

export default async function Calendario({ searchParams }: Props) {
  const { m } = await searchParams
  const u = await richiediUtente()

  // Il mese mostrato: ?m=YYYY-MM, altrimenti quello corrente (in ora italiana).
  const oggiIt = giornoIt(new Date())
  const [annoOggi, meseOggi] = oggiIt.split('-').map(Number)
  const [anno, mese] = /^\d{4}-\d{2}$/.test(m ?? '')
    ? (m as string).split('-').map(Number)
    : [annoOggi, meseOggi]

  const precedente = mese === 1 ? `${anno - 1}-12` : `${anno}-${String(mese - 1).padStart(2, '0')}`
  const successivo = mese === 12 ? `${anno + 1}-01` : `${anno}-${String(mese + 1).padStart(2, '0')}`

  // Eventi del mese (con un giorno di margine per il fuso) + i prossimi 30 giorni.
  const inizioMese = new Date(Date.UTC(anno, mese - 1, 1) - 24 * 60 * 60 * 1000)
  const fineMese = new Date(Date.UTC(anno, mese, 1) + 24 * 60 * 60 * 1000)
  const adesso = new Date()

  let eventiMese: Awaited<ReturnType<typeof db.evento.findMany>> = []
  let prossimi: typeof eventiMese = []
  let tokenCalendario = ''
  try {
    ;[eventiMese, prossimi] = await Promise.all([
      db.evento.findMany({
        where: { utenteId: u.id, inizio: { gte: inizioMese, lt: fineMese } },
        orderBy: { inizio: 'asc' },
      }),
      db.evento.findMany({
        where: {
          utenteId: u.id,
          inizio: { gte: adesso, lt: new Date(adesso.getTime() + 30 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { inizio: 'asc' },
        take: 20,
      }),
    ])
    tokenCalendario = (await db.utente.findUnique({
      where: { id: u.id },
      select: { tokenCalendario: true },
    }))?.tokenCalendario ?? ''
  } catch {
    // Tabella non ancora migrata: la pagina si apre lo stesso, vuota.
  }

  // Gli eventi giorno per giorno (chiave YYYY-MM-DD in ora italiana).
  const perGiorno = new Map<string, typeof eventiMese>()
  for (const e of eventiMese) {
    const chiave = giornoIt(e.inizio)
    perGiorno.set(chiave, [...(perGiorno.get(chiave) ?? []), e])
  }

  // La griglia: da lunedì della prima settimana a domenica dell'ultima.
  const primoDelMese = new Date(Date.UTC(anno, mese - 1, 1))
  const slittamento = (primoDelMese.getUTCDay() + 6) % 7 // lun=0 … dom=6
  const giorniNelMese = new Date(Date.UTC(anno, mese, 0)).getUTCDate()
  const celle: { giorno: number | null; chiave: string }[] = []
  for (let i = 0; i < slittamento; i++) celle.push({ giorno: null, chiave: `v${i}` })
  for (let g = 1; g <= giorniNelMese; g++) {
    celle.push({ giorno: g, chiave: `${anno}-${String(mese).padStart(2, '0')}-${String(g).padStart(2, '0')}` })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Calendario</h1>
          <p className="page-caption">
            Gli appuntamenti tuoi, annotati a mano o nati dalle mail. Sincronizzabile con le
            altre agende.
          </p>
        </div>
        <div className="page-actions">
          <Link href={`/calendario?m=${precedente}`} className="btn secondary small">←</Link>
          <span className="cal-mese">{MESI[mese - 1]} {anno}</span>
          <Link href={`/calendario?m=${successivo}`} className="btn secondary small">→</Link>
          {`${anno}-${String(mese).padStart(2, '0')}` !== `${annoOggi}-${String(meseOggi).padStart(2, '0')}` && (
            <Link href="/calendario" className="btn secondary small">Oggi</Link>
          )}
        </div>
      </div>

      <NuovoEvento />

      <div className="card cal-card">
        <div className="cal-griglia">
          {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((g) => (
            <div key={g} className="cal-intestazione">{g}</div>
          ))}
          {celle.map((c) =>
            c.giorno === null ? (
              <div key={c.chiave} className="cal-cella vuota" />
            ) : (
              <div key={c.chiave} className={`cal-cella ${c.chiave === oggiIt ? 'oggi' : ''}`}>
                <div className="cal-numero">{c.giorno}</div>
                {(perGiorno.get(c.chiave) ?? []).map((e) => (
                  <div key={e.id} className="cal-evento" title={`${e.titolo}${e.luogo ? ` · ${e.luogo}` : ''}`}>
                    {!e.giornataIntera && <span className="cal-ora">{oraIt(e.inizio)}</span>}
                    {e.titolo}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      <h2 className="section-title">Prossimi appuntamenti</h2>
      <div className="card tight">
        {prossimi.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">▦</div>
            <div className="empty-title">Niente in agenda</div>
            <p className="empty-text">Aggiungi il primo appuntamento con il modulo qui sopra.</p>
          </div>
        ) : (
          prossimi.map((e) => (
            <div key={e.id} className="task-row">
              <div className="cal-quando">
                <div className="cal-quando-giorno">
                  {e.inizio.toLocaleDateString('it-IT', { timeZone: FUSO, weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                <div className="cal-quando-ora">
                  {e.giornataIntera ? 'tutto il giorno' : `${oraIt(e.inizio)}${e.fine ? `–${oraIt(e.fine)}` : ''}`}
                </div>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="task-titolo">{e.titolo}</div>
                {(e.luogo || e.descrizione) && (
                  <div className="task-sub">
                    {[e.luogo, e.descrizione].filter(Boolean).join(' · ').slice(0, 140)}
                  </div>
                )}
              </div>
              <div className="task-side">
                <EliminaEvento id={e.id} />
              </div>
            </div>
          ))
        )}
      </div>

      <h2 className="section-title">Sincronizza con le altre agende</h2>
      <div className="card">
        <FeedCalendario token={tokenCalendario} />
      </div>
    </>
  )
}
