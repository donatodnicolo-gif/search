import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { elencoMittentiIgnorati, salvaMittentiIgnorati } from '@/lib/mittenti-ignorati'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * «Segnala come spam»: il mittente entra fra quelli da ignorare e la
 * conversazione va in archivio.
 *
 * Non è un antispam e non deve diventarlo (stessa regola di
 * `src/lib/mittenti-ignorati.ts`): non si indovina se una mail è pubblicità, si
 * ignora un mittente che **una persona** ha indicato. Qui si toglie solo la
 * fatica di andare a mano in `/caselle` a incollare l'indirizzo — che è il
 * motivo per cui la colonna Deluxy è arrivata a 95 conversazioni quasi tutte
 * spazzatura: il posto per farlo c'era, ma costava troppi clic.
 *
 * ⚠️⚠️ SI SALVA L'INDIRIZZO ESATTO, MAI IL DOMINIO. `daIgnorare` accetta anche
 * `@dominio.it` e i pezzi di indirizzo, e da qui sarebbe comodo dedurli — ma uno
 * spam da `tizio@gmail.com` farebbe sparire in silenzio ogni cliente che scrive
 * da Gmail, e nessuno se ne accorgerebbe perché le mail ignorate non suonano.
 * Le regole larghe restano una scelta consapevole, da fare in `/caselle`
 * guardando l'elenco intero.
 *
 * ⚠️ E NON SI CANCELLA NIENTE: la conversazione va in **archivio**, non nel
 * cestino. Un mittente segnalato per sbaglio si ritrova cercando; una
 * conversazione cancellata no.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const conversazione = await db.conversazione.findUnique({
    where: { id },
    select: { id: true, canale: true, idEsterno: true },
  })
  if (!conversazione) {
    return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })
  }

  // ⚠️ L'elenco dei mittenti da ignorare è letto SOLO dalle rotte della posta
  // (`cron/posta`, `email/sync`, `email/rismista`). Su WhatsApp o Instagram
  // metterci dentro un id non bloccherebbe un bel niente: bisogna bloccare la
  // persona da Meta. Promettere qui un blocco che non c'è sarebbe peggio che
  // non avere il bottone — chi lo preme smette di controllare.
  if (conversazione.canale !== 'email') {
    return NextResponse.json(
      {
        errore:
          'Per ora si segnala spam solo sulla posta: sugli altri canali il blocco va fatto da WhatsApp o Instagram. Questa conversazione puoi archiviarla.',
      },
      { status: 400 }
    )
  }

  const mittente = (conversazione.idEsterno ?? '').trim().toLowerCase()
  if (!mittente || !mittente.includes('@')) {
    return NextResponse.json(
      { errore: 'Questa conversazione non ha un indirizzo email da cui bloccare.' },
      { status: 400 }
    )
  }

  const elenco = await elencoMittentiIgnorati()
  const righe = elenco.split('\n').map((r) => r.trim().toLowerCase())
  const giaCera = righe.includes(mittente)
  if (!giaCera) {
    // `salvaMittentiIgnorati` normalizza e toglie i doppioni da sé.
    await salvaMittentiIgnorati(`${elenco}\n${mittente}`)
  }

  await db.conversazione.update({
    where: { id },
    data: { archiviata: true, nonLetti: 0, daRileggere: false },
  })

  return NextResponse.json({ mittente, giaCera, archiviata: true })
}
