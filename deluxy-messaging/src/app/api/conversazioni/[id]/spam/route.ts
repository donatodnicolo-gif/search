import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { elencoMittentiIgnorati, salvaMittentiIgnorati } from '@/lib/mittenti-ignorati'
import { utenteCorrente } from '@/lib/sessione'

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
 * ⚠️⚠️ DAL 25/08/2026 VA NEL **CESTINO**, non in archivio (chiesto
 * dall'utente: «cliccando spam deve essere proprio spam e non apparire mai
 * più»). In archivio ci restava sotto gli occhi — 58 conversazioni, quasi tutte
 * spazzatura — e ogni mail nuova dello stesso mittente ne rimetteva una lì.
 *
 * ⚠️ Il cestino NON è una cancellazione immediata: si può riaprire e ripescare
 * per **30 giorni**, poi il cron `/api/cron/cestino` cancella davvero. È la
 * differenza col vecchio comportamento e va detta a chi preme: uno spam messo
 * per sbaglio su un cliente vero, se nessuno se ne accorge in un mese, si
 * perde. Per questo la conferma nomina l'indirizzo esatto e dice dove si
 * disfa.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
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
    data: {
      // ⚠️ Nel cestino, e NON archiviata: se un domani qualcuno la ripesca deve
      // tornare in posta in arrivo, dove la si guarda, non in un archivio dove
      // resterebbe invisibile come prima.
      eliminataIl: new Date(),
      archiviata: false,
      nonLetti: 0,
      daRileggere: false,
    },
  })

  return NextResponse.json({ mittente, giaCera, cestinata: true })
}
