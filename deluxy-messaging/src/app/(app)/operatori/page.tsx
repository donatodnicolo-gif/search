import { OperatoriLista } from '@/components/OperatoriLista'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Quanto lavoro ha fatto ciascun operatore. Sta in «Qualità» perché è una
// misura da guardare una volta a settimana, non uno strumento di chi ha un
// cliente al telefono adesso.
//
// ⚠️ Il ruolo si legge QUI e si passa alla pagina, ma il controllo vero sta in
// `/api/operatori`: nascondere una tabella non impedisce di chiamare
// l'indirizzo che ci sta sotto.
export default async function PaginaOperatori() {
  const io = await utenteCorrente()
  return <OperatoriLista amministratore={io?.ruolo === 'admin'} />
}
