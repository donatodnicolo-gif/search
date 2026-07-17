import Link from 'next/link'
import { db } from '@/lib/db'
import { dataBreve, PRIORITA } from '@/lib/format'
import { PrioritaButtons } from '@/components/PrioritaButtons'
import { ColonnaAttivita } from '@/components/ColonnaAttivita'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ sezione?: string; stato?: string; p?: string }> }

export default async function PostaInArrivo({ searchParams }: Props) {
  const { sezione, stato, p } = await searchParams

  const account = await db.account.count()
  if (account === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">Posta in arrivo</h1>
            <p className="page-caption">
              Le mail lette, smistate e riassunte automaticamente dall’AI.
            </p>
          </div>
        </div>
        <div className="card">
          <div className="empty">
            <div className="empty-icon">✉</div>
            <div className="empty-title">Nessuna casella collegata</div>
            <p className="empty-text">
              Collega la tua casella IMAP e AI Mail inizierà a leggere, smistare e
              proporre risposte.
            </p>
            <div style={{ marginTop: 18 }}>
              <Link href="/impostazioni" className="btn primary">
                Collega una casella
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  const sezioneAttiva = sezione ? await db.sezione.findUnique({ where: { id: sezione } }) : null

  const messaggi = await db.messaggio.findMany({
    where: {
      archiviato: stato === 'archiviati',
      ...(sezione ? { sezioneId: sezione } : {}),
      ...(stato === 'non-letti' ? { letto: false } : {}),
      ...(stato === 'da-rispondere' ? { serveRisposta: true } : {}),
      ...(p ? { priorita: p } : {}),
    },
    // Sempre in ordine di arrivo: una mail appena arrivata non è ancora stata
    // analizzata, e ordinare per priorità la spingerebbe in fondo. Per vedere
    // le urgenze si usano i filtri P0…P3 qui sopra.
    orderBy: { data: 'desc' },
    take: 100,
    include: { sezione: true, bozza: { select: { id: true, inviata: true } }, _count: { select: { attivita: true } } },
  })

  const filtri = [
    { chiave: '', label: 'Tutti' },
    { chiave: 'non-letti', label: 'Non letti' },
    { chiave: 'da-rispondere', label: 'Da rispondere' },
    { chiave: 'archiviati', label: 'Archiviati' },
  ]

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{sezioneAttiva?.nome ?? 'Posta in arrivo'}</h1>
          <p className="page-caption">
            {sezioneAttiva
              ? sezioneAttiva.descrizione
              : 'Le mail lette, smistate e riassunte automaticamente dall’AI.'}
          </p>
        </div>
        <div className="page-actions filters">
          {filtri.map((f) => {
            const params = new URLSearchParams()
            if (sezione) params.set('sezione', sezione)
            if (p) params.set('p', p)
            if (f.chiave) params.set('stato', f.chiave)
            const attivo = (stato ?? '') === f.chiave
            return (
              <Link
                key={f.label}
                href={`/?${params.toString()}`}
                className={`btn ${attivo ? 'primary' : 'secondary'} small`}
              >
                {f.label}
              </Link>
            )
          })}

          <span style={{ width: 1, height: 22, background: 'var(--hairline-strong)', margin: '0 2px' }} />

          {PRIORITA.map((liv) => {
            const params = new URLSearchParams()
            if (sezione) params.set('sezione', sezione)
            if (stato) params.set('stato', stato)
            const attivo = p === liv.codice
            // Ripremere il filtro attivo lo toglie.
            if (!attivo) params.set('p', liv.codice)
            return (
              <Link
                key={liv.codice}
                href={`/?${params.toString()}`}
                className={`prio-btn ${liv.colore} ${attivo ? 'attivo' : ''}`}
                title={`Solo ${liv.codice} — ${liv.quando}`}
              >
                {liv.codice}
              </Link>
            )
          })}
        </div>
      </div>

      <div className="inbox-split">
        <div className="card tight">
        {messaggi.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">Niente da vedere qui</div>
            <p className="empty-text">
              Nessun messaggio con questi filtri. Premi “Aggiorna posta” per leggere le
              novità.
            </p>
          </div>
        ) : (
          <div className="mail-list">
            {messaggi.map((m) => (
              // La riga non è più tutta un link: i pulsanti di priorità devono
              // essere cliccabili senza aprire la mail.
              <div key={m.id} className={`mail-row ${m.letto ? '' : 'non-letto'}`}>
                <Link href={`/messaggio/${m.id}`} className="mail-row-link">
                  <div className="mail-top">
                    <span className={m.letto ? 'dot-spacer' : 'dot-unread'} />
                    <span className="mail-mittente">{m.mittenteNome || m.mittente}</span>
                    <span className="mail-data">{dataBreve(m.data)}</span>
                  </div>
                  <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
                    {m.oggetto}
                  </div>

                  {m.riassunto ? (
                    <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                      <span className="ai-mark">AI</span>
                      <span>{m.riassunto}</span>
                    </div>
                  ) : (
                    <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                      <span className="muted">{m.anteprima}</span>
                    </div>
                  )}

                  {(m.sezione || m._count.attivita > 0 || m.bozza || m.erroreAI) && (
                    <div className="mail-tags" style={{ paddingLeft: 17 }}>
                      {m.sezione && (
                        <span className={`badge ${m.sezione.colore}`}>
                          <span className="dot" />
                          {m.sezione.nome}
                        </span>
                      )}
                      {m._count.attivita > 0 && (
                        <span className="badge neutral">
                          {m._count.attivita} attività
                        </span>
                      )}
                      {m.bozza && !m.bozza.inviata && (
                        <span className="badge gold">Bozza pronta</span>
                      )}
                      {m.erroreAI && <span className="badge red">AI non riuscita</span>}
                    </div>
                  )}
                </Link>

                <div style={{ paddingLeft: 17 }}>
                  <PrioritaButtons id={m.id} priorita={m.priorita} prioritaDa={m.prioritaDa} />
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

        <ColonnaAttivita />
      </div>
    </>
  )
}
