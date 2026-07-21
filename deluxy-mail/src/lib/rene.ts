// Renè AI — l'agente che tiene in ordine la casella.
//
// Un giro di Renè: legge la posta del periodo (in arrivo, SPAM, cestino),
// consulta il suo taccuino, e PROPONE azioni (regole, sezioni, smistamenti,
// attività, eventi). Niente parte da solo: ogni proposta aspetta la conferma —
// a meno che quel TIPO di azione non sia diventato una "conseguenza" approvata.
//
// Migliorie di progetto rispetto alla richiesta:
// - le "urgenti senza risposta" si calcolano QUI, deterministicamente (P0/P1 o
//   serveRisposta, nessuna nostra mail successiva nel thread) — non a
//   sensazione del modello;
// - le proposte hanno una FIRMA: una proposta uguale a una già fatta (anche
//   rifiutata) non viene riproposta — niente tormentoni;
// - il taccuino è riscritto compatto a ogni giro (tetto di caratteri), così i
//   token non crescono nel tempo;
// - una sola chiamata AI per giro, su un digest compatto della posta.

import { createHash } from 'node:crypto'
import { db } from './db'
import { reneAnalizza } from './ai'
import { CHIAVI, leggiImpostazioni } from './impostazioni'
import { CODICI_PRIORITA, FUSO } from './format'
import { raggruppa } from './thread'

export type PeriodoRene = 'oggi' | 'settimana' | 'mese'

export function periodoValidoRene(p: string): PeriodoRene {
  return p === 'oggi' || p === 'mese' ? (p as PeriodoRene) : 'settimana'
}

const GIORNI: Record<PeriodoRene, number> = { oggi: 1, settimana: 7, mese: 30 }

const MEMORIA_MAX = 1500 // caratteri: il taccuino non deve crescere nel tempo

export type UrgenteSenzaRisposta = {
  messaggioId: string
  oggetto: string
  mittente: string
  motivo: string
}

/** "YYYY-MM-DDTHH:MM" in ora italiana → istante UTC. */
function oraItalianaInUtc(iso: string): Date | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return null
  const [Y, M, G, h, min] = [m[1], m[2], m[3], m[4] ?? '00', m[5] ?? '00'].map(Number)
  const utcBase = Date.UTC(Y, M - 1, G, h, min)
  const inRoma = new Date(utcBase).toLocaleString('en-US', { timeZone: FUSO })
  const offset = utcBase - new Date(`${inRoma} UTC`).getTime()
  return new Date(utcBase + offset)
}

function firmaDi(tipo: string, dati: Record<string, unknown>): string {
  // Solo i campi che identificano l'azione, normalizzati: la stessa proposta
  // deve avere la stessa firma anche se il "motivo" cambia.
  const chiavi = ['nome', 'seMittente', 'seOggetto', 'seContiene', 'sezioneNome', 'messaggioId', 'titolo', 'inizio']
  const essenza = chiavi.map((k) => String(dati[k] ?? '').trim().toLowerCase()).join('|')
  return createHash('sha1').update(`${tipo}|${essenza}`).digest('hex')
}

/**
 * Le mail urgenti a cui non abbiamo ancora risposto: P0/P1 (o "serve risposta")
 * in arrivo, non archiviate/cestinate, senza una nostra mail successiva nella
 * stessa conversazione. Calcolo deterministico, zero token.
 */
export async function urgentiSenzaRisposta(
  utenteId: string,
  da: Date,
  sezioneId?: string | null
): Promise<UrgenteSenzaRisposta[]> {
  const candidate = await db.messaggio.findMany({
    where: {
      utenteId,
      direzione: 'entrata',
      cestinato: false,
      archiviato: false,
      data: { gte: da },
      ...(sezioneId !== undefined ? { sezioneId } : {}),
      OR: [{ priorita: { in: ['P0', 'P1'] } }, { serveRisposta: true }],
    },
    orderBy: { data: 'desc' },
    take: 40,
    select: { id: true, oggetto: true, mittente: true, mittenteNome: true, priorita: true, serveRisposta: true, data: true, thread: true, threadManuale: true },
  })
  if (candidate.length === 0) return []

  // Una finestra di messaggi per ricostruire le conversazioni (in entrambe le direzioni).
  const finestra = await db.messaggio.findMany({
    where: { utenteId, cestinato: false },
    orderBy: { data: 'desc' },
    take: 400,
    select: { id: true, thread: true, threadManuale: true, oggetto: true, data: true, direzione: true },
  })
  const gruppi = raggruppa(finestra)
  const gruppoDi = new Map<string, (typeof finestra)>()
  for (const g of gruppi) for (const m of g) gruppoDi.set(m.id, g)

  const esiti: UrgenteSenzaRisposta[] = []
  for (const c of candidate) {
    const gruppo = gruppoDi.get(c.id)
    const risposta = gruppo?.some((m) => m.direzione === 'uscita' && m.data > c.data)
    if (risposta) continue
    esiti.push({
      messaggioId: c.id,
      oggetto: c.oggetto,
      mittente: c.mittenteNome || c.mittente,
      motivo: c.priorita ? `priorità ${c.priorita}` : 'chiede una risposta',
    })
    if (esiti.length >= 10) break
  }
  return esiti
}

/** Esegue una proposta approvata. Restituisce l'esito da salvare. */
export async function applicaPropostaRene(
  utenteId: string,
  tipo: string,
  dati: Record<string, unknown>
): Promise<{ ok: boolean; messaggio: string }> {
  const s = (k: string) => {
    const v = dati[k]
    return typeof v === 'string' ? v.trim() : ''
  }

  // La sezione di destinazione: se non esiste ancora si crea (l'utente sta
  // approvando proprio questo disegno di casella).
  const sezioneDaNome = async (nome: string) => {
    if (!nome) return null
    const esiste = await db.sezione.findFirst({
      where: { utenteId, nome: { equals: nome, mode: 'insensitive' } },
      select: { id: true },
    })
    if (esiste) return esiste.id
    const ultima = await db.sezione.findFirst({ where: { utenteId }, orderBy: { ordine: 'desc' } })
    const creata = await db.sezione.create({
      data: {
        utenteId,
        nome,
        descrizione: s('descrizione') || `Posta della categoria ${nome}.`,
        colore: s('colore') || 'blue',
        ordine: (ultima?.ordine ?? 0) + 1,
      },
      select: { id: true },
    })
    return creata.id
  }

  switch (tipo) {
    case 'sezione': {
      const nome = s('nome')
      if (!nome) return { ok: false, messaggio: 'Sezione senza nome.' }
      await sezioneDaNome(nome)
      return { ok: true, messaggio: `Sezione «${nome}» pronta.` }
    }

    case 'regola': {
      const nome = s('nome')
      const seMittente = s('seMittente') || null
      const seOggetto = s('seOggetto') || null
      const seContiene = s('seContiene') || null
      if (!nome || (!seMittente && !seOggetto && !seContiene)) {
        return { ok: false, messaggio: 'Regola senza nome o senza condizioni.' }
      }
      const sezioneId = await sezioneDaNome(s('sezioneNome'))
      await db.regola.create({
        data: {
          utenteId,
          nome,
          seMittente,
          seOggetto,
          seContiene,
          sezioneId,
          archivia: dati.archivia === true,
          priorita: 0,
        },
      })
      return { ok: true, messaggio: `Regola «${nome}» creata${sezioneId ? ' (con smistamento in sezione)' : ''}.` }
    }

    case 'smista': {
      const messaggioId = s('messaggioId')
      const sezioneId = await sezioneDaNome(s('sezioneNome'))
      if (!messaggioId || !sezioneId) return { ok: false, messaggio: 'Smistamento incompleto.' }
      // "Non smistata a mano" deve includere le mail ANCORA da smistare
      // (smistatoDa NULL): in SQL `NULL != 'manuale'` non è vero, quindi un
      // semplice NOT le escluderebbe — proprio quelle da sistemare.
      const r = await db.messaggio.updateMany({
        where: {
          id: messaggioId,
          utenteId,
          OR: [{ smistatoDa: null }, { smistatoDa: { not: 'manuale' } }],
        },
        data: { sezioneId, smistatoDa: 'ai' },
      })
      if (r.count > 0) return { ok: true, messaggio: `Mail smistata in «${s('sezioneNome')}».` }
      // Distinguo i due casi per un messaggio utile.
      const esiste = await db.messaggio.findFirst({ where: { id: messaggioId, utenteId }, select: { smistatoDa: true } })
      if (!esiste)
        return {
          ok: false,
          messaggio:
            'La mail non è più in AI Mail (cestino svuotato, doppione ripulito o retention): niente da smistare.',
        }
      return { ok: false, messaggio: 'Mail smistata a mano: non la tocco.' }
    }

    case 'attivita': {
      const titolo = s('titolo')
      if (!titolo) return { ok: false, messaggio: 'Attività senza titolo.' }
      const scad = s('scadenza')
      const codice = s('priorita')
      await db.attivita.create({
        data: {
          utenteId,
          titolo,
          dettaglio: s('dettaglio') || null,
          scadenza: scad ? new Date(`${scad.slice(0, 10)}T00:00:00Z`) : null,
          priorita: CODICI_PRIORITA.includes(codice as never) ? codice : 'P2',
          messaggioId: s('messaggioId') || null,
          creataDaAI: true,
        },
      })
      return { ok: true, messaggio: `Attività «${titolo}» creata.` }
    }

    case 'evento': {
      const titolo = s('titolo')
      const inizioIso = s('inizio')
      if (!titolo || !inizioIso) return { ok: false, messaggio: 'Evento senza titolo o data.' }
      const giornataIntera = !/[T ]\d{2}:\d{2}/.test(inizioIso)
      const inizio = giornataIntera ? new Date(`${inizioIso.slice(0, 10)}T00:00:00Z`) : oraItalianaInUtc(inizioIso)
      if (!inizio || isNaN(inizio.getTime())) return { ok: false, messaggio: 'Data dell’evento non valida.' }
      const fineIso = s('fine')
      const fine = !giornataIntera && fineIso ? oraItalianaInUtc(fineIso) : null
      await db.evento.create({
        data: {
          utenteId,
          titolo,
          luogo: s('luogo'),
          inizio,
          fine: fine && fine > inizio ? fine : null,
          giornataIntera,
          messaggioId: s('messaggioId') || null,
          creatoDaAI: true,
        },
      })
      return { ok: true, messaggio: `«${titolo}» in calendario.` }
    }

    default:
      return { ok: false, messaggio: `Tipo di proposta sconosciuto: ${tipo}.` }
  }
}

/**
 * Da una proposta di SMISTAMENTO («metti questa mail in Ordini») crea una REGOLA
 * deterministica sul MITTENTE: da qui in poi le mail di quel mittente vanno da
 * sole in quella sezione, senza passare da Renè. È il "fai sempre così" degli
 * smistamenti. Idempotente: se la regola c'è già, non la duplica.
 */
export async function creaRegolaDaSmista(
  utenteId: string,
  dati: Record<string, unknown>
): Promise<{ ok: boolean; messaggio: string }> {
  const messaggioId = typeof dati.messaggioId === 'string' ? dati.messaggioId : ''
  const sezioneNome = typeof dati.sezioneNome === 'string' ? dati.sezioneNome : ''
  if (!messaggioId || !sezioneNome) return { ok: false, messaggio: 'Dati insufficienti per la regola.' }

  const msg = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId },
    select: { mittente: true, mittenteNome: true },
  })
  if (!msg) return { ok: false, messaggio: 'Mail non trovata per la regola.' }

  const sezione = await db.sezione.findFirst({
    where: { utenteId, nome: sezioneNome },
    select: { id: true },
  })
  if (!sezione) return { ok: false, messaggio: 'Sezione non trovata per la regola.' }

  const seMittente = msg.mittente.trim()
  if (!seMittente) return { ok: false, messaggio: 'Mittente assente: regola non creata.' }

  // Niente doppioni: se c'è già una regola su questo mittente verso questa sezione.
  const gia = await db.regola.findFirst({
    where: { utenteId, sezioneId: sezione.id, seMittente: { equals: seMittente, mode: 'insensitive' } },
    select: { id: true },
  })
  if (gia) return { ok: true, messaggio: 'Regola già presente per questo mittente.' }

  await db.regola.create({
    data: {
      utenteId,
      nome: `${msg.mittenteNome || seMittente} → ${sezioneNome}`,
      seMittente,
      seOggetto: null,
      seContiene: null,
      sezioneId: sezione.id,
      archivia: false,
      priorita: 0,
    },
  })
  return {
    ok: true,
    messaggio: `Regola creata: le prossime mail da ${msg.mittenteNome || seMittente} andranno in «${sezioneNome}».`,
  }
}

export const TIPI_RENE: Record<string, string> = {
  sezione: 'Creare sezioni',
  regola: 'Creare regole di smistamento',
  smista: 'Smistare la posta nelle sezioni',
  attivita: 'Creare attività',
  evento: 'Mettere appuntamenti in calendario',
}

/** Il giro completo di Renè sul periodo scelto. */
export async function eseguiRene(
  utenteId: string,
  periodo: PeriodoRene,
  // Ambito: undefined = tutta la posta; una stringa = solo quella sezione;
  // null = solo le mail senza sezione (da smistare).
  sezioneId?: string | null
): Promise<{ ok: boolean; messaggio: string; analisiId?: string }> {
  const da = new Date(Date.now() - GIORNI[periodo] * 24 * 60 * 60 * 1000)

  // La posta del periodo: in arrivo, nelle sezioni, SPAM e cestino insieme —
  // Renè deve vedere anche cosa è finito dove non doveva. Se è indicata una
  // sezione, il giro si concentra solo su quella.
  const messaggi = await db.messaggio.findMany({
    where: { utenteId, direzione: 'entrata', data: { gte: da }, ...(sezioneId !== undefined ? { sezioneId } : {}) },
    orderBy: { data: 'desc' },
    take: 150,
    select: {
      id: true, mittente: true, mittenteNome: true, oggetto: true, data: true,
      letto: true, serveRisposta: true, priorita: true, cestinato: true,
      anteprima: true, sezione: { select: { nome: true } },
    },
  })
  if (messaggi.length === 0) {
    return { ok: false, messaggio: 'Nessuna mail nel periodo scelto: niente da analizzare.' }
  }

  const [sezioni, regole, memoriaRiga, imp, conseguenze] = await Promise.all([
    db.sezione.findMany({ where: { utenteId }, orderBy: { ordine: 'asc' }, select: { nome: true, descrizione: true } }),
    db.regola.findMany({ where: { utenteId, attiva: true }, select: { nome: true, seMittente: true, seOggetto: true, seContiene: true, sezione: { select: { nome: true } } } }),
    db.reneMemoria.findUnique({ where: { utenteId }, select: { testo: true } }),
    leggiImpostazioni(),
    db.reneConseguenza.findMany({ where: { utenteId, attiva: true }, select: { tipo: true } }),
  ])
  const conseguenzeAttive = new Set(conseguenze.map((c) => c.tipo))

  // Il digest compatto: una riga per mail, numerata per i riferimenti.
  const digest = messaggi
    .map((m, i) => {
      const dove = m.cestinato ? 'CESTINO' : m.sezione?.nome ? `sez:${m.sezione.nome}` : 'in arrivo'
      const stato = [m.letto ? '' : 'non letta', m.serveRisposta ? 'chiede risposta' : '', m.priorita ?? ''].filter(Boolean).join(', ')
      return `[${i}] ${m.data.toISOString().slice(0, 10)} da ${m.mittenteNome || m.mittente} <${m.mittente}> — "${m.oggetto.slice(0, 90)}" (${dove}${stato ? `; ${stato}` : ''})\n    ${m.anteprima.slice(0, 140)}`
    })
    .join('\n')

  const analisi = await reneAnalizza({
    periodo,
    digest,
    sezioniEsistenti: sezioni.map((s) => `- "${s.nome}": ${s.descrizione}`).join('\n'),
    regoleEsistenti: regole
      .map((r) => `- "${r.nome}": ${[r.seMittente && `mittente~${r.seMittente}`, r.seOggetto && `oggetto~${r.seOggetto}`, r.seContiene && `testo~${r.seContiene}`].filter(Boolean).join(' e ')}${r.sezione ? ` → ${r.sezione.nome}` : ''}`)
      .join('\n'),
    memoria: memoriaRiga?.testo ?? '',
    contestoAzienda: imp[CHIAVI.contestoAzienda],
    oggi: new Date(),
  })

  // Urgenze: calcolate qui, non dal modello. Stesso ambito del giro.
  const urgenti = await urgentiSenzaRisposta(utenteId, da, sezioneId)

  const record = await db.reneAnalisi.create({
    data: { utenteId, periodo, riassunto: analisi.riassunto, urgenti: JSON.stringify(urgenti) },
    select: { id: true },
  })

  // Il taccuino si riscrive (compatto): è la memoria di Renè, non un log.
  const memoriaNuova = (analisi.memoria || '').slice(0, MEMORIA_MAX)
  if (memoriaNuova.trim()) {
    await db.reneMemoria.upsert({
      where: { utenteId },
      create: { utenteId, testo: memoriaNuova },
      update: { testo: memoriaNuova },
    })
  }

  // Le proposte: firma anti-doppione, poi o si applicano da sole (conseguenza
  // attiva per quel tipo) o restano in attesa di conferma.
  let applicate = 0
  let inAttesa = 0
  for (const p of analisi.proposte.slice(0, 20)) {
    const dati: Record<string, unknown> = {
      nome: p.nome,
      descrizione: p.descrizione,
      colore: p.colore,
      seMittente: p.seMittente,
      seOggetto: p.seOggetto,
      seContiene: p.seContiene,
      sezioneNome: p.sezioneNome,
      archivia: p.archivia,
      titolo: p.titolo,
      dettaglio: p.dettaglio,
      scadenza: p.scadenza,
      priorita: p.priorita,
      inizio: p.inizio,
      fine: p.fine,
      luogo: p.luogo,
      motivo: p.motivo,
      // il riferimento alla mail si risolve SUBITO in un id vero
      messaggioId:
        p.indiceMail != null && p.indiceMail >= 0 && p.indiceMail < messaggi.length
          ? messaggi[p.indiceMail].id
          : null,
      oggettoMail:
        p.indiceMail != null && p.indiceMail >= 0 && p.indiceMail < messaggi.length
          ? messaggi[p.indiceMail].oggetto
          : null,
    }
    // smista/attivita/evento legati a un indice inventato: proposta inutilizzabile.
    if ((p.tipo === 'smista') && !dati.messaggioId) continue

    const firma = firmaDi(p.tipo, dati)
    const gia = await db.reneProposta.findFirst({ where: { utenteId, firma }, select: { id: true } })
    if (gia) continue // già proposta (magari rifiutata): non si ripropone

    if (conseguenzeAttive.has(p.tipo)) {
      const esito = await applicaPropostaRene(utenteId, p.tipo, dati)
      await db.reneProposta.create({
        data: {
          utenteId,
          analisiId: record.id,
          tipo: p.tipo,
          dati: JSON.stringify(dati),
          firma,
          stato: esito.ok ? 'applicata' : 'errore',
          esitoTesto: esito.messaggio,
          daConseguenza: true,
        },
      })
      if (esito.ok) applicate++
    } else {
      await db.reneProposta.create({
        data: { utenteId, analisiId: record.id, tipo: p.tipo, dati: JSON.stringify(dati), firma },
      })
      inAttesa++
    }
  }

  const pezzi = [
    `Analisi pronta.`,
    urgenti.length ? `${urgenti.length} urgenti senza risposta.` : '',
    applicate ? `${applicate} azioni fatte da solo (conseguenze).` : '',
    inAttesa ? `${inAttesa} proposte da confermare.` : 'Nessuna proposta nuova.',
  ].filter(Boolean)
  return { ok: true, messaggio: pezzi.join(' '), analisiId: record.id }
}
