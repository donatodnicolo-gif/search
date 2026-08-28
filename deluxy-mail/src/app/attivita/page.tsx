import Link from 'next/link'
import { db } from '@/lib/db'
import { CheckAttivita } from '@/components/CheckAttivita'
import { NotaAttivita } from '@/components/NotaAttivita'
import { RiapriAttivita } from '@/components/RiapriAttivita'
import { ChiudiTutteAttivita } from '@/components/ChiudiTutteAttivita'
import { DecidiSpamRiga } from '@/components/DecidiSpamRiga'
import { BottoneEsegui } from '@/components/BottoneEsegui'
import { NuovaAttivita } from '@/components/NuovaAttivita'
import { RicercaMail } from '@/components/RicercaMail'
import { ChipsPeriodo } from '@/components/ChipsPeriodo'
import { intervalloPeriodo } from '@/lib/periodo'
import { coloreDiPriorita, priorita as livello, FUSO } from '@/lib/format'
import { richiediUtente } from '@/lib/sessione'
import { raggruppa } from '@/lib/thread'
import { nomiPerGruppi } from '@/lib/nomiThread'

export const dynamic = 'force-dynamic'

/**
 * Le attività, raggruppate per PROVENIENZA.
 *
 * Un elenco piatto di cose da fare nasconde la cosa più utile che si sappia su
 * di loro: quali riguardano la stessa pratica. Cinque righe sparse fra decine
 * sono cinque compiti; le stesse cinque sotto «Preparazione Meeting Malavenda»
 * sono una cosa sola, e si sbrigano in un colpo.
 *
 * ⚠️ Il raggruppamento è per CONVERSAZIONE, non per singola mail: due attività
 * nate da due messaggi dello stesso scambio appartengono alla stessa pratica, e
 * separarle sarebbe esattamente l'errore da evitare. Si usa lo stesso
 * `raggruppa()` del resto dell'app — così un thread a cui hai dato un nome si
 * chiama qui come si chiama là — applicato alle sole mail citate dalle attività
 * aperte: sono poche, quindi non costa niente.
 */
export default async function Attivita({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; periodo?: string }>
}) {
  const { q: qGrezzo, periodo } = await searchParams
  const q = (qGrezzo ?? '').trim()
  const ricerca = q.length >= 2
  // Le scorciatoie di periodo (Libro v1.9 §8-bis) sulla DATA DI CREAZIONE
  // (`creataIl`): è la data che la riga mostra («creata il …»). Valgono per
  // le attività APERTE; le «fatte di recente» restano le ultime 20 comunque.
  const intervallo = intervalloPeriodo(periodo)
  const u = await richiediUtente()
  const campiMessaggio = {
    id: true,
    oggetto: true,
    mittente: true,
    mittenteNome: true,
    data: true,
    thread: true,
    threadManuale: true,
    scollegato: true,
    // In attesa di decisione «è spam?»: quelle attività non si «eseguono»,
    // si decidono (vedi DecidiSpamRiga).
    spamCaso: true,
  } as const

  const [daFare, fatte] = await Promise.all([
    db.attivita.findMany({
      where: {
        utenteId: u.id,
        fatta: false,
        ...(intervallo ? { creataIl: { gte: intervallo.gte, lt: intervallo.lt } } : {}),
        // La ricerca (Libro v1.9 §8-bis): come si riconosce una cosa da fare —
        // cosa chiede (titolo/dettaglio) o chi l'ha fatta nascere.
        ...(ricerca
          ? {
              OR: [
                { titolo: { contains: q, mode: 'insensitive' as const } },
                { dettaglio: { contains: q, mode: 'insensitive' as const } },
                { messaggio: { oggetto: { contains: q, mode: 'insensitive' as const } } },
                { messaggio: { mittente: { contains: q, mode: 'insensitive' as const } } },
                { messaggio: { mittenteNome: { contains: q, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      // Le più recenti in cima: ordine per data di creazione, discendente.
      orderBy: { creataIl: 'desc' },
      include: { messaggio: { select: campiMessaggio } },
    }),
    db.attivita.findMany({
      where: { utenteId: u.id, fatta: true },
      orderBy: { fattaIl: 'desc' },
      take: 20,
      include: { messaggio: { select: { id: true, oggetto: true, mittente: true } } },
    }),
  ])

  const oggi = new Date()
  oggi.setHours(23, 59, 59, 999)

  type Riga = (typeof daFare)[number]

  // Le mail citate dalle attività aperte, senza doppioni: è su queste che si
  // ricostruiscono le conversazioni.
  const messaggi = [
    ...new Map(daFare.filter((a) => a.messaggio).map((a) => [a.messaggio!.id, a.messaggio!])).values(),
  ]
  const gruppiThread = raggruppa(messaggi)
  const nomiThread = await nomiPerGruppi(u.id, gruppiThread)

  // Da quale conversazione viene ogni mail (indice del gruppo).
  const gruppoDiMessaggio = new Map<string, number>()
  gruppiThread.forEach((g, i) => g.forEach((m) => gruppoDiMessaggio.set(m.id, i)))

  type Blocco = {
    chiave: string
    titolo: string
    /** Link al posto da cui l'attività nasce: la conversazione o la scheda. */
    href?: string
    sottotitolo?: string
    /** Etichetta della provenienza, per capire a colpo d'occhio da dove viene. */
    tipo: 'thread' | 'contatto' | 'mano'
    /** Quante mail ha la conversazione da cui nasce: lo dice il tasto «Apri». */
    messaggi?: number
    righe: Riga[]
  }

  const perChiave = new Map<string, Blocco>()
  for (const a of daFare) {
    let b: Blocco
    if (a.messaggio) {
      const i = gruppoDiMessaggio.get(a.messaggio.id) ?? -1
      const gruppo = i >= 0 ? gruppiThread[i] : [a.messaggio]
      const volto = gruppo[gruppo.length - 1]
      const nome = i >= 0 ? nomiThread[i] : null
      b = {
        chiave: `t:${i >= 0 ? i : a.messaggio.id}`,
        titolo: nome || volto.oggetto || '(senza oggetto)',
        href: `/messaggio/${volto.id}`,
        sottotitolo:
          gruppo.length > 1
            ? `${volto.mittenteNome || volto.mittente} · conversazione di ${gruppo.length} messaggi`
            : volto.mittenteNome || volto.mittente,
        tipo: 'thread',
        messaggi: gruppo.length,
        righe: [],
      }
    } else if (a.contattoEmail) {
      b = {
        chiave: `c:${a.contattoEmail}`,
        titolo: a.contattoEmail,
        href: `/rubrica/${encodeURIComponent(a.contattoEmail)}`,
        sottotitolo: 'dal punto della situazione col contatto',
        tipo: 'contatto',
        righe: [],
      }
    } else {
      b = { chiave: 'mano', titolo: 'Aggiunte a mano', tipo: 'mano', righe: [] }
    }
    const gia = perChiave.get(b.chiave)
    if (gia) gia.righe.push(a)
    else perChiave.set(b.chiave, { ...b, righe: [a] })
  }

  // Ordine dei blocchi: prima quello con l'attività più recente. Le «aggiunte a
  // mano» in fondo — non sono una pratica, sono un contenitore.
  const blocchi = [...perChiave.values()].sort((x, y) => {
    if (x.tipo === 'mano') return 1
    if (y.tipo === 'mano') return -1
    return y.righe[0].creataIl.getTime() - x.righe[0].creataIl.getTime()
  })

  const ETICHETTA = { thread: 'Conversazione', contatto: 'Contatto', mano: 'A mano' } as const

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Attività</h1>
          <p className="page-caption">
            Quello che le mail ti chiedono di fare, più le attività che aggiungi tu. Sono raggruppate
            per <strong>provenienza</strong>: le cose che nascono dallo stesso scambio stanno
            insieme, così si sbrigano insieme.
          </p>
        </div>
      </div>

      <NuovaAttivita />

      <div style={{ margin: '12px 0 16px' }}>
        {/* Chips fuori dal form: un nuovo submit della ricerca riparte senza
            `periodo` e lo azzera da solo (Libro v1.9 §8-bis). */}
        <ChipsPeriodo base="/attivita" periodo={periodo} altri={{ q: ricerca ? q : undefined }} />
        <RicercaMail
          iniziale={ricerca ? q : ''}
          base="/attivita"
          placeholder="Cerca fra le attività (cosa chiede, mittente, oggetto)…"
        />
      </div>

      {daFare.length === 0 ? (
        <div className="card tight">
          <div className="empty">
            {/* Filtrando, «Non hai attività aperte» sarebbe una bugia: le
                attività ci sono, non rispondono a QUESTA domanda. */}
            <div className="empty-icon">{ricerca || intervallo ? '⌕' : '✓'}</div>
            <div className="empty-title">
              {ricerca || intervallo ? 'Nessuna attività trovata' : 'Non hai attività aperte'}
            </div>
            <p className="empty-text">
              {ricerca
                ? `Nessuna attività aperta corrisponde a «${q}».`
                : intervallo
                  ? 'Nessuna attività aperta creata nel periodo scelto.'
                  : 'Quando una mail ti chiede qualcosa, l’attività compare qui da sola.'}
            </p>
          </div>
        </div>
      ) : (
        blocchi.map((b) => (
          <div key={b.chiave} style={{ marginBottom: 18 }}>
            <div
              className="col-attivita-head"
              style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}
            >
              <span className={`badge ${b.tipo === 'thread' ? 'gold' : b.tipo === 'contatto' ? 'neutral' : 'neutral'}`}>
                <span className="dot" />
                {ETICHETTA[b.tipo]}
              </span>
              <strong style={{ fontSize: 14.5, minWidth: 0 }}>
                {b.href ? (
                  <Link href={b.href} style={{ textDecoration: 'none' }}>
                    {b.titolo}
                  </Link>
                ) : (
                  b.titolo
                )}
              </strong>
              {b.sottotitolo && (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {b.sottotitolo}
                </span>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                {b.righe.length} {b.righe.length === 1 ? 'cosa da fare' : 'cose da fare'}
              </span>
              {/* ⚠️ Il titolo era già un link, ma senza sottolineatura né
                  freccia: da fuori è testo, e infatti «manca la possibilità di
                  riprendere la mail da cui parte l'attività». Il modo per
                  tornare alla mail va DETTO, non lasciato indovinare. */}
              {/* Chiudere in blocco: la stessa conversazione produce spesso
                  cinque volte la stessa cosa da fare, e spuntarle una per una
                  è lavoro inventato. */}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12, alignItems: 'center' }}>
                <ChiudiTutteAttivita ids={b.righe.map((a) => a.id)} />
                {b.href && (
                  <Link href={b.href} className="azione-riga">
                    {b.tipo === 'contatto'
                      ? 'Apri il contatto →'
                      : b.messaggi && b.messaggi > 1
                        ? `Apri la conversazione (${b.messaggi}) →`
                        : 'Apri la mail →'}
                  </Link>
                )}
              </span>
            </div>

            <div className="card tight">
              {b.righe.map((a) => {
                const scaduta = a.scadenza && a.scadenza < oggi
                return (
                  <div key={a.id} className="task-row">
                    <CheckAttivita id={a.id} fatta={a.fatta} />
                    <div style={{ minWidth: 0 }}>
                      <div className="task-titolo">{a.titolo}</div>
                      {/* La descrizione (spesso scritta dall AI) resta com e:
                          annotare non deve cancellarla. La nota sta sotto. */}
                      {a.dettaglio && <div className="task-sub">{a.dettaglio}</div>}
                      <NotaAttivita
                        id={a.id}
                        nota={a.note}
                        autore={a.noteAutore}
                        quando={a.noteIl ? a.noteIl.toISOString() : null}
                      />
                      {/* LA MAIL ESATTA da cui nasce QUESTA cosa da fare,
                          sempre: l'intestazione porta alla conversazione, ma
                          dentro una conversazione lunga «da quale mail viene»
                          è la domanda che ci si fa davvero. */}
                      {a.messaggio && (
                        <div className="task-sub">
                          da{' '}
                          <Link href={`/messaggio/${a.messaggio.id}`} style={{ textDecoration: 'underline' }}>
                            {a.messaggio.oggetto || '(senza oggetto)'}
                          </Link>
                        </div>
                      )}
                    </div>
                    <div className="task-side">
                      {a.scadenza && (
                        <span className={`badge ${scaduta ? 'red' : 'neutral'}`}>
                          {scaduta ? 'scaduta ' : 'entro '}
                          {a.scadenza.toLocaleDateString('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      <span
                        className={`badge ${coloreDiPriorita(a.priorita)}`}
                        title={livello(a.priorita)?.quando}
                      >
                        {a.priorita}
                      </span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        creata il{' '}
                        {a.creataIl.toLocaleDateString('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short' })}
                      </span>
                      {/* Esegui solo se c'è una mail a cui rispondere: un'attività
                          scritta a mano senza origine non ha nulla da eseguire. */}
                      {/* Un tasto per tornare alla mail, accanto a «Esegui»:
                          spesso prima di eseguire si vuole rileggere. */}
                      {a.messaggio && (
                        <Link href={`/messaggio/${a.messaggio.id}`} className="azione-riga" title="Apri la mail da cui nasce">
                          ✉ Mail
                        </Link>
                      )}
                      {/* ⚠️ Richiesta di approvazione «è spam?»: qui NON va
                          «Esegui» (l'AI scriverebbe una risposta — e una volta
                          l'ha scritta a una mail di phishing). Si decide. */}
                      {a.messaggio?.spamCaso ? (
                        <DecidiSpamRiga messaggioId={a.messaggio.id} />
                      ) : (
                        (a.messaggio || a.contattoEmail) && <BottoneEsegui id={a.id} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {fatte.length > 0 && (
        <>
          <h2 className="section-title">Fatte di recente</h2>
          <div className="card tight">
            {fatte.map((a) => (
              <div key={a.id} className="task-row fatta">
                {/* `riallinea`: togliendo la spunta l'attività deve tornare
                    SU, fra le cose da fare, non restare qui non barrata. */}
                <CheckAttivita id={a.id} fatta={a.fatta} riallinea />
                <div style={{ minWidth: 0 }}>
                  <div className="task-titolo">{a.titolo}</div>
                  {a.fattaIl && (
                    <div className="task-sub">
                      completata il {a.fattaIl.toLocaleDateString('it-IT', { timeZone: FUSO })}
                    </div>
                  )}
                  {a.messaggio && (
                    <div className="task-sub">
                      da{' '}
                      <Link href={`/messaggio/${a.messaggio.id}`} style={{ textDecoration: 'underline' }}>
                        {a.messaggio.oggetto || '(senza oggetto)'}
                      </Link>
                    </div>
                  )}
                </div>
                <div className="task-side">
                  <RiapriAttivita id={a.id} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
