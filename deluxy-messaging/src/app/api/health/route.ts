import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Health-check pubblico, standard per tutte le app Deluxy: dice se il server
// risponde e se il database è raggiungibile davvero. Lo legge la pagina /stato
// del Hub. Non espone nessun dato: solo booleani e due conteggi.
//
// ⚠️ `ok` NON È SEMPRE VERO. Nella prima versione era scritto fisso a `true`, e
// una pagina di stato lo avrebbe mostrato verde anche con `database: false` —
// cioè proprio nel caso per cui questo controllo esiste. Ora vale quello che
// promette.
//
// ⚠️ «RAGGIUNGIBILE» NON BASTA. Un `SELECT 1` riesce benissimo anche con il
// database in SOLA LETTURA — su Supabase succede a disco pieno — e intanto
// l'app non salva più niente: non entrano ordini, non entrano messaggi. Da qui
// `scrivibile`: è la differenza fra «risponde» e «funziona». Stesso impianto di
// deluxy-mail, dove il problema è già stato pagato una volta.

export const dynamic = 'force-dynamic'

export async function GET() {
  let database = false
  let scrivibile: boolean | null = null
  // Due numeri per vedere a colpo d'occhio se l'app sta davvero lavorando: un
  // database sano con zero ordini vuol dire che il sync è fermo, e da fuori è
  // indistinguibile da un'app che funziona.
  let ordini: number | null = null
  let conversazioni: number | null = null

  try {
    const [r] = await db.$queryRaw<
      { ro: string }[]
    >`SELECT current_setting('transaction_read_only') AS ro`
    database = true
    scrivibile = r?.ro !== 'on'
  } catch {
    database = false
  }

  if (database) {
    try {
      const [a, b] = await Promise.all([db.ordine.count(), db.conversazione.count()])
      ordini = a
      conversazioni = b
    } catch {
      // I conteggi sono un extra: se falliscono resta valido lo stato del
      // database, e non si finge un guasto che non c'è.
    }
  }

  return NextResponse.json(
    {
      ok: database && scrivibile !== false,
      app: 'deluxy-messaging',
      database,
      scrivibile,
      ordini,
      conversazioni,
      ...(scrivibile === false
        ? {
            avviso:
              'Database in sola lettura: non entrano più ordini né messaggi (su Supabase succede a disco pieno).',
          }
        : {}),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
