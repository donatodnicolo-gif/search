import Link from 'next/link'
import { db } from '@/lib/db'
import { dataBreve, coloreDiPriorita } from '@/lib/format'

/**
 * Storico di come sono state gestite le mail a cui hai dato una priorità:
 * l'esito è DEDOTTO dallo stato attuale (risposto / attività / archiviata /
 * cestinata / in sospeso), senza bisogno di un registro a parte.
 */
export async function StoricoPriorita({ utenteId }: { utenteId: string }) {
  const msgs = await db.messaggio.findMany({
    where: { utenteId, prioritaDa: { not: null }, direzione: 'entrata' },
    orderBy: { data: 'desc' },
    take: 40,
    include: { attivita: { select: { fatta: true } }, bozze: { select: { inviata: true } } },
  })

  // Risposto? = c'è una nostra mail in uscita nello stesso thread.
  const roots = msgs.map((m) => m.thread || m.messageId).filter((x): x is string => Boolean(x))
  const risposti = new Set<string>()
  if (roots.length) {
    const uscite = await db.messaggio.findMany({
      where: { utenteId, direzione: 'uscita', thread: { in: roots } },
      select: { thread: true },
    })
    for (const u of uscite) if (u.thread) risposti.add(u.thread)
  }

  function esito(m: (typeof msgs)[number]): { testo: string; classe: string } {
    if (m.cestinato) return { testo: 'Cestinata', classe: 'neutral' }
    if (m.archiviato) return { testo: 'Archiviata', classe: 'neutral' }
    if (risposti.has(m.thread || m.messageId || '')) return { testo: 'Risposto', classe: 'green' }
    if (m.attivita.some((a) => a.fatta)) return { testo: 'Attività completata', classe: 'green' }
    if (m.attivita.length > 0) return { testo: 'Attività da fare', classe: 'orange' }
    if (m.bozze.some((b) => !b.inviata)) return { testo: 'Bozza pronta', classe: 'gold' }
    return { testo: 'In sospeso', classe: 'neutral' }
  }

  if (msgs.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Qui comparirà lo storico man mano che dai una priorità alle mail.
      </p>
    )
  }

  return (
    <div className="storico-prio">
      {msgs.map((m) => {
        const e = esito(m)
        return (
          <Link key={m.id} href={`/messaggio/${m.id}`} className="storico-riga">
            <span className={`badge ${coloreDiPriorita(m.priorita)}`}>{m.priorita}</span>
            <span className="storico-testo">
              <span className="storico-ogg">{m.oggetto || '(senza oggetto)'}</span>
              <span className="storico-da">{m.mittenteNome || m.mittente}</span>
            </span>
            <span className={`badge ${e.classe}`}>{e.testo}</span>
            <span className="muted storico-data">{dataBreve(m.data)}</span>
          </Link>
        )
      })}
    </div>
  )
}
