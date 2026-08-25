import { db } from './db'
import { leggiImpostazioni } from './impostazioni'
import { inviaSulCanale } from './invio'
import { suggerisciRisposta } from './ai'
import { linguaDelTesto } from './lingua-testo'
import { avvisaAmministratore } from './aiuto-whatsapp'
import { giornoSettimana, inMinuti, turniDelGiorno, type EsitoTurni } from './turni'

// QUANDO NON C'È NESSUNO, RISPONDE L'AI — E SE HA DUBBI CHIEDE.
//
// Chiesto dall'utente il 25/08/2026: «quando non c'è nessuno sul cs attivo come
// operatore tutte le risposte vengono fornite dall'AI e in caso di dubbi come
// rispondere chiede informazioni a +393498853209».
//
// ⚠️⚠️ QUESTA È L'UNICA PARTE DELL'APP CHE PARLA AL CLIENTE SENZA CHE UNA
// PERSONA ABBIA PREMUTO. Per questo ha quattro serrature, e vanno lasciate:
//
//  1. un INTERRUTTORE in Impostazioni (`aiFuoriTurnoAttivo`), spento di suo:
//     una funzione così non deve accendersi da sola con un deploy;
//  2. solo FUORI TURNO: se c'è anche una sola persona in servizio, non parte —
//     due risposte diverse allo stesso cliente sono peggio di una tardiva;
//  3. solo su conversazioni che NON ha preso nessuno e in cui l'ultimo
//     messaggio è del cliente;
//  4. un TETTO di risposte automatiche per conversazione: se il cliente
//     continua a scrivere e l'AI continua a rispondere, il problema non è la
//     velocità — è che serve una persona.
//
// ⚠️⚠️ E il DUBBIO non si nasconde. `suggerisciRisposta` può rispondere «nessuno
// script adatto»: quello è il momento in cui l'app **non sa** cosa dire, e
// inventare sarebbe il danno peggiore. Lì non si scrive al cliente: si chiede
// all'amministratore su WhatsApp (`aiuto-whatsapp.ts`, che manda al numero
// predefinito +39 349 885 3209) e si aspetta una persona.

/** I canali su cui ha senso rispondere da soli. */
const CANALI = ['whatsapp', 'instagram', 'messenger', 'email', 'widget']

/** Quante conversazioni al massimo per giro: un cron non deve diventare un invio di massa. */
const PER_GIRO = 10

/** Quante risposte automatiche al massimo su una conversazione, in tutto. */
const TETTO_PER_CONVERSAZIONE = 3

/**
 * Da quanto può essere vecchio il messaggio del cliente perché valga la pena
 * rispondere da soli.
 *
 * ⚠️ Non è solo buon senso: su WhatsApp fuori dalle 24 ore Meta rifiuta il testo
 * libero (errore 131047). Rispondere a un messaggio di tre giorni fa fallirebbe,
 * e il fallimento resterebbe scritto in chat come un errore rosso.
 */
const ORE_UTILI = 20

export type EsitoGiro = {
  /** Perché non è partito niente, quando non parte niente. */
  fermo: string
  /** Chi risulta in turno adesso (se c'è qualcuno, il giro non parte). */
  inTurno: string[]
  risposte: number
  domande: number
  saltate: number
  /** Una riga per conversazione toccata: serve a capire cosa ha fatto. */
  righe: string[]
}

/**
 * L'ora di ROMA, non quella del server.
 *
 * ⚠️⚠️ I turni sono scritti «09:00 – 18:00» e li legge una persona che vive in
 * Italia. Un cron su Vercel gira in UTC: d'estate calcolerebbe le 07:00 quando
 * qui sono le 09:00, cioè direbbe «non c'è nessuno» proprio mentre il turno è
 * appena cominciato — e l'AI si metterebbe a rispondere sopra a chi lavora.
 */
export function adessoARoma(adesso: Date): { giorno: string; settimana: number; minuti: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(adesso)
  const pezzo = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  const giorno = `${pezzo('year')}-${pezzo('month')}-${pezzo('day')}`
  // ⚠️ Il giorno della settimana si ricava dalla data ROMANA appena costruita,
  // non da `adesso.getDay()`: a mezzanotte passata di un'ora sono due giorni
  // diversi, e il turno del lunedì verrebbe cercato di domenica.
  const settimana = giornoSettimana(new Date(`${giorno}T12:00:00Z`))
  const minuti = inMinuti(`${pezzo('hour')}:${pezzo('minute')}`)
  return { giorno, settimana, minuti }
}

/** Chi è in servizio adesso, per nome. Vuoto = non c'è nessuno. */
export async function chiEInTurno(adesso = new Date()): Promise<string[]> {
  const ora = adessoARoma(adesso)
  const [turni, eccezioni] = await Promise.all([
    db.turnoSettimanale.findMany(),
    db.eccezioneTurno.findMany({ where: { giorno: ora.giorno } }),
  ])
  const esito: EsitoTurni = {
    // ⚠️ Gli operatori qui non servono: `turniDelGiorno` guarda solo turni ed
    // eccezioni. Si passa la lista vuota invece di caricarli per niente.
    operatori: [],
    turni: turni.map((t) => ({
      id: t.id,
      utenteId: t.utenteId,
      utenteNome: t.utenteNome,
      giorno: t.giorno,
      dalle: t.dalle,
      alle: t.alle,
    })),
    eccezioni: eccezioni.map((e) => ({
      id: e.id,
      utenteId: e.utenteId,
      utenteNome: e.utenteNome,
      giorno: e.giorno,
      tipo: e.tipo as 'riposo' | 'orario',
      dalle: e.dalle,
      alle: e.alle,
      motivo: e.motivo,
      creatoDaNome: e.creatoDaNome ?? '',
    })),
  }
  return turniDelGiorno(esito, ora.giorno, ora.settimana)
    .filter((t) => ora.minuti >= inMinuti(t.dalle) && ora.minuti < inMinuti(t.alle))
    .map((t) => t.nome)
}

/**
 * Il giro: legge le conversazioni lasciate a metà e risponde, o chiede aiuto.
 *
 * ⚠️ `prova: true` fa tutto tranne mandare: serve a guardarlo lavorare senza
 * scrivere a nessun cliente. È il modo in cui questa funzione va provata la
 * prima volta, e resta il modo di controllarla dopo un cambio.
 */
export async function giroAiFuoriTurno(opz: { prova?: boolean } = {}): Promise<EsitoGiro> {
  const vuoto: EsitoGiro = { fermo: '', inTurno: [], risposte: 0, domande: 0, saltate: 0, righe: [] }

  const conf = await leggiImpostazioni(['aiFuoriTurnoAttivo'])
  if (conf.aiFuoriTurnoAttivo !== 'si') {
    return { ...vuoto, fermo: 'Le risposte automatiche fuori turno sono spente (Impostazioni).' }
  }

  const inTurno = await chiEInTurno()
  if (inTurno.length > 0) {
    // ⚠️ Non è un errore: è la regola. Si dice chi c'è, così chi legge il log
    // non va a cercare un guasto.
    return { ...vuoto, inTurno, fermo: `C'è chi lavora: ${inTurno.join(', ')}.` }
  }

  const limite = new Date(Date.now() - ORE_UTILI * 3600 * 1000)
  const conversazioni = await db.conversazione.findMany({
    where: {
      canale: { in: CANALI },
      archiviata: false,
      eliminataIl: null,
      // ⚠️ Chi ha preso in carico una conversazione se ne sta occupando, magari
      // dal telefono e fuori orario: l'AI non gli scrive sopra.
      presaDaId: '',
      nonLetti: { gt: 0 },
      ultimoMessaggioIl: { gte: limite },
    },
    orderBy: { ultimoMessaggioIl: 'asc' },
    take: PER_GIRO,
  })

  const esito: EsitoGiro = { ...vuoto, inTurno }
  if (conversazioni.length === 0) {
    esito.fermo = 'Nessuna conversazione che aspetta una risposta.'
    return esito
  }

  const script = await db.script.findMany({
    where: { attivo: true },
    select: { id: true, titolo: true, categoria: true, testo: true, quando: true },
    orderBy: { usi: 'desc' },
    take: 60,
  })
  if (script.length === 0) {
    esito.fermo = 'Non c’è nessuna risposta pronta da cui attingere: l’AI non inventa.'
    return esito
  }

  for (const c of conversazioni) {
    const nome = c.nome || c.idEsterno
    const ultimo = await db.messaggio.findFirst({
      where: { conversazioneId: c.id },
      orderBy: { creatoIl: 'desc' },
    })
    // ⚠️ Se l'ultimo messaggio è NOSTRO, qualcuno (o l'AI) ha già risposto: il
    // cliente aspetta lui, non noi.
    if (!ultimo || ultimo.direzione !== 'in') {
      esito.saltate++
      esito.righe.push(`${nome}: ha già una risposta in fondo`)
      continue
    }

    const giaFatte = await db.messaggio.count({
      where: { conversazioneId: c.id, direzione: 'out', tipo: 'ai' },
    })
    if (giaFatte >= TETTO_PER_CONVERSAZIONE) {
      esito.saltate++
      esito.righe.push(`${nome}: già ${giaFatte} risposte automatiche, qui serve una persona`)
      continue
    }

    // ⚠️ Se una domanda su questa conversazione è già aperta, non se ne fa
    // un'altra: l'amministratore riceverebbe lo stesso dubbio ogni cinque
    // minuti, e dopo tre volte smetterebbe di guardare gli avvisi.
    const domandaAperta = await db.domandaAiuto.findFirst({
      where: { conversazioneId: c.id, stato: 'aperta' },
    })
    if (domandaAperta) {
      esito.saltate++
      esito.righe.push(`${nome}: c’è già una domanda aperta all’amministratore`)
      continue
    }

    const testo = (ultimo.testo ?? '').trim()
    if (!testo) {
      esito.saltate++
      esito.righe.push(`${nome}: l’ultimo messaggio non ha testo (foto o allegato)`)
      continue
    }
    const lingua = ultimo.lingua || linguaDelTesto(testo)
    const brand = c.negozioId
      ? await db.negozioShopify.findUnique({
          where: { id: c.negozioId },
          select: { id: true, nome: true },
        })
      : null

    const proposta = await suggerisciRisposta(
      testo,
      script,
      c.canale === 'email' ? 'email' : 'chat',
      brand,
      lingua
    )
    if (proposta.stato !== 'ok') {
      esito.saltate++
      esito.righe.push(
        `${nome}: l’AI non ha risposto (${proposta.stato === 'errore' ? proposta.messaggio : 'chiave OpenAI mancante'})`
      )
      continue
    }

    // ── IL DUBBIO ──
    //
    // ⚠️⚠️ «Nessuno script adatto» non è un fallimento da nascondere: è l'app che
    // dice «questa non la so». Si chiede a una persona invece di inventare, ed è
    // la ragione per cui questa funzione può stare accesa di notte.
    if (!proposta.suggerimento) {
      esito.domande++
      esito.righe.push(`${nome}: dubbio → chiedo all’amministratore`)
      if (opz.prova) continue
      const domanda = await db.domandaAiuto.create({
        data: {
          testo:
            `Fuori turno, non so come rispondere a ${nome} su ${c.canale}.\n\n` +
            `Ha scritto: «${testo.slice(0, 400)}»`,
          pagina: '/inbox',
          ordineNumero: c.ordineNumero ?? '',
          conversazioneId: c.id,
          // ⚠️ Il nome dice che non è un collega ad aver chiesto: chi risponde
          // deve sapere che dall'altra parte non c'è nessuno che aspetta al
          // computer, e che il cliente non ha ancora ricevuto niente.
          utenteNome: 'AI fuori turno',
        },
      })
      await avvisaAmministratore(domanda.id)
      continue
    }

    const rispostaTesto = proposta.suggerimento.risposta.trim()
    if (!rispostaTesto) {
      esito.saltate++
      esito.righe.push(`${nome}: la risposta proposta era vuota`)
      continue
    }
    esito.risposte++
    esito.righe.push(`${nome}: rispondo con «${proposta.suggerimento.titolo}»`)
    if (opz.prova) continue

    const inviata = await inviaSulCanale(c, rispostaTesto)
    // ⚠️ Anche l'invio fallito si registra, col motivo: una risposta che non è
    // partita deve VEDERSI in chat come un errore. Sparendo, l'operatore
    // crederebbe che il cliente sia stato servito.
    await db.messaggio.create({
      data: {
        conversazioneId: c.id,
        direzione: 'out',
        tipo: 'ai',
        // ⚠️ Il nome si scrive: nel filo dev'essere evidente che ha risposto
        // l'app e non un collega, o domani nessuno saprà perché a quel cliente
        // è stata detta quella cosa.
        utenteNome: 'AI (fuori turno)',
        testo: rispostaTesto,
        idEsterno: inviata.ok ? inviata.idEsterno : '',
        stato: inviata.ok ? 'inviato' : 'errore',
        errore: inviata.ok ? '' : inviata.errore,
      },
    })
    if (!inviata.ok) {
      esito.risposte--
      esito.saltate++
      esito.righe[esito.righe.length - 1] = `${nome}: invio fallito — ${inviata.errore}`
    }
    // ⚠️⚠️ `nonLetti` NON si azzera: la conversazione deve restare da leggere
    // per la persona che arriva domattina. L'AI ha tamponato, non ha chiuso — e
    // una chat che sparisce dai non letti è una chat che nessuno rilegge.
  }

  return esito
}
