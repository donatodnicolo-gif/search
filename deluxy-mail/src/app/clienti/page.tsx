import Link from 'next/link'
import { db } from '@/lib/db'
import { richiediUtente } from '@/lib/sessione'
import { raggruppa } from '@/lib/thread'
import { indiceClienti, linkPartner } from '@/lib/anagrafiche'
import { emailContattiAI } from '@/lib/contattiAI'
import { RicercaMail } from '@/components/RicercaMail'
import { ListaMail } from '@/components/ListaMail'
import type { RigaData } from '@/components/RigaMail'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Props = { searchParams: Promise<{ q?: string }> }

/**
 * "Clienti": la posta dei CLIENTI di Anagrafiche (partner con stato attivo),
 * riconciliata per EMAIL esatta o per DOMINIO. Vista dinamica: non sposta la
 * posta, la mostra qui con le stesse azioni della posta in arrivo.
 */
export default async function Clienti({ searchParams }: Props) {
  const { q: qGrezzo } = await searchParams
  const q = (qGrezzo ?? '').trim()
  const ricerca = q.length >= 2
  const u = await richiediUtente()

  const idx = await indiceClienti().catch(() => null)
  const nessunCliente = !idx || (idx.perEmail.size === 0 && idx.perDominio.size === 0)

  // Le sezioni per lo "Sposta in…" delle azioni di riga (SPAM esclusa).
  const sezioniPerSposta = nessunCliente
    ? []
    : (
        await db.sezione.findMany({ where: { utenteId: u.id }, orderBy: { ordine: 'asc' }, select: { id: true, nome: true } })
      ).filter((s) => s.nome !== 'SPAM')

  const messaggi = nessunCliente
    ? []
    : await db.messaggio.findMany({
        where: {
          utenteId: u.id,
          direzione: 'entrata',
          cestinato: false,
          archiviato: false,
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
        omit: { corpoTesto: true, corpoHtml: true },
        include: {
          sezione: true,
          bozze: { where: { inviata: false }, select: { id: true } },
          _count: { select: { attivita: true, inviiApp: true } },
        },
      })

  // Riconciliazione locale: quali mail sono di un cliente (per email o dominio).
  const clienteDi = (mittente: string): { id: string; nome: string } | null => {
    if (!idx) return null
    const e = mittente.toLowerCase()
    return idx.perEmail.get(e) || idx.perDominio.get(e.split('@')[1] || '') || null
  }
  const messaggiClienti = messaggi.filter((m) => clienteDi(m.mittente) !== null)

  const setAI = new Set(nessunCliente ? [] : await emailContattiAI(u.id))
  const gruppi = raggruppa(messaggiClienti).slice(0, 1200)

  // Iconcina "risposto": una nostra risposta esiste se nel thread c'è un'uscita.
  const roots = messaggiClienti.map((m) => m.thread || m.messageId).filter((x): x is string => Boolean(x))
  const threadRisposti = new Set<string>()
  if (roots.length) {
    const uscite = await db.messaggio.findMany({
      where: { utenteId: u.id, direzione: 'uscita', thread: { in: roots } },
      select: { thread: true },
    })
    for (const o of uscite) if (o.thread) threadRisposti.add(o.thread)
  }

  const costruisciRiga = (g: (typeof gruppi)[number], nomeCliente: string): RigaData => {
    const m = g[g.length - 1]
    return {
      id: m.id,
      mittente: m.mittente,
      mittenteNome: m.mittenteNome,
      oggetto: m.oggetto,
      data: m.data,
      riassunto: m.riassunto,
      anteprima: m.anteprima,
      corpoTradotto: m.corpoTradotto,
      lingua: m.lingua,
      sezione: m.sezione ? { nome: m.sezione.nome, colore: m.sezione.colore } : null,
      sezioneId: m.sezioneId,
      bozze: m.bozze.length,
      attivita: m._count.attivita,
      inviiApp: m._count.inviiApp,
      eventoProposto: Boolean(m.eventoProposto),
      archiviato: m.archiviato,
      cestinato: m.cestinato,
      priorita: m.priorita,
      prioritaDa: m.prioritaDa,
      analizzato: m.analizzatoIl !== null,
      nel: g.length,
      parti: new Set(g.map((x) => (x.direzione === 'uscita' ? 'me' : x.mittente.toLowerCase()))).size,
      nonLetti: g.some((x) => !x.letto),
      contattoAI: setAI.has(m.mittente.toLowerCase()),
      risposto: threadRisposti.has(m.thread || m.messageId || ''),
      inviata: false,
      destinatari: m.destinatari,
      clienteNome: nomeCliente,
    }
  }

  // Raggruppa i thread PER CLIENTE: ogni azienda con le sue conversazioni.
  const perCliente = new Map<string, { nome: string; link: string; righe: RigaData[]; ultima: number; nonLetti: number }>()
  for (const g of gruppi) {
    const volto = g[g.length - 1]
    const cli = clienteDi(volto.mittente)
    if (!cli) continue
    const b = perCliente.get(cli.id) ?? { nome: cli.nome, link: linkPartner(cli.id), righe: [], ultima: 0, nonLetti: 0 }
    b.righe.push(costruisciRiga(g, cli.nome))
    b.ultima = Math.max(b.ultima, volto.data.getTime())
    if (g.some((x) => !x.letto)) b.nonLetti++
    perCliente.set(cli.id, b)
  }
  // Clienti con posta più recente in cima.
  const clienti = [...perCliente.values()].sort((a, b) => b.ultima - a.ultima)
  const totaleRighe = clienti.reduce((n, c) => n + c.righe.length, 0)

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
              Collega Anagrafiche in{' '}
              <Link href="/impostazioni-app" style={{ textDecoration: 'underline' }}>Impostazioni App</Link>{' '}
              (basta la chiave di sola lettura). Poi qui compare la posta delle aziende con stato
              “attivo” nel registro.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <RicercaMail iniziale={ricerca ? q : ''} base="/clienti" placeholder="Cerca nella posta dei clienti…" />
          </div>

          {totaleRighe === 0 ? (
            <div className="card">
              <div className="empty">
                <div className="empty-icon">✓</div>
                <div className="empty-title">Nessuna mail dai clienti</div>
                <p className="empty-text">Quando un cliente del registro ti scrive, la mail compare qui.</p>
              </div>
            </div>
          ) : (
            clienti.map((c) => (
              <div key={c.nome} style={{ marginBottom: 22 }}>
                <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span>{c.nome}</span>
                  <span className="badge neutral">{c.righe.length} {c.righe.length === 1 ? 'conversazione' : 'conversazioni'}</span>
                  {c.nonLetti > 0 && <span className="badge green"><span className="dot" />{c.nonLetti} non lette</span>}
                  <a href={c.link} target="_blank" rel="noreferrer" className="azione-riga" style={{ marginLeft: 'auto', fontSize: 13 }}>
                    Apri nel registro →
                  </a>
                </h2>
                <div className="card tight">
                  <ListaMail righe={c.righe} sezioni={sezioniPerSposta} />
                </div>
              </div>
            ))
          )}
        </>
      )}
    </>
  )
}
