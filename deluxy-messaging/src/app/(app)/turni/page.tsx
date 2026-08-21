import { TurniLista } from '@/components/TurniLista'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// I turni degli operatori: chi lavora, quando.
//
// ⚠️ Il ruolo si legge qui e si passa alla pagina, ma il controllo vero sta in
// `/api/turni`: nascondere una griglia non impedisce di chiamare l'indirizzo
// che ci sta sotto, né di scriverci.
export default async function PaginaTurni() {
  const io = await utenteCorrente()
  return <TurniLista amministratore={io?.ruolo === 'admin'} />
}
