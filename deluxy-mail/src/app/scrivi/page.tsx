import Link from 'next/link'
import { db } from '@/lib/db'
import { ComposizioneNuova } from '@/components/ComposizioneNuova'
import { richiediUtente } from '@/lib/sessione'
import { elencoContatti } from '@/lib/contatti'
import { caselleUtente, accountAttivoId } from '@/lib/accountAttivo'
import { htmlAPlain, sembraHtml } from '@/lib/htmlMail'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{
    bozza?: string
    a?: string
    cc?: string
    oggetto?: string
    corpo?: string
    /** Chi ha aperto la finestra (es. «Deluxy Orders») e a cosa si riferisce
     *  (es. «ordine 2529»): si mostrano e basta, per sapere da dove arriva. */
    app?: string
    rif?: string
  }>
}

/**
 * Ripulisce un valore che arriva dall'URL: è testo scritto da un'ALTRA app, e
 * va trattato come dato. Via i caratteri di controllo, e un tetto di lunghezza
 * (un URL enorme non arriverebbe comunque a destinazione).
 */
function daUrl(v: string | undefined, max: number): string {
  return [...(v ?? '')]
    .filter((c) => {
      const n = c.codePointAt(0) ?? 0
      return n === 9 || n === 10 || n === 13 || n >= 32 // tab, a-capo e stampabili
    })
    .join('')
    .slice(0, max)
    .trim()
}

/** Nuova mail: si scrive da zero, senza rispondere a niente. */
export default async function Scrivi({ searchParams }: Props) {
  const { bozza: bozzaId, a, cc, oggetto, corpo, app, rif } = await searchParams
  const u = await richiediUtente()

  // Le caselle collegate: con più di una si sceglie da quale inviare (la
  // attiva è quella predefinita).
  const [caselle, attivo] = await Promise.all([caselleUtente(u.id), accountAttivoId(u.id)])
  const account =
    (attivo ? caselle.find((c) => c.id === attivo) : null) ??
    (await db.account.findFirst({ where: { utenteId: u.id } }))
  if (!account) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">Nuova mail</h1>
          </div>
        </div>
        <div className="card">
          <div className="empty">
            <div className="empty-icon">✉</div>
            <div className="empty-title">Nessuna casella collegata</div>
            <p className="empty-text">Per scrivere una mail serve prima una casella.</p>
            <div style={{ marginTop: 18 }}>
              <Link href="/impostazioni" className="btn primary">
                Collega una casella
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Riprendendo una bozza si riparte da com'era, non dai campi vuoti.
  const bozza = bozzaId
    ? await db.bozza.findFirst({ where: { id: bozzaId, utenteId: u.id, inviata: false } })
    : null

  // Prefill da un'ALTRA app Deluxy (link «scrivi a…»): destinatari, oggetto e
  // testo arrivano nell'indirizzo. ⚠️ Il corpo si tratta come TESTO: se
  // contenesse HTML verrebbe spedito come tale, e qui il contenuto lo scrive
  // un'altra applicazione, non l'utente. Chi manda formattato usa l'API.
  const corpoDaUrl = (() => {
    const t = daUrl(corpo, 8000)
    return t && sembraHtml(t) ? htmlAPlain(t) : t
  })()
  const firma = u.firma ? `\n\n${u.firma}` : ''

  const iniziale = bozza
    ? { a: bozza.a, cc: bozza.cc, oggetto: bozza.oggetto, corpo: bozza.corpo }
    : {
        a: daUrl(a, 500),
        cc: daUrl(cc, 500),
        oggetto: daUrl(oggetto, 300),
        corpo: corpoDaUrl ? `${corpoDaUrl}${firma}` : firma,
      }

  // Da dove arriva la richiesta: si mostra e basta (niente viene salvato).
  const provenienza = [daUrl(app, 60), daUrl(rif, 80)].filter(Boolean).join(' · ')

  const contatti = (await elencoContatti(u.id)).map((c) => ({ email: c.email, nome: c.nome }))

  // Le sequenze di follow-up da poter agganciare all'invio.
  let sequenze: { id: string; nome: string }[] = []
  try {
    sequenze = await db.sequenza.findMany({
      where: { utenteId: u.id, attiva: true },
      orderBy: { creataIl: 'asc' },
      select: { id: true, nome: true },
    })
  } catch {
    sequenze = []
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/" className="btn secondary small">
            ← Torna alla posta
          </Link>
          <h1 className="page-title" style={{ marginTop: 14 }}>
            Nuova mail
          </h1>
          <p className="page-caption">
            Una mail scritta da zero: apre una conversazione nuova.
            {provenienza && (
              <>
                {' '}
                <span className="badge neutral">
                  <span className="dot" />
                  Preparata da {provenienza}
                </span>{' '}
                — controlla il testo prima di mandarla.
              </>
            )}
          </p>
        </div>
      </div>

      <ComposizioneNuova
        da={`${account.nome} <${account.email}>`}
        // Con più caselle: il «Da» è scegliibile; l'attiva è la predefinita.
        caselle={caselle.map((c) => ({ id: c.id, etichetta: `${c.nome} <${c.email}>` }))}
        accountId={account.id}
        iniziale={iniziale}
        bozzaId={bozza?.id}
        contatti={contatti}
        sequenze={sequenze}
      />
    </>
  )
}
