import Link from 'next/link'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { FUSO, coloreDiPriorita, priorita as livello } from '@/lib/format'
import { NuovoEvento } from '@/components/NuovoEvento'
import { EventoDettaglio, EventoApribile, type DatiEvento } from '@/components/EventoDettaglio'
import { EliminaEvento } from '@/components/EliminaEvento'
import { FeedCalendario } from '@/components/FeedCalendario'
import { elencoContatti } from '@/lib/contatti'

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

  // La rubrica per l'autocompletamento del campo "Invita" del nuovo evento.
  let contatti: { email: string; nome: string | null }[] = []
  try {
    contatti = (await elencoContatti(u.id)).map((c) => ({ email: c.email, nome: c.nome }))
  } catch {
    contatti = []
  }

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
  // Le attività con una scadenza: entrano nel calendario, ordinate per urgenza.
  type TaskConScadenza = {
    id: string
    titolo: string
    priorita: string
    scadenza: Date | null
    messaggio: { id: string } | null
  }
  let taskMese: TaskConScadenza[] = []
  let taskUrgenti: TaskConScadenza[] = []
  try {
    ;[eventiMese, prossimi, taskMese] = await Promise.all([
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
      db.attivita.findMany({
        where: { utenteId: u.id, fatta: false, scadenza: { gte: inizioMese, lt: fineMese } },
        orderBy: [{ scadenza: 'asc' }, { priorita: 'asc' }],
        select: { id: true, titolo: true, priorita: true, scadenza: true, messaggio: { select: { id: true } } },
      }),
    ])
    tokenCalendario = (await db.utente.findUnique({
      where: { id: u.id },
      select: { tokenCalendario: true },
    }))?.tokenCalendario ?? ''

    // La lista "per urgenza": le scadute e le imminenti, prima le più urgenti.
    taskUrgenti = await db.attivita.findMany({
      where: {
        utenteId: u.id,
        fatta: false,
        scadenza: { lt: new Date(adesso.getTime() + 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: [{ scadenza: 'asc' }, { priorita: 'asc' }],
      take: 30,
      select: { id: true, titolo: true, priorita: true, scadenza: true, messaggio: { select: { id: true } } },
    })
  } catch {
    // Tabella non ancora migrata: la pagina si apre lo stesso, vuota.
  }

  // Gli eventi giorno per giorno (chiave YYYY-MM-DD in ora italiana).
  const perGiorno = new Map<string, typeof eventiMese>()
  for (const e of eventiMese) {
    const chiave = giornoIt(e.inizio)
    perGiorno.set(chiave, [...(perGiorno.get(chiave) ?? []), e])
  }

  // Le task nel giorno della loro scadenza.
  const taskPerGiorno = new Map<string, TaskConScadenza[]>()
  for (const t of taskMese) {
    if (!t.scadenza) continue
    const chiave = giornoIt(t.scadenza)
    taskPerGiorno.set(chiave, [...(taskPerGiorno.get(chiave) ?? []), t])
  }

  // La griglia: da lunedì della prima settimana a domenica dell'ultima.
  const primoDelMese = new Date(Date.UTC(anno, mese - 1, 1))
  // I dati che la scheda di dettaglio si aspetta: giorno e ore già in ora
  // italiana, così il modale non deve fare conti sui fusi.
  const datiEvento = (e: {
    id: string
    titolo: string
    descrizione: string
    luogo: string
    inizio: Date
    fine: Date | null
    giornataIntera: boolean
    serieId?: string | null
    regola?: string
    invitati: string
    messaggioId: string | null
  }): DatiEvento => ({
    id: e.id,
    titolo: e.titolo,
    descrizione: e.descrizione,
    luogo: e.luogo,
    giorno: giornoIt(e.inizio),
    oraInizio: e.giornataIntera ? '' : oraIt(e.inizio),
    oraFine: !e.giornataIntera && e.fine ? oraIt(e.fine) : '',
    giornataIntera: e.giornataIntera,
    serieId: e.serieId ?? null,
    regola: e.regola ?? '',
    invitati: e.invitati,
    messaggioId: e.messaggioId,
  })

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

      <NuovoEvento contatti={contatti} />

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
                  // Cliccando si apre la scheda: dettaglio, modifica, elimina.
                  <EventoApribile
                    key={e.id}
                    dati={datiEvento(e)}
                    className="cal-evento"
                    title={`${e.titolo}${e.luogo ? ` · ${e.luogo}` : ''} — clicca per aprire`}
                  >
                    {!e.giornataIntera && <span className="cal-ora">{oraIt(e.inizio)}</span>}
                    {e.titolo}
                    {e.serieId && <span className="cal-ripete" title="Appuntamento ricorrente">⟳</span>}
                  </EventoApribile>
                ))}
                {(taskPerGiorno.get(c.chiave) ?? []).map((t) => (
                  <Link
                    key={t.id}
                    href={t.messaggio ? `/messaggio/${t.messaggio.id}` : '/attivita'}
                    className={`cal-task prio-${t.priorita}`}
                    title={`${t.priorita} · ${t.titolo}`}
                  >
                    <span className="cal-task-dot" />
                    {t.titolo}
                  </Link>
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
                <div className="task-titolo">
                  {/* Il titolo apre la scheda: dettaglio, modifica, elimina. */}
                  <EventoApribile dati={datiEvento(e)} className="link-evento" title="Apri la scheda dell’appuntamento">
                    {e.titolo}
                  </EventoApribile>
                  {e.serieId && (
                    <span className="badge gold" style={{ marginLeft: 8 }} title={e.regola || 'Appuntamento ricorrente'}>
                      <span className="dot" />
                      si ripete
                    </span>
                  )}
                </div>
                {(e.luogo || e.descrizione) && (
                  <div className="task-sub">
                    {[e.luogo, e.descrizione].filter(Boolean).join(' · ').slice(0, 140)}
                  </div>
                )}
                {/* Le risposte agli inviti: accettato / rifiutato / in attesa. */}
                {e.invitati && (
                  <div className="mail-tags" style={{ marginTop: 6 }}>
                    {e.invitati.split(',').map((email) => {
                      const chi = email.trim().toLowerCase()
                      if (!chi) return null
                      let r: string | undefined
                      try {
                        r = (JSON.parse(e.risposteInvito || '{}') as Record<string, string>)[chi]
                      } catch {
                        r = undefined
                      }
                      return (
                        <span key={chi} className={`badge ${r === 'si' ? 'green' : r === 'no' ? 'red' : 'neutral'}`}>
                          <span className="dot" />
                          {chi} {r === 'si' ? '· accettato' : r === 'no' ? '· rifiutato' : '· in attesa'}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="task-side">
                <EventoApribile dati={datiEvento(e)} className="azione-riga" title="Modifica o elimina">
                  Apri
                </EventoApribile>
                <EliminaEvento id={e.id} />
              </div>
            </div>
          ))
        )}
      </div>

      {taskUrgenti.length > 0 && (
        <>
          <h2 className="section-title">Attività in scadenza</h2>
          <div className="card tight">
            {taskUrgenti.map((t) => {
              const scaduta = t.scadenza && t.scadenza < adesso
              return (
                <div key={t.id} className="task-row">
                  <div className="cal-quando">
                    <div className="cal-quando-giorno">
                      {t.scadenza
                        ? t.scadenza.toLocaleDateString('it-IT', { timeZone: FUSO, weekday: 'short', day: 'numeric', month: 'short' })
                        : '—'}
                    </div>
                    <div className={`cal-quando-ora ${scaduta ? 'scaduta' : ''}`}>
                      {scaduta ? 'scaduta' : 'in scadenza'}
                    </div>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="task-titolo">
                      {t.messaggio ? (
                        <Link href={`/messaggio/${t.messaggio.id}`} style={{ textDecoration: 'underline' }}>
                          {t.titolo}
                        </Link>
                      ) : (
                        t.titolo
                      )}
                    </div>
                  </div>
                  <div className="task-side">
                    <span className={`badge ${coloreDiPriorita(t.priorita)}`} title={livello(t.priorita)?.quando}>
                      {t.priorita}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <h2 className="section-title">Sincronizza con le altre agende</h2>
      <div className="card">
        <FeedCalendario token={tokenCalendario} />
      </div>

      {/* La scheda dell'appuntamento: montata una volta per la pagina. */}
      <EventoDettaglio />
    </>
  )
}
