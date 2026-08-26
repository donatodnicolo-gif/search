import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Casistiche di partenza: le più comuni per un servizio di consegna fiori/dolci.
// Sono un punto di partenza modificabile, non una gabbia. Le azioni sono una per
// riga. La colpa tipica è solo un default: sul singolo reclamo si cambia.
const ESEMPI = [
  {
    nome: 'Consegna in ritardo',
    descrizione: 'La consegna è arrivata dopo la fascia oraria concordata.',
    colpaTipica: 'valet',
    gravita: 2,
    azioni: 'Verificare orario reale di consegna\nScusarsi con il cliente\nValutare rimborso spedizione o omaggio',
  },
  {
    nome: 'Mancata consegna',
    descrizione: 'La consegna non è mai avvenuta nella data prevista.',
    colpaTipica: 'valet',
    gravita: 3,
    azioni: 'Contattare il cliente e capire cosa è successo\nRiprogrammare la consegna in urgenza\nValutare rimborso o riordino a nostro carico',
  },
  {
    nome: 'Prodotto danneggiato o appassito',
    descrizione: 'Il prodotto è arrivato rovinato, appassito o di qualità non conforme.',
    colpaTipica: 'partner',
    gravita: 3,
    azioni: 'Farsi mandare una foto dal cliente\nAprire contestazione con il partner/fornitore\nRiordino sostitutivo o rimborso',
  },
  {
    nome: 'Prodotto errato',
    descrizione: 'È stato consegnato un prodotto diverso da quello ordinato.',
    colpaTipica: 'partner',
    gravita: 2,
    azioni: 'Confrontare ordine e prodotto consegnato\nOrganizzare la sostituzione\nAvvisare il partner dell’errore',
  },
  {
    nome: 'Indirizzo o destinatario sbagliato',
    descrizione: 'La consegna è avvenuta all’indirizzo o alla persona sbagliata.',
    colpaTipica: 'azienda',
    gravita: 3,
    azioni: 'Verificare l’indirizzo sull’ordine\nRecuperare o rifare la consegna\nCorreggere l’anagrafica del cliente',
  },
  {
    nome: 'Biglietto mancante o errato',
    descrizione: 'Il biglietto/dedica non è stato inserito o riporta un testo sbagliato.',
    colpaTipica: 'partner',
    gravita: 1,
    azioni: 'Recuperare il testo corretto del biglietto\nInviare scuse al cliente\nSegnalare al partner',
  },
  {
    nome: 'Comportamento del corriere',
    descrizione: 'Il cliente lamenta il comportamento o la cura del valet in consegna.',
    colpaTipica: 'valet',
    gravita: 2,
    azioni: 'Raccogliere il racconto del cliente\nParlare con il valet\nAnnotare per il giudizio del valet',
  },
]

// Aggiunge le casistiche di esempio SENZA duplicare quelle già presenti (match
// sul nome). Torna quante ne ha aggiunte e quante saltate.
export async function POST() {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const presenti = await db.casistaReclamo.findMany({ select: { nome: true } })
  const nomiPresenti = new Set(presenti.map((c) => c.nome.toLowerCase()))
  const daAggiungere = ESEMPI.filter((e) => !nomiPresenti.has(e.nome.toLowerCase()))
  if (daAggiungere.length) {
    await db.casistaReclamo.createMany({ data: daAggiungere })
  }
  return NextResponse.json({
    aggiunte: daAggiungere.length,
    saltate: ESEMPI.length - daAggiungere.length,
  })
}
