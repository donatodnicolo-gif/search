import Link from 'next/link'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { dataBreve } from '@/lib/format'
import { raggruppa } from '@/lib/thread'
import { indiceClienti } from '@/lib/anagrafiche'
import { RicercaMail } from '@/components/RicercaMail'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Props = { searchParams: Promise<{ q?: string }> }

/**
 * "Clienti": la posta dei CLIENTI di Anagrafiche (partner con stato attivo),
 * riconciliata per EMAIL esatta o per DOMINIO. Vista dinamica: non sposta la
 * posta, la mostra qui — così si aggiorna da sola quando cambiano i clienti.
 */
export default async function Clienti({ searchParams }: Props) {
  const { q: qGrezzo } = await searchParams
  const q = (qGrezzo ?? '').trim()
  const ricerca = q.length >= 2
  const u = await richiediUtente()

  const idx = await indiceClienti().catch(() => null)
  const nessunCliente = !idx || (idx.perEmail.size === 0 && idx.perDominio.size === 0)

  const messaggi = nessunCliente
    ? []
    : await db.messaggio.findMany({
        where: {
          utenteId: u.id,
          direzione: 'entrata',
          cestinato: false,
          NOT: { sezione: { nome: 'SPAM' } },
          ...(ricerca
            ? {
                OR: [
                  { oggetto: { contains: q, mode: 'insensitive' as const } },
                  { mittente: { contains: q, mode: 'insensitive' as const } },
                  { mittenteNome: { contains: q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        orderBy: { data: 'desc' },
        take: 2000,
        select: {
          id: true, thread: true, threadManuale: true, scollegato: true, oggetto: true, data: true,
          mittente: true, mittenteNome: true, letto: true,
        },
      })

  // Riconciliazione locale: quali mail sono di un cliente (per email o dominio).
  const clienteDi = (mittente: string): { id: string; nome: string } | null => {
    if (!idx) return null
    const e = mittente.toLowerCase()
    return idx.perEmail.get(e) || idx.perDominio.get(e.split('@')[1] || '') || null
  }
  const diClienti = messaggi
    .map((m) => ({ m, cliente: clienteDi(m.mittente) }))
    .filter((x): x is { m: (typeof messaggi)[number]; cliente: { id: string; nome: string } } => x.cliente !== null)

  const gruppi = raggruppa(diClienti.map((x) => x.m))
  const clientePerId = new Map(diClienti.map((x) => [x.m.id, x.cliente]))

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Clienti</h1>
          <p className="page-caption">
            La posta dei <strong>clienti</strong> del registro Anagrafiche (stato attivo),
            riconciliata per email o per dominio. È una vista: la posta resta anche in arrivo.
          </p>
        </div>
      </div>

      {nessunCliente ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">🏢</div>
            <div className="empty-title">Nessun cliente da Anagrafiche</div>
            <p className="empty-text">
              Collega Anagrafiche in <Link href="/impostazioni-app" style={{ textDecoration: 'underline' }}>Impostazioni App</Link>{' '}
              (chiave di sola lettura basta). Poi qui compare la posta delle aziende con stato
              “attivo” nel registro.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <RicercaMail iniziale={ricerca ? q : ''} base="/clienti" placeholder="Cerca nella posta dei clienti…" />
          </div>
          <div className="card tight">
            {gruppi.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">✓</div>
                <div className="empty-title">Nessuna mail dai clienti</div>
                <p className="empty-text">Quando un cliente del registro ti scrive, la mail compare qui.</p>
              </div>
            ) : (
              <div className="mail-list">
                {gruppi.map((g) => {
                  const volto = g[g.length - 1]
                  const count = g.length
                  const nonLetti = g.some((x) => !x.letto)
                  const cliente = clientePerId.get(volto.id)
                  return (
                    <div key={volto.id} className={`mail-row ${nonLetti ? 'non-letto' : ''}`}>
                      <div className="mail-row-head">
                        <Link href={`/messaggio/${volto.id}`} className="mail-row-link">
                          <div className="mail-top">
                            <span className={nonLetti ? 'dot-unread' : 'dot-spacer'} />
                            <span className="mail-mittente">{volto.mittenteNome || volto.mittente}</span>
                            {cliente && <span className="badge green"><span className="dot" />{cliente.nome}</span>}
                            {count > 1 && <span className="thread-count">{count}</span>}
                          </div>
                          <div className="mail-oggetto" style={{ paddingLeft: 17 }}>{volto.oggetto}</div>
                        </Link>
                        <div className="mail-row-side">
                          <span className="mail-data">{dataBreve(volto.data)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
