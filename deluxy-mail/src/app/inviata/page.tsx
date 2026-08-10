import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { raggruppa } from '@/lib/thread'
import { nomiPerGruppi, chiaviPerNome } from '@/lib/nomiThread'
import { RicercaMail } from '@/components/RicercaMail'
import { CondizioniRicerca } from '@/components/CondizioniRicerca'
import { CercaServer } from '@/components/CercaServer'
import { ListaInviati, type RigaInviata } from '@/components/ListaInviati'
import { accountAttivoId } from '@/lib/accountAttivo'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{
    q?: string
    a?: string
    dal?: string
    al?: string
    allegati?: string
    dove?: string
    sezione?: string
  }>
}

export default async function PostaInviata({ searchParams }: Props) {
  const { q: qGrezzo, a, dal, al, allegati, dove, sezione } = await searchParams
  const q = (qGrezzo ?? '').trim()
  // Le stesse condizioni della posta in arrivo, meno «da»: qui il mittente sei
  // sempre tu, e un campo che non filtra niente è peggio che non averlo.
  const cond = {
    a: (a ?? '').trim(),
    dal: (dal ?? '').trim(),
    al: (al ?? '').trim(),
    allegati: allegati === '1',
    dove: (dove ?? '').trim(),
    sezione: (sezione ?? '').trim(),
  }
  const conCondizioni = Boolean(cond.a || cond.dal || cond.al || cond.allegati || cond.sezione)
  const ricerca = q.length >= 2 || conCondizioni
  const u = await richiediUtente()
  const accountAttivo = await accountAttivoId(u.id)
  // Cercando si trovano anche le conversazioni a cui hai dato un NOME: la
  // chiave del nome è l'id di una loro mail, quindi basta includerla.
  const chiaviNome = ricerca ? await chiaviPerNome(u.id, q) : []

  const [messaggi, sezioni] = await Promise.all([
    db.messaggio.findMany({
      where: {
        utenteId: u.id,
        direzione: 'uscita',
        cestinato: false,
        // Casella attiva (multi-account): solo gli inviati da quella.
        ...(accountAttivo ? { accountId: accountAttivo } : {}),
        // Parole e condizioni si sommano in AND: «preventivo» nell'oggetto E a
        // Martina E di settembre. Ogni pezzo può stare anche da solo.
        ...(ricerca
          ? {
              AND: [
                ...(q.length >= 2
                  ? [
                      {
                        OR: [
                          ...(cond.dove === 'corpo' || cond.dove === 'persone'
                            ? []
                            : [{ oggetto: { contains: q, mode: 'insensitive' as const } }]),
                          ...(cond.dove === 'oggetto' || cond.dove === 'corpo'
                            ? []
                            : [{ destinatari: { contains: q, mode: 'insensitive' as const } }]),
                          ...(cond.dove === 'oggetto' || cond.dove === 'persone'
                            ? []
                            : [{ corpoTesto: { contains: q, mode: 'insensitive' as const } }]),
                          ...(chiaviNome.length ? [{ id: { in: chiaviNome } }] : []),
                        ],
                      },
                    ]
                  : []),
                ...(cond.a ? [{ destinatari: { contains: cond.a, mode: 'insensitive' as const } }] : []),
                ...(cond.dal ? [{ data: { gte: new Date(`${cond.dal}T00:00:00`) } }] : []),
                // Il giorno indicato è compreso.
                ...(cond.al ? [{ data: { lte: new Date(`${cond.al}T23:59:59`) } }] : []),
                ...(cond.allegati ? [{ allegati: { gt: 0 } }] : []),
                ...(cond.sezione ? [{ sezioneId: cond.sezione }] : []),
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

  // Dimensione mancante (mail salvate prima del campo): si ricava dai byte dei
  // corpi con una query di soli interi, solo per le righe che ne sono prive.
  // Senza, l'ordinamento per dimensione sarebbe inerte. Vedi page.tsx.
  const senzaPeso = righe.filter((r) => !r.dimensione)
  if (senzaPeso.length > 0) {
    try {
      const pesi = await db.$queryRaw<{ id: string; peso: number }[]>(
        Prisma.sql`SELECT "id",
                          (octet_length("corpoTesto") + COALESCE(octet_length("corpoHtml"), 0))::int AS peso
                     FROM "Messaggio"
                    WHERE "id" IN (${Prisma.join(senzaPeso.map((r) => r.id))})`
      )
      const perId = new Map(pesi.map((p) => [p.id, Number(p.peso) || 0]))
      for (const r of senzaPeso) r.dimensione = perId.get(r.id) ?? 0
    } catch {
      /* si ordina con quello che c'è */
    }
  }

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
        <RicercaMail iniziale={q} base="/inviata" placeholder="Cerca negli inviati (destinatario, oggetto, testo)…" />
        <CondizioniRicerca
          valori={{ q, a: cond.a, dal: cond.dal, al: cond.al, allegati, dove: cond.dove, sezione: cond.sezione }}
          sezioni={sezioni}
          base="/inviata"
          campi={['a', 'periodo', 'allegati', 'dove', 'sezione']}
        />
        {/* La ricerca guarda anche la posta mai scaricata, sul server. */}
        {q.length >= 2 && <CercaServer q={q} />}
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
