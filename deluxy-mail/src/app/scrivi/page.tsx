import Link from 'next/link'
import { db } from '@/lib/db'
import { ComposizioneNuova } from '@/components/ComposizioneNuova'
import { richiediUtente } from '@/lib/sessione'
import { elencoContatti } from '@/lib/contatti'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{ bozza?: string; a?: string }>
}

/** Nuova mail: si scrive da zero, senza rispondere a niente. */
export default async function Scrivi({ searchParams }: Props) {
  const { bozza: bozzaId, a } = await searchParams
  const u = await richiediUtente()

  const account = await db.account.findFirst({ where: { utenteId: u.id } })
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

  const iniziale = bozza
    ? { a: bozza.a, cc: bozza.cc, oggetto: bozza.oggetto, corpo: bozza.corpo }
    : { a: a ?? '', cc: '', oggetto: '', corpo: u.firma ? `\n\n${u.firma}` : '' }

  const contatti = (await elencoContatti(u.id)).map((c) => ({ email: c.email, nome: c.nome }))

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
          <p className="page-caption">Una mail scritta da zero: apre una conversazione nuova.</p>
        </div>
      </div>

      <ComposizioneNuova
        da={`${account.nome} <${account.email}>`}
        iniziale={iniziale}
        bozzaId={bozza?.id}
        contatti={contatti}
      />
    </>
  )
}
