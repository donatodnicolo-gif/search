import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Health-check pubblico, standard per tutte le app Deluxy: dice se il server
// risponde e se il database è raggiungibile davvero. Lo legge la pagina /stato
// del Hub. Non espone alcun dato: solo booleani.
//
// ⚠️ «RAGGIUNGIBILE» NON BASTA. Un `SELECT 1` riesce benissimo anche con il
// database in SOLA LETTURA — è quello che succede su Supabase a disco pieno — e
// intanto l'app non riceve più posta e non salva più niente. Con il solo
// `database: true` questo controllo avrebbe detto «tutto a posto» mentre AI
// Mail era ferma da ore. Da qui `scrivibile`: è la differenza fra «risponde» e
// «funziona», e la sola che conta per chi guarda una pagina di stato.

export const dynamic = 'force-dynamic'

export async function GET() {
  let database = false
  let scrivibile: boolean | null = null

  try {
    const [r] = await db.$queryRaw<{ ro: string }[]>`SELECT current_setting('transaction_read_only') AS ro`
    database = true
    scrivibile = r?.ro !== 'on'
  } catch {
    database = false
  }

  return NextResponse.json(
    {
      // `ok` vale ora quello che promette: risponde E può lavorare.
      ok: database && scrivibile !== false,
      app: 'deluxy-mail',
      database,
      scrivibile,
      ...(scrivibile === false
        ? { avviso: 'Database in sola lettura: la posta non viene più scaricata (su Supabase succede a disco pieno).' }
        : {}),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
