import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  categoriaValida,
  marchiSiSovrappongono,
  marchiScritti,
  testoDaScrivere,
  type PropostaDto,
  type VoceDto,
} from '@/lib/glossario'
import { leggiQuotaFornitore } from '@/lib/orders'
import { giroGlossario } from '@/lib/glossario-ai'
import { utenteCorrente } from '@/lib/sessione'

/**
 * Come siamo fatti: la parte del glossario che **non si scrive**.
 *
 * ⚠️ Letta dalla configurazione a ogni apertura, apposta. Sono i dati che
 * cambiano da soli quando qualcuno collega un numero o una casella: scritti a
 * mano invecchierebbero in silenzio, e un glossario che invecchia è peggio di
 * un glossario che manca — perché a quello ci si crede.
 */
type FattoDiSistema = { voce: string; valore: string }
type BrandDiSistema = { nome: string; fatti: FattoDiSistema[] }

async function comeSiamoFatti(): Promise<{
  brand: BrandDiSistema[]
  globali: FattoDiSistema[]
}> {
  const [negozi, numeri, pagine, caselle, siti, quota] = await Promise.all([
    db.negozioShopify.findMany({ orderBy: { nome: 'asc' } }),
    db.numeroWhatsApp.findMany(),
    db.paginaMeta.findMany(),
    db.casellaEmail.findMany(),
    db.widgetSito.findMany(),
    // ⚠️ La quota è di Deluxy Orders e si chiede a lui: qui non si ricopia.
    leggiQuotaFornitore(),
  ])

  const brand: BrandDiSistema[] = negozi.map((n) => {
    const fatti: FattoDiSistema[] = [{ voce: 'Negozio Shopify', valore: n.dominio }]
    if (n.prefisso) fatti.push({ voce: 'Sigla in rubrica', valore: n.prefisso })
    const wa = numeri.filter((x) => x.negozioId === n.id)
    for (const w of wa) {
      fatti.push({ voce: 'WhatsApp', valore: w.numeroVisibile || w.nome || w.phoneNumberId })
    }
    for (const p of pagine.filter((x) => x.negozioId === n.id)) {
      fatti.push({ voce: p.canale === 'instagram' ? 'Instagram' : 'Messenger', valore: p.riferimento || p.idPagina })
    }
    for (const c of caselle.filter((x) => x.negozioId === n.id)) {
      fatti.push({ voce: 'Casella email', valore: c.indirizzo + (c.predefinita ? ' (predefinita)' : '') })
    }
    for (const s of siti.filter((x) => x.negozioId === n.id)) {
      fatti.push({
        voce: 'Sito col widget',
        valore: `${s.dominio}${s.attivo ? '' : ' — spento'}${s.apreSulSito ? '' : ' · il link porta alla chat a pagina intera'}`,
      })
    }
    return { nome: n.nome, fatti }
  })

  const globali: FattoDiSistema[] = []
  if (quota) {
    globali.push({
      voce: 'Quota del fornitore',
      valore: `${quota.quota}% del valore dell'ordine, indicativa e uguale per tutti — si cambia in ${quota.dove}`,
    })
  }
  const senzaBrand = [
    ...numeri.filter((x) => !x.negozioId).map((x) => `WhatsApp ${x.numeroVisibile || x.nome}`),
    ...caselle.filter((x) => !x.negozioId).map((x) => `casella ${x.indirizzo}`),
    ...pagine.filter((x) => !x.negozioId).map((x) => `account ${x.riferimento || x.idPagina}`),
  ]
  // ⚠️ Un canale senza brand non è un dettaglio: le sue conversazioni finiscono
  // in «Senza marchio» e l'AI risponde senza sapere per chi parla. Va detto qui
  // invece di lasciarlo scoprire a chi legge una colonna strana.
  if (senzaBrand.length) {
    globali.push({
      voce: 'Canali senza un brand collegato',
      valore: `${senzaBrand.join(', ')} — le loro conversazioni finiscono in «Senza marchio»`,
    })
  }
  return { brand, globali }
}

async function leggiGlossario(): Promise<{
  voci: VoceDto[]
  proposte: PropostaDto[]
  negozi: { id: string; nome: string }[]
}> {
  const [voci, proposte, negozi] = await Promise.all([
    db.voceGlossario.findMany({ orderBy: [{ termine: 'asc' }] }),
    db.propostaGlossario.findMany({ where: { stato: 'aperta' }, orderBy: { creatoIl: 'desc' } }),
    db.negozioShopify.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
  ])
  const nomi = new Map(negozi.map((n) => [n.id, n.nome]))
  return {
    negozi,
    voci: voci.map((v) => ({
      id: v.id,
      termine: v.termine,
      definizione: v.definizione,
      categoria: v.categoria,
      negoziIds: v.negoziIds,
      negoziNomi: v.negoziIds.map((id) => nomi.get(id) ?? id),
      fonte: v.fonte,
      conversazioneId: v.conversazioneId,
      autoreNome: v.autoreNome,
      aggiornatoIl: v.aggiornatoIl.toISOString(),
    })),
    proposte: proposte.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      voceId: p.voceId,
      termine: p.termine,
      definizione: p.definizione,
      categoria: p.categoria,
      negozioId: p.negozioId,
      negozioNome: p.negozioId ? (nomi.get(p.negozioId) ?? '') : '',
      perche: p.perche,
      conversazioneId: p.conversazioneId,
      creatoIl: p.creatoIl.toISOString(),
    })),
  }
}

/**
 * La voce su cui scrivere, quando ne esiste già una che si sovrappone.
 *
 * ⚠️⚠️ Il vincolo di unicità su (termine, marchio) è caduto col passaggio ai
 * marchi multipli: due voci con lo stesso termine e marchi DIVERSI sono
 * legittime — «consegna gratuita» può dire una cosa per Cake e un'altra per
 * Deluxy. Quello che non va bene è che si SOVRAPPONGANO: allora chi legge il
 * glossario trova due risposte alla stessa domanda per lo stesso marchio, e non
 * sa quale vale. Prima lo impediva il database; adesso lo controlliamo qui, che
 * è più preciso — e soprattutto sa dire PERCHÉ.
 */
async function voceCheSiSovrappone(
  termine: string,
  negoziIds: string[],
  escludiId = ''
): Promise<{ id: string; negoziIds: string[] } | null> {
  const stesse = await db.voceGlossario.findMany({
    where: { termine, ...(escludiId ? { NOT: { id: escludiId } } : {}) },
    select: { id: true, negoziIds: true },
  })
  return stesse.find((v) => marchiSiSovrappongono(v.negoziIds, negoziIds)) ?? null
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function chi() {
  const io = await utenteCorrente()
  if (!io) return { errore: NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 }) }
  return { io }
}

// Il glossario, le proposte aperte e «come siamo fatti» (letto dalla config).
export async function GET() {
  const { errore } = await chi()
  if (errore) return errore
  const [dati, sistema] = await Promise.all([leggiGlossario(), comeSiamoFatti()])
  return NextResponse.json({ ...dati, sistema })
}

type Corpo = {
  azione?: 'salva' | 'accetta' | 'scarta' | 'giro'
  id?: string
  termine?: string
  definizione?: string
  categoria?: string
  /** I marchi scelti. Lista VUOTA = tutti; assente = non toccare. */
  negoziIds?: string[]
}


export async function POST(req: NextRequest) {
  const { io, errore } = await chi()
  if (errore) return errore
  const c = (await req.json().catch(() => ({}))) as Corpo

  // ── Il giro dell'AI, a mano ──
  // ⚠️ Esiste perché il cron gira alle 5:40 e chi vuole provarlo adesso non
  // deve aspettare domani. Fa esattamente la stessa cosa: propone, non scrive.
  if (c.azione === 'giro') {
    const esito = await giroGlossario()
    const dati = await leggiGlossario()
    return NextResponse.json({ ...dati, esitoGiro: esito })
  }

  // ── Accettare o scartare una proposta ──
  if (c.azione === 'accetta' || c.azione === 'scarta') {
    const p = c.id ? await db.propostaGlossario.findUnique({ where: { id: c.id } }) : null
    if (!p) return NextResponse.json({ errore: 'Proposta non trovata.' }, { status: 404 })

    const scritto = testoDaScrivere(p, c)
    if (c.azione === 'accetta') {
      // ⚠️ Una voce nata da una proposta CORRETTA a mano non è «proposta
      // dall'AI»: è a metà, e si dice. Un'etichetta che si prende il merito di
      // una frase riscritta da una persona falsa il conto di quanto l'AI ci
      // prende.
      const fonte = scritto.corretta ? 'ai-corretta' : 'ai'
      // ⚠️ Un «avviso» non è una voce: è una cosa da sapere, non da scrivere in
      // glossario. Accettarlo vuol dire «l'ho letto», e sparisce dall'elenco.
      if (p.tipo === 'correzione' && p.voceId) {
        // ⚠️ `updateMany`: se la voce è stata cancellata nel frattempo non si
        // schianta — la correzione semplicemente non ha più un bersaglio.
        await db.voceGlossario.updateMany({
          where: { id: p.voceId },
          data: {
            definizione: scritto.definizione,
            fonte,
            conversazioneId: p.conversazioneId,
            autoreNome: io!.nome,
          },
        })
      } else if (p.tipo === 'aggiunta') {
        // ⚠️ I marchi sono quelli DECISI accettando, non quello proposto: chi
        // legge la conversazione si accorge che «la consegna è gratuita» vale
        // per due negozi su tre, e deve poterlo dire prima di scrivere in
        // glossario una promessa che gli operatori poi ripetono a tutti.
        const esistente = await voceCheSiSovrappone(scritto.termine, scritto.negoziIds)
        if (esistente) {
          await db.voceGlossario.update({
            where: { id: esistente.id },
            data: {
              definizione: scritto.definizione,
              categoria: scritto.categoria,
              // ⚠️ I marchi si AGGIORNANO: accettando «vale anche per Cake» la
              // voce che c'era deve allargarsi, non restare com'era mentre la
              // proposta risulta accettata.
              negoziIds: scritto.negoziIds,
              fonte,
              conversazioneId: p.conversazioneId,
              autoreNome: io!.nome,
            },
          })
        } else {
          await db.voceGlossario.create({
            data: {
              termine: scritto.termine,
              definizione: scritto.definizione,
              categoria: scritto.categoria,
              negoziIds: scritto.negoziIds,
              fonte,
              conversazioneId: p.conversazioneId,
              autoreNome: io!.nome,
            },
          })
        }
      }
    }

    await db.propostaGlossario.update({
      where: { id: p.id },
      data: {
        stato: c.azione === 'accetta' ? 'accettata' : 'scartata',
        decisaDaNome: io!.nome,
        decisaIl: new Date(),
        // ⚠️ `termine` e `definizione` NON si toccano: restano la proposta
        // originale, che è la prova di che cosa aveva detto l'AI. Quello che si
        // è deciso di scrivere va accanto.
        corretta: c.azione === 'accetta' && scritto.corretta,
        termineAccettato: c.azione === 'accetta' && scritto.corretta ? scritto.termine : '',
        definizioneAccettata:
          c.azione === 'accetta' && scritto.corretta ? scritto.definizione : '',
        // ⚠️ Anche i marchi decisi si archiviano: restringere o allargare una
        // voce cambia il senso di quella frase quanto riscriverla, e senza
        // questo campo l'archivio non saprebbe dire che cosa è stato cambiato.
        negoziAccettati: c.azione === 'accetta' && scritto.corretta ? scritto.negoziIds : [],
      },
    })
    return NextResponse.json(await leggiGlossario())
  }

  // ── Scrivere o correggere una voce a mano ──
  const termine = (c.termine ?? '').trim()
  const definizione = (c.definizione ?? '').trim()
  if (!termine || !definizione) {
    return NextResponse.json({ errore: 'Servono il termine e la spiegazione.' }, { status: 400 })
  }
  const categoria = categoriaValida(c.categoria ?? '') ? c.categoria! : 'cliente'
  // ⚠️ Lista vuota = «vale per tutti i marchi». Vedi `valePerTutti` in
  // src/lib/glossario.ts: è il contrario di quello che verrebbe da pensare
  // guardando un array vuoto, ed è la cosa da non sbagliare qui.
  const negoziIds = [
    ...new Set((c.negoziIds ?? []).map((x) => (x ?? '').trim()).filter(Boolean)),
  ]

  if (c.id) {
    // ⚠️ Un doppione si dice PRIMA di scrivere, e si dice con nomi e cognomi:
    // «esiste già» senza dire quale e per quale marchio costringe a cercarlo a
    // mano fra le voci, e chi lo cerca finisce per crearne un altro.
    const scontro = await voceCheSiSovrappone(termine, negoziIds, c.id)
    if (scontro) {
      const nomi = new Map(
        (await db.negozioShopify.findMany({ select: { id: true, nome: true } })).map((n) => [
          n.id,
          n.nome,
        ])
      )
      return NextResponse.json(
        {
          errore: `C'è già una voce «${termine}» per ${marchiScritti(scontro.negoziIds, nomi)}: correggi quella, oppure scegli marchi diversi.`,
        },
        { status: 409 }
      )
    }
    await db.voceGlossario.updateMany({
      where: { id: c.id },
      data: { termine, definizione, categoria, negoziIds, autoreNome: io!.nome },
    })
  } else {
    // ⚠️ Se ne esiste già una che si sovrappone si AGGIORNA quella: riscrivere
    // un termine che c'è già è una correzione, non un errore da mostrare. Con un
    // create secco la pagina direbbe «esiste già» a chi sta solo aggiornando una
    // definizione.
    const esistente = await voceCheSiSovrappone(termine, negoziIds)
    if (esistente) {
      await db.voceGlossario.update({
        where: { id: esistente.id },
        data: { definizione, categoria, negoziIds, autoreNome: io!.nome },
      })
    } else {
      await db.voceGlossario.create({
        data: { termine, definizione, categoria, negoziIds, fonte: 'persona', autoreNome: io!.nome },
      })
    }
  }
  return NextResponse.json(await leggiGlossario())
}

export async function DELETE(req: NextRequest) {
  const { errore } = await chi()
  if (errore) return errore
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Manca l’id.' }, { status: 400 })
  // ⚠️ `deleteMany` con l'id: se un collega l'ha già tolta, non si schianta.
  await db.voceGlossario.deleteMany({ where: { id } })
  return NextResponse.json(await leggiGlossario())
}
