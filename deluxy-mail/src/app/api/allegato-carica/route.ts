import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/allegato-carica
// Riceve UN pezzo di UN allegato e lo deposita. Il browser manda pezzi da ~3 MB
// perché su Vercel il corpo di una richiesta non può superare 4,5 MB: è questo
// il motivo per cui una mail con allegati pesanti moriva con la schermata
// bianca prima ancora di arrivare al codice.
//
// Campi (FormData): gruppo, file (indice del file), parte (indice del pezzo),
// nome, tipo, pezzo (Blob).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Un pezzo non deve mai avvicinarsi al tetto di piattaforma.
const MAX_PEZZO = 4 * 1024 * 1024

export async function POST(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) return Response.json({ ok: false, messaggio: 'Sessione scaduta' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ ok: false, messaggio: 'Pezzo non leggibile' }, { status: 400 })
  }

  const gruppo = String(form.get('gruppo') ?? '').trim()
  const file = Number(form.get('file') ?? NaN)
  const parte = Number(form.get('parte') ?? NaN)
  const nome = String(form.get('nome') ?? '').slice(0, 300)
  const tipo = String(form.get('tipo') ?? '').slice(0, 120)
  const pezzo = form.get('pezzo')

  if (!gruppo || !Number.isInteger(file) || !Number.isInteger(parte) || !nome) {
    return Response.json({ ok: false, messaggio: 'Parametri mancanti' }, { status: 400 })
  }
  if (!(pezzo instanceof Blob) || pezzo.size === 0) {
    return Response.json({ ok: false, messaggio: 'Pezzo vuoto' }, { status: 400 })
  }
  if (pezzo.size > MAX_PEZZO) {
    return Response.json({ ok: false, messaggio: 'Pezzo troppo grande' }, { status: 413 })
  }

  try {
    await db.allegatoCaricato.create({
      data: {
        utenteId: userId,
        gruppo,
        file,
        parte,
        nome,
        tipo,
        dati: Buffer.from(await pezzo.arrayBuffer()),
      },
    })
  } catch {
    return Response.json({ ok: false, messaggio: 'Salvataggio del pezzo non riuscito' }, { status: 500 })
  }

  // Pulizia opportunistica: pezzi di scritture abbandonate più vecchie di un
  // giorno (chi chiude la finestra senza inviare non lascia zavorra).
  try {
    await db.allegatoCaricato.deleteMany({
      where: { utenteId: userId, creatoIl: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    })
  } catch {
    /* non è un problema dell'utente */
  }

  return Response.json({ ok: true })
}
