import Link from 'next/link'
import { db } from '@/lib/db'
import { dataBreve } from '@/lib/format'
import { raggruppa } from '@/lib/thread'
import { nomiPerGruppi } from '@/lib/nomiThread'

/**
 * TOP THREAD: le conversazioni più corpose degli ultimi 30 giorni — quelle in
 * cui si è scambiato più traffico, che sono anche quelle che di solito stanno
 * decidendo qualcosa. In cima alla colonna destra della posta in arrivo.
 *
 * Solo desktop (come il resto della colonna): sotto i 1100px sparisce.
 */
export async function ColonnaTopThread({ utenteId }: { utenteId: string }) {
  const daQuando = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  let messaggi: {
    id: string
    thread: string | null
    threadManuale: string | null
    scollegato: boolean | null
    oggetto: string
    data: Date
    mittente: string
    mittenteNome: string | null
    direzione: string
    letto: boolean
  }[] = []
  try {
    messaggi = await db.messaggio.findMany({
      where: {
        utenteId,
        cestinato: false,
        data: { gte: daQuando },
        // Lo SPAM non fa "traffico": resta fuori.
        NOT: { sezione: { nome: 'SPAM' } },
      },
      orderBy: { data: 'desc' },
      // Finestra ampia ma con pochi campi: serve solo a raggruppare e contare.
      take: 1500,
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
      },
    })
  } catch {
    return null // niente da mostrare: la posta resta quella che conta
  }

  // Conversazioni vere (più di un messaggio), le più corpose in cima; a parità
  // di messaggi vince quella con l'ultimo scambio più recente.
  const gruppi = raggruppa(messaggi)
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length || b[b.length - 1].data.getTime() - a[a.length - 1].data.getTime())
    .slice(0, 5)

  if (gruppi.length === 0) return null

  // I nomi dati a mano alle conversazioni: se c'è, si mostra quello.
  const nomi = await nomiPerGruppi(utenteId, gruppi)

  return (
    <aside className="col-attivita" style={{ marginBottom: 22 }}>
      <div className="col-attivita-head">
        <span className="nav-label" style={{ padding: 0 }}>
          Top thread · 30 giorni
        </span>
        <Link href="/thread" className="azione-riga" style={{ fontSize: 12 }}>
          Tutti →
        </Link>
      </div>

      <div className="card tight">
        {gruppi.map((g, i) => {
          const volto = g[g.length - 1] // il messaggio più recente
          const parti = new Set(
            g.map((x) => (x.direzione === 'uscita' ? 'me' : x.mittente.toLowerCase()))
          ).size
          const nonLetti = g.some((x) => x.direzione === 'entrata' && !x.letto)
          const nome = nomi[i]
          return (
            <div key={volto.id} className="col-task">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="col-task-titolo">
                  <Link href={`/messaggio/${volto.id}`}>
                    {nome || volto.oggetto || '(senza oggetto)'}
                  </Link>
                </div>
                <div className="col-task-meta">
                  <span className="badge neutral">{g.length} messaggi</span>
                  <span className="muted">
                    {parti} {parti === 1 ? 'parte' : 'parti'}
                  </span>
                  <span className="muted">{dataBreve(volto.data)}</span>
                  {nonLetti && <span className="dot-unread" title="Ci sono mail non lette" />}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
