import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { controllaFascia, giornoIso, giornoValido, type EsitoTurni } from '@/lib/turni'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

/**
 * Turni, eccezioni e persone: tutto quello che serve alla pagina, in un colpo.
 *
 * ⚠️ Sta qui e non in `src/lib/turni.ts` perché quel file lo importa anche il
 * componente client — gli serve «chi è di turno adesso», calcolato con
 * l'orologio di chi guarda. Un `import { db }` là dentro trascinerebbe Prisma
 * nel bundle del browser e la build fallirebbe.
 */
async function leggiTurni(): Promise<EsitoTurni> {
  const [operatori, turni, eccezioni] = await Promise.all([
    db.utente.findMany({
      orderBy: [{ nome: 'asc' }],
      select: { id: true, nome: true, ruolo: true },
    }),
    db.turnoSettimanale.findMany({ orderBy: [{ giorno: 'asc' }, { dalle: 'asc' }] }),
    // ⚠️ Solo da ieri in poi: le eccezioni passate non sono lavoro, sono
    // archivio, e un elenco che cresce all'infinito smette di guardarsi. «Ieri»
    // e non «oggi» perché chi apre la pagina la mattina deve ancora vedere il
    // giorno appena finito.
    db.eccezioneTurno.findMany({
      where: { giorno: { gte: giornoIso(new Date(Date.now() - 86400000)) } },
      orderBy: [{ giorno: 'asc' }, { dalle: 'asc' }],
    }),
  ])

  // ⚠️ Il nome buono è quello dell'anagrafica, non quello copiato sulla riga:
  // chi si corregge il nome comparirebbe due volte nella griglia.
  const nomi = new Map(operatori.map((o) => [o.id, o.nome]))

  return {
    operatori,
    turni: turni.map((t) => ({
      id: t.id,
      utenteId: t.utenteId,
      utenteNome: nomi.get(t.utenteId) ?? t.utenteNome,
      giorno: t.giorno,
      dalle: t.dalle,
      alle: t.alle,
    })),
    eccezioni: eccezioni.map((e) => ({
      id: e.id,
      utenteId: e.utenteId,
      utenteNome: nomi.get(e.utenteId) ?? e.utenteNome,
      giorno: e.giorno,
      tipo: e.tipo === 'orario' ? ('orario' as const) : ('riposo' as const),
      dalle: e.dalle,
      alle: e.alle,
      motivo: e.motivo,
      creatoDaNome: e.creatoDaNome,
    })),
  }
}

// I turni degli operatori.
//
// ⚠️ Solo amministratori, in lettura e in scrittura. Il controllo sta QUI e non
// solo nel menu: nascondere una voce non impedisce di chiamare l'indirizzo.
async function admin() {
  const io = await utenteCorrente()
  if (!io) return { errore: NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 }) }
  if (io.ruolo !== 'admin') {
    return { errore: NextResponse.json({ errore: 'Serve un amministratore.' }, { status: 403 }) }
  }
  return { io }
}

export async function GET() {
  const { errore } = await admin()
  if (errore) return errore
  return NextResponse.json(await leggiTurni())
}

type Corpo = {
  cosa?: 'settimana' | 'eccezione'
  utenteId?: string
  giorno?: number | string
  tipo?: string
  dalle?: string
  alle?: string
  motivo?: string
}

export async function POST(req: NextRequest) {
  const { io, errore } = await admin()
  if (errore) return errore

  const c = (await req.json().catch(() => ({}))) as Corpo
  const utente = c.utenteId ? await db.utente.findUnique({ where: { id: c.utenteId } }) : null
  if (!utente) return NextResponse.json({ errore: 'Scegli una persona.' }, { status: 400 })

  // ── Un turno della settimana che si ripete ──
  if (c.cosa === 'settimana') {
    const giorno = Number(c.giorno)
    if (!Number.isInteger(giorno) || giorno < 1 || giorno > 7) {
      return NextResponse.json({ errore: 'Giorno della settimana non valido.' }, { status: 400 })
    }
    const male = controllaFascia(c.dalle ?? '', c.alle ?? '')
    if (male) return NextResponse.json({ errore: male }, { status: 400 })

    // ⚠️ `upsert` e non `create`: rimettere lo stesso identico turno non è un
    // errore da mostrare, è un doppio clic. Con un create secco la pagina
    // direbbe «esiste già» a chi ha solo premuto due volte.
    await db.turnoSettimanale.upsert({
      where: {
        utenteId_giorno_dalle_alle: {
          utenteId: utente.id,
          giorno,
          dalle: c.dalle!,
          alle: c.alle!,
        },
      },
      update: { utenteNome: utente.nome },
      create: {
        utenteId: utente.id,
        utenteNome: utente.nome,
        giorno,
        dalle: c.dalle!,
        alle: c.alle!,
      },
    })
    return NextResponse.json(await leggiTurni())
  }

  // ── Un giorno in cui la settimana non vale ──
  const giorno = String(c.giorno ?? '')
  if (!giornoValido(giorno)) {
    return NextResponse.json({ errore: 'Scegli un giorno del calendario.' }, { status: 400 })
  }
  const tipo = c.tipo === 'orario' ? 'orario' : 'riposo'
  let dalle = ''
  let alle = ''
  if (tipo === 'orario') {
    const male = controllaFascia(c.dalle ?? '', c.alle ?? '')
    if (male) return NextResponse.json({ errore: male }, { status: 400 })
    dalle = c.dalle!
    alle = c.alle!
  }

  await db.eccezioneTurno.upsert({
    where: { utenteId_giorno_dalle_alle: { utenteId: utente.id, giorno, dalle, alle } },
    update: { tipo, motivo: (c.motivo ?? '').trim(), creatoDaNome: io!.nome },
    create: {
      utenteId: utente.id,
      utenteNome: utente.nome,
      giorno,
      tipo,
      dalle,
      alle,
      motivo: (c.motivo ?? '').trim(),
      creatoDaNome: io!.nome,
    },
  })
  return NextResponse.json(await leggiTurni())
}

/**
 * Cambia le ore di un turno che c'è già.
 *
 * ⚠️ Serve perché gli orari si scrivono **dentro la riga del giorno**, come
 * negli orari di apertura: senza, per spostare un turno di mezz'ora bisogna
 * cancellarlo e rifarlo, che è il gesto che la pagina vuole togliere di mezzo.
 */
export async function PATCH(req: NextRequest) {
  const { errore } = await admin()
  if (errore) return errore

  const c = (await req.json().catch(() => ({}))) as { id?: string; dalle?: string; alle?: string }
  if (!c.id) return NextResponse.json({ errore: 'Manca l’id.' }, { status: 400 })
  const male = controllaFascia(c.dalle ?? '', c.alle ?? '')
  if (male) return NextResponse.json({ errore: male }, { status: 400 })

  const esistente = await db.turnoSettimanale.findUnique({ where: { id: c.id } })
  if (!esistente) return NextResponse.json(await leggiTurni())

  // ⚠️ Se quella persona ha GIÀ una fascia identica in quel giorno, spostare
  // questa sopra l'altra violerebbe l'unicità e la pagina direbbe un errore
  // tecnico. La cosa giusta è che le due diventino una: si toglie il doppione.
  const gemella = await db.turnoSettimanale.findFirst({
    where: {
      utenteId: esistente.utenteId,
      giorno: esistente.giorno,
      dalle: c.dalle!,
      alle: c.alle!,
      id: { not: esistente.id },
    },
  })
  if (gemella) await db.turnoSettimanale.deleteMany({ where: { id: esistente.id } })
  else await db.turnoSettimanale.update({ where: { id: c.id }, data: { dalle: c.dalle!, alle: c.alle! } })

  return NextResponse.json(await leggiTurni())
}

export async function DELETE(req: NextRequest) {
  const { errore } = await admin()
  if (errore) return errore

  const p = req.nextUrl.searchParams
  const cosa = p.get('cosa')

  // ── Chiudere un giorno intero ──
  // ⚠️ Una chiamata sola e non una per fascia: con due o tre richieste in
  // parallelo, ognuna che risponde con lo stato completo, l'ultima che arriva
  // vince — e il giorno resterebbe mezzo aperto a schermo, con la pagina che
  // dice una cosa e il database un'altra.
  if (cosa === 'giorno') {
    const utenteId = p.get('utenteId') ?? ''
    const giorno = Number(p.get('giorno'))
    if (!utenteId || !Number.isInteger(giorno) || giorno < 1 || giorno > 7) {
      return NextResponse.json({ errore: 'Giorno non valido.' }, { status: 400 })
    }
    await db.turnoSettimanale.deleteMany({ where: { utenteId, giorno } })
    return NextResponse.json(await leggiTurni())
  }

  const id = p.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Manca l’id.' }, { status: 400 })

  // ⚠️ `deleteMany` con l'id: se la riga è già stata tolta da un altro
  // amministratore, non deve schiantarsi — la pagina si limita a ricaricare e
  // quella riga non c'è più, che è esattamente il risultato voluto.
  if (cosa === 'settimana') await db.turnoSettimanale.deleteMany({ where: { id } })
  else await db.eccezioneTurno.deleteMany({ where: { id } })

  return NextResponse.json(await leggiTurni())
}
