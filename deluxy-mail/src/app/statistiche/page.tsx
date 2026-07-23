import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { PRIORITA, coloreDiPriorita } from '@/lib/format'

export const dynamic = 'force-dynamic'

/** Statistiche di gestione: quante priorità date e come sono finite. */
export default async function Statistiche() {
  const u = await richiediUtente()

  const msgs = await db.messaggio.findMany({
    where: { utenteId: u.id, prioritaDa: { not: null }, direzione: 'entrata' },
    orderBy: { data: 'desc' },
    take: 2000,
    // Qui si contano solo gli esiti: i corpi (2000 mail!) non servono.
    omit: { corpoTesto: true, corpoHtml: true },
    include: { attivita: { select: { fatta: true } }, bozze: { select: { inviata: true } } },
  })

  // Risposto? = c'è una nostra mail in uscita nel thread.
  const roots = msgs.map((m) => m.thread || m.messageId).filter((x): x is string => Boolean(x))
  const risposti = new Set<string>()
  if (roots.length) {
    const uscite = await db.messaggio.findMany({
      where: { utenteId: u.id, direzione: 'uscita', thread: { in: roots } },
      select: { thread: true },
    })
    for (const uu of uscite) if (uu.thread) risposti.add(uu.thread)
  }

  const perPriorita: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 }
  const perEsito: Record<string, number> = {
    Risposto: 0,
    'Attività completata': 0,
    'Attività da fare': 0,
    'Bozza pronta': 0,
    Archiviata: 0,
    Cestinata: 0,
    'In sospeso': 0,
  }

  for (const m of msgs) {
    if (m.priorita && perPriorita[m.priorita] !== undefined) perPriorita[m.priorita]++
    let esito: string
    if (m.cestinato) esito = 'Cestinata'
    else if (m.archiviato) esito = 'Archiviata'
    else if (risposti.has(m.thread || m.messageId || '')) esito = 'Risposto'
    else if (m.attivita.some((a) => a.fatta)) esito = 'Attività completata'
    else if (m.attivita.length > 0) esito = 'Attività da fare'
    else if (m.bozze.some((b) => !b.inviata)) esito = 'Bozza pronta'
    else esito = 'In sospeso'
    perEsito[esito]++
  }

  const totale = msgs.length
  const gestite = totale - perEsito['In sospeso']
  const pct = (n: number) => (totale ? Math.round((n / totale) * 100) : 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Statistiche</h1>
          <p className="page-caption">
            Come sono state gestite le mail a cui hai dato una priorità. Su {totale} mail
            prioritizzate, {gestite} portate a termine ({pct(gestite)}%).
          </p>
        </div>
      </div>

      <h2 className="section-title" style={{ marginTop: 0 }}>Per priorità</h2>
      <div className="card">
        <div className="stat-griglia">
          {PRIORITA.map((liv) => (
            <div key={liv.codice} className="stat-cella">
              <span className={`badge ${coloreDiPriorita(liv.codice)}`}>{liv.codice}</span>
              <span className="stat-numero">{perPriorita[liv.codice] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="section-title">Per esito</h2>
      <div className="card">
        {Object.entries(perEsito).map(([nome, n]) => (
          <div key={nome} className="stat-barra-riga">
            <span className="stat-barra-nome">{nome}</span>
            <span className="stat-barra-out">
              <span className="stat-barra-in" style={{ width: `${pct(n)}%` }} />
            </span>
            <span className="stat-barra-val">
              {n} · {pct(n)}%
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
