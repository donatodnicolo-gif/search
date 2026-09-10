import { NextRequest, NextResponse } from 'next/server'
import { autentica, erroreApi } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { chiaveNome } from '@/lib/cerca-fornitore'
import { chiPrepara } from '@/lib/chi-prepara'

export const dynamic = 'force-dynamic'

// GET /api/v1/fornitori?giorni=180 — A CHI ABBIAMO DATO ORDINI, E QUANTI, per
// le altre app (oggi: Scout, che nelle schermate Fornitori e Segnalazioni CS
// vuole vedere accanto a ogni fornitore «quanti ordini negli ultimi 30 giorni,
// quanti negli ultimi 180» — richiesta dell'utente del 10/09/2026).
//
// ⭐ È la CASA di questo dato: l'assegnazione di un ordine a un fornitore la
// decide il Customer Service (`Ordine.fornitoreNome/fornitoreId/fornitoreIl`),
// quindi il conteggio si fa qui e le altre app lo leggono. Rifarlo altrove
// vorrebbe dire due numeri diversi per la stessa domanda.
//
// ⚠️ Si conta l'ORDINE DATO, non il pagamento: «quanti ordini gli abbiamo
// affidato» è la domanda di chi va a visitarlo (fornitori-usati.ts risponde
// invece a «quanto gli abbiamo pagato», che è un'altra cosa). La data è quella
// dell'assegnazione (`fornitoreIl`); per le righe vecchie senza, la data
// dell'ordine.
//
// ⚠️ Fuori: gli annullati su Shopify (non si sono fatti) e gli ordini uniti a
// un altro (`unitoA`: sono la stessa vendita scritta due volte).
//
// ⚠️ Si raggruppa per id del registro Anagrafiche quando c'è; altrimenti per
// nome normalizzato (`chiaveNome`), lo stesso che usa la ricerca fornitori.
// Chi legge aggancia per id e, in ripiego, per nome — e sa che il secondo
// aggancio è meno sicuro perché glielo diciamo (`id` vuoto).
//
// Cosa NON esce di qui: `fornitoreCosto` (quanto gli diamo). Il venduto è il
// totale pagato dal cliente: serve a pesare il fornitore, non a rifare i conti.
//
// Parametri:
//   giorni   la finestra LUNGA, 1..730 (default 180). Quella breve è sempre 30.

type VenditeFornitore = {
  /** L'id nel registro Anagrafiche ('' = non collegato al registro). */
  id: string
  nome: string
  /** `chiaveNome(nome)`: per agganciare chi non ha l'id. */
  chiave: string
  ordini30: number
  ordiniLunga: number
  venduto30: number
  vendutoLunga: number
  /** L'ultimo ordine affidato: quando e quale. */
  ultimoIl: string | null
  ultimoNumero: string
  /**
   * L'ultimo PAGAMENTO fatto a questo fornitore (`RichiestaPagamento.pagataIl`,
   * senza finestra: è una data, non un conteggio). Serve a Scout per
   * «ultimo aggiornamento» (10/09/2026): pagare un fornitore lo rimette in cima.
   */
  ultimoPagamentoIl: string | null
}

const FINESTRA_BREVE = 30

export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const grezzo = Number(req.nextUrl.searchParams.get('giorni') ?? '180')
  if (!Number.isFinite(grezzo) || grezzo < 1 || grezzo > 730) {
    return erroreApi(400, 'giorni deve essere un numero fra 1 e 730')
  }
  const lunga = Math.round(grezzo)
  const adesso = new Date()
  const daLunga = new Date(adesso.getTime() - lunga * 86400000)
  const daBreve = new Date(adesso.getTime() - FINESTRA_BREVE * 86400000)

  // Si legge dalla finestra lunga e si spacchetta qui: due query direbbero la
  // stessa cosa due volte.
  const righe = await db.ordine.findMany({
    where: {
      fornitoreNome: { not: '' },
      annullatoIl: null,
      unitoA: '',
      OR: [{ fornitoreIl: { gte: daLunga } }, { fornitoreIl: null, data: { gte: daLunga } }],
    },
    select: {
      numero: true,
      totale: true,
      valuta: true,
      data: true,
      fornitoreIl: true,
      fornitoreId: true,
      fornitoreNome: true,
    },
  })

  // I pagamenti FATTI (`pagataIl` valorizzato: è tutta la differenza fra
  // «gli abbiamo chiesto di pagarlo» e «l'abbiamo pagato»), per chi prepara.
  // Nessuna finestra: l'ultimo pagamento è una data, e un fornitore pagato
  // sette mesi fa è comunque «aggiornato» a quella data.
  const pagate = await db.richiestaPagamento.findMany({
    where: { pagataIl: { not: null }, intestatario: { not: '' } },
    select: { intestatario: true, fornitore: true, pagataIl: true },
  })
  const ultimoPagamento = new Map<string, Date>()
  for (const r of pagate) {
    const k = chiaveNome(chiPrepara(r))
    if (!k || !r.pagataIl) continue
    const prec = ultimoPagamento.get(k)
    if (!prec || r.pagataIl > prec) ultimoPagamento.set(k, r.pagataIl)
  }

  const per = new Map<string, VenditeFornitore>()
  const valute = new Set<string>()
  const vuoto = (id: string, nome: string, chiave: string): VenditeFornitore => ({
    id,
    nome,
    chiave,
    ordini30: 0,
    ordiniLunga: 0,
    venduto30: 0,
    vendutoLunga: 0,
    ultimoIl: null,
    ultimoNumero: '',
    ultimoPagamentoIl: ultimoPagamento.get(chiave)?.toISOString() ?? null,
  })
  for (const o of righe) {
    const nome = o.fornitoreNome.trim()
    const chiave = chiaveNome(nome)
    if (!chiave) continue
    const id = (o.fornitoreId ?? '').trim()
    const k = id ? `id:${id}` : `nome:${chiave}`
    const quando = o.fornitoreIl ?? o.data
    const f = per.get(k) ?? vuoto(id, nome, chiave)
    f.ordiniLunga++
    f.vendutoLunga += o.totale ?? 0
    if (quando >= daBreve) {
      f.ordini30++
      f.venduto30 += o.totale ?? 0
    }
    const iso = quando.toISOString()
    if (!f.ultimoIl || iso > f.ultimoIl) {
      f.ultimoIl = iso
      f.ultimoNumero = o.numero
      // Il nome mostrato è quello dell'ultimo ordine: è come lo si chiama oggi.
      f.nome = nome
    }
    valute.add(o.valuta || 'EUR')
    per.set(k, f)
  }
  // Chi è stato pagato ma non ha ordini nella finestra entra lo stesso, a
  // zero ordini: la data del pagamento è l'informazione, e va data.
  for (const [chiave, quando] of ultimoPagamento) {
    const giaConOrdini = [...per.values()].some((f) => f.chiave === chiave)
    if (giaConOrdini) continue
    const nome = pagate.find((r) => chiaveNome(chiPrepara(r)) === chiave)
    per.set(`nome:${chiave}`, { ...vuoto('', nome ? chiPrepara(nome) : chiave, chiave), ultimoPagamentoIl: quando.toISOString() })
  }

  const fornitori = [...per.values()].sort(
    (a, b) => b.ordiniLunga - a.ordiniLunga || a.nome.localeCompare(b.nome, 'it')
  )
  return NextResponse.json({
    ok: true,
    asOf: adesso.toISOString(),
    finestre: { breve: FINESTRA_BREVE, lunga },
    fornitori,
    ordini: righe.length,
    // ⚠️ Se un giorno arrivano valute diverse, sommare i venduti mentirebbe:
    // lo si dice invece di sommare mele e pere.
    valuteDiverse: [...valute],
  })
}
