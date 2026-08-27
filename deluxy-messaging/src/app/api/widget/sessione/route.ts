import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { normalizzaSlug } from '@/lib/widget-siti'
import { classificaProvenienza } from '@/lib/provenienza'

export const dynamic = 'force-dynamic'

// Apre una sessione di chat per un visitatore del sito (API pubblica).
// Il token casuale è l'unica chiave della conversazione: chi non lo ha
// non può leggerla, e non contiene dati personali.
// ── QUANTE SESSIONI PUÒ APRIRE LO STESSO VISITATORE ──
//
// ⚠️⚠️ Questa rotta è PUBBLICA e ogni chiamata scriveva una riga
// `Conversazione`, senza nessun tetto, su un Postgres condiviso con altre
// tredici app. Un ciclo `curl` di dieci righe riempiva la tabella e l'inbox del
// servizio clienti di visitatori che non esistono — e, con le risposte
// automatiche accese, faceva anche partire chiamate a pagamento verso l'AI.
//
// ⚠️ Il freno vive nella MEMORIA della funzione, e va detto cosa vuol dire: su
// Vercel le istanze sono più d'una e si spengono, quindi questo non è un limite
// esatto — è un tetto per istanza. Trasforma «illimitato da un solo script» in
// «qualche decina», che è un'altra cosa, ma **non sostituisce** un firewall
// davanti (Vercel Firewall / Attack Challenge Mode), che è lo strumento giusto
// per questo mestiere e va acceso dal pannello, non dal codice.
//
// ⚠️ Il tetto è largo apposta: un visitatore vero ne apre UNA (il widget chiede
// il token solo quando sta per mandare il primo messaggio, vedi
// `src/app/widget/page.tsx`). Dieci all'ora lasciano spazio a una famiglia
// dietro lo stesso IP di ufficio e uccidono lo script.
const TETTO_ORARIO = 10
const recenti = new Map<string, number[]>()

function troppeSessioni(ip: string): boolean {
  const adesso = Date.now()
  const finestra = adesso - 3600_000
  // ⚠️ Si ripulisce mentre si conta: senza, la mappa cresce per sempre e diventa
  // essa stessa la perdita di memoria che il tetto voleva evitare.
  for (const [k, v] of recenti) {
    const vivi = v.filter((t) => t > finestra)
    if (vivi.length) recenti.set(k, vivi)
    else recenti.delete(k)
  }
  const miei = recenti.get(ip) ?? []
  if (miei.length >= TETTO_ORARIO) return true
  recenti.set(ip, [...miei, adesso])
  return false
}

export async function POST(req: NextRequest) {
  // ⚠️ `x-forwarded-for` è una lista: il PRIMO è il client, gli altri sono i
  // proxy. Prendere l'ultimo vorrebbe dire contare tutti insieme sotto Vercel.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sconosciuto'
  if (troppeSessioni(ip)) {
    // ⚠️ 429 e non 400: chi ha davvero premuto troppo in fretta deve capire che
    // deve solo aspettare, e un client serio sa cosa farne.
    return NextResponse.json(
      { errore: 'Troppe chat aperte da qui: riprova fra qualche minuto.' },
      { status: 429 }
    )
  }

  const { nome, sito, provenienza } = (await req.json().catch(() => ({}))) as {
    nome?: string
    sito?: string
    // Quello che la PAGINA OSPITE sapeva quando la chat si è aperta: utm, gclid,
    // sito che ha mandato, pagina. Dentro l'iframe non si potrebbe sapere —
    // `document.referrer` là dentro è il sito stesso.
    provenienza?: Record<string, string>
  }
  const token = crypto.randomBytes(24).toString('hex')
  const da = classificaProvenienza(provenienza ?? {})

  // Da QUALE SITO arriva la chat, salvato nello stesso campo del numero WhatsApp
  // e dell'account Meta: fa lo stesso mestiere, dice a chi ha scritto il
  // cliente. Senza, le chat dei tre siti finivano tutte in «Senza marchio» e in
  // Inbox non si sapeva se il visitatore stava guardando i fiori o le torte.
  const slugSito = normalizzaSlug(sito ?? '')

  await db.conversazione.create({
    data: {
      canale: 'widget',
      idEsterno: token,
      numeroId: slugSito,
      nome: (nome ?? '').trim().slice(0, 80) || 'Visitatore sito',
      origine: da.origine,
      origineDettaglio: da.dettaglio,
      paginaIngresso: da.pagina,
    },
  })

  return NextResponse.json({ token })
}
