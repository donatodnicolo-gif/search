import Link from 'next/link'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { dataBreve } from '@/lib/format'
import { raggruppa } from '@/lib/thread'
import { nomiPerGruppi, chiaviPerNome } from '@/lib/nomiThread'
import { idsThreadAI } from '@/lib/threadAI'
import { RicercaMail } from '@/components/RicercaMail'
import { AzioniThread } from '@/components/AzioniThread'
import { AgganciaDialog } from '@/components/AgganciaRiga'
import { NomeThreadDialog } from '@/components/NomeThreadRiga'

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

  const base = {
    utenteId: u.id,
    cestinato: false,
    // SPAM fuori (filtro sulla relazione, così restano le mail senza sezione).
    NOT: { sezione: { nome: 'SPAM' } },
  }
  const campi = {
    id: true,
    thread: true,
    threadManuale: true,
    scollegato: true,
    oggetto: true,
    data: true,
    mittente: true,
    mittenteNome: true,
    destinatari: true,
    direzione: true,
    letto: true,
    sezione: { select: { nome: true, colore: true } },
  } as const

  const condizioniTesto = [
    { oggetto: { contains: q, mode: 'insensitive' as const } },
    { mittente: { contains: q, mode: 'insensitive' as const } },
    { mittenteNome: { contains: q, mode: 'insensitive' as const } },
    { destinatari: { contains: q, mode: 'insensitive' as const } },
  ]

  // ⚠️ In ricerca NON si filtra solo in SQL: un thread va mostrato INTERO (con
  // il conteggio giusto) anche se a combaciare è una sola delle sue mail — e un
  // thread trovato per NOME non ha nessuna mail che contiene la parola. Quindi:
  // si carica la finestra recente, si raggruppa, e si filtrano i GRUPPI.
  // Le mail che combaciano ma sono più vecchie della finestra si aggiungono a
  // parte, così una ricerca vecchia continua a trovarle.
  // Le conversazioni il cui NOME combacia: la chiave salvata è l'id di una loro
  // mail. Si risolve PRIMA, perché quelle mail vanno caricate comunque (anche
  // se vecchie), altrimenti una conversazione battezzata e poi non più toccata
  // non uscirebbe cercandone il nome.
  const chiaviNome = ricerca ? await chiaviPerNome(u.id, q) : []

  const [finestra, fuoriFinestra] = await Promise.all([
    db.messaggio.findMany({ where: base, orderBy: { data: 'desc' }, take: 2000, select: campi }),
    ricerca
      ? db.messaggio.findMany({
          where: {
            ...base,
            OR: [...condizioniTesto, ...(chiaviNome.length ? [{ id: { in: chiaviNome } }] : [])],
          },
          orderBy: { data: 'desc' },
          take: 300,
          select: campi,
        })
      : Promise.resolve([]),
  ])

  // Di una conversazione trovata per nome servono TUTTE le mail, non solo
  // quella che porta il nome: si recuperano le compagne agganciate a mano.
  const manuali = [
    ...new Set(
      fuoriFinestra
        .filter((m) => chiaviNome.includes(m.id) && m.threadManuale)
        .map((m) => m.threadManuale as string)
    ),
  ]
  const compagne = manuali.length
    ? await db.messaggio.findMany({
        where: { ...base, threadManuale: { in: manuali } },
        select: campi,
        take: 300,
      })
    : []

  const perId = new Map([...finestra, ...fuoriFinestra, ...compagne].map((m) => [m.id, m]))
  const tutti = [...perId.values()]

  // Un THREAD è una conversazione VERA: più di un messaggio. Le mail singole
  // (1 messaggio) non sono thread e restano fuori da questa vista.
  const gruppiTutti = raggruppa(tutti).filter((g) => g.length > 1)

  // Il nome dato a mano a ogni conversazione (una sola query per tutta la
  // pagina). Si cerca su TUTTI i messaggi del gruppo: vedi nomiPerGruppi.
  // Insieme, le conversazioni col PLUS AI (anche lì il segno sta su ogni mail).
  const [nomi, idsAI] = await Promise.all([nomiPerGruppi(u.id, gruppiTutti), idsThreadAI(u.id)])
  const setAI = new Set(idsAI)
  const gruppoHaAI = (g: { id: string }[]) => g.some((m) => setAI.has(m.id))

  // Le conversazioni trovate per NOME: la chiave salvata è l'id di una loro
  // mail, quindi basta che il gruppo la contenga.
  const setNome = new Set(chiaviNome)
  const gruppoHaChiaveNome = (g: { id: string }[]) => g.some((m) => setNome.has(m.id))
  const combacia = (testo: string | null | undefined) =>
    Boolean(testo && testo.toLowerCase().includes(q.toLowerCase()))

  // Gruppo e suo nome viaggiano insieme: filtrando, gli indici non si perdono.
  const conNome = gruppiTutti.map((g, i) => ({ g, nome: nomi[i] }))

  const scelti = (
    ricerca
      ? conNome.filter(({ g, nome }) => {
          // Per NOME della conversazione…
          if (gruppoHaChiaveNome(g) || combacia(nome)) return true
          // …oppure per il contenuto di una qualsiasi mail del thread.
          return g.some(
            (m) =>
              combacia(m.oggetto) ||
              combacia(m.mittente) ||
              combacia(m.mittenteNome) ||
              combacia(m.destinatari)
          )
        })
      : conNome
  ).slice(0, 800)

  const righe = scelti.map(({ g, nome }) => {
    const volto = g[g.length - 1] // il più recente
    const parti = new Set(g.map((x) => (x.direzione === 'uscita' ? 'me' : x.mittente.toLowerCase()))).size
    const nonLetti = g.some((x) => x.direzione === 'entrata' && !x.letto)
    return { volto, count: g.length, parti, nonLetti, nome: nome ?? null, ai: gruppoHaAI(g) }
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Thread</h1>
          <p className="page-caption">
            Solo le conversazioni VERE (più di un messaggio): una riga per thread. Aprila per
            vedere tutti i messaggi e per <strong>darle un nome</strong> (poi la ritrovi cercando
            quel nome qui). Le mail singole restano fuori (SPAM e Cestino esclusi).
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RicercaMail
          iniziale={ricerca ? q : ''}
          base="/thread"
          placeholder="Cerca fra i thread (nome dato da te, oggetto, persona)…"
        />
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
            {righe.map(({ volto, count, parti, nonLetti, nome, ai }) => (
              <div key={volto.id} className={`mail-row ${nonLetti ? 'non-letto' : ''}`}>
                <div className="mail-row-head">
                  <Link href={`/messaggio/${volto.id}`} className="mail-row-link">
                    <div className="mail-top">
                      <span className={nonLetti ? 'dot-unread' : 'dot-spacer'} />
                      <span className="mail-mittente">
                        {volto.direzione === 'uscita' ? 'Tu' : volto.mittenteNome || volto.mittente}
                      </span>
                      {/* Conversazione col PLUS AI: l'AI la legge sempre. */}
                      {ai && (
                        <span className="ai-toggle-mark" title="PLUS AI attivo su questa conversazione">
                          AI
                        </span>
                      )}
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
                    {/* Il nome dato a mano: è quello che si riconosce a colpo
                        d'occhio, quindi va sopra l'oggetto. */}
                    {nome && (
                      <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
                        <span className="badge gold">
                          <span className="dot" />
                          {nome}
                        </span>
                      </div>
                    )}
                    <div className="mail-oggetto" style={{ paddingLeft: 17, fontWeight: nome ? 400 : undefined }}>
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
                <AzioniThread messaggioId={volto.id} nome={nome} aiAttivo={ai} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Il dialogo di aggancio, montato una volta per la pagina. */}
      <AgganciaDialog />
      <NomeThreadDialog />
    </>
  )
}
