import { MetodiPagamento } from '@/components/MetodiPagamento'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// ⭐ 11/09/2026 — METODI DI PAGAMENTO (richiesta dell'utente: «in nuovo ordine
// la terza opzione è altri metodi di pagamento: consentimi su impostazioni di
// stabilire per ogni metodo che viene elencato le specifiche»).
//
// ⚠️ Il ruolo si legge qui e si passa alla schermata, ma il cancello vero sta
// nella rotta /api/metodi-pagamento: scrivere è dell'amministratore, leggere di
// tutti gli operatori (il modulo Nuovo ordine legge gli stessi metodi).
export default async function PaginaMetodiPagamento() {
  const io = await utenteCorrente()
  return <MetodiPagamento amministratore={io?.ruolo === 'admin'} />
}
