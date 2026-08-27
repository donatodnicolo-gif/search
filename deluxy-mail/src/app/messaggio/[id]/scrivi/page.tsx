import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { accountPerRisposta, caselleIndirizzate, modoValido, preparaRisposta, TITOLI } from '@/lib/rispondi'
import { Composizione } from '@/components/Composizione'
import { richiediUtente } from '@/lib/sessione'
import { leggiSenzaTraduzione, lingueLetteDi } from '@/lib/lingue'
import { elencoContatti } from '@/lib/contatti'
import { htmlDiMessaggio } from '@/lib/htmlServer'
import { righeThread } from '@/lib/sync'
import { anteprimaPulita } from '@/lib/citato'
import { ConversazioneMentreScrivi } from '@/components/ConversazioneMentreScrivi'

export const dynamic = 'force-dynamic'
// L'invio gira qui dentro: inoltrando, gli allegati si riprendono dalla casella
// IMAP prima di spedire, e con file pesanti dieci secondi non bastano. ⚠️ Le
// Server Action NON ereditano il `maxDuration` del layout: va messo sulla
// pagina da cui partono.
export const maxDuration = 60

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ modo?: string; bozza?: string }>
}

export default async function Scrivi({ params, searchParams }: Props) {
  const { id } = await params
  const { modo: modoGrezzo, bozza: bozzaId } = await searchParams
  const modo = modoValido(modoGrezzo)
  const u = await richiediUtente()

  const messaggio = await db.messaggio.findFirst({
    where: { id, utenteId: u.id },
    include: { account: true },
  })
  if (!messaggio) notFound()

  // Da QUALE casella si risponde: quella a cui la mail era indirizzata, non
  // quella che ha scaricato la copia (con più caselle possono differire — il
  // «Da: cs@deluxy.it» su una mail mandata a nicolo.donato). La stessa regola
  // la riapplica `inviaMessaggio` allo spedire: qui si mostra, là si fa.
  const caselle = await db.account.findMany({
    where: { utenteId: u.id, attivo: true },
    select: { id: true, email: true, nome: true },
  })
  const daCasella = accountPerRisposta(messaggio, caselle) ?? messaggio.account
  // La tendina «Da» c'è SEMPRE (chiesto il 27/08/2026): una risposta si deve
  // poter far partire da qualunque casella, non solo da quella che l'app ha
  // indovinato. `caselleIndirizzate` resta, ma con un altro compito: dice
  // quali erano DAVVERO fra i destinatari, e quindi chi rimettere in Cc se
  // cambi mittente.
  const indirizzate = caselleIndirizzate(messaggio, caselle).map((c) => c.email)
  // ⚠️ La voce proposta dev'essere UNA DELLE VOCI DELLA TENDINA. La casella
  // della copia può essere disattivata (o di un'altra epoca) e non comparire
  // fra le attive: in quel caso il menu mostrerebbe la prima voce mentre lo
  // stato ne tiene un'altra, e la mail partirebbe da un indirizzo diverso da
  // quello scritto a schermo. Un'etichetta che mente è peggio di una scelta
  // scomoda.
  const daIdProposto = caselle.some((c) => c.id === daCasella.id)
    ? daCasella.id
    : (caselle[0]?.id ?? '')

  // Riprendendo una bozza si riparte da com'era, non dai campi precompilati:
  // sarebbe come non averla mai salvata.
  const bozza = bozzaId
    ? await db.bozza.findFirst({ where: { id: bozzaId, utenteId: u.id, inviata: false } })
    : null

  // La citazione mantiene la formattazione dell'originale: se l'HTML è stato
  // alleggerito (mail vecchia, vive sul server), si riprende da lì. Solo quando
  // serve davvero (niente bozza da riprendere) e best-effort: senza, si cita il
  // testo semplice e la risposta parte comunque.
  if (!bozza && !messaggio.corpoHtml) messaggio.corpoHtml = await htmlDiMessaggio(messaggio)

  const iniziale = bozza
    ? { a: bozza.a, cc: bozza.cc, oggetto: bozza.oggetto, corpo: bozza.corpo }
    : preparaRisposta({
        messaggio,
        modo,
        // L'indirizzo della casella SCELTA: serve anche a «rispondi a tutti»
        // per non mettersi da soli fra i destinatari.
        mioIndirizzo: daCasella.email,
        firma: u.firma || undefined,
      })

  // Se la mail è straniera E in una lingua che l'utente NON legge, la risposta
  // si scrive in italiano e si traduce all'invio. Si usa la lingua GIÀ NOTA del
  // messaggio: NON si fa una traduzione AI qui (bloccava l'apertura della
  // pagina). La traduzione all'invio la fa comunque inviaMessaggio.
  const lingua = messaggio.lingua
  const rispostaTradotta =
    modo !== 'inoltra' && lingua !== null && !leggiSenzaTraduzione(lingua, lingueLetteDi(u.lingueLette))
      ? lingua
      : null

  const contatti = (await elencoContatti(u.id)).map((c) => ({ email: c.email, nome: c.nome }))

  // Le altre mail della conversazione, in forma leggera: i testi si chiedono
  // uno alla volta quando si apre quel messaggio (vedi il componente).
  const precedenti = (await righeThread(u.id, messaggio.id))
    .filter((r) => r.id !== messaggio.id)
    .map((r) => ({
      id: r.id,
      mittente: r.mittente,
      mittenteNome: r.mittenteNome,
      direzione: r.direzione,
      data: r.data,
      anteprima: anteprimaPulita(r.anteprima ?? ''),
    }))

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
          <Link href={`/messaggio/${id}`} className="btn secondary small">
            ← Torna al messaggio
          </Link>
          <h1 className="page-title" style={{ marginTop: 14 }}>
            {TITOLI[modo]}
          </h1>
          <p className="page-caption">
            {modo === 'inoltra' ? (
              <>
                Il messaggio originale è riportato sotto: scegli a chi mandarlo.
                {/* Gli allegati partono da soli, ma bisogna VEDERLO prima di
                    premere invia: senza, o li si riallega a mano (doppioni) o
                    si resta col dubbio. */}
                {messaggio.allegati > 0 && (
                  <>
                    {' '}
                    <strong>
                      📎 {messaggio.allegati === 1
                        ? 'L’allegato dell’originale parte'
                        : `I ${messaggio.allegati} allegati dell’originale partono`}{' '}
                      con l’inoltro
                    </strong>
                    : non serve riallegarli.
                  </>
                )}
              </>
            ) : (
              `In risposta a “${messaggio.oggetto}”.`
            )}
          </p>
        </div>
      </div>

      {rispostaTradotta && (
        <div className="ai-box" style={{ marginBottom: 16 }}>
          <div className="ai-box-text">
            Questa mail è in <strong>{rispostaTradotta}</strong>. Scrivi pure in italiano: al
            momento dell’invio la traduco io nella sua lingua.
          </div>
        </div>
      )}

      {/* Le mail precedenti, richiudibili: rispondendo si ha bisogno di
          ricontrollare un prezzo o una data senza abbandonare quello che si
          sta scrivendo. */}
      <ConversazioneMentreScrivi righe={precedenti} />

      <Composizione
        messaggioId={messaggio.id}
        modo={modo}
        da={`${daCasella.nome} <${daCasella.email}>`}
        daScelte={caselle}
        daId={daIdProposto}
        daIndirizzate={indirizzate}
        iniziale={iniziale}
        tornaA={`/messaggio/${id}`}
        bozzaId={bozza?.id}
        contatti={contatti}
        sequenze={sequenze}
      />
    </>
  )
}
