import { VenditeConfig } from '@/components/VenditeConfig'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// ⭐ 06/09/2026 — VENDITE: il Customer Service è il custode dello sconto per
// provincia e delle liste di priorità per area commerciale (nuova architettura,
// decisione dell'utente). Tre aree: Sconti · Partner per provincia · Liste.
//
// ⚠️ Il ruolo si legge qui e si passa alla pagina, ma il cancello vero sta nelle
// rotte /api/vendite/*: scrivere è dell'amministratore, guardare di tutti.
export default async function PaginaVendite() {
  const io = await utenteCorrente()
  return <VenditeConfig amministratore={io?.ruolo === 'admin'} />
}
