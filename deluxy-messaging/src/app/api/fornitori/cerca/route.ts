import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { partnerAttivi } from '@/lib/anagrafiche'
import {
  chiaveNome,
  nomeCorrisponde,
  unisci,
  type FornitoreTrovato,
} from '@/lib/cerca-fornitore'

export const dynamic = 'force-dynamic'

// CERCA UN FORNITORE FRA QUELLI CHE GIÀ CONOSCIAMO.
//
//   GET /api/fornitori/cerca?q=rossi
//
// Tre fonti, in ordine di quanto risparmiano a chi sta compilando:
//  1. **le richieste di pagamento già fatte** — qui c'è l'IBAN, cioè l'unica
//     cosa che non si può ricavare da nessun'altra parte;
//  2. **gli ordini che gli abbiamo già dato** — nome, città, telefono, e quanto
//     gli abbiamo pattuito l'ultima volta;
//  3. **il registro Anagrafiche** — ragione sociale (che è quella che va
//     sull'IBAN), città, recapiti.
//
// ⚠️ Il registro NON ha gli IBAN: li conosciamo solo perché li abbiamo usati.
// Per questo la prima fonte è la nostra tabella e non l'anagrafica.
//
// ⚠️ Una fonte che non risponde NON fa fallire la ricerca: se Anagrafiche è
// giù, quello che sappiamo in casa vale lo stesso. Una ricerca che si rifiuta
// di rispondere perché una fonte su tre è lenta è una ricerca che non si usa.

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ fornitori: [], nota: '' })
  const chiave = chiaveNome(q)

  const [daPagamenti, daOrdini, daRegistro] = await Promise.all([
    db.richiestaPagamento
      .findMany({
        where: { intestatario: { contains: q, mode: 'insensitive' } },
        orderBy: { creatoIl: 'desc' },
        take: 200,
        select: { intestatario: true, iban: true, creatoIl: true },
      })
      .catch(() => []),
    db.ordine
      .findMany({
        where: { fornitoreNome: { contains: q, mode: 'insensitive' } },
        orderBy: { fornitoreIl: 'desc' },
        take: 200,
        select: {
          fornitoreNome: true,
          fornitoreCitta: true,
          fornitoreTelefono: true,
          fornitoreEmail: true,
          fornitoreCosto: true,
        },
      })
      .catch(() => []),
    partnerAttivi({ q, perPagina: 20, stato: 'tutti' }).catch(() => ({
      stato: 'errore' as const,
      messaggio: 'registro non raggiungibile',
    })),
  ])

  const pezzi: FornitoreTrovato[] = []

  // ── 1. Chi abbiamo già pagato ──
  const perNome = new Map<string, { nome: string; iban: Set<string>; primo: string; quanti: number }>()
  for (const r of daPagamenti) {
    const k = chiaveNome(r.intestatario)
    if (!k) continue
    const p = perNome.get(k) ?? { nome: r.intestatario, iban: new Set<string>(), primo: '', quanti: 0 }
    p.quanti++
    const iban = (r.iban || '').replace(/\s+/g, '').toUpperCase()
    if (iban) {
      // ⚠️ Le richieste arrivano dalla più recente: il primo IBAN che si vede è
      // quello dell'ultimo pagamento, ed è quello che si propone — se è l'unico.
      if (!p.primo) p.primo = iban
      p.iban.add(iban)
    }
    perNome.set(k, p)
  }
  for (const p of perNome.values()) {
    pezzi.push({
      nome: p.nome,
      ragioneSociale: '',
      citta: '',
      telefono: '',
      email: '',
      // ⚠️⚠️ Con più IBAN diversi NON se ne propone nessuno. Due IBAN vogliono
      // dire che è cambiato qualcosa — un conto nuovo, un'altra società, un
      // omonimo — e indovinare vuol dire mandare i soldi a qualcun altro.
      iban: p.iban.size === 1 ? p.primo : '',
      ibanDiversi: p.iban.size,
      ordini: 0,
      ultimoCosto: null,
      pagamenti: p.quanti,
      fonti: ['pagamento'],
      stato: '',
    })
  }

  // ── 2. Chi ha già preparato ordini per noi ──
  const perOrdine = new Map<string, FornitoreTrovato>()
  for (const o of daOrdini) {
    const k = chiaveNome(o.fornitoreNome)
    if (!k) continue
    const prec = perOrdine.get(k)
    if (prec) {
      prec.ordini++
      continue
    }
    perOrdine.set(k, {
      nome: o.fornitoreNome,
      ragioneSociale: '',
      citta: o.fornitoreCitta,
      telefono: o.fornitoreTelefono,
      email: o.fornitoreEmail,
      iban: '',
      ibanDiversi: 0,
      ordini: 1,
      // Gli ordini arrivano dal più recente: il primo costo che si vede è
      // l'ultimo pattuito.
      ultimoCosto: o.fornitoreCosto,
      pagamenti: 0,
      fonti: ['ordine'],
      stato: '',
    })
  }
  pezzi.push(...perOrdine.values())

  // ── 3. Il registro ──
  let nota = ''
  if (daRegistro.stato === 'ok') {
    for (const p of daRegistro.partner) {
      pezzi.push({
        nome: p.nome || p.ragioneSociale,
        ragioneSociale: p.ragioneSociale,
        citta: p.citta,
        telefono: p.telefono,
        email: p.email,
        iban: '',
        ibanDiversi: 0,
        ordini: 0,
        ultimoCosto: null,
        pagamenti: 0,
        fonti: ['registro'],
        stato: p.stato === 'attivo' ? 'Partner' : 'In anagrafica',
      })
    }
  } else if (daRegistro.stato === 'non-configurato') {
    nota = 'Il registro Anagrafiche non è collegato: si cerca solo fra ordini e pagamenti nostri.'
  } else {
    nota = 'Il registro Anagrafiche non ha risposto: qui sotto c’è solo quello che sappiamo in casa.'
  }

  // ⚠️⚠️ SI TIENE SOLO CHI SI CHIAMA DAVVERO COSI.
  //
  // Il registro Anagrafiche cerca anche dentro le NOTE: misurato, «rossi»
  // rispondeva ANTONIO MARRAS, BRIONI e DOLCE & GABBANA, perche nelle loro note
  // c e scritto «p*rossi*ma settimana». In un elenco da cui si sceglie chi
  // pagare, quel rumore fa cliccare il nome sbagliato.
  //
  // ⚠️ Il filtro sta QUI e non nella chiamata al registro: la ricerca larga la
  // fa lui e non possiamo cambiarla: quello che possiamo fare e non mostrarne i
  // risultati che non c entrano.
  const fornitori = unisci(pezzi.filter((p) => nomeCorrisponde(p, q))).slice(0, 12)
  return NextResponse.json({ fornitori, nota, cercato: chiave })
}
