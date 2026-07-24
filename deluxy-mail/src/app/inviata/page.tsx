import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { raggruppa } from '@/lib/thread'
import { nomiPerGruppi, chiaviPerNome } from '@/lib/nomiThread'
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
  // Cercando si trovano anche le conversazioni a cui hai dato un NOME: la
  // chiave del nome è l'id di una loro mail, quindi basta includerla.
  const chiaviNome = ricerca ? await chiaviPerNome(u.id, q) : []

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
                ...(chiaviNome.length ? [{ id: { in: chiaviNome } }] : []),
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

  // ⚠️ Il raggruppamento va fatto su TUTTA la posta, non solo sugli inviati:
  // raggruppando solo le mie mail, una risposta dentro uno scambio di venti
  // messaggi risultava "1" e non si capiva che faceva parte di una
  // conversazione. Qui si prende una finestra di posta (leggera, solo i campi
  // per raggruppare), si raggruppa, e si tengono i gruppi che contengono
  // almeno una MIA mail.
  const contorno = await db.messaggio.findMany({
    where: { utenteId: u.id, cestinato: false },
    orderBy: { data: 'desc' },
    take: 2000,
    select: {
      id: true, thread: true, threadManuale: true, scollegato: true,
      oggetto: true, data: true, direzione: true,
    },
  })

  const idsInviate = new Set(messaggi.map((m) => m.id))
  const perId = new Map(contorno.map((m) => [m.id, m]))
  // Le mie mail fuori dalla finestra del contorno vanno aggiunte a mano.
  for (const m of messaggi) {
    if (!perId.has(m.id)) {
      perId.set(m.id, {
        id: m.id, thread: m.thread, threadManuale: m.threadManuale, scollegato: m.scollegato,
        oggetto: m.oggetto, data: m.data, direzione: m.direzione,
      })
    }
  }

  const gruppi = raggruppa([...perId.values()]).filter((g) => g.some((x) => idsInviate.has(x.id)))

  // Il nome dato a mano alle conversazioni (una query per tutta la pagina).
  // Il nome si cerca su TUTTI i messaggi del gruppo (vedi nomiPerGruppi).
  const nomi = await nomiPerGruppi(u.id, gruppi)

  // Il volto della riga è la MIA mail più recente del gruppo (è posta inviata).
  const datiInviate = new Map(messaggi.map((m) => [m.id, m]))

  const righe: RigaInviata[] = gruppi.flatMap((g, i) => {
    const mieNelGruppo = g.filter((x) => idsInviate.has(x.id))
    const volto = mieNelGruppo[mieNelGruppo.length - 1]
    const m = datiInviate.get(volto.id)
    if (!m) return []
    return [{
      id: m.id,
      // Le azioni agiscono solo sulle MIE mail: cestinare la conversazione
      // intera da qui toglierebbe anche la posta ricevuta, che non è ciò che
      // si chiede in "Posta inviata".
      ids: mieNelGruppo.map((x) => x.id),
      nel: mieNelGruppo.length,
      /** Quanti messaggi ha lo scambio in tutto (miei + ricevuti). */
      nelThread: g.length,
      nomeThread: nomi[i] ?? null,
      destinatari: m.destinatari,
      oggetto: m.oggetto,
      anteprima: m.anteprima,
      data: m.data,
      sezione: m.sezione ? { nome: m.sezione.nome, colore: m.sezione.colore } : null,
      sezioneId: m.sezioneId,
      dimensione: m.dimensione ?? 0,
    }]
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
