import Link from 'next/link'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { dataBreve } from '@/lib/format'
import { RicercaMail } from '@/components/RicercaMail'
import { chiaviPerNome } from '@/lib/nomiThread'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string }> }

// La forma salvata del riassunto (compatibile coi vecchi: inSospeso può essere
// una semplice stringa invece di un oggetto).
type Vista = {
  sintesi: string
  parti: { chi: string; punto: string; msgId?: string | null }[]
  inSospeso: (string | { cosa: string; chi?: string; msgId?: string | null })[]
}

/**
 * "Riassunti": la casella dei quadri "per punti di vista" che l'AI ha fatto
 * delle conversazioni. Ogni voce linka il thread correlato (il capostipite,
 * la cui pagina mostra tutti i messaggi e il riassunto per esteso).
 */
export default async function Riassunti({ searchParams }: Props) {
  const u = await richiediUtente()
  const { q: qGrezzo } = await searchParams
  const q = (qGrezzo ?? '').trim()
  const ricerca = q.length >= 2

  let riassunti: {
    id: string
    chiave: string
    riassunto: string
    partecipanti: number
    messaggiVisti: number
    generatoIl: Date
  }[] = []
  try {
    // In ricerca si guarda: il CONTENUTO del riassunto (il JSON salvato contiene
    // sintesi/punti/sospesi), il NOME dato al thread e l'oggetto del capostipite.
    let chiaviTitolo: string[] = []
    let chiaviNome: string[] = []
    if (ricerca) {
      const [teste, nomi] = await Promise.all([
        db.messaggio.findMany({
          where: { utenteId: u.id, oggetto: { contains: q, mode: 'insensitive' } },
          select: { id: true },
          take: 500,
        }),
        chiaviPerNome(u.id, q),
      ])
      chiaviTitolo = teste.map((t) => t.id)
      chiaviNome = nomi
    }
    riassunti = await db.riassuntoThread.findMany({
      where: {
        utenteId: u.id,
        ...(ricerca
          ? {
              OR: [
                { riassunto: { contains: q, mode: 'insensitive' as const } },
                ...(chiaviTitolo.length ? [{ chiave: { in: chiaviTitolo } }] : []),
                ...(chiaviNome.length ? [{ chiave: { in: chiaviNome } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { generatoIl: 'desc' },
      take: 300,
    })
  } catch {
    // Tabella non ancora migrata: la pagina si apre lo stesso, vuota.
    riassunti = []
  }

  // Oggetto/mittente del capostipite di ogni thread (chiave = id del più vecchio),
  // così ogni riga ha un titolo leggibile.
  const chiavi = riassunti.map((r) => r.chiave)
  const teste = chiavi.length
    ? await db.messaggio.findMany({
        where: { id: { in: chiavi }, utenteId: u.id },
        select: { id: true, oggetto: true, mittente: true, mittenteNome: true },
      })
    : []
  const perId = new Map(teste.map((m) => [m.id, m]))

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Riassunti</h1>
          <p className="page-caption">
            I quadri “per punti di vista” che l’AI ha fatto delle conversazioni. Apri il thread
            correlato per rivedere tutti i messaggi e il riassunto per esteso.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RicercaMail
          iniziale={ricerca ? q : ''}
          base="/riassunti"
          placeholder="Cerca fra i riassunti (contenuto, nome del thread, oggetto)…"
        />
      </div>

      <div className="card tight">
        {riassunti.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{ricerca ? '⌕' : '✦'}</div>
            <div className="empty-title">{ricerca ? 'Nessun riassunto trovato' : 'Ancora nessun riassunto'}</div>
            <p className="empty-text">
              {ricerca
                ? `Nessun riassunto corrisponde a «${q}».`
                : 'Apri una conversazione con più messaggi e premi “Riassumi la conversazione”: il quadro dell’AI verrà salvato qui, con il link al thread.'}
            </p>
          </div>
        ) : (
          <div className="mail-list">
            {riassunti.map((r) => {
              const testa = perId.get(r.chiave)
              let vista: Vista | null = null
              try {
                vista = JSON.parse(r.riassunto) as Vista
              } catch {
                vista = null
              }
              const sospesi = vista?.inSospeso?.length ?? 0
              return (
                <div key={r.id} className="mail-row">
                  <div className="mail-row-head">
                    <Link href={`/messaggio/${r.chiave}`} className="mail-row-link">
                      <div className="mail-top">
                        <span className="dot-spacer" />
                        <span className="mail-mittente">
                          {testa?.oggetto || '(conversazione)'}
                        </span>
                        <span className="badge neutral">
                          {r.partecipanti} {r.partecipanti === 1 ? 'parte' : 'parti'}
                        </span>
                        {sospesi > 0 && (
                          <span className="badge gold">
                            <span className="dot" />
                            {sospesi} in sospeso
                          </span>
                        )}
                      </div>
                      <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                        <span className="ai-mark">AI</span>
                        <span>{vista?.sintesi || '—'}</span>
                      </div>
                      <div className="mail-tags" style={{ paddingLeft: 17 }}>
                        <span className="muted" style={{ fontSize: 12 }}>
                          Su {r.messaggiVisti} messaggi · apri il thread correlato →
                        </span>
                      </div>
                    </Link>
                    <div className="mail-row-side">
                      <span className="mail-data">{dataBreve(r.generatoIl)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
