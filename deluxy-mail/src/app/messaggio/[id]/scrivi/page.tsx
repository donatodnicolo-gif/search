import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { leggiImpostazioni, CHIAVI } from '@/lib/impostazioni'
import { modoValido, preparaRisposta, TITOLI } from '@/lib/rispondi'
import { Composizione } from '@/components/Composizione'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ modo?: string; bozza?: string }>
}

export default async function Scrivi({ params, searchParams }: Props) {
  const { id } = await params
  const { modo: modoGrezzo, bozza: bozzaId } = await searchParams
  const modo = modoValido(modoGrezzo)

  const messaggio = await db.messaggio.findUnique({
    where: { id },
    include: { account: true },
  })
  if (!messaggio) notFound()

  const impostazioni = await leggiImpostazioni()

  // Riprendendo una bozza si riparte da com'era, non dai campi precompilati:
  // sarebbe come non averla mai salvata.
  const bozza = bozzaId
    ? await db.bozza.findUnique({ where: { id: bozzaId, inviata: false } })
    : null

  const iniziale = bozza
    ? { a: bozza.a, cc: bozza.cc, oggetto: bozza.oggetto, corpo: bozza.corpo }
    : preparaRisposta({
        messaggio,
        modo,
        mioIndirizzo: messaggio.account.email,
        firma: impostazioni[CHIAVI.firma],
      })

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

      <Composizione
        messaggioId={messaggio.id}
        modo={modo}
        da={`${messaggio.account.nome} <${messaggio.account.email}>`}
        iniziale={iniziale}
        tornaA={`/messaggio/${id}`}
        bozzaId={bozza?.id}
      />
    </>
  )
}
