import Link from 'next/link'
import { db } from '@/lib/db'
import { dataBreve } from '@/lib/format'
import { htmlAPlain, sembraHtml } from '@/lib/htmlMail'
import { ripulisciAnteprima } from '@/lib/citato'
import { EliminaBozza } from '@/components/EliminaBozza'
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

  const mie = bozze.filter((b) => b.origine === 'utente')
  const daAI = bozze.filter((b) => b.origine === 'ai')

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
        <>
          {mie.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 0 }}>
                Iniziate da te
              </h2>
              <div className="card tight">
                <div className="mail-list">
                  {mie.map((b) => (
                    <RigaBozza key={b.id} bozza={b} allegati={b.allegatiGruppo ? (quantiAllegati.get(b.allegatiGruppo) ?? 0) : 0} />
                  ))}
                </div>
              </div>
            </>
          )}

          {daAI.length > 0 && (
            <>
              <h2 className="section-title">Proposte dall’AI</h2>
              <div className="card tight">
                <div className="mail-list">
                  {daAI.map((b) => (
                    <RigaBozza key={b.id} bozza={b} allegati={b.allegatiGruppo ? (quantiAllegati.get(b.allegatiGruppo) ?? 0) : 0} />
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

type BozzaConMessaggio = {
  id: string
  origine: string
  modo: string
  a: string
  oggetto: string
  corpo: string
  modificata: boolean
  aggiornataIl: Date
  messaggio: { id: string; mittente: string; mittenteNome: string | null } | null
}

/** `allegati`: quanti file la bozza si porta dietro (0 = nessuno). Arriva
 *  come numero e non come elenco: la riga deve disegnare un bollino, non
 *  caricare i byte dei file. */
function RigaBozza({ bozza, allegati = 0 }: { bozza: BozzaConMessaggio; allegati?: number }) {
  // Una bozza tua si riapre nella schermata di scrittura da cui è nata (la
  // risposta sotto il messaggio, la mail nuova in "Scrivi"); una dell'AI si
  // rivede sotto il messaggio a cui risponde.
  const dove =
    bozza.origine === 'utente' && bozza.messaggio
      ? `/messaggio/${bozza.messaggio.id}/scrivi?modo=${bozza.modo}&bozza=${bozza.id}`
      : bozza.messaggio
        ? `/messaggio/${bozza.messaggio.id}`
        : `/scrivi?bozza=${bozza.id}`

  const destinatario = bozza.a || bozza.messaggio?.mittenteNome || bozza.messaggio?.mittente || '—'

  return (
    <div className="mail-row">
      <div className="mail-row-head">
        <Link href={dove} className="mail-row-link">
          <div className="mail-top">
            <span className="dot-spacer" />
            <span className="mail-mittente">a {destinatario}</span>
          </div>
          <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
            {bozza.oggetto || '(senza oggetto)'}
          </div>
          <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
            <span className="muted">
              {anteprimaBozza(bozza.corpo) || '(vuota)'}
            </span>
          </div>
          <div className="mail-tags" style={{ paddingLeft: 17 }}>
            {allegati > 0 && (
              <span className="badge neutral" title="Allegati conservati con la bozza">
                📎 {allegati}
              </span>
            )}
            {bozza.modo === 'nuova' && <span className="badge neutral">nuova mail</span>}
            {bozza.modo === 'inoltra' && <span className="badge neutral">inoltro</span>}
            {bozza.modo === 'tutti' && <span className="badge neutral">a tutti</span>}
            {bozza.origine === 'ai' && bozza.modificata && (
              <span className="badge neutral">modificata da te</span>
            )}
          </div>
        </Link>

        <div className="mail-row-side">
          <span className="mail-data">{dataBreve(bozza.aggiornataIl)}</span>
        </div>
      </div>

      <div className="riga-azioni" style={{ paddingLeft: 17 }}>
        <Link href={dove} className="azione-riga">
          Riprendi
        </Link>
        <EliminaBozza id={bozza.id} />
      </div>
    </div>
  )
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