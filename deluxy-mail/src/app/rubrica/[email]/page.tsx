import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { coloreDiPriorita, dataBreve, FUSO } from '@/lib/format'
import { iniziali } from '@/lib/contatti'
import { PrioritaButtons } from '@/components/PrioritaButtons'
import { RispostaAzioni } from '@/components/RispostaAzioni'
import { BottoneAI } from '@/components/BottoneAI'
import { BottoneContattoAI } from '@/components/BottoneContattoAI'
import { CheckAttivita } from '@/components/CheckAttivita'
import { richiediUtente } from '@/lib/sessione'
import { datiContattoAI } from '@/lib/contattiAI'
import { EditorIstruzioni } from '@/components/EditorIstruzioni'
import { partnerPerEmail } from '@/lib/anagrafiche'
import { AnagraficheContatto } from '@/components/AnagraficheContatto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // il quadro AI del contatto gira qui

type Props = { params: Promise<{ email: string }> }

export default async function Contatto({ params }: Props) {
  const { email: grezza } = await params
  const email = decodeURIComponent(grezza)
  const u = await richiediUtente()

  const messaggi = await db.messaggio.findMany({
    where: { utenteId: u.id, mittente: email },
    orderBy: { data: 'desc' },
    take: 200,
    include: {
      sezione: true,
      bozze: { where: { inviata: false }, select: { id: true } },
      _count: { select: { attivita: true } },
    },
  })
  if (messaggi.length === 0) notFound()

  const nome = messaggi.find((m) => m.mittenteNome)?.mittenteNome ?? null
  const daRispondere = messaggi.filter((m) => m.serveRisposta && !m.archiviato).length
  const attivitaAperte = await db.attivita.count({
    where: {
      utenteId: u.id,
      fatta: false,
      OR: [{ messaggio: { mittente: email } }, { contattoEmail: email }],
    },
  })
  const riassunto = await db.riassuntoContatto.findUnique({
    where: { utenteId_email: { utenteId: u.id, email } },
  })
  const { attivo: contattoAI, istruzioni: istruzioniContatto } = await datiContattoAI(u.id, email)
  const azioni = await db.attivita.findMany({
    where: { utenteId: u.id, contattoEmail: email, fatta: false },
    orderBy: [{ scadenza: 'asc' }, { priorita: 'asc' }],
  })

  // Questo contatto è un'azienda in Anagrafiche? (e un cliente?)
  const partnerAnagrafiche = await partnerPerEmail(email).catch(() => null)

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/rubrica" className="btn secondary small" style={{ marginBottom: 14 }}>
            ← Contatti
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>
              {iniziali(nome, email)}
            </span>
            <div>
              <h1 className="page-title" style={{ fontSize: 26 }}>
                {nome || email.split('@')[0]}
              </h1>
              <p className="page-caption" style={{ marginTop: 2 }}>
                {email}
              </p>
            </div>
          </div>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <BottoneContattoAI email={email.toLowerCase()} attivo={contattoAI} />
          <BottoneAI email={email} aggiornatoIl={riassunto?.aggiornatoIl ?? null} />
        </div>
      </div>

      <AnagraficheContatto
        email={email.toLowerCase()}
        nome={nome}
        partner={
          partnerAnagrafiche
            ? { nome: partnerAnagrafiche.nome, stato: partnerAnagrafiche.stato, citta: partnerAnagrafiche.citta, link: partnerAnagrafiche.link }
            : null
        }
        link={partnerAnagrafiche?.link ?? ''}
      />

      <div className="card" style={{ marginBottom: 18 }}>
        <EditorIstruzioni tipo="contatto" target={email.toLowerCase()} valore={istruzioniContatto} />
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Messaggi</div>
          <div className="kpi-value">{messaggi.length}</div>
          <div className="kpi-sub">l’ultimo {dataBreve(messaggi[0].data)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da rispondere</div>
          <div className={`kpi-value ${daRispondere > 0 ? 'neg' : ''}`}>{daRispondere}</div>
          <div className="kpi-sub">secondo l’AI</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Attività aperte</div>
          <div className="kpi-value">{attivitaAperte}</div>
          <div className="kpi-sub">nate dalle sue mail</div>
        </div>
      </div>

      {riassunto ? (
        <div className="ai-box">
          <div className="ai-box-title">
            La situazione secondo l’AI · {riassunto.messaggiVisti} messaggi letti il{' '}
            {riassunto.aggiornatoIl.toLocaleDateString('it-IT', { timeZone: FUSO })}
          </div>
          <div className="ai-box-text">{riassunto.situazione}</div>

          {riassunto.taskAperti.trim() && (
            <>
              <div className="ai-box-title" style={{ marginTop: 14 }}>
                Rimasto in sospeso
              </div>
              <ul style={{ margin: '0 0 0 18px', fontSize: 14 }}>
                {riassunto.taskAperti
                  .split('\n')
                  .filter(Boolean)
                  .map((t, i) => (
                    <li key={i} style={{ marginTop: 4 }}>
                      {t}
                    </li>
                  ))}
              </ul>
            </>
          )}

          {azioni.length > 0 && (
            <>
              <div className="ai-box-title" style={{ marginTop: 14 }}>
                Azioni proposte · le trovi anche in Attività
              </div>
              {azioni.map((a) => (
                <div key={a.id} className="col-task" style={{ padding: '10px 0', border: 'none' }}>
                  <CheckAttivita id={a.id} fatta={a.fatta} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{a.titolo}</div>
                    {a.dettaglio && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {a.dettaglio}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${coloreDiPriorita(a.priorita)}`}>{a.priorita}</span>
                  {a.scadenza && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      entro {a.scadenza.toLocaleDateString('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="ai-box" style={{ background: 'var(--fill)', borderColor: 'var(--hairline)' }}>
          <div className="ai-box-text" style={{ color: 'var(--text-secondary)' }}>
            Premi <strong>AI</strong> qui sopra: legge le ultime 10 mail scambiate con questo
            contatto, ti dice a che punto siete e propone cosa fare.
          </div>
        </div>
      )}

      <h2 className="section-title">Tutti i messaggi</h2>
      <div className="card tight">
        <div className="mail-list">
          {messaggi.map((m) => (
            <div key={m.id} className={`mail-row ${m.letto ? '' : 'non-letto'}`}>
              <div className="mail-row-head">
                <Link href={`/messaggio/${m.id}`} className="mail-row-link">
                <div className="mail-top">
                  <span className={m.letto ? 'dot-spacer' : 'dot-unread'} />
                  <span className="mail-mittente">{m.oggetto}</span>
                </div>

                <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                  {m.riassunto ? (
                    <>
                      <span className="ai-mark">AI</span>
                      <span>{m.riassunto}</span>
                    </>
                  ) : (
                    <span className="muted">{m.anteprima}</span>
                  )}
                </div>

                {(m.sezione || m.archiviato || m._count.attivita > 0 || m.bozze.length > 0) && (
                  <div className="mail-tags" style={{ paddingLeft: 17 }}>
                    {m.sezione && (
                      <span className={`badge ${m.sezione.colore}`}>
                        <span className="dot" />
                        {m.sezione.nome}
                      </span>
                    )}
                    {m.archiviato && <span className="badge neutral">archiviato</span>}
                    {m._count.attivita > 0 && (
                      <span className="badge neutral">{m._count.attivita} attività</span>
                    )}
                    {m.bozze.length > 0 && <span className="badge gold">Bozza pronta</span>}
                  </div>
                )}
                </Link>

                <div className="mail-row-side">
                  <span className="mail-data">{dataBreve(m.data)}</span>
                  <RispostaAzioni id={m.id} />
                </div>
              </div>

              <div style={{ paddingLeft: 17 }}>
                <PrioritaButtons
                  id={m.id}
                  priorita={m.priorita}
                  prioritaDa={m.prioritaDa}
                  analizzato={m.analizzatoIl !== null}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
