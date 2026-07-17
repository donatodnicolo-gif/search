import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { dataLunga } from '@/lib/format'
import { BozzaEditor } from '@/components/BozzaEditor'
import { AzioniMessaggio } from '@/components/AzioniMessaggio'
import { PrioritaButtons } from '@/components/PrioritaButtons'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export default async function DettaglioMessaggio({ params }: Props) {
  const { id } = await params

  const messaggio = await db.messaggio.findUnique({
    where: { id },
    include: { sezione: true, bozza: true, attivita: true, account: true },
  })
  if (!messaggio) notFound()

  const sezioni = await db.sezione.findMany({ orderBy: { ordine: 'asc' } })

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
        />
      </div>

      <div className="card">
        <div className="mail-head">
          <h1 className="mail-subject">{messaggio.oggetto}</h1>
          <div className="mail-meta">
            <strong>{messaggio.mittenteNome || messaggio.mittente}</strong>{' '}
            &lt;{messaggio.mittente}&gt;
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

        {messaggio.erroreAI && (
          <div className="ai-box" style={{ background: 'rgba(215,0,21,0.06)', borderColor: 'rgba(215,0,21,0.2)' }}>
            <div className="ai-box-title" style={{ color: 'var(--red)' }}>
              Analisi AI non riuscita
            </div>
            <div className="ai-box-text">{messaggio.erroreAI}</div>
          </div>
        )}

        <div className="mail-body">{messaggio.corpoTesto}</div>
      </div>

      {messaggio.bozza && (
        <div className="card draft-box">
          <BozzaEditor
            bozza={{
              id: messaggio.bozza.id,
              oggetto: messaggio.bozza.oggetto,
              corpo: messaggio.bozza.corpo,
              inviata: messaggio.bozza.inviata,
              modificata: messaggio.bozza.modificata,
            }}
            destinatario={messaggio.mittente}
            mittente={messaggio.account.email}
          />
        </div>
      )}
    </>
  )
}
