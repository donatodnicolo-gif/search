import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { partnerAttivi } from '@/lib/anagrafiche'
import { calcolaPagella, type DatiSoggetto, type Voce } from '@/lib/punteggi'

export const dynamic = 'force-dynamic'

// LA PAGELLA di valet e partner: per ogni soggetto mette insieme i dati grezzi
// (reclami, feedback, puntualità, valori a mano) e li dà in pasto al calcolo
// configurabile di src/lib/punteggi.ts.
//
// Chi entra in pagella:
//  - TUTTI i valet attivi (sono pochi e sono nostri: uno senza dati va visto)
//  - TUTTI i partner attivi del registro Anagrafiche, se il registro risponde;
//    se non risponde, almeno quelli su cui abbiamo già un dato — così la pagella
//    non si svuota per un problema di rete.
export async function GET(req: NextRequest) {
  const tipo = (req.nextUrl.searchParams.get('tipo') ?? '').trim() // valet | partner | ''

  const [vociDb, valetDb, reclami, feedback, puntualita, manuali] = await Promise.all([
    db.vocePunteggio.findMany({ where: { attiva: true } }),
    db.valet.findMany({ where: { attivo: true }, orderBy: { nome: 'asc' } }),
    db.reclamo.findMany({
      where: { colpaTipo: { in: ['valet', 'partner'] }, colpaId: { not: '' } },
      select: { colpaTipo: true, colpaId: true, colpaNome: true, gravita: true, stato: true },
    }),
    db.feedback.findMany({
      select: { soggettoTipo: true, soggettoId: true, soggettoNome: true, voto: true },
    }),
    db.puntualita.findMany({ select: { valetId: true, minutiRitardo: true } }),
    db.metricaManuale.findMany(),
  ])

  const voci: Voce[] = vociDb.map((v) => ({
    id: v.id,
    nome: v.nome,
    soggetto: v.soggetto,
    fonte: v.fonte,
    peso: v.peso,
    soglia: v.soglia,
  }))

  // Indice dei soggetti da mettere in pagella: chiave "tipo:id".
  const soggetti = new Map<string, { tipo: string; id: string; nome: string }>()
  const aggiungi = (t: string, id: string, nome: string) => {
    if (!id) return
    if (tipo && t !== tipo) return
    const k = `${t}:${id}`
    const gia = soggetti.get(k)
    // Un nome vero batte sempre un nome vuoto.
    if (!gia) soggetti.set(k, { tipo: t, id, nome })
    else if (!gia.nome && nome) gia.nome = nome
  }

  for (const v of valetDb) aggiungi('valet', v.id, v.nome)

  // Partner dal registro; se non risponde si va avanti coi soli partner noti.
  let registroNota = ''
  if (!tipo || tipo === 'partner') {
    const esito = await partnerAttivi({ perPagina: 200 })
    if (esito.stato === 'ok') {
      for (const p of esito.partner) aggiungi('partner', p.id, p.nome || p.ragioneSociale)
    } else {
      registroNota =
        esito.stato === 'non-configurato'
          ? 'Registro Anagrafiche non collegato: in pagella solo i partner su cui c’è già un dato.'
          : `Registro Anagrafiche non raggiungibile (${esito.messaggio}): in pagella solo i partner su cui c’è già un dato.`
    }
  }

  // Chi ha almeno un dato entra comunque (anche se il registro non l'ha dato).
  for (const r of reclami) aggiungi(r.colpaTipo, r.colpaId, r.colpaNome)
  for (const f of feedback) aggiungi(f.soggettoTipo, f.soggettoId, f.soggettoNome)
  for (const m of manuali) aggiungi(m.soggettoTipo, m.soggettoId, '')

  // Dati grezzi per soggetto.
  const pagelle = [...soggetti.values()].map((s) => {
    const dati: DatiSoggetto = {
      tipo: s.tipo,
      id: s.id,
      nome: s.nome || '(senza nome)',
      reclami: reclami
        .filter((r) => r.colpaTipo === s.tipo && r.colpaId === s.id)
        .map((r) => ({ gravita: r.gravita, stato: r.stato })),
      votiFeedback: feedback
        .filter((f) => f.soggettoTipo === s.tipo && f.soggettoId === s.id)
        .map((f) => f.voto),
      // La puntualità esiste solo per i valet.
      ritardi:
        s.tipo === 'valet'
          ? puntualita.filter((p) => p.valetId === s.id).map((p) => p.minutiRitardo)
          : [],
      manuali: Object.fromEntries(
        manuali
          .filter((m) => m.soggettoTipo === s.tipo && m.soggettoId === s.id)
          .map((m) => [m.voceId, m.valore])
      ),
    }
    return calcolaPagella(dati, voci)
  })

  // Prima chi è davvero valutabile, dal peggiore al migliore: chi ha bisogno di
  // attenzione sta in cima. Chi non ha prove sufficienti va in fondo in ordine
  // alfabetico — non è una classifica, è una lista di "da misurare".
  pagelle.sort((a, b) => {
    if (a.attendibile !== b.attendibile) return a.attendibile ? -1 : 1
    if (!a.attendibile) return a.nome.localeCompare(b.nome)
    return (a.punteggio ?? 0) - (b.punteggio ?? 0)
  })

  const valutabili = pagelle.filter((p) => p.attendibile).length

  // `soloValutabili=1` toglie di mezzo chi non ha ancora prove: con 41 partner
  // in registro e i dati che arrivano poco a poco, è la vista che serve di solito.
  const soloValutabili = req.nextUrl.searchParams.get('soloValutabili') === '1'

  return NextResponse.json({
    pagelle: soloValutabili ? pagelle.filter((p) => p.attendibile) : pagelle,
    voci,
    registroNota,
    valutabili,
    totale: pagelle.length,
  })
}
