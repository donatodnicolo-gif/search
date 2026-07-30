import { OrdiniLista } from '@/components/OrdiniLista'

export const dynamic = 'force-dynamic'

// La bacheca degli ordini aperti. Stava su `/`, che adesso è la schermata
// iniziale del Customer Service.
//
// ⚠️ Questo indirizzo è anche quello registrato come URL dell'app su Shopify:
// prima era un redirect verso `/`, ora è la pagina vera — chi arriva da Shopify
// continua a trovare gli ordini, che è quello che si aspetta.
export default function PaginaOrdini() {
  return <OrdiniLista />
}
