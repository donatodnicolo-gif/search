import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { coloreDiPriorita, dataBreve, FUSO } from '@/lib/format'
import { CheckAttivita } from '@/components/CheckAttivita'
import { BottoneEsegui } from '@/components/BottoneEsegui'
import { ChecklistArchivio } from '@/components/ChecklistArchivio'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // l'Assistente AI (riassunto periodo) gira qui

const TITOLI: Record<string, string> = {
  oggi: 'Assistente · Oggi',
  settimana: 'Assistente · Settimana',
  mese: 'Assistente · Mese',
}

type Props = { params: Promise<{ id: string }> }

export default async function Rapporto({ params }: Props) {
  const { id } = await params
  const u = await richiediUtente()

  const rapporto = await db.rapportoAI.findFirst({
    where: { id, utenteId: u.id },
    include: {
      attivita: { orderBy: [{ fatta: 'asc' }, { priorita: 'asc' }], include: { messaggio: true } },
      proposte: {
        orderBy: { applicata: 'asc' },
        include: { messaggio: { select: { id: true, mittente: true, mittenteNome: true, oggetto: true, data: true } } },
      },
    },
  })
  if (!rapporto) notFound()

  const daArchiviare = rapporto.proposte.filter((p) => !p.applicata)
  const attiveAperte = rapporto.attivita.filter((a) => !a.fatta)

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/" className="btn secondary small" style={{ marginBottom: 14 }}>
            ← Posta in arrivo
          </Link>
          <h1 className="page-title">{TITOLI[rapporto.periodo] ?? 'Assistente'}</h1>
          <p className="page-caption">
            {rapporto.messaggiVisti} messaggi letti il{' '}
            {rapporto.generatoIl.toLocaleString('it-IT', {
              timeZone: FUSO,
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {rapporto.troncato && ' · erano di più, ho letto i più recenti'}
          </p>
        </div>
      </div>

      <div className="ai-box">
        <div className="ai-box-title">Il riassunto del periodo</div>
        <div className="ai-box-text" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {rapporto.riassunto}
        </div>
      </div>

      <h2 className="section-title">
        Da fare {attiveAperte.length > 0 && <span className="muted">· {attiveAperte.length}</span>}
      </h2>
      <div className="card tight">
        {rapporto.attivita.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
            Niente da fare da questa posta.
          </div>
        ) : (
          rapporto.attivita.map((a) => (
            <div key={a.id} className={`task-row ${a.fatta ? 'fatta' : ''}`}>
              <CheckAttivita id={a.id} fatta={a.fatta} />
              <div style={{ minWidth: 0 }}>
                <div className="task-titolo">{a.titolo}</div>
                {a.dettaglio && <div className="task-sub">{a.dettaglio}</div>}
                {a.messaggio && (
                  <div className="task-sub">
                    da{' '}
                    <Link href={`/messaggio/${a.messaggio.id}`} style={{ textDecoration: 'underline' }}>
                      {a.messaggio.oggetto}
                    </Link>
                  </div>
                )}
              </div>
              <div className="task-side">
                <span className={`badge ${coloreDiPriorita(a.priorita)}`}>{a.priorita}</span>
                {a.messaggio && !a.fatta && <BottoneEsegui id={a.id} />}
              </div>
            </div>
          ))
        )}
      </div>

      <h2 className="section-title">
        Si possono archiviare{' '}
        {daArchiviare.length > 0 && <span className="muted">· {daArchiviare.length}</span>}
      </h2>
      {daArchiviare.length === 0 ? (
        <div className="card">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {rapporto.proposte.length > 0
              ? 'Hai già archiviato tutto quello che l’AI aveva proposto.'
              : 'L’AI non ha trovato niente di sicuro da archiviare in questo periodo.'}
          </p>
        </div>
      ) : (
        <ChecklistArchivio
          proposte={daArchiviare.map((p) => ({
            id: p.id,
            motivo: p.motivo,
            mittente: p.messaggio.mittenteNome || p.messaggio.mittente,
            oggetto: p.messaggio.oggetto,
            data: dataBreve(p.messaggio.data),
          }))}
        />
      )}
    </>
  )
}
