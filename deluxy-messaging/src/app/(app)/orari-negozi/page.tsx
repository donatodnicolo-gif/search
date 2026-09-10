import { OrariNegozi } from '@/components/OrariNegozi'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// ⭐ 10/09/2026 — ORARI NEGOZI (richiesta dell'utente): per ogni negozio Shopify
// i giorni di apertura (cioè quali date si possono scegliere), le fasce orarie
// di consegna con orario minimo e massimo, e i giorni di chiusura.
//
// ⚠️ Il ruolo si legge qui e si passa alla pagina, ma il cancello vero sta
// nella rotta /api/orari-negozi: scrivere è dell'amministratore, guardare di
// tutti (il modulo Nuovo ordine legge le stesse regole).
export default async function PaginaOrariNegozi() {
  const io = await utenteCorrente()
  return <OrariNegozi amministratore={io?.ruolo === 'admin'} />
}
