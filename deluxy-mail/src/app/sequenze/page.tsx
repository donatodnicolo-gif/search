import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { dataBreve, FUSO } from '@/lib/format'
import { SequenzaCard, SequenzaForm, FermaIscrizione } from '@/components/SequenzaForm'
import { NuovaSequenza } from '@/components/NuovaSequenza'

export const dynamic = 'force-dynamic'

/**
 * SEQUENZE: i modelli di follow-up. All'invio di una mail ne agganci una:
 * se il destinatario non risponde, i passi partono da soli. Qui si creano i
 * modelli (con le variabili) e si vedono le iscrizioni in corso.
 */
export default async function Sequenze() {
  const u = await richiediUtente()

  let sequenze: {
    id: string
    nome: string
    descrizione: string
    passi: { giorniAttesa: number; oggetto: string; corpo: string; ordine: number; ramo: string }[]
    iscrizioni: { stato: string }[]
  }[] = []
  let iscrizioni: {
    id: string
    destinatario: string
    stato: string
    esito: string
    ramo: string
    passoFatto: number
    prossimoInvio: Date | null
    creataIl: Date
    sequenza: { nome: string; passi: { id: string }[] }
  }[] = []
  try {
    ;[sequenze, iscrizioni] = await Promise.all([
      db.sequenza.findMany({
        where: { utenteId: u.id },
        orderBy: { creataIl: 'asc' },
        include: {
          passi: { orderBy: { ordine: 'asc' } },
          iscrizioni: { where: { stato: 'attiva' }, select: { stato: true } },
        },
      }),
      db.sequenzaIscrizione.findMany({
        where: { utenteId: u.id },
        orderBy: { creataIl: 'desc' },
        take: 50,
        include: { sequenza: { select: { nome: true, passi: { select: { id: true } } } } },
      }),
    ])
  } catch {
    // Tabelle non ancora migrate: la pagina si apre lo stesso.
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sequenze</h1>
          <p className="page-caption">
            I modelli di follow-up: all’invio di una mail ne agganci una. Se il destinatario NON
            risponde partono i passi del <strong>percorso A</strong>; appena risponde parte il{' '}
            <strong>percorso B</strong>. Variabili nei modelli: {'{{nome}}'}, {'{{email}}'},{' '}
            {'{{oggetto}}'}.
          </p>
        </div>
      </div>

      <NuovaSequenza />

      {sequenze.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">⛓</div>
            <div className="empty-title">Nessuna sequenza</div>
            <p className="empty-text">
              Crea la prima con «+ Nuova sequenza»: la aggancerai alle mail dal menu
              «Sequenza dopo l’invio» quando scrivi.
            </p>
          </div>
        </div>
      ) : (
        sequenze.map((s) => (
          <SequenzaCard
            key={s.id}
            sequenza={{
              id: s.id,
              nome: s.nome,
              descrizione: s.descrizione,
              passi: s.passi.map((p) => ({
                giorniAttesa: p.giorniAttesa,
                oggetto: p.oggetto,
                corpo: p.corpo,
                ramo: p.ramo === 'B' ? 'B' : 'A',
              })),
              iscritteAttive: s.iscrizioni.length,
            }}
          />
        ))
      )}

      {iscrizioni.length > 0 && (
        <>
          <h2 className="section-title">Destinatari nelle sequenze</h2>
          <div className="card tight">
            {iscrizioni.map((i) => (
              <div key={i.id} className="task-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="task-titolo">
                    {i.destinatario}{' '}
                    <span className="muted" style={{ fontWeight: 400 }}>· {i.sequenza.nome}</span>
                  </div>
                  <div className="task-sub">
                    percorso {i.ramo === 'B' ? 'B (ha risposto)' : 'A (attende risposta)'} ·{' '}
                    {i.passoFatto} pass{i.passoFatto === 1 ? 'o' : 'i'} inviat{i.passoFatto === 1 ? 'o' : 'i'}
                    {i.stato === 'attiva' && i.prossimoInvio
                      ? ` · prossimo: ${i.prossimoInvio.toLocaleString('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                    {i.esito ? ` · ${i.esito}` : ''}
                  </div>
                </div>
                <div className="task-side" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`badge ${i.stato === 'attiva' ? 'green' : i.stato === 'completata' ? 'blue' : 'neutral'}`}>
                    <span className="dot" />
                    {i.stato}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>{dataBreve(i.creataIl)}</span>
                  {i.stato === 'attiva' && <FermaIscrizione id={i.id} />}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
