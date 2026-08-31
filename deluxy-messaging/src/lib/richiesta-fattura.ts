// LA RICHIESTA DI FATTURA su un ordine.
//
// Il cliente chiede la fattura — al telefono, in chat, tre giorni dopo aver
// comprato. Finora quella richiesta viveva dentro una conversazione e i dati
// fiscali si ricopiavano in un messaggio: chi emette la fattura doveva andarseli
// a cercare, e metà delle volte mancava il codice destinatario.
//
// ⚠️⚠️ QUI NON SI EMETTE NIENTE. La fattura elettronica esce da FINANCE /
// Fatture in Cloud: prende un numero nella numerazione dell'anno e parte verso
// lo SDI, e non si annulla con un clic — si annulla con una nota di credito.
// Questa parte tiene la RICHIESTA, i DATI FISCALI (che oggi non stanno da
// nessuna parte) e lo stato.
//
// ⚠️ Niente si deduce dall'ordine: l'indirizzo di spedizione è del DESTINATARIO
// (è un regalo) e la ragione sociale non è il nome di chi compra. Si chiedono.

import { db } from './db'
import { caselleDaCuiScrivere, inviaEmail } from './email'
import { leggiImpostazioni } from './impostazioni'

export type DatiFattura = {
  tipo: string
  intestazione: string
  partitaIva: string
  codiceFiscale: string
  codiceSdi: string
  pec: string
  email: string
  indirizzo: string
  cap: string
  citta: string
  provincia: string
  paese: string
  note: string
}

export type FatturaDto = DatiFattura & {
  id: string
  ordineNumero: string
  stato: string
  numeroFattura: string
  emessaIl: string | null
  emessaDaNome: string
  chiestaDaNome: string
  creatoIl: string
  /** Quando e a chi e stata mandata ad amministrazione, e com e andata. */
  inviataIl: string | null
  inviataA: string
  inviataEsito: string
  /** Che cosa manca perché sia emettibile: vuoto = si può fare. */
  mancano: string[]
}

/**
 * Che cosa manca per poterla emettere davvero.
 *
 * ⚠️⚠️ Non è pignoleria burocratica: **lo SDI scarta** una fattura elettronica
 * senza il recapito giusto, e lo scarto arriva giorni dopo — quando il cliente
 * ha già chiuso la conversazione e nessuno si ricorda di richiamarlo per
 * chiedergli il codice. Meglio dirlo adesso, mentre è al telefono.
 *
 * ⚠️ Per un'AZIENDA serve la P.IVA **e** uno fra codice destinatario e PEC.
 * Per un PRIVATO basta il codice fiscale. Sono due regole diverse, e trattarle
 * uguali vorrebbe dire chiedere a una persona la partita IVA che non ha.
 */
export function cosaManca(d: DatiFattura): string[] {
  const manca: string[] = []
  if (!d.intestazione.trim()) manca.push(d.tipo === 'azienda' ? 'la ragione sociale' : 'nome e cognome')
  if (d.tipo === 'azienda') {
    if (!d.partitaIva.trim()) manca.push('la partita IVA')
    if (!d.codiceSdi.trim() && !d.pec.trim()) manca.push('il codice destinatario (o la PEC)')
  } else if (!d.codiceFiscale.trim()) {
    manca.push('il codice fiscale')
  }
  if (!d.indirizzo.trim() || !d.citta.trim()) manca.push("l'indirizzo di fatturazione")
  return manca
}

function dto(r: {
  id: string
  ordineNumero: string
  tipo: string
  intestazione: string
  partitaIva: string
  codiceFiscale: string
  codiceSdi: string
  pec: string
  email: string
  indirizzo: string
  cap: string
  citta: string
  provincia: string
  paese: string
  note: string
  stato: string
  numeroFattura: string
  emessaIl: Date | null
  emessaDaNome: string
  chiestaDaNome: string
  creatoIl: Date
  inviataIl: Date | null
  inviataA: string
  inviataEsito: string
}): FatturaDto {
  const dati: DatiFattura = {
    tipo: r.tipo,
    intestazione: r.intestazione,
    partitaIva: r.partitaIva,
    codiceFiscale: r.codiceFiscale,
    codiceSdi: r.codiceSdi,
    pec: r.pec,
    email: r.email,
    indirizzo: r.indirizzo,
    cap: r.cap,
    citta: r.citta,
    provincia: r.provincia,
    paese: r.paese,
    note: r.note,
  }
  return {
    ...dati,
    id: r.id,
    ordineNumero: r.ordineNumero,
    stato: r.stato,
    numeroFattura: r.numeroFattura,
    emessaIl: r.emessaIl ? r.emessaIl.toISOString() : null,
    emessaDaNome: r.emessaDaNome,
    chiestaDaNome: r.chiestaDaNome,
    creatoIl: r.creatoIl.toISOString(),
    inviataIl: r.inviataIl ? r.inviataIl.toISOString() : null,
    inviataA: r.inviataA,
    inviataEsito: r.inviataEsito,
    mancano: cosaManca(dati),
  }
}

/** La richiesta di fattura di un ordine, se c'è. */
export async function fatturaDellOrdine(ordineId: string): Promise<FatturaDto | null> {
  const r = await db.richiestaFattura.findUnique({ where: { ordineId } })
  return r ? dto(r) : null
}

/**
 * Apre o aggiorna la richiesta.
 *
 * ⚠️ Una sola per ordine (`ordineId` unico): due fatture per lo stesso ordine
 * sono un problema fiscale, non una comodità. Chiederla due volte aggiorna i
 * dati della stessa richiesta.
 *
 * ⚠️ I dati si possono salvare **incompleti**: chi è al telefono scrive quello
 * che il cliente gli detta, e il codice destinatario spesso arriva dopo. La riga
 * dice cosa manca invece di rifiutare il salvataggio — rifiutarlo vorrebbe dire
 * perdere anche quello che si era già scritto.
 */
export async function salvaRichiestaFattura(
  ordineId: string,
  d: Partial<DatiFattura>,
  chi: { nome: string } | null
): Promise<{ ok: true; fattura: FatturaDto } | { ok: false; errore: string }> {
  const o = await db.ordine.findUnique({
    where: { id: ordineId },
    select: { id: true, numero: true, negozioId: true, clienteNome: true, email: true },
  })
  if (!o) return { ok: false, errore: 'Ordine non trovato.' }

  const testo = (v: string | undefined, alt = '') => (v === undefined ? alt : v.trim())
  const tipo = d.tipo === 'azienda' ? 'azienda' : 'privato'

  const base = {
    tipo,
    intestazione: testo(d.intestazione, o.clienteNome ?? ''),
    partitaIva: testo(d.partitaIva),
    codiceFiscale: testo(d.codiceFiscale),
    // ⚠️ Il codice destinatario è di 7 caratteri e si scrive maiuscolo: lo SDI
    // non perdona una minuscola, e chi lo detta al telefono lo detta come gli
    // viene.
    codiceSdi: testo(d.codiceSdi).toUpperCase().slice(0, 7),
    pec: testo(d.pec).toLowerCase(),
    email: testo(d.email, o.email ?? '').toLowerCase(),
    indirizzo: testo(d.indirizzo),
    cap: testo(d.cap),
    citta: testo(d.citta),
    provincia: testo(d.provincia).toUpperCase().slice(0, 2),
    paese: testo(d.paese, 'IT').toUpperCase().slice(0, 2) || 'IT',
    note: testo(d.note),
  }

  const r = await db.richiestaFattura.upsert({
    where: { ordineId },
    create: {
      ordineId,
      ordineNumero: o.numero,
      negozioId: o.negozioId,
      chiestaDaNome: chi?.nome ?? '',
      ...base,
    },
    update: base,
  })

  // ⚠️⚠️ LA MAIL AD AMMINISTRAZIONE PARTE QUI, e solo quando i dati sono
  // COMPLETI e non è già partita. Chiesto dall'utente: «fai inserire tutti i
  // dati e manda una mail a amministrazione@deluxy.it».
  //
  // Perché al salvataggio e non con un bottone: il bottone lo si preme quando
  // ci si ricorda, e una richiesta che resta qui dentro è una fattura che
  // nessuno emette. Perché solo a dati completi: una mail a metà obbligherebbe
  // amministrazione a rincorrere il codice destinatario, cioè esattamente il
  // lavoro che questa cosa toglie.
  //
  // ⚠️ Non fa fallire il salvataggio: la richiesta è la cosa che conta, e
  // perderla perché la posta non risponde sarebbe il peggiore dei due errori.
  // L'esito resta scritto sulla riga e la scheda lo mostra.
  const fatta = dto(r)
  if (!fatta.mancano.length && !r.inviataIl) {
    try {
      await mandaRichiestaFattura(ordineId)
    } catch {
      /* l'esito è già scritto dentro mandaRichiestaFattura */
    }
    const dopo = await db.richiestaFattura.findUnique({ where: { ordineId } })
    return { ok: true, fattura: dopo ? dto(dopo) : fatta }
  }
  return { ok: true, fattura: fatta }
}

/**
 * Segna com'è finita.
 *
 * ⚠️ `emessa` chiede il NUMERO: «emessa» senza numero è una parola che nessuno
 * può verificare, e fra un mese non si sa più quale fattura fosse.
 */
export async function chiudiRichiestaFattura(
  ordineId: string,
  stato: string,
  numeroFattura: string,
  chi: { nome: string } | null
): Promise<{ ok: boolean; errore?: string }> {
  if (!['chiesta', 'emessa', 'non_dovuta'].includes(stato)) {
    return { ok: false, errore: 'Stato non valido.' }
  }
  const numero = (numeroFattura ?? '').trim()
  if (stato === 'emessa' && !numero) {
    return { ok: false, errore: 'Scrivi il numero della fattura: senza, «emessa» non si può verificare.' }
  }
  const c = await db.richiestaFattura.findUnique({ where: { ordineId }, select: { id: true } })
  if (!c) return { ok: false, errore: 'Nessuna richiesta di fattura su questo ordine.' }

  await db.richiestaFattura.update({
    where: { ordineId },
    data: {
      stato,
      ...(stato === 'emessa'
        ? { numeroFattura: numero, emessaIl: new Date(), emessaDaNome: chi?.nome ?? '' }
        : {}),
      // ⚠️ Tornando a «chiesta» si tolgono numero e data: lasciarli scritti su
      // una richiesta riaperta farebbe credere che una fattura ci sia.
      ...(stato === 'chiesta' ? { numeroFattura: '', emessaIl: null, emessaDaNome: '' } : {}),
    },
  })
  return { ok: true }
}

/** Le richieste ancora aperte: le guarda chi emette le fatture. */
export async function fattureDaEmettere(): Promise<FatturaDto[]> {
  const righe = await db.richiestaFattura.findMany({
    where: { stato: 'chiesta' },
    orderBy: { creatoIl: 'asc' },
    take: 200,
  })
  return righe.map(dto)
}

// ── MANDARE LA RICHIESTA AD AMMINISTRAZIONE ──────────────────────────────────
//
// Chiesto dall'utente: «fai inserire tutti i dati e manda una mail a
// amministrazione@deluxy.it».
//
// ⚠️⚠️ LA MAIL PARTE SOLO A DATI COMPLETI. Mandarne una a metà obbligherebbe
// amministrazione a rincorrere il codice destinatario — cioè esattamente il
// lavoro che questa cosa toglie — e a quel punto la mail diventa un promemoria
// da ignorare. Finché manca qualcosa, la richiesta resta qui e la scheda dice
// che cosa.
//
// ⚠️ Parte UNA VOLTA sola da sé: alla prima volta che i dati sono completi. Le
// correzioni successive non rimandano niente in automatico — c'è il bottone,
// perché rimandare è una decisione di chi guarda, non un effetto collaterale di
// aver corretto un CAP.

const DESTINATARIO_DEFAULT = 'amministrazione@deluxy.it'

// L indirizzo dell app, per il link all ordine dentro la mail.
const BASE_APP = (process.env.APP_URL ?? 'https://deluxy-messaging.vercel.app').replace(/\/+$/, '')

/** A chi vanno le richieste di fattura. Cambiabile in Impostazioni. */
export async function destinatarioFatture(): Promise<string> {
  const c = await leggiImpostazioni(['emailAmministrazione'])
  return (c.emailAmministrazione || '').trim() || DESTINATARIO_DEFAULT
}

function testoRichiesta(ordineId: string, f: FatturaDto, o: { numero: string; negozioNome: string; data: Date; totale: number; valuta: string; clienteNome: string }): string {
  const riga = (etichetta: string, valore: string) => (valore.trim() ? `${etichetta}: ${valore.trim()}` : '')
  const soldi = o.totale.toLocaleString('it-IT', { style: 'currency', currency: o.valuta || 'EUR' })
  return [
    `Richiesta di fattura per l'ordine ${o.numero} (${o.negozioNome}).`,
    '',
    `Ordine del ${o.data.toLocaleDateString('it-IT')} · totale ${soldi}`,
    riga('Cliente sull ordine', o.clienteNome),
    '',
    '— DATI PER LA FATTURA —',
    `Intestatario: ${f.tipo === 'azienda' ? 'AZIENDA' : 'PRIVATO'}`,
    riga('Intestazione', f.intestazione),
    riga('Partita IVA', f.partitaIva),
    riga('Codice fiscale', f.codiceFiscale),
    riga('Codice destinatario (SDI)', f.codiceSdi),
    riga('PEC', f.pec),
    riga('Email', f.email),
    riga('Indirizzo', [f.indirizzo, f.cap, f.citta, f.provincia, f.paese].filter(Boolean).join(', ')),
    riga('Note', f.note),
    '',
    riga('Chiesta da', f.chiestaDaNome),
    '',
    // ⚠️ Il link all'ordine: chi emette deve poter vedere che cosa è stato
    // venduto senza chiederlo indietro per mail.
    `Ordine nel Customer Service: ${BASE_APP}/ordini?apri=${ordineId}`,
  ]
    .filter((r) => r !== '')
    .join('\n')
}

export type EsitoInvioFattura = { ok: boolean; messaggio: string }

/**
 * Manda la richiesta ad amministrazione.
 *
 * ⚠️ Best-effort e con l'esito SCRITTO: se la posta non parte, la richiesta
 * resta e la scheda lo dice. Una mail che non è partita e che risulta mandata è
 * peggio di una mail non mandata: nessuno la rimanda.
 */
export async function mandaRichiestaFattura(
  ordineId: string,
  opz: { forza?: boolean } = {}
): Promise<EsitoInvioFattura> {
  const r = await db.richiestaFattura.findUnique({ where: { ordineId } })
  if (!r) return { ok: false, messaggio: 'Nessuna richiesta di fattura su questo ordine.' }

  const f = dto(r)
  if (f.mancano.length) {
    return {
      ok: false,
      messaggio: `Non la mando: manca ${f.mancano.join(', ')}. Ad amministrazione serve completa.`,
    }
  }
  if (r.inviataIl && !opz.forza) {
    return { ok: true, messaggio: `Già mandata il ${r.inviataIl.toLocaleDateString('it-IT')}.` }
  }

  const o = await db.ordine.findUnique({
    where: { id: ordineId },
    select: { numero: true, negozioNome: true, data: true, totale: true, valuta: true, clienteNome: true },
  })
  if (!o) return { ok: false, messaggio: 'Ordine non trovato.' }

  const a = await destinatarioFatture()
  // ⚠️ Si scrive da una casella di POSTA, mai da quella delle chiamate: quella
  // riceve le notifiche del centralino e una risposta di amministrazione lì
  // dentro non la leggerebbe nessuno.
  const caselle = await caselleDaCuiScrivere()
  if (!caselle.length) {
    const messaggio = 'Nessuna casella da cui scrivere: la richiesta è salvata ma non è partita.'
    await db.richiestaFattura.update({ where: { ordineId }, data: { inviataEsito: messaggio } })
    return { ok: false, messaggio }
  }

  const oggetto = `Fattura da emettere — ordine ${o.numero} (${o.negozioNome})`
  const testo = testoRichiesta(ordineId, f, o)

  try {
    await inviaEmail(caselle[0], a, oggetto, testo)
    await db.richiestaFattura.update({
      where: { ordineId },
      data: { inviataIl: new Date(), inviataA: a, inviataEsito: 'mandata' },
    })
    return { ok: true, messaggio: `Mandata a ${a}.` }
  } catch (e) {
    const messaggio = `Non è partita: ${e instanceof Error ? e.message : 'errore di posta'}`
    await db.richiestaFattura.update({ where: { ordineId }, data: { inviataEsito: messaggio } })
    return { ok: false, messaggio }
  }
}
