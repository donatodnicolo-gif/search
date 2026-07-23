import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { raggruppa, chiaveThread } from '@/lib/thread'
import { nomiPerChiavi } from '@/lib/nomiThread'
import { RicercaMail } from '@/components/RicercaMail'
import { CercaServer } from '@/components/CercaServer'
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
      take: 300,
      // ⚠️ MAI portarsi dietro i corpi qui: la lista mostra solo l'anteprima.
      // Con 500 mail complete (corpoHtml incluso) erano decine di MB dal DB a
      // ogni apertura della pagina — era questa la lentezza della posta inviata.
      omit: { corpoTesto: true, corpoHtml: true },
      include: { sezione: { select: { nome: true, colore: true } } },
    }),
    db.sezione.findMany({ where: { utenteId: u.id }, orderBy: { ordine: 'asc' }, select: { id: true, nome: true } }),
  ])

  // Anche qui la posta si legge a CONVERSAZIONI: più risposte mie nello stesso
  // scambio fanno una riga sola (come in posta in arrivo), col numero accanto.
  // Il volto della riga è la mia mail più recente della conversazione.
  const gruppi = raggruppa(messaggi)

  // Il nome dato a mano alle conversazioni (una query per tutta la pagina).
  const nomi = await nomiPerChiavi(u.id, gruppi.map((g) => chiaveThread(g)))

  const righe: RigaInviata[] = gruppi.map((g) => {
    const m = g[g.length - 1]
    return {
      id: m.id,
      ids: g.map((x) => x.id),
      nel: g.length,
      nomeThread: nomi.get(chiaveThread(g)) ?? null,
      destinatari: m.destinatari,
      oggetto: m.oggetto,
      anteprima: m.anteprima,
      data: m.data,
      sezione: m.sezione ? { nome: m.sezione.nome, colore: m.sezione.colore } : null,
      sezioneId: m.sezioneId,
    }
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Posta inviata</h1>
          <p className="page-caption">
            Le mail spedite da AI Mail, raccolte per conversazione (il numero accanto al
            destinatario dice quante tue mail ci sono in quello scambio). Ne resta una copia anche
            nella cartella “Inviata” della casella, così le rivedi da qualsiasi altro client.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RicercaMail iniziale={ricerca ? q : ''} base="/inviata" placeholder="Cerca negli inviati (destinatario, oggetto, testo)…" />
        {/* La ricerca guarda anche la posta mai scaricata, sul server. */}
        {ricerca && <CercaServer q={q} />}
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
