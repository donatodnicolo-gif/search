import { db } from '@/lib/db'
import { dataBreve } from '@/lib/format'
import { htmlAPlain, sembraHtml } from '@/lib/htmlMail'
import { ripulisciAnteprima } from '@/lib/citato'
import { ListaBozze, type RigaBozzaDati } from '@/components/ListaBozze'
import { RicercaMail } from '@/components/RicercaMail'
import { CondizioniRicerca } from '@/components/CondizioniRicerca'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{ q?: string; a?: string; dal?: string; al?: string; dove?: string }>
}

export default async function Bozze({ searchParams }: Props) {
  const u = await richiediUtente()
  const { q: qGrezzo, a, dal, al, dove } = await searchParams
  const q = (qGrezzo ?? '').trim()
  // Le condizioni che hanno senso su una bozza: a chi è indirizzata, quando
  // l'hai toccata l'ultima volta, e dove cercare le parole. Niente «da» (sei
  // tu), niente allegati né sezioni: una bozza non ne ha.
  const cond = { a: (a ?? '').trim(), dal: (dal ?? '').trim(), al: (al ?? '').trim(), dove: (dove ?? '').trim() }
  const filtri = [
    ...(q.length >= 2
      ? [
          {
            OR: [
              ...(cond.dove === 'corpo' || cond.dove === 'persone'
                ? []
                : [{ oggetto: { contains: q, mode: 'insensitive' as const } }]),
              ...(cond.dove === 'oggetto' || cond.dove === 'persone'
                ? []
                : [{ corpo: { contains: q, mode: 'insensitive' as const } }]),
              ...(cond.dove === 'oggetto' || cond.dove === 'corpo'
                ? []
                : [{ a: { contains: q, mode: 'insensitive' as const } }]),
            ],
          },
        ]
      : []),
    ...(cond.a ? [{ a: { contains: cond.a, mode: 'insensitive' as const } }] : []),
    // Il periodo guarda l'ultima modifica: è la data che vedi sulla riga.
    ...(cond.dal ? [{ aggiornataIl: { gte: new Date(`${cond.dal}T00:00:00`) } }] : []),
    ...(cond.al ? [{ aggiornataIl: { lte: new Date(`${cond.al}T23:59:59`) } }] : []),
  ]

  const bozze = await db.bozza.findMany({
    where: { utenteId: u.id, inviata: false, ...(filtri.length ? { AND: filtri } : {}) },
    orderBy: { aggiornataIl: 'desc' },
    include: {
      messaggio: { select: { id: true, mittente: true, mittenteNome: true } },
    },
  })

  // Quanti allegati ha ogni bozza: UNA query per tutte, e senza tirarsi
  // dietro i byte (un `include` degli allegati porterebbe i file interi in
  // memoria per disegnare un numero).
  const gruppi = bozze.map((b) => b.allegatiGruppo).filter((g): g is string => Boolean(g))
  const quantiAllegati = new Map<string, number>()
  if (gruppi.length) {
    try {
      const conteggi = await db.allegatoCaricato.groupBy({
        by: ['gruppo', 'file'],
        where: { utenteId: u.id, gruppo: { in: gruppi } },
      })
      for (const c of conteggi) quantiAllegati.set(c.gruppo, (quantiAllegati.get(c.gruppo) ?? 0) + 1)
    } catch {
      /* tabella non migrata: si mostra la bozza senza il numero */
    }
  }

  // Le righe si preparano QUI, sul server: la lista e un componente client
  // (deve tenere la selezione), e un componente client non deve ricevere
  // oggetti Prisma interi ne rifare i conti: riceve quello che disegna.
  const righe: RigaBozzaDati[] = bozze.map((b) => ({
    id: b.id,
    origine: b.origine,
    modo: b.modo,
    oggetto: b.oggetto,
    anteprima: anteprimaBozza(b.corpo),
    destinatario: b.a || b.messaggio?.mittenteNome || b.messaggio?.mittente || '-',
    dove: dovePortare(b),
    data: dataBreve(b.aggiornataIl),
    modificata: b.modificata,
    allegati: b.allegatiGruppo ? (quantiAllegati.get(b.allegatiGruppo) ?? 0) : 0,
  }))

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Bozze</h1>
          <p className="page-caption">
            Le mail iniziate e non finite, e le risposte proposte dall’AI. Nessuna parte da sola.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RicercaMail
          iniziale={q}
          base="/bozze"
          placeholder="Cerca nelle bozze (destinatario, oggetto, testo)…"
        />
        <CondizioniRicerca
          valori={{ q, a: cond.a, dal: cond.dal, al: cond.al, dove: cond.dove }}
          base="/bozze"
          campi={['a', 'periodo', 'dove']}
        />
      </div>

      {bozze.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">✎</div>
            {/* Cercando, «Nessuna bozza» sarebbe una bugia: le bozze ci sono,
                non ce n'è una che risponda a QUESTA domanda. */}
            <div className="empty-title">{filtri.length ? 'Nessuna bozza trovata' : 'Nessuna bozza'}</div>
            <p className="empty-text">
              {filtri.length ? (
                <>
                  Nessuna bozza corrisponde a quello che hai chiesto. Togli qualche condizione
                  qui sopra per allargare la ricerca.
                </>
              ) : (
                <>
                  Quando inizi una risposta e la metti da parte, la ritrovi qui. Le bozze dell’AI
                  compaiono quando dai una priorità a una mail che chiede una risposta.
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <ListaBozze righe={righe} />
      )}
    </>
  )
}

/**
 * Dove si riapre una bozza.
 *
 * Una bozza tua torna nella schermata di scrittura da cui e nata (la risposta
 * sotto il messaggio, la mail nuova in Scrivi); una dell'AI si rivede sotto il
 * messaggio a cui risponde.
 */
function dovePortare(b: {
  id: string
  origine: string
  modo: string
  messaggio: { id: string } | null
}): string {
  if (b.origine === 'utente' && b.messaggio) {
    return `/messaggio/${b.messaggio.id}/scrivi?modo=${b.modo}&bozza=${b.id}`
  }
  return b.messaggio ? `/messaggio/${b.messaggio.id}` : `/scrivi?bozza=${b.id}`
}

/**
 * L'anteprima di una bozza in ELENCO.
 *
 * ⚠️ Il corpo di una bozza è HTML (lo produce l'editor), e prima finiva a
 * schermo così com'era: si leggeva `<p><br></p><table style="width: 600px…`
 * invece del testo (segnalato il 21/08/2026). Chi scorre le bozze vuole
 * riconoscere quale sia, e i tag non glielo dicono.
 *
 * ⚠️ `sembraHtml` prima di convertire: una bozza salvata come testo semplice
 * non va passata per il convertitore.
 */
function anteprimaBozza(corpo: string): string {
  const testo = sembraHtml(corpo) ? htmlAPlain(corpo) : corpo
  // ⚠️⚠️ Qui c'era `.replace(/s+/g, ' ')` — un backslash mangiato: al posto
  // degli spazi cancellava la LETTERA «s» da ogni anteprima di bozza.
  // Misurato sul database: 29 bozze su 30 storpiate («la spesa sostenuta» →
  // «la  pe a  o tenuta»). La riparazione non è rimettere il backslash ma
  // togliere la riga: gli spazi li collassa già `ripulisciAnteprima`, ed è
  // esattamente per questo che quel `replace` non aveva altro da fare.
  return ripulisciAnteprima(testo).trim().slice(0, 160)
}