import Link from 'next/link'
import { db } from '@/lib/db'
import { dataBreve } from '@/lib/format'
import { EliminaBozza } from '@/components/EliminaBozza'

export const dynamic = 'force-dynamic'

export default async function Bozze() {
  const bozze = await db.bozza.findMany({
    where: { inviata: false },
    orderBy: { aggiornataIl: 'desc' },
    include: {
      messaggio: { select: { id: true, mittente: true, mittenteNome: true } },
    },
  })

  const mie = bozze.filter((b) => b.origine === 'utente')
  const daAI = bozze.filter((b) => b.origine === 'ai')

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Bozze</h1>
          <p className="page-caption">
            Le mail iniziate e non finite, e le risposte proposte dall’AI. Nessuna parte da sola.
          </p>
        </div>
      </div>

      {bozze.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">✎</div>
            <div className="empty-title">Nessuna bozza</div>
            <p className="empty-text">
              Quando inizi una risposta e la metti da parte, la ritrovi qui. Le bozze dell’AI
              compaiono quando dai una priorità a una mail che chiede una risposta.
            </p>
          </div>
        </div>
      ) : (
        <>
          {mie.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 0 }}>
                Iniziate da te
              </h2>
              <div className="card tight">
                <div className="mail-list">
                  {mie.map((b) => (
                    <RigaBozza key={b.id} bozza={b} />
                  ))}
                </div>
              </div>
            </>
          )}

          {daAI.length > 0 && (
            <>
              <h2 className="section-title">Proposte dall’AI</h2>
              <div className="card tight">
                <div className="mail-list">
                  {daAI.map((b) => (
                    <RigaBozza key={b.id} bozza={b} />
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

type BozzaConMessaggio = {
  id: string
  origine: string
  modo: string
  a: string
  oggetto: string
  corpo: string
  modificata: boolean
  aggiornataIl: Date
  messaggio: { id: string; mittente: string; mittenteNome: string | null } | null
}

function RigaBozza({ bozza }: { bozza: BozzaConMessaggio }) {
  // Una bozza tua si riapre nella schermata di scrittura da cui è nata; una
  // dell'AI si rivede sotto il messaggio a cui risponde.
  const dove =
    bozza.origine === 'utente' && bozza.messaggio
      ? `/messaggio/${bozza.messaggio.id}/scrivi?modo=${bozza.modo}&bozza=${bozza.id}`
      : bozza.messaggio
        ? `/messaggio/${bozza.messaggio.id}`
        : '/bozze'

  const destinatario = bozza.a || bozza.messaggio?.mittenteNome || bozza.messaggio?.mittente || '—'

  return (
    <div className="mail-row">
      <div className="mail-row-head">
        <Link href={dove} className="mail-row-link">
          <div className="mail-top">
            <span className="dot-spacer" />
            <span className="mail-mittente">a {destinatario}</span>
          </div>
          <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
            {bozza.oggetto || '(senza oggetto)'}
          </div>
          <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
            <span className="muted">
              {bozza.corpo.replace(/\s+/g, ' ').slice(0, 160) || '(vuota)'}
            </span>
          </div>
          <div className="mail-tags" style={{ paddingLeft: 17 }}>
            {bozza.modo === 'inoltra' && <span className="badge neutral">inoltro</span>}
            {bozza.modo === 'tutti' && <span className="badge neutral">a tutti</span>}
            {bozza.origine === 'ai' && bozza.modificata && (
              <span className="badge neutral">modificata da te</span>
            )}
          </div>
        </Link>

        <div className="mail-row-side">
          <span className="mail-data">{dataBreve(bozza.aggiornataIl)}</span>
        </div>
      </div>

      <div className="riga-azioni" style={{ paddingLeft: 17 }}>
        <Link href={dove} className="azione-riga">
          Riprendi
        </Link>
        <EliminaBozza id={bozza.id} />
      </div>
    </div>
  )
}
