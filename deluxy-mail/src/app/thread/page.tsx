import Link from 'next/link'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { dataBreve } from '@/lib/format'
import { raggruppa } from '@/lib/thread'
import { RicercaMail } from '@/components/RicercaMail'
import { AzioniThread } from '@/components/AzioniThread'
import { AgganciaDialog } from '@/components/AgganciaRiga'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Props = { searchParams: Promise<{ q?: string }> }

/**
 * "Thread": tutte le conversazioni raggruppate. Una riga per thread, col volto
 * (il messaggio più recente), quante mail e quante parti. Cliccando si apre la
 * conversazione. È la vista "per conversazioni" di tutta la posta (SPAM e
 * Cestino esclusi).
 */
export default async function Thread({ searchParams }: Props) {
  const { q: qGrezzo } = await searchParams
  const q = (qGrezzo ?? '').trim()
  const ricerca = q.length >= 2
  const u = await richiediUtente()

  const messaggi = await db.messaggio.findMany({
    where: {
      utenteId: u.id,
      cestinato: false,
      // SPAM fuori (filtro sulla relazione, così restano le mail senza sezione).
      NOT: { sezione: { nome: 'SPAM' } },
      ...(ricerca
        ? {
            OR: [
              { oggetto: { contains: q, mode: 'insensitive' as const } },
              { mittente: { contains: q, mode: 'insensitive' as const } },
              { mittenteNome: { contains: q, mode: 'insensitive' as const } },
              { destinatari: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { data: 'desc' },
    take: 2000,
    select: {
      id: true,
      thread: true,
      threadManuale: true,
      scollegato: true,
      oggetto: true,
      data: true,
      mittente: true,
      mittenteNome: true,
      direzione: true,
      letto: true,
      sezione: { select: { nome: true, colore: true } },
    },
  })

  // Un THREAD è una conversazione VERA: più di un messaggio. Le mail singole
  // (1 messaggio) non sono thread e restano fuori da questa vista.
  const gruppi = raggruppa(messaggi)
    .filter((g) => g.length > 1)
    .slice(0, 800)

  const righe = gruppi.map((g) => {
    const volto = g[g.length - 1] // il più recente
    const parti = new Set(g.map((x) => (x.direzione === 'uscita' ? 'me' : x.mittente.toLowerCase()))).size
    const nonLetti = g.some((x) => x.direzione === 'entrata' && !x.letto)
    return { volto, count: g.length, parti, nonLetti }
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Thread</h1>
          <p className="page-caption">
            Solo le conversazioni VERE (più di un messaggio): una riga per thread. Aprila per
            vedere tutti i messaggi. Le mail singole restano fuori (SPAM e Cestino esclusi).
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RicercaMail iniziale={ricerca ? q : ''} base="/thread" placeholder="Cerca fra i thread (oggetto, persona)…" />
      </div>

      <div className="card tight">
        {righe.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{ricerca ? '⌕' : '☷'}</div>
            <div className="empty-title">{ricerca ? 'Nessun thread trovato' : 'Nessuna conversazione'}</div>
            <p className="empty-text">
              {ricerca ? `Nessun thread corrisponde a «${q}».` : 'Qui compaiono tutte le conversazioni.'}
            </p>
          </div>
        ) : (
          <div className="mail-list">
            {righe.map(({ volto, count, parti, nonLetti }) => (
              <div key={volto.id} className={`mail-row ${nonLetti ? 'non-letto' : ''}`}>
                <div className="mail-row-head">
                  <Link href={`/messaggio/${volto.id}`} className="mail-row-link">
                    <div className="mail-top">
                      <span className={nonLetti ? 'dot-unread' : 'dot-spacer'} />
                      <span className="mail-mittente">
                        {volto.direzione === 'uscita' ? 'Tu' : volto.mittenteNome || volto.mittente}
                      </span>
                      {count > 1 && (
                        <span className="thread-count" title={`${count} messaggi · ${parti} ${parti === 1 ? 'parte' : 'parti'}`}>
                          {count}
                        </span>
                      )}
                      {volto.sezione && (
                        <span className={`badge ${volto.sezione.colore}`}>
                          <span className="dot" />
                          {volto.sezione.nome}
                        </span>
                      )}
                    </div>
                    <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
                      {volto.oggetto}
                    </div>
                    <div className="mail-tags" style={{ paddingLeft: 17 }}>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {count} {count === 1 ? 'messaggio' : 'messaggi'} · {parti} {parti === 1 ? 'parte' : 'parti'}
                      </span>
                    </div>
                  </Link>
                  <div className="mail-row-side">
                    <span className="mail-data">{dataBreve(volto.data)}</span>
                  </div>
                </div>
                <AzioniThread messaggioId={volto.id} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Il dialogo di aggancio, montato una volta per la pagina. */}
      <AgganciaDialog />
    </>
  )
}
