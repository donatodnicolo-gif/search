// I PREVENTIVI: le richieste di prezzo che non sono ancora ordini.
//
// «Quanto costa un bouquet di 100 rose consegnato a Como sabato?» non è un
// ordine e non è un reclamo: è una domanda che vale dei soldi. Finché non
// c'era un posto dove scriverla viveva dentro una conversazione — e una
// conversazione si archivia. Chi chiede un prezzo e non riceve risposta non
// lascia traccia: non è un ordine perso, è un ordine mai contato.
//
// ⚠️⚠️ NON È UN REGISTRO ORDINI. L'ordine nasce su Shopify e vive in Deluxy
// Orders. Qui c'è la richiesta e la nostra risposta — quanto abbiamo detto, con
// che link, ed è finita sì o no. Quando il cliente paga, l'ordine arriva dal
// giro normale: il preventivo si CHIUDE, non diventa lui l'ordine.

import { db } from './db'
import { creaOrdine } from './nuovo-ordine'
import { cifreTelefono } from './scheda-cliente'
import { STATI_APERTI, type StatoPreventivo } from './preventivi-stati'

// ⚠️⚠️ Stati e nomi stanno in un file a parte (`preventivi-stati.ts`) perché li
// legge anche un componente CLIENT: importandoli da qui si porterebbe dietro
// `nuovo-ordine.ts` → `crypto.ts` → `node:crypto`, e la build fallisce con un
// errore che parla di webpack e non nomina mai la vera causa. Qui si ri-esportano
// per comodità di chi lavora lato server, che ha già tutta la catena.
export {
  STATI_PREVENTIVO,
  STATI_APERTI,
  nomeStato,
  type StatoPreventivo,
} from './preventivi-stati'

export type PreventivoDto = {
  id: string
  negozioId: string
  negozioNome: string
  clienteNome: string
  email: string
  telefono: string
  richiesta: string
  occasione: string
  citta: string
  dataConsegna: string | null
  fasciaConsegna: string
  origine: string
  conversazioneId: string
  stato: StatoPreventivo
  importo: number
  valuta: string
  bozzaNome: string
  linkPagamento: string
  ordineNumero: string
  validoFinoAl: string | null
  seguitoDaNome: string
  note: string
  creatoIl: string
  inviatoIl: string | null
  chiusoIl: string | null
  chiusoDaNome: string
  /** Da quanti giorni aspetta: è la sola urgenza che ha un preventivo. */
  giorniFermo: number
}

export type ColonnaMarchio = {
  negozioId: string
  nome: string
  aperti: number
  daFare: number
  /** Il valore dei preventivi INVIATI e ancora aperti: quanto stiamo aspettando. */
  valoreInAttesa: number
}

export type ElencoPreventivi = {
  preventivi: PreventivoDto[]
  perMarchio: ColonnaMarchio[]
  aperti: number
  daFare: number
  valoreInAttesa: number
}

function giorniDa(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}

export async function elencoPreventivi(opzioni?: {
  stato?: string
  negozioId?: string
  q?: string
}): Promise<ElencoPreventivi> {
  const stato = opzioni?.stato ?? 'aperti'
  const q = (opzioni?.q ?? '').trim()

  const dove = {
    ...(stato === 'aperti'
      ? { stato: { in: STATI_APERTI } }
      : stato === 'tutti'
        ? {}
        : { stato }),
    ...(opzioni?.negozioId ? { negozioId: opzioni.negozioId } : {}),
    ...(q
      ? {
          OR: [
            { clienteNome: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { telefono: { contains: q } },
            { richiesta: { contains: q, mode: 'insensitive' as const } },
            { citta: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [righe, negozi] = await Promise.all([
    db.preventivo.findMany({
      where: dove,
      // ⚠️ I più VECCHI in cima fra quelli aperti: un preventivo non ha una data
      // di consegna che lo renda urgente — la sua urgenza è da quanto aspetta.
      // Ordinare per «ultimo arrivato», come si fa con la posta, seppellirebbe
      // proprio quelli che stanno marcendo.
      orderBy: [{ creatoIl: 'asc' }],
      take: 300,
    }),
    db.negozioShopify.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
  ])

  const nomeDi = new Map(negozi.map((n) => [n.id, n.nome]))

  // ⚠️ I conteggi per marchio si fanno su TUTTI gli aperti, non sulle 300 righe
  // caricate né sul filtro scelto: le colonne devono dire quanto c'è, anche
  // mentre si guarda un marchio solo.
  const apertiTutti = await db.preventivo.findMany({
    where: { stato: { in: STATI_APERTI } },
    select: { negozioId: true, stato: true, importo: true },
  })

  const per = new Map<string, ColonnaMarchio>()
  for (const n of negozi) {
    per.set(n.id, { negozioId: n.id, nome: n.nome, aperti: 0, daFare: 0, valoreInAttesa: 0 })
  }
  per.set('', {
    negozioId: '',
    nome: 'Senza marchio',
    aperti: 0,
    daFare: 0,
    valoreInAttesa: 0,
  })
  for (const p of apertiTutti) {
    const c = per.get(p.negozioId ?? '')
    if (!c) continue
    c.aperti++
    if (p.stato === 'da_fare') c.daFare++
    else c.valoreInAttesa += p.importo
  }

  const colonne = [...per.values()].filter((c) => c.aperti > 0 || c.negozioId !== '')

  return {
    preventivi: righe.map((p) => ({
      id: p.id,
      negozioId: p.negozioId ?? '',
      negozioNome: p.negozioId ? (nomeDi.get(p.negozioId) ?? '') : '',
      clienteNome: p.clienteNome,
      email: p.email,
      telefono: p.telefono,
      richiesta: p.richiesta,
      occasione: p.occasione,
      citta: p.citta,
      dataConsegna: p.dataConsegna ? p.dataConsegna.toISOString() : null,
      fasciaConsegna: p.fasciaConsegna,
      origine: p.origine,
      conversazioneId: p.conversazioneId,
      stato: p.stato as StatoPreventivo,
      importo: p.importo,
      valuta: p.valuta,
      bozzaNome: p.bozzaNome,
      linkPagamento: p.linkPagamento,
      ordineNumero: p.ordineNumero,
      validoFinoAl: p.validoFinoAl ? p.validoFinoAl.toISOString() : null,
      seguitoDaNome: p.seguitoDaNome,
      note: p.note,
      creatoIl: p.creatoIl.toISOString(),
      inviatoIl: p.inviatoIl ? p.inviatoIl.toISOString() : null,
      chiusoIl: p.chiusoIl ? p.chiusoIl.toISOString() : null,
      chiusoDaNome: p.chiusoDaNome,
      giorniFermo: giorniDa(p.inviatoIl ?? p.creatoIl),
    })),
    perMarchio: colonne,
    aperti: apertiTutti.length,
    daFare: apertiTutti.filter((p) => p.stato === 'da_fare').length,
    valoreInAttesa: apertiTutti
      .filter((p) => p.stato === 'inviato')
      .reduce((s, p) => s + p.importo, 0),
  }
}

export type DatiNuovoPreventivo = {
  negozioId?: string
  clienteNome?: string
  email?: string
  telefono?: string
  richiesta: string
  occasione?: string
  citta?: string
  dataConsegna?: string
  fasciaConsegna?: string
  origine?: string
  conversazioneId?: string
  chiamataId?: string
  note?: string
}

export async function creaPreventivo(
  d: DatiNuovoPreventivo,
  chi: { id: string; nome: string } | null
): Promise<{ ok: true; id: string } | { ok: false; errore: string }> {
  const richiesta = (d.richiesta ?? '').trim()
  // ⚠️ La richiesta è l'unico campo obbligatorio, e non è un formalismo: un
  // preventivo senza la domanda del cliente è una riga che nessuno saprà
  // preparare. Il nome può mancare (a volte si sa solo il numero), il prezzo
  // arriva dopo — la domanda no.
  if (!richiesta) {
    return { ok: false, errore: 'Scrivi che cosa ha chiesto il cliente: senza, nessuno può preparare il prezzo.' }
  }

  const p = await db.preventivo.create({
    data: {
      negozioId: d.negozioId?.trim() ? d.negozioId.trim() : null,
      clienteNome: (d.clienteNome ?? '').trim(),
      email: (d.email ?? '').trim().toLowerCase(),
      telefono: (d.telefono ?? '').trim(),
      cifre: cifreTelefono(d.telefono ?? ''),
      richiesta,
      occasione: (d.occasione ?? '').trim(),
      citta: (d.citta ?? '').trim(),
      dataConsegna: d.dataConsegna?.trim() ? new Date(`${d.dataConsegna}T12:00:00`) : null,
      fasciaConsegna: (d.fasciaConsegna ?? '').trim(),
      origine: (d.origine ?? 'manuale').trim(),
      conversazioneId: (d.conversazioneId ?? '').trim(),
      chiamataId: (d.chiamataId ?? '').trim(),
      note: (d.note ?? '').trim(),
      seguitoDaId: chi?.id ?? '',
      seguitoDaNome: chi?.nome ?? '',
    },
    select: { id: true },
  })
  return { ok: true, id: p.id }
}

/**
 * Manda il preventivo: crea la bozza su Shopify col link di pagamento.
 *
 * ⚠️⚠️ È una BOZZA, non un ordine: il cliente paga da lì e solo allora l'ordine
 * esiste. Registrare un incasso adesso vorrebbe dire scrivere nei conti soldi
 * che non sono arrivati.
 *
 * ⚠️ Il link NON parte da solo: si copia e si manda con le proprie parole. Un
 * prezzo è una cosa che si accompagna — un link secco a chi ha chiesto «quanto
 * verrebbe» sembra un preventivo fatto da una macchina, che è esattamente quello
 * che non vogliamo sembrare.
 */
export async function inviaPreventivo(
  id: string,
  d: { importo: number; descrizione: string; giorniValidita?: number },
  chi: { id: string; nome: string } | null
): Promise<{ ok: true; link: string; bozza: string } | { ok: false; errore: string }> {
  const p = await db.preventivo.findUnique({ where: { id } })
  if (!p) return { ok: false, errore: 'Preventivo non trovato.' }
  if (!p.negozioId) {
    // ⚠️ Il marchio serve DAVVERO: la bozza nasce dentro un negozio Shopify, e
    // sceglierne uno a caso vorrebbe dire mandare al cliente un link col nome
    // del brand sbagliato.
    return { ok: false, errore: 'Scegli il marchio: la bozza nasce dentro un negozio Shopify.' }
  }
  const importo = Number(d.importo)
  if (!Number.isFinite(importo) || importo <= 0) {
    return { ok: false, errore: 'Scrivi il prezzo: un preventivo senza importo non è un preventivo.' }
  }
  const descrizione = (d.descrizione ?? '').trim() || p.richiesta.slice(0, 120)

  const pezzi = (p.clienteNome ?? '').trim().split(/\s+/)
  const esito = await creaOrdine({
    negozioId: p.negozioId,
    cliente: {
      nome: pezzi[0] ?? '',
      // ⚠️ Se ha un nome solo il cognome resta VUOTO: inventarlo scriverebbe un
      // dato falso su un cliente vero.
      cognome: pezzi.slice(1).join(' '),
      email: p.email,
      telefono: p.telefono,
    },
    consegna: {
      data: p.dataConsegna ? p.dataConsegna.toISOString().slice(0, 10) : '',
      fascia: p.fasciaConsegna,
      indirizzo: '',
      civicoNote: '',
      cap: '',
      citta: p.citta,
      provincia: '',
      paese: '',
    },
    righe: [{ titolo: descrizione, prezzo: importo, quantita: 1 }],
    biglietto: '',
    spedizione: { titolo: '', prezzo: 0 },
    pagamento: 'link',
    mezzoPagamento: '',
    operatore: chi ? { id: chi.id, nome: chi.nome } : undefined,
  })
  if (!esito.ok) return { ok: false, errore: esito.errore }

  const giorni = Number(d.giorniValidita)
  const validoFinoAl =
    Number.isFinite(giorni) && giorni > 0 ? new Date(Date.now() + giorni * 86400000) : null

  await db.preventivo.update({
    where: { id },
    data: {
      stato: 'inviato',
      importo,
      bozzaNome: esito.ordineNumero,
      linkPagamento: esito.linkPagamento,
      inviatoIl: new Date(),
      validoFinoAl,
      seguitoDaId: chi?.id ?? p.seguitoDaId,
      seguitoDaNome: chi?.nome ?? p.seguitoDaNome,
    },
  })
  return { ok: true, link: esito.linkPagamento, bozza: esito.ordineNumero }
}

/** Chiude un preventivo: accettato, rifiutato o scaduto. */
export async function chiudiPreventivo(
  id: string,
  stato: string,
  d: { ordineNumero?: string; note?: string },
  chi: { nome: string } | null
): Promise<{ ok: boolean; errore?: string }> {
  if (!['accettato', 'rifiutato', 'scaduto'].includes(stato)) {
    return { ok: false, errore: 'Stato non valido.' }
  }
  const p = await db.preventivo.findUnique({ where: { id }, select: { note: true } })
  if (!p) return { ok: false, errore: 'Preventivo non trovato.' }

  const nota = (d.note ?? '').trim()
  await db.preventivo.update({
    where: { id },
    data: {
      stato,
      chiusoIl: new Date(),
      chiusoDaNome: chi?.nome ?? '',
      ...(d.ordineNumero?.trim() ? { ordineNumero: d.ordineNumero.trim() } : {}),
      // ⚠️ La nota si AGGIUNGE: quella di prima è il lavoro di qualcun altro, e
      // chiudere un preventivo non è un buon motivo per cancellarlo.
      ...(nota ? { note: p.note ? `${p.note}\n${nota}` : nota } : {}),
    },
  })
  return { ok: true }
}

/** Cambia il marchio o i dati del cliente di un preventivo già aperto. */
export async function aggiornaPreventivo(
  id: string,
  d: { negozioId?: string; clienteNome?: string; email?: string; telefono?: string; note?: string }
): Promise<{ ok: boolean; errore?: string }> {
  const esiste = await db.preventivo.findUnique({ where: { id }, select: { id: true } })
  if (!esiste) return { ok: false, errore: 'Preventivo non trovato.' }
  await db.preventivo.update({
    where: { id },
    data: {
      // ⚠️ Solo i campi ARRIVATI: un form parziale non deve azzerare quello che
      // non contiene (è già successo con «Sospendi» sui negozi, 26/08/2026).
      ...(d.negozioId === undefined ? {} : { negozioId: d.negozioId.trim() || null }),
      ...(d.clienteNome === undefined ? {} : { clienteNome: d.clienteNome.trim() }),
      ...(d.email === undefined ? {} : { email: d.email.trim().toLowerCase() }),
      ...(d.telefono === undefined
        ? {}
        : { telefono: d.telefono.trim(), cifre: cifreTelefono(d.telefono) }),
      ...(d.note === undefined ? {} : { note: d.note.trim() }),
    },
  })
  return { ok: true }
}
