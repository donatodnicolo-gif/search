import { NextRequest, NextResponse } from 'next/server'
import { autentica } from '@/lib/api-auth'
import { arrotondaA5, scontoPerProvincia, statoProvincia } from '@/lib/vendite'

export const dynamic = 'force-dynamic'

// GET /api/v1/quota-fornitore — ⭐ 06/09/2026: LA CASA DELLA QUOTA È QUI.
//
// Nuova architettura vendite (decisione dell'utente): Orders gestisce solo
// l'ordine; lo sconto per provincia e le liste di priorità li custodisce il
// Customer Service. Il contratto è lo stesso che aveva Orders, così chi lo
// chiamava (piattaforma consegne, Budgets, Orders stesso che ora delega qui)
// cambia solo indirizzo:
//   ?provincia=MI            la sigla
//   &conPartner=1|0          se chi chiama lo sa (la piattaforma lo sa); se
//                            manca si chiede alla piattaforma
//   &prezzoPubblico=85       → prezzoFornitore già arrotondato a 5/0
//   &totale=135              → atteso (compatibilità)
export async function GET(req: NextRequest) {
  const cliente = await autentica(req)
  if (cliente instanceof NextResponse) return cliente
  const q = req.nextUrl.searchParams
  const provincia = (q.get('provincia') ?? '').trim().toUpperCase()
  const grezzo = q.get('conPartner')
  let conPartner: boolean | null = grezzo === null ? null : ['1', 'true', 'si', 'sì'].includes(grezzo.toLowerCase()) ? true : ['0', 'false', 'no'].includes(grezzo.toLowerCase()) ? false : null
  let fonteConPartner: 'chiamante' | 'piattaforma' | 'sconosciuta' = conPartner === null ? 'sconosciuta' : 'chiamante'
  if (conPartner === null && provincia) {
    const stato = await statoProvincia(provincia)
    if (stato) { conPartner = stato.conPartner; fonteConPartner = 'piattaforma' }
  }
  const deciso = await scontoPerProvincia(provincia, conPartner)
  const prezzoPubblico = q.get('prezzoPubblico') === null ? null : Number(q.get('prezzoPubblico'))
  const totale = q.get('totale') === null ? null : Number(q.get('totale'))
  return NextResponse.json({
    quota: deciso.quota,
    sconto: deciso.sconto,
    regola: deciso.regola,
    motivo: deciso.motivo,
    conPartner,
    fonteConPartner,
    predefinita: 60,
    chiave: 'vendite.scontoProvincia',
    dove: 'Deluxy Customer Service → Vendite',
    casa: 'customer-service',
    ambito: 'prodotti non unici: per gli unici vale il listino del proprietario',
    arrotondamento: 'il prezzo al fornitore si arrotonda a 5 o a 0, al più vicino',
    nota:
      deciso.regola === 'default'
        ? 'Quota indicativa di default: nessuna regola applicabile.'
        : deciso.regola === 'personalizzata'
          ? 'Sconto scritto per questa provincia in Customer Service → Vendite.'
          : 'Regola del territorio (06/09/2026): 40% senza partner; con partner 20% a Milano, 30% altrove.',
    ...(totale !== null && Number.isFinite(totale) && totale > 0 ? { totale, atteso: totale * (deciso.quota / 100) } : {}),
    ...(prezzoPubblico !== null && Number.isFinite(prezzoPubblico) && prezzoPubblico > 0 ? { prezzoPubblico, prezzoFornitore: arrotondaA5(prezzoPubblico * (deciso.quota / 100)) } : {}),
  })
}
