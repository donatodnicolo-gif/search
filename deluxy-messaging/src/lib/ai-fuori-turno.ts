import { db } from './db'
import { leggiImpostazioni, salvaImpostazione } from './impostazioni'
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

/**
 * Quante conversazioni al massimo si LAVORANO per giro (cioè quante chiamate
 * all'AI): un cron non deve diventare un invio di massa.
 *
 * ⚠️ Non è quante se ne guardano. Vedi il `take` nella query: gli scarti si
 * contano dopo, o le conversazioni bloccate mangiano i posti dei clienti veri.
 */
const PER_GIRO = 10

/**
 * L'indirizzo dichiara che dall'altra parte non c'è nessuno?
 *
 * ⚠️⚠️ Non è un filtro antispam e non giudica il contenuto: guarda solo la parte
 * prima della chiocciola, e riconosce le caselle che **per convenzione** non
 * ricevono risposte. Rispondere lì non fallisce nemmeno con un errore: il
 * messaggio parte e non lo legge nessuno.
 *
 * ⚠️ Volutamente CORTA e ancorata: `noreply` sì, ma una `no.reply.marketing@…`
 * no e va bene così — sbagliare in questo verso costa una domanda in più
 * all'amministratore, sbagliare nell'altro vuol dire non rispondere a un
 * cliente che si chiama `norberto@…`.
 */
export function casellaSenzaNessuno(indirizzo: string): boolean {
  const a = (indirizzo ?? '').trim().toLowerCase()
  const locale = a.includes('@') ? a.slice(0, a.indexOf('@')) : a
  if (!locale) return false
  const SENZA_NESSUNO = [
    'mailer-daemon',
    'postmaster',
    'no-reply',
    'noreply',
    'donotreply',
    'do-not-reply',
    'bounce',
    'bounces',
    'mailer',
    'notifications',
    'notification',
    'automated',
  ]
  // ⚠️ Uguaglianza o prefisso staccato da un separatore: «noreply» e
  // «noreply-123» sì, «norbertoreply» no.
  return SENZA_NESSUNO.some((s) => locale === s || locale.startsWith(`${s}-`) || locale.startsWith(`${s}.`) || locale.startsWith(`${s}+`))
}

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
 * Quante ore alla settimana risultano coperte dalla griglia dei turni.
 *
 * ⚠️⚠️ SERVE A NON ACCENDERE UNA COSA CHE NON SI È CAPITA. Misurato il
 * 25/08/2026: in griglia c'erano **4 fasce, tutte di sabato e domenica** — 12
 * ore su 168. Accendendo le risposte automatiche in quel momento, l'AI avrebbe
 * risposto ai clienti **per 156 ore a settimana**, lunedì mattina compreso,
 * mentre le persone erano al lavoro: non perché qualcuno l'avesse deciso, ma
 * perché il loro orario non era scritto da nessuna parte.
 *
 * Il numero si mostra accanto all'interruttore: chi accende deve vedere quante
 * ore sta consegnando all'AI, non scoprirlo dai messaggi partiti.
 */
export async function copertura(): Promise<{ ore: number; fasce: number; scoperte: number }> {
  const turni = await db.turnoSettimanale.findMany()
  return { ...oreCoperte(turni), fasce: turni.length }
}

/**
 * Le ore davvero coperte: gli intervalli si **UNISCONO**, non si sommano.
 *
 * ⚠️⚠️ Prima era una somma di durate, e due operatori nella stessa fascia
 * contavano due volte. Rifatti i conti: 3 operatori lunedì-venerdì 09-18
 * davano «135 ore coperte, **33 scoperte**» quando le ore davvero scoperte sono
 * **123**; con 5 operatori usciva «**−57** ore scoperte».
 *
 * ⚠️⚠️ E l'errore andava **sempre nella stessa direzione**: far sembrare la
 * griglia più coperta di quanto sia. Questo numero è l'unica cosa che una
 * persona legge **prima di accendere** l'unica funzione dell'app che scrive ai
 * clienti da sola, e la soglia rossa scatta sopra le 100 ore scoperte: con tre
 * operatori diceva 33 in nero invece di 123 in rosso.
 *
 * ⚠️ Le fasce si uniscono **per giorno**: due turni dello stesso giorno che si
 * accavallano diventano uno solo; giorni diversi non si toccano mai.
 */
export function oreCoperte(
  turni: { giorno: number; dalle: string; alle: string }[]
): { ore: number; scoperte: number } {
  const perGiorno = new Map<number, [number, number][]>()
  for (const t of turni) {
    const a = inMinuti(t.dalle)
    const b = inMinuti(t.alle)
    // Una fascia che finisce prima di cominciare non copre niente.
    if (!(b > a)) continue
    const elenco = perGiorno.get(t.giorno) ?? []
    elenco.push([a, b])
    perGiorno.set(t.giorno, elenco)
  }
  let minuti = 0
  for (const fasce of perGiorno.values()) {
    fasce.sort((x, y) => x[0] - y[0])
    let [da, a] = fasce[0]
    for (const [x, y] of fasce.slice(1)) {
      // ⚠️ `<=` e non `<`: due fasce attaccate (09-12 e 12-18) sono una sola
      // copertura continua, non due con un buco di zero minuti in mezzo.
      if (x <= a) a = Math.max(a, y)
      else {
        minuti += a - da
        da = x
        a = y
      }
    }
    minuti += a - da
  }
  const ore = minuti / 60
  return {
    ore: Math.round(ore * 10) / 10,
    // ⚠️ Mai negativo: con una griglia strana, un numero sotto zero a schermo
    // fa dubitare di tutta la pagina.
    scoperte: Math.round(Math.max(0, 168 - ore) * 10) / 10,
  }
}

/**
 * Il giro: legge le conversazioni lasciate a metà e risponde, o chiede aiuto.
 *
 * ⚠️ `prova: true` fa tutto tranne mandare: serve a guardarlo lavorare senza
 * scrivere a nessun cliente. È il modo in cui questa funzione va provata la
 * prima volta, e resta il modo di controllarla dopo un cambio.
 */
/** Dove si scrive com'è andato l'ultimo giro. */
export const CHIAVE_ULTIMO = 'aiFuoriTurnoUltimo'
export const CHIAVE_ESITO = 'aiFuoriTurnoEsito'

/** Una riga sola che dice cosa ha fatto il giro: è quella che si legge in inbox. */
export function riassumiGiro(e: EsitoGiro): string {
  if (e.fermo) return e.fermo
  const pezzi = [
    e.risposte ? `${e.risposte} risposte` : '',
    e.domande ? `${e.domande} domande all'amministratore` : '',
    e.saltate ? `${e.saltate} saltate` : '',
  ].filter(Boolean)
  return pezzi.length ? pezzi.join(' · ') : 'Niente da fare.'
}

/**
 * Com'è messa adesso la risposta automatica.
 *
 * ⚠️⚠️ Esiste perché fino al 27/08/2026 questa funzione era **invisibile**: il
 * cron girava 144 volte al giorno e il suo esito viveva **solo nel JSON della
 * chiamata**, che non guardava nessuno. Un automatismo che nessuno può guardare
 * non è acceso né spento: è una speranza.
 */
export async function statoAiFuoriTurno(): Promise<{
  acceso: boolean
  inTurno: string[]
  ultimo: string
  esito: string
  inAttesa: number
  script: number
}> {
  const conf = await leggiImpostazioni(['aiFuoriTurnoAttivo', CHIAVE_ULTIMO, CHIAVE_ESITO])
  const limite = new Date(Date.now() - ORE_UTILI * 3600 * 1000)
  const [inTurno, inAttesa, script] = await Promise.all([
    chiEInTurno(),
    // Le stesse condizioni del giro vero: il numero a schermo deve essere
    // quello su cui l'AI lavorerebbe, non un conteggio che gli somiglia.
    db.conversazione.count({
      where: {
        canale: { in: CANALI },
        archiviata: false,
        eliminataIl: null,
        presaDaId: '',
        nonLetti: { gt: 0 },
        ultimoMessaggioIl: { gte: limite },
      },
    }),
    db.script.count({ where: { attivo: true } }),
  ])
  return {
    acceso: conf.aiFuoriTurnoAttivo === 'si',
    inTurno,
    ultimo: conf[CHIAVE_ULTIMO] ?? '',
    esito: conf[CHIAVE_ESITO] ?? '',
    inAttesa,
    script,
  }
}

export async function giroAiFuoriTurno(opz: { prova?: boolean } = {}): Promise<EsitoGiro> {
  const vuoto: EsitoGiro = { fermo: '', inTurno: [], risposte: 0, domande: 0, saltate: 0, righe: [] }

  const conf = await leggiImpostazioni(['aiFuoriTurnoAttivo'])
  if (conf.aiFuoriTurnoAttivo !== 'si') {
    // ⚠️ Spenta NON si scrive nell'esito: se ne scrivesse uno a ogni giro,
    // l'ultima riga vera — quella dell'ultima volta che ha davvero risposto —
    // sparirebbe dopo dieci minuti.
    if (!opz.prova) await segnaPassaggio()
    return { ...vuoto, fermo: 'Le risposte automatiche fuori turno sono spente.' }
  }

  const inTurno = await chiEInTurno()
  if (inTurno.length > 0) {
    // ⚠️ Non è un errore: è la regola. Si dice chi c'è, così chi legge il log
    // non va a cercare un guasto.
    if (!opz.prova) await segnaPassaggio()
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
    // ⚠️⚠️ SI GUARDA LARGO E SI TAGLIA DOPO. `PER_GIRO` è il tetto di quante
    // conversazioni si possono **lavorare** (cioè quante chiamate all'AI si
    // fanno), non di quante se ne possono guardare: metterlo qui nella query
    // significava applicare tutti gli scarti — «ha già una risposta in fondo»,
    // «c'è già una domanda aperta», «tetto raggiunto» — **dopo** il taglio.
    //
    // ⚠️ E l'ordine è dalla PIÙ VECCHIA, quindi gli scarti stanno esattamente in
    // cima: una conversazione con una domanda aperta all'amministratore resta
    // bloccata **finché una persona non risponde**, e intanto occupa un posto a
    // ogni giro, per sempre. Misurato il 27/08/2026 alle 11:45: dieci candidate
    // e dieci posti, di cui **tre già bruciati** da due domande aperte (una
    // della notte precedente) e da una conversazione a cui avevamo già
    // risposto. Con undici messaggi in coda, il cliente numero undici non
    // sarebbe mai entrato nel giro.
    take: PER_GIRO * 6,
  })

  const esito: EsitoGiro = { ...vuoto, inTurno }
  if (conversazioni.length === 0) {
    esito.fermo = 'Nessuna conversazione che aspetta una risposta.'
    if (!opz.prova) await segnaPassaggio()
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
    if (!opz.prova) await segnaPassaggio()
    return esito
  }

  // ⚠️ Quante ne abbiamo davvero LAVORATE (cioè chieste all'AI): è questo il
  // numero che `PER_GIRO` limita. Gli scarti non consumano niente — non costano
  // una chiamata e non sono lavoro fatto.
  let lavorate = 0
  for (const c of conversazioni) {
    if (lavorate >= PER_GIRO) {
      esito.righe.push(`(mi fermo a ${PER_GIRO}: le altre al prossimo giro)`)
      break
    }
    const nome = c.nome || c.idEsterno

    // ── LE CASELLE CHE NON SONO PERSONE ──
    //
    // ⚠️⚠️ Misurato il 27/08/2026 sulla coda vera: delle dieci conversazioni in
    // attesa **nessuna era un cliente**. C'erano un avviso di mancata consegna
    // (`mailer-daemon@…`), due newsletter e un fornitore. A un
    // `mailer-daemon` non si può rispondere — è la casella che ci dice che
    // un'altra mail non è arrivata — e chiedere all'amministratore su WhatsApp
    // «non so cosa rispondere a mailer-daemon» è il modo più veloce di
    // insegnargli a non guardare più gli avvisi.
    //
    // ⚠️ Si guarda l'INDIRIZZO, non il testo: un indirizzo di rimbalzo o di
    // sola andata dichiara da sé che dall'altra parte non c'è nessuno. Le
    // newsletter vere invece un indirizzo valido ce l'hanno, e per quelle resta
    // la strada normale — l'AI non trova uno script adatto e chiede.
    if (c.canale === 'email' && casellaSenzaNessuno(c.idEsterno)) {
      esito.saltate++
      esito.righe.push(`${nome}: casella automatica, non si risponde e non si chiede`)
      continue
    }
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

    // ⚠️ Da qui in giù si SPENDE: la chiamata all'AI è la parte cara del giro,
    // ed è il punto in cui questa conversazione conta come lavorata.
    lavorate++
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

  await segnaGiro(esito, opz.prova)
  return esito
}

/**
 * L'esito del giro si SCRIVE.
 *
 * ⚠️⚠️ Prima non si scriveva da nessuna parte: il cron girava ogni dieci minuti
 * e quello che aveva fatto restava nel JSON della risposta, che non legge
 * nessuno. Così non c'era modo di sapere se stesse funzionando — né di
 * accorgersi che era **spento da sempre**, che è esattamente quello che era.
 *
 * ⚠️ La prova non lo scrive: un giro a vuoto non è quello che è successo ai
 * clienti, e sovrascrivendolo si perderebbe l'ultima cosa vera.
 */
async function segnaGiro(esito: EsitoGiro, prova?: boolean) {
  if (prova) return
  try {
    await salvaImpostazione(CHIAVE_ULTIMO, new Date().toISOString())
    await salvaImpostazione(CHIAVE_ESITO, riassumiGiro(esito))
  } catch {
    // l'esito è un contorno: se non si scrive, il giro vale comunque
  }
}

/**
 * IL CRON È PASSATO DI QUI, comunque sia andata.
 *
 * ⚠️⚠️ Prima l'orologio si scriveva **solo in fondo al giro**, cioè solo quando
 * il giro arrivava a guardare le conversazioni. Ma il giro esce prima in
 * quattro casi su cinque — spenta, c'è chi lavora, niente in coda, nessuno
 * script — e in tutti quelli l'ora restava quella di ore prima. Il pannello
 * diceva «ultimo giro alle 08:50» alle 11:45, che si legge in un modo solo:
 * **il cron è morto**. Non lo era: stava rispettando i turni.
 *
 * ⚠️ L'ESITO invece NON si tocca qui, ed è la ragione per cui sono due chiavi
 * separate: un giro che non è partito non è quello che è successo ai clienti, e
 * sovrascriverlo cancellerebbe l'ultima riga vera dopo dieci minuti.
 */
async function segnaPassaggio() {
  try {
    await salvaImpostazione(CHIAVE_ULTIMO, new Date().toISOString())
  } catch {
    // contorno: se non si scrive, il giro vale comunque
  }
}
