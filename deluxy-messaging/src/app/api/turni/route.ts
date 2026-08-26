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
 *
 * ⚠️ `dal` è il primo giorno della settimana che si sta guardando. Senza, i
 * cambi partono da ieri e una settimana **passata** tornerebbe vuota: cioè
 * direbbe «era una settimana normale» invece di «non te l'ho caricata». È il
 * genere di bugia che nessuno mette in dubbio.
 */
async function leggiTurni(dal?: string): Promise<EsitoTurni> {
  const inizio = dal && giornoValido(dal) ? dal : giornoIso(new Date(Date.now() - 86400000))

  const [operatori, turni, eccezioni] = await Promise.all([
    db.utente.findMany({
      orderBy: [{ nome: 'asc' }],
      select: { id: true, nome: true, ruolo: true },
    }),
    db.turnoSettimanale.findMany({ orderBy: [{ giorno: 'asc' }, { dalle: 'asc' }] }),
    db.eccezioneTurno.findMany({
      where: { giorno: { gte: inizio } },
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

export async function GET(req: NextRequest) {
  // ⚠️ Chi sei: il middleware controlla la FIRMA del cookie, non che
  // l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { errore } = await admin()
  if (errore) return errore
  return NextResponse.json(await leggiTurni(req.nextUrl.searchParams.get('dal') ?? undefined))
}

type Corpo = {
  /**
   * `settimana-giorno` = un giorno della regola, scritto intero ·
   * `settimana` = una fascia sola della regola ·
   * `giorno-data` = un giorno di una settimana sola, scritto intero ·
   * (senza `cosa`) = una singola fascia su una data.
   */
  cosa?: 'settimana' | 'settimana-giorno' | 'giorno-data'
  utenteId?: string
  /** Numero 1–7 per la regola, «AAAA-MM-GG» per il giorno di una settimana. */
  giorno?: number | string
  tipo?: string
  dalle?: string
  alle?: string
  /** Solo per `giorno-data`: tutte le fasce del giorno. Vuoto = non lavora. */
  fasce?: { dalle?: string; alle?: string }[]
  motivo?: string
  /** Il lunedì della settimana guardata: torna nella risposta. */
  dal?: string
}

export async function POST(req: NextRequest) {
  // ⚠️ Chi sei: il middleware controlla la FIRMA del cookie, non che
  // l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { io, errore } = await admin()
  if (errore) return errore

  const c = (await req.json().catch(() => ({}))) as Corpo
  const utente = c.utenteId ? await db.utente.findUnique({ where: { id: c.utenteId } }) : null
  if (!utente) return NextResponse.json({ errore: 'Scegli una persona.' }, { status: 400 })

  // ── UN GIORNO DELLA REGOLA, scritto tutto insieme ──
  //
  // ⚠️⚠️ In una transazione, e non «cancella poi riscrivi» a colpi separati: se
  // la seconda chiamata fallisse (o non partisse), il giorno resterebbe VUOTO —
  // cioè avremmo cancellato un turno per cambiargli mezz'ora. Qui o cambia
  // tutto o non cambia niente.
  if (c.cosa === 'settimana-giorno') {
    const giorno = Number(c.giorno)
    if (!Number.isInteger(giorno) || giorno < 1 || giorno > 7) {
      return NextResponse.json({ errore: 'Giorno della settimana non valido.' }, { status: 400 })
    }
    const fasce = Array.isArray(c.fasce) ? c.fasce : []
    for (const f of fasce) {
      const male = controllaFascia(f?.dalle ?? '', f?.alle ?? '')
      if (male) return NextResponse.json({ errore: male }, { status: 400 })
    }
    await db.$transaction([
      db.turnoSettimanale.deleteMany({ where: { utenteId: utente.id, giorno } }),
      db.turnoSettimanale.createMany({
        data: fasce.map((f) => ({
          utenteId: utente.id,
          utenteNome: utente.nome,
          giorno,
          dalle: f.dalle!,
          alle: f.alle!,
        })),
        skipDuplicates: true,
      }),
    ])
    return NextResponse.json(await leggiTurni(c.dal))
  }

  // ── Un turno della settimana che si ripete (una fascia per volta) ──
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
    return NextResponse.json(await leggiTurni(c.dal))
  }

  // ── UN GIORNO DI UNA SETTIMANA SOLA, scritto tutto insieme ──
  //
  // ⚠️⚠️ Il giorno si manda **intero** — l'elenco delle sue fasce, vuoto se non
  // lavora — e non una fascia per volta. Modificare un orario in una settimana
  // vuol dire staccare quel giorno dalla regola: se lo si facesse con tre
  // chiamate (togli il vecchio, scrivi la prima, scrivi la seconda), ognuna che
  // risponde con lo stato completo, basterebbe che arrivassero fuori ordine per
  // lasciare il giorno mezzo scritto — e a schermo sembrerebbe un turno
  // sparito, non una richiesta in ritardo.
  if (c.cosa === 'giorno-data') {
    const g = String(c.giorno ?? '')
    if (!giornoValido(g)) {
      return NextResponse.json({ errore: 'Scegli un giorno del calendario.' }, { status: 400 })
    }
    const fasce = Array.isArray(c.fasce) ? c.fasce : []
    for (const f of fasce) {
      const male = controllaFascia(f?.dalle ?? '', f?.alle ?? '')
      if (male) return NextResponse.json({ errore: male }, { status: 400 })
    }
    const motivo = (c.motivo ?? '').trim()

    await db.eccezioneTurno.deleteMany({ where: { utenteId: utente.id, giorno: g } })
    // Nessuna fascia = quel giorno non lavora. È la stessa cosa che dice il
    // bottone «Chiuso», e va scritta: un giorno senza righe tornerebbe a
    // seguire la regola di sempre, che è l'opposto.
    const righe = fasce.length
      ? fasce.map((f) => ({
          utenteId: utente.id,
          utenteNome: utente.nome,
          giorno: g,
          tipo: 'orario',
          dalle: f.dalle!,
          alle: f.alle!,
          motivo,
          creatoDaNome: io!.nome,
        }))
      : [
          {
            utenteId: utente.id,
            utenteNome: utente.nome,
            giorno: g,
            tipo: 'riposo',
            dalle: '',
            alle: '',
            motivo,
            creatoDaNome: io!.nome,
          },
        ]
    await db.eccezioneTurno.createMany({ data: righe, skipDuplicates: true })
    return NextResponse.json(await leggiTurni(c.dal))
  }

  // ── Un giorno singolo, alla vecchia maniera (una fascia per volta) ──
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

  // ⚠️⚠️ Un giorno non può essere insieme «non lavora» e «lavora dalle…».
  // Scrivere un orario toglie il riposo, e scrivere un riposo toglie gli orari:
  // senza questo in tabella resterebbero righe che si contraddicono, e
  // `turniDelGiorno` ne userebbe una sola — con l'altra a fare da mina per
  // chiunque legga la tabella dopo.
  if (tipo === 'orario') {
    await db.eccezioneTurno.deleteMany({ where: { utenteId: utente.id, giorno, tipo: 'riposo' } })
  } else {
    await db.eccezioneTurno.deleteMany({ where: { utenteId: utente.id, giorno, tipo: 'orario' } })
  }

  await db.eccezioneTurno.upsert({
    where: { utenteId_giorno_dalle_alle: { utenteId: utente.id, giorno, dalle, alle } },
    update: { tipo, creatoDaNome: io!.nome },
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
  return NextResponse.json(await leggiTurni(c.dal))
}

/**
 * Cambia le ore (o il motivo) di un turno che c'è già.
 *
 * ⚠️ Serve perché gli orari si scrivono **dentro la riga del giorno**, come
 * negli orari di apertura: senza, per spostare un turno di mezz'ora bisogna
 * cancellarlo e rifarlo, che è il gesto che la pagina vuole togliere di mezzo.
 */
export async function PATCH(req: NextRequest) {
  // ⚠️ Chi sei: il middleware controlla la FIRMA del cookie, non che
  // l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { errore } = await admin()
  if (errore) return errore

  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    cosa?: 'settimana' | 'eccezione'
    dalle?: string
    alle?: string
    motivo?: string
    dal?: string
  }
  if (!c.id) return NextResponse.json({ errore: 'Manca l’id.' }, { status: 400 })

  // ── Solo il motivo («ferie», «visita») ──
  // ⚠️ Prima di tutto il resto: un motivo non è un orario e non va fatto
  // passare da `controllaFascia`, che lo rifiuterebbe.
  if (typeof c.motivo === 'string' && c.dalle === undefined) {
    await db.eccezioneTurno.updateMany({ where: { id: c.id }, data: { motivo: c.motivo.trim() } })
    return NextResponse.json(await leggiTurni(c.dal))
  }

  const male = controllaFascia(c.dalle ?? '', c.alle ?? '')
  if (male) return NextResponse.json({ errore: male }, { status: 400 })

  // ── Le ore di un giorno di una settimana sola ──
  if (c.cosa === 'eccezione') {
    const e = await db.eccezioneTurno.findUnique({ where: { id: c.id } })
    if (!e) return NextResponse.json(await leggiTurni(c.dal))
    const gemella = await db.eccezioneTurno.findFirst({
      where: {
        utenteId: e.utenteId,
        giorno: e.giorno,
        dalle: c.dalle!,
        alle: c.alle!,
        id: { not: e.id },
      },
    })
    if (gemella) await db.eccezioneTurno.deleteMany({ where: { id: e.id } })
    else await db.eccezioneTurno.update({ where: { id: e.id }, data: { dalle: c.dalle!, alle: c.alle! } })
    return NextResponse.json(await leggiTurni(c.dal))
  }

  const esistente = await db.turnoSettimanale.findUnique({ where: { id: c.id } })
  if (!esistente) return NextResponse.json(await leggiTurni(c.dal))

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

  return NextResponse.json(await leggiTurni(c.dal))
}

export async function DELETE(req: NextRequest) {
  // ⚠️ Chi sei: il middleware controlla la FIRMA del cookie, non che
  // l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { errore } = await admin()
  if (errore) return errore

  const p = req.nextUrl.searchParams
  const cosa = p.get('cosa')
  const dal = p.get('dal') ?? undefined
  const utenteId = p.get('utenteId') ?? ''

  // ── Chiudere un giorno della regola che si ripete ──
  // ⚠️ Una chiamata sola e non una per fascia: con due o tre richieste in
  // parallelo, ognuna che risponde con lo stato completo, l'ultima che arriva
  // vince — e il giorno resterebbe mezzo aperto a schermo, con la pagina che
  // dice una cosa e il database un'altra.
  if (cosa === 'giorno') {
    const giorno = Number(p.get('giorno'))
    if (!utenteId || !Number.isInteger(giorno) || giorno < 1 || giorno > 7) {
      return NextResponse.json({ errore: 'Giorno non valido.' }, { status: 400 })
    }
    await db.turnoSettimanale.deleteMany({ where: { utenteId, giorno } })
    return NextResponse.json(await leggiTurni(dal))
  }

  // ── «Torna al solito»: quel giorno smette di fare eccezione ──
  // ⚠️ Si tolgono TUTTE le righe di quella persona in quella data, non una: un
  // giorno può avere due fasce, e lasciarne mezza darebbe un giorno che non è
  // né quello di sempre né quello scritto.
  if (cosa === 'data') {
    const giorno = p.get('giorno') ?? ''
    if (!utenteId || !giornoValido(giorno)) {
      return NextResponse.json({ errore: 'Giorno non valido.' }, { status: 400 })
    }
    await db.eccezioneTurno.deleteMany({ where: { utenteId, giorno } })
    return NextResponse.json(await leggiTurni(dal))
  }

  const id = p.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Manca l’id.' }, { status: 400 })

  // ⚠️ `deleteMany` con l'id: se la riga è già stata tolta da un altro
  // amministratore, non deve schiantarsi — la pagina si limita a ricaricare e
  // quella riga non c'è più, che è esattamente il risultato voluto.
  if (cosa === 'settimana') await db.turnoSettimanale.deleteMany({ where: { id } })
  else await db.eccezioneTurno.deleteMany({ where: { id } })

  return NextResponse.json(await leggiTurni(dal))
}
