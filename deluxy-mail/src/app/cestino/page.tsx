import Link from 'next/link'
import { ripulisciAnteprima } from '@/lib/citato'
import { db } from '@/lib/db'
import { dataBreve } from '@/lib/format'
import { AzioniRiga } from '@/components/AzioniRiga'
import { RipristinaCestino } from '@/components/RipristinaCestino'
import { SvuotaCestino } from '@/components/SvuotaCestino'
import { RicercaMail } from '@/components/RicercaMail'
import { ChipsPeriodo } from '@/components/ChipsPeriodo'
import { intervalloPeriodo } from '@/lib/periodo'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string; periodo?: string }> }

export default async function Cestino({ searchParams }: Props) {
  const { q: qGrezzo, periodo } = await searchParams
  const q = (qGrezzo ?? '').trim()
  const ricerca = q.length >= 2
  // Le scorciatoie di periodo (Libro v1.9 §8-bis) sulla DATA DI CESTINAZIONE
  // (`cestinatoIl`): è la data che la riga mostra («cestinato …»), ed è quella
  // che uno ricorda quando cerca cosa ha buttato la settimana scorsa.
  const intervallo = intervalloPeriodo(periodo)
  const u = await richiediUtente()
  const [messaggi, totaleCestino] = await Promise.all([
    db.messaggio.findMany({
      where: {
        utenteId: u.id,
        cestinato: true,
        ...(intervallo ? { cestinatoIl: { gte: intervallo.gte, lt: intervallo.lt } } : {}),
        // La ricerca (Libro v1.9 §8-bis): come si riconosce una mail buttata —
        // chi la mandava, a chi andava, di cosa parlava.
        ...(ricerca
          ? {
              OR: [
                { oggetto: { contains: q, mode: 'insensitive' as const } },
                { mittente: { contains: q, mode: 'insensitive' as const } },
                { mittenteNome: { contains: q, mode: 'insensitive' as const } },
                { destinatari: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { cestinatoIl: 'desc' },
      // ⚠️ La finestra del recupero deve reggere il confronto con quella della
      // distruzione: dalla posta si cestinano fino a 800 conversazioni in un
      // colpo, e con 200 il cestino non le mostrava nemmeno tutte — chi voleva
      // disfare non trovava più metà di quello che aveva buttato.
      take: 800,
      // La lista mostra solo riassunto/anteprima: i corpi non servono e pesano.
      omit: { corpoTesto: true, corpoHtml: true },
    }),
    // ⚠️ IL CESTINO INTERO, senza filtri e senza `take`. Non è un doppione della
    // lista: è la popolazione su cui agisce «Svuota cestino», che è un'altra cosa
    // da quella che si vede.
    //
    // Segnalato dall'utente il 10/09/2026 («se non c'è una mail in cestino da
    // posta in arrivo il pulsante sembra sparire»). I due pulsanti stavano dietro
    // a `messaggi.length > 0`, cioè al conteggio FILTRATO dai chip di periodo e
    // dalla ricerca e TAGLIATO a 800. Due guai in uno:
    //   1. con un filtro che non pesca nulla il pulsante spariva anche col cestino
    //      pieno — e nella stessa schermata la pagina scriveva «Niente nel cestino
    //      PER QUESTA RICERCA», cioè sapeva benissimo che vuoto non era;
    //   2. peggio, quel numero finiva nella CONFERMA («Rimuovo N messaggi») mentre
    //      `svuotaCestinoDi()` svuota tutto: misurato quel giorno, Renato aveva
    //      1.076 mail in cestino e la pagina ne mostrava 800 — la conferma avrebbe
    //      detto 800 cancellandone 1.076, dal server e per sempre.
    //
    // La regola, buona ovunque: **un comando che agisce su TUTTA una popolazione
    // non si mostra, né si conta, sulla sua sottopopolazione filtrata.**
    // Il ripristino invece è giusto che segua le righe mostrate — è quello che
    // dice la sua etichetta — e si nasconde da sé quando non ce ne sono.
    db.messaggio.count({ where: { utenteId: u.id, cestinato: true } }),
  ])

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Cestino</h1>
          <p className="page-caption">
            Messaggi tolti da AI Mail. Finché stanno qui sono ancora sulla casella e si possono
            rimettere in posta; <strong>svuotando il cestino si cancellano anche di là</strong>, e
            non si torna indietro.
          </p>
        </div>
        {totaleCestino > 0 && (
          <div className="page-actions">
            {/* Il ripristino in blocco sta ACCANTO allo svuotamento: le due strade
                opposte devono costare lo stesso numero di gesti.
                ⚠️ Il ripristino agisce sulle righe MOSTRATE (con ricerca o
                periodo attivi, su quelle filtrate); «Svuota» invece svuota
                TUTTO il cestino, come dice la sua conferma. */}
            <RipristinaCestino ids={messaggi.map((m) => m.id)} />
            <SvuotaCestino quanti={totaleCestino} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        {/* Chips fuori dal form: un nuovo submit della ricerca riparte senza
            `periodo` e lo azzera da solo (Libro v1.9 §8-bis). */}
        <ChipsPeriodo base="/cestino" periodo={periodo} altri={{ q: ricerca ? q : undefined }} />
        <RicercaMail
          iniziale={ricerca ? q : ''}
          base="/cestino"
          placeholder="Cerca nel cestino (mittente, destinatario, oggetto)…"
        />
      </div>

      <div className="card tight">
        {messaggi.length === 0 ? (
          <div className="empty">
            {/* Cercando, «Cestino vuoto» sarebbe una bugia: le mail buttate ci
                sono, non ce n'è una che risponda a QUESTA domanda. */}
            <div className="empty-icon">{ricerca || intervallo ? '⌕' : '🗑'}</div>
            <div className="empty-title">
              {ricerca || intervallo ? 'Niente nel cestino per questa ricerca' : 'Cestino vuoto'}
            </div>
            <p className="empty-text">
              {ricerca
                ? `Nessuna mail cestinata corrisponde a «${q}».`
                : intervallo
                  ? 'Nessuna mail cestinata nel periodo scelto.'
                  : 'Niente da buttare, per ora.'}
            </p>
          </div>
        ) : (
          <div className="mail-list">
            {messaggi.map((m) => (
              <div key={m.id} className="mail-row">
                <Link href={`/messaggio/${m.id}`} className="mail-row-link">
                  <div className="mail-top">
                    <span className="dot-spacer" />
                    <span className="mail-mittente">{m.mittenteNome || m.mittente}</span>
                    <span className="mail-data">
                      {m.cestinatoIl ? `cestinato ${dataBreve(m.cestinatoIl)}` : ''}
                    </span>
                  </div>
                  <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
                    {m.oggetto}
                  </div>
                  <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                    <span className="muted">{m.riassunto || ripulisciAnteprima(m.anteprima)}</span>
                  </div>
                </Link>
                <div className="riga-azioni" style={{ paddingLeft: 17 }}>
                  <AzioniRiga id={m.id} archiviato={m.archiviato} cestinato={m.cestinato} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
