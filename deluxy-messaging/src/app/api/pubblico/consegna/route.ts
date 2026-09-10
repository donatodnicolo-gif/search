import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leggiOrario } from '@/lib/orari-regole'
import { adessoRoma, calendarioConsegna, scriviDataBreve } from '@/lib/orari-regole'

export const dynamic = 'force-dynamic'

// ⭐ GET /api/pubblico/consegna?dominio=deluxygifts.myshopify.com[&oraMinima=10][&leadGiorni=0][&giorni=60]
//
// LE DATE E LE FASCE DI CONSEGNA PER I SITI SHOPIFY (10/09/2026, richiesta
// dell'utente: «prepara le version to work di Shopify in modo tale che tutte le
// tabelle recepiscano le date da te»). Il tema del sito chiama questa rotta dal
// browser del cliente e da qui costruisce il calendario (giorni spenti con il
// motivo) e la tendina delle fasce. La regola è UNA e sta in orari-regole.ts.
//
// ⚠️ PUBBLICA E SENZA CHIAVE, di proposito: chi legge è il browser di un
// cliente qualunque, e quello che esce è quello che il sito mostra a tutti
// (giorni aperti, fasce). Niente dati di persone, niente segreti. Fuori dal
// cancello del middleware (`api/pubblico` nel matcher) e con CORS aperto.
//
// ⚠️ Il tempo è quello ITALIANO del server (`adessoRoma`), non l'orologio del
// cliente: un cliente a Londra alle 19:30 locali ordina alle 20:30 italiane.
//
// ⚠️ Scala: è una chiamata per apertura del carrello/scheda prodotto sui siti
// dei CLIENTI, cioè l'unico punto che cresce con le visite. Una query sola
// (negozio + orario) e `Cache-Control` di 60 s condiviso (s-maxage) sull'edge
// di Vercel: cento visitatori nello stesso minuto = una lettura del database.
// Il calcolo cambia solo al cambio di minuto e con i vincoli del carrello,
// che stanno nella query string e quindi nella chiave di cache.
//
// Vincoli che conosce solo il sito e ci passa: `oraMinima` (il massimo dei
// `custom.minimo_orario` dei prodotti in carrello, in ore) e `leadGiorni` (il
// massimo dei `prodotto.consegna`, giorni di preavviso).
//
// Risposta: { negozio, configurato, adesso:{data,ora}, primoGiorno, giorni:[{data, etichetta, quando, ok, motivo, fasce:[{da,a,valore,etichetta}]}] }
//   · `configurato: false` = nessuno ha impostato orari per questo negozio: il
//     sito NON deve applicare niente e tiene le sue regole. Lo diciamo, non lo
//     nascondiamo dietro un calendario «tutto aperto».
//   · `valore` è la fascia come la vuole il tema («08-10», «14-15»), `etichetta`
//     come la legge il cliente («08:00–10:00»).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
}

function rispondi(corpo: unknown, status = 200, cache = 'public, max-age=30, s-maxage=60, stale-while-revalidate=60') {
  return NextResponse.json(corpo, { status, headers: { ...CORS, 'Cache-Control': cache } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const dominio = (p.get('dominio') ?? '').trim().toLowerCase()
  if (!dominio) return rispondi({ errore: 'Manca il dominio del negozio (?dominio=xxx.myshopify.com).' }, 400, 'no-store')
  const num = (k: string, min: number, max: number, se: number) => {
    const v = Number(p.get(k))
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : se
  }
  const oraMinima = num('oraMinima', 0, 23, 0)
  const leadGiorni = num('leadGiorni', 0, 365, 0)

  const negozio = await db.negozioShopify.findFirst({
    where: { dominio: { equals: dominio, mode: 'insensitive' } },
    select: { id: true, nome: true, dominio: true, attivo: true, orario: true },
  })
  if (!negozio) return rispondi({ errore: 'Nessun negozio con questo dominio.' }, 404, 'no-store')

  const adesso = adessoRoma()
  const oraTesto = `${String(Math.floor(adesso.minuti / 60)).padStart(2, '0')}:${String(adesso.minuti % 60).padStart(2, '0')}`
  if (!negozio.orario) {
    return rispondi({
      negozio: { nome: negozio.nome, dominio: negozio.dominio },
      configurato: false,
      adesso: { data: adesso.data, ora: oraTesto },
      primoGiorno: null,
      giorni: [],
      nota: 'Nessun orario impostato per questo negozio nel Customer Service: il sito tiene le sue regole.',
    })
  }
  const dati = leggiOrario(negozio.orario)
  const giorni = num('giorni', 1, 366, dati.regole.giorniMostrati)
  const calendario = calendarioConsegna(dati, adesso, { oraMinima, leadGiorni }, giorni)
  const perCliente = (hhmm: string) => hhmm // «08:00»
  return rispondi({
    negozio: { nome: negozio.nome, dominio: negozio.dominio },
    configurato: true,
    adesso: { data: adesso.data, ora: oraTesto },
    vincoli: { oraMinima, leadGiorni },
    primoGiorno: calendario.find((g) => g.ok)?.data ?? null,
    giorni: calendario.map((g) => ({
      data: g.data,
      etichetta: `${g.quando === 'oggi' ? 'Oggi, ' : g.quando === 'domani' ? 'Domani, ' : ''}${scriviDataBreve(g.data).slice(0, 9)}`,
      quando: g.quando,
      ok: g.ok,
      motivo: g.motivo,
      fasce: g.fasce.map((f, i) => ({ da: f.da, a: f.a, valore: g.etichette[i], etichetta: `${perCliente(f.da)}–${perCliente(f.a)}` })),
    })),
  })
}
