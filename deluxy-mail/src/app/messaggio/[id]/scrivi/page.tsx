import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { modoValido, preparaRisposta, TITOLI } from '@/lib/rispondi'
import { Composizione } from '@/components/Composizione'
import { richiediUtente } from '@/lib/sessione'
import { leggiSenzaTraduzione, lingueLetteDi } from '@/lib/lingue'
import { elencoContatti } from '@/lib/contatti'

export const dynamic = 'force-dynamic'

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

  // Riprendendo una bozza si riparte da com'era, non dai campi precompilati:
  // sarebbe come non averla mai salvata.
  const bozza = bozzaId
    ? await db.bozza.findFirst({ where: { id: bozzaId, utenteId: u.id, inviata: false } })
    : null

  const iniziale = bozza
    ? { a: bozza.a, cc: bozza.cc, oggetto: bozza.oggetto, corpo: bozza.corpo }
    : preparaRisposta({
        messaggio,
        modo,
        mioIndirizzo: messaggio.account.email,
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
            {modo === 'inoltra'
              ? 'Il messaggio originale è riportato sotto: scegli a chi mandarlo.'
              : `In risposta a “${messaggio.oggetto}”.`}
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

      <Composizione
        messaggioId={messaggio.id}
        modo={modo}
        da={`${messaggio.account.nome} <${messaggio.account.email}>`}
        iniziale={iniziale}
        tornaA={`/messaggio/${id}`}
        bozzaId={bozza?.id}
        contatti={contatti}
        sequenze={sequenze}
      />
    </>
  )
}
