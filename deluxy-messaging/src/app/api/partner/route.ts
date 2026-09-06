import { NextRequest, NextResponse } from 'next/server'
import { partnerAttivi } from '@/lib/anagrafiche'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// I partner attivi, letti dal registro Anagrafiche. Passa di qui e non dal
// browser perché la chiave del registro non deve mai uscire dal server.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  // ⚠️ `stato=tutti` = anche prospect e gli altri stati del registro (utente,
  // 06/09/2026: «cerco modena ma esce 0, mentre un ordine in provincia di
  // Modena mostra dei fornitori» — quelli erano PROSPECT, e questa pagina
  // chiedeva al registro solo gli attivi). Di suo restano gli attivi.
  const stato = p.get('stato') === 'tutti' ? 'tutti' : 'attivo'
  // ⚠️ La città può arrivare più volte: sono le VARIANTI con cui è scritta nel
  // registro («MODENA», «Modena»), che il filtro di là distingue. Si chiede una
  // volta per variante e si fondono i risultati; con una sola, una chiamata.
  const cittaScelte = p.getAll('citta').map((c) => c.trim()).filter(Boolean)
  const chiedi = (citta: string) =>
    partnerAttivi({ q: p.get('q') ?? '', categoria: p.get('categoria') ?? '', citta, stato })
  let esito = await chiedi(cittaScelte[0] ?? '')
  if (esito.stato === 'ok' && cittaScelte.length > 1) {
    const altri = await Promise.all(cittaScelte.slice(1).map(chiedi))
    const visti = new Set(esito.partner.map((x) => x.id))
    for (const a of altri) {
      if (a.stato !== 'ok') continue
      for (const x of a.partner) if (!visti.has(x.id)) { visti.add(x.id); esito.partner.push(x) }
    }
    esito = { ...esito, totale: esito.partner.length }
  }

  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Registro Anagrafiche non collegato: metti URL e chiave in Impostazioni.' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') {
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }

  return NextResponse.json({
    totale: esito.totale,
    partner: esito.partner,
    categorie: esito.categorie,
    citta: esito.citta,
    cittaVarianti: esito.cittaVarianti,
  })
}
