import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { RicercaMail } from '@/components/RicercaMail'
import { ListaInviati, type RigaInviata } from '@/components/ListaInviati'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string }> }

export default async function PostaInviata({ searchParams }: Props) {
  const { q: qGrezzo } = await searchParams
  const q = (qGrezzo ?? '').trim()
  const ricerca = q.length >= 2
  const u = await richiediUtente()
  const [messaggi, sezioni] = await Promise.all([
    db.messaggio.findMany({
      where: {
        utenteId: u.id,
        direzione: 'uscita',
        cestinato: false,
        ...(ricerca
          ? {
              OR: [
                { oggetto: { contains: q, mode: 'insensitive' as const } },
                { destinatari: { contains: q, mode: 'insensitive' as const } },
                { corpoTesto: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { data: 'desc' },
      take: 500,
      include: { sezione: { select: { nome: true, colore: true } } },
    }),
    db.sezione.findMany({ where: { utenteId: u.id }, orderBy: { ordine: 'asc' }, select: { id: true, nome: true } }),
  ])

  const righe: RigaInviata[] = messaggi.map((m) => ({
    id: m.id,
    destinatari: m.destinatari,
    oggetto: m.oggetto,
    anteprima: m.anteprima,
    data: m.data,
    sezione: m.sezione ? { nome: m.sezione.nome, colore: m.sezione.colore } : null,
    sezioneId: m.sezioneId,
  }))

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Posta inviata</h1>
          <p className="page-caption">
            Le mail spedite da AI Mail. Ne resta una copia anche nella cartella “Inviata” della
            casella, così le rivedi da qualsiasi altro client.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RicercaMail iniziale={ricerca ? q : ''} base="/inviata" placeholder="Cerca negli inviati (destinatario, oggetto, testo)…" />
      </div>

      <div className="card tight">
        {messaggi.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{ricerca ? '⌕' : '↗'}</div>
            <div className="empty-title">
              {ricerca ? 'Nessun inviato trovato' : 'Non hai ancora inviato niente'}
            </div>
            <p className="empty-text">
              {ricerca
                ? `Nessuna mail inviata corrisponde a «${q}».`
                : 'Qui compaiono le risposte e gli inoltri che parti da AI Mail. Quello che hai mandato da altri programmi resta nella tua casella, non qui.'}
            </p>
          </div>
        ) : (
          <ListaInviati righe={righe} sezioni={sezioni} />
        )}
      </div>
    </>
  )
}
