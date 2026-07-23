import Link from 'next/link'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { dataBreve } from '@/lib/format'
import { raggruppa, chiaveThread } from '@/lib/thread'
import { nomiPerChiavi, chiaviPerNome } from '@/lib/nomiThread'
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
  const [finestra, fuoriFinestra, chiaviNome] = await Promise.all([
    db.messaggio.findMany({ where: base, orderBy: { data: 'desc' }, take: 2000, select: campi }),
    ricerca
      ? db.messaggio.findMany({
          where: { ...base, OR: condizioniTesto },
          orderBy: { data: 'desc' },
          take: 300,
          select: campi,
        })
      : Promise.resolve([]),
    ricerca ? chiaviPerNome(u.id, q) : Promise.resolve([]),
  ])

  const perId = new Map([...finestra, ...fuoriFinestra].map((m) => [m.id, m]))
  const tutti = [...perId.values()]

  // Un THREAD è una conversazione VERA: più di un messaggio. Le mail singole
  // (1 messaggio) non sono thread e restano fuori da questa vista.
  const gruppiTutti = raggruppa(tutti).filter((g) => g.length > 1)

  // Il nome dato a mano a ogni conversazione (una sola query per tutta la pagina).
  const chiavi = gruppiTutti.map((g) => chiaveThread(g))
  const nomi = await nomiPerChiavi(u.id, chiavi)

  const setNome = new Set(chiaviNome)
  const combacia = (testo: string | null | undefined) =>
    Boolean(testo && testo.toLowerCase().includes(q.toLowerCase()))

  const gruppi = (
    ricerca
      ? gruppiTutti.filter((g, i) => {
          // Per NOME della conversazione…
          if (setNome.has(chiavi[i]) || combacia(nomi.get(chiavi[i]))) return true
          // …oppure per il contenuto di una qualsiasi mail del thread.
          return g.some(
            (m) =>
              combacia(m.oggetto) ||
              combacia(m.mittente) ||
              combacia(m.mittenteNome) ||
              combacia(m.destinatari)
          )
        })
      : gruppiTutti
  ).slice(0, 800)

  const righe = gruppi.map((g) => {
    const volto = g[g.length - 1] // il più recente
    const parti = new Set(g.map((x) => (x.direzione === 'uscita' ? 'me' : x.mittente.toLowerCase()))).size
    const nonLetti = g.some((x) => x.direzione === 'entrata' && !x.letto)
    return { volto, count: g.length, parti, nonLetti, nome: nomi.get(chiaveThread(g)) ?? null }
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
            {righe.map(({ volto, count, parti, nonLetti, nome }) => (
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
