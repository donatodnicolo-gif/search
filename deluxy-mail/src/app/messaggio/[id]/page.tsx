import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { dataLunga } from '@/lib/format'
import { BozzaEditor } from '@/components/BozzaEditor'
import { AzioniMessaggio } from '@/components/AzioniMessaggio'
import { PrioritaButtons } from '@/components/PrioritaButtons'
import { Rianalizza } from '@/components/Rianalizza'
import { CorpoMessaggio } from '@/components/CorpoMessaggio'
import { sanitizzaHtml } from '@/lib/sanitizzaHtml'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export default async function DettaglioMessaggio({ params }: Props) {
  const { id } = await params
  const u = await richiediUtente()

  const messaggio = await db.messaggio.findFirst({
    where: { id, utenteId: u.id },
    include: { sezione: true, bozze: true, attivita: true, account: true },
  })
  if (!messaggio) notFound()

  const sezioni = await db.sezione.findMany({ where: { utenteId: u.id }, orderBy: { ordine: 'asc' } })

  // Qui si mostra solo la proposta dell'AI: le bozze che hai iniziato tu si
  // riprendono dalla schermata di scrittura, dove le stavi scrivendo.
  const bozzaAI = messaggio.bozze.find((b) => b.origine === 'ai' && !b.inviata)

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/" className="btn secondary small">
            ← Posta in arrivo
          </Link>
        </div>
        <AzioniMessaggio
          id={messaggio.id}
          letto={messaggio.letto}
          archiviato={messaggio.archiviato}
          sezioneId={messaggio.sezioneId}
          sezioni={sezioni.map((s) => ({ id: s.id, nome: s.nome }))}
          mittente={messaggio.mittente}
        />
      </div>

      <div className="card">
        <div className="mail-head">
          <h1 className="mail-subject">{messaggio.oggetto}</h1>
          <div className="mail-meta">
            <Link
              href={`/rubrica/${encodeURIComponent(messaggio.mittente)}`}
              style={{ textDecoration: 'underline' }}
              title="Vedi tutti i messaggi di questo contatto"
            >
              <strong>{messaggio.mittenteNome || messaggio.mittente}</strong>{' '}
              &lt;{messaggio.mittente}&gt;
            </Link>
            <br />
            a {messaggio.destinatari} · {dataLunga(messaggio.data)}
          </div>
          <div className="mail-tags">
            {messaggio.sezione && (
              <span className={`badge ${messaggio.sezione.colore}`}>
                <span className="dot" />
                {messaggio.sezione.nome}
              </span>
            )}
            {messaggio.smistatoDa && (
              <span className="badge neutral">
                smistato da{' '}
                {messaggio.smistatoDa === 'ai'
                  ? 'AI'
                  : messaggio.smistatoDa === 'regola'
                    ? 'una regola'
                    : 'te'}
              </span>
            )}
            {messaggio.allegati > 0 && (
              <span className="badge neutral">
                {messaggio.allegati} allegat{messaggio.allegati === 1 ? 'o' : 'i'}
              </span>
            )}
          </div>

          <PrioritaButtons
            id={messaggio.id}
            priorita={messaggio.priorita}
            prioritaDa={messaggio.prioritaDa}
            analizzato={messaggio.analizzatoIl !== null}
          />
        </div>

        {messaggio.riassunto && (
          <div className="ai-box">
            <div className="ai-box-title">Cosa ha capito l’AI</div>
            <div className="ai-box-text">{messaggio.riassunto}</div>
            {messaggio.attivita.length > 0 && (
              <ul style={{ margin: '10px 0 0 18px', fontSize: 14 }}>
                {messaggio.attivita.map((a) => (
                  <li key={a.id} style={{ marginTop: 4 }}>
                    {a.titolo}
                    {a.scadenza && (
                      <span className="muted">
                        {' '}
                        — entro {a.scadenza.toLocaleDateString('it-IT')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* L'errore si vede solo qui e solo se l'analisi è stata chiesta e non
            è riuscita: nella lista sarebbe rumore su ogni messaggio. */}
        {messaggio.erroreAI && (
          <div
            className="ai-box"
            style={{ background: 'rgba(215,0,21,0.06)', borderColor: 'rgba(215,0,21,0.2)' }}
          >
            <div className="ai-box-title" style={{ color: 'var(--red)' }}>
              Analisi non riuscita
            </div>
            <div className="ai-box-text">{messaggio.erroreAI}</div>
            <div style={{ marginTop: 12 }}>
              <Rianalizza id={messaggio.id} />
            </div>
          </div>
        )}

        {!messaggio.riassunto && !messaggio.erroreAI && (
          <div className="ai-box" style={{ background: 'var(--fill)', borderColor: 'var(--hairline)' }}>
            <div className="ai-box-text" style={{ color: 'var(--text-secondary)' }}>
              L’AI non ha ancora letto questo messaggio. Dagli una priorità qui sopra: te lo
              riassume e crea l’attività da fare.
            </div>
          </div>
        )}

        <CorpoMessaggio
          html={messaggio.corpoHtml ? sanitizzaHtml(messaggio.corpoHtml) : null}
          testo={messaggio.corpoTesto}
        />
      </div>

      {bozzaAI && (
        <div className="card draft-box">
          <BozzaEditor
            bozza={{
              id: bozzaAI.id,
              oggetto: bozzaAI.oggetto,
              corpo: bozzaAI.corpo,
              inviata: bozzaAI.inviata,
              modificata: bozzaAI.modificata,
            }}
            destinatario={messaggio.mittente}
            mittente={messaggio.account.email}
          />
        </div>
      )}
    </>
  )
}
