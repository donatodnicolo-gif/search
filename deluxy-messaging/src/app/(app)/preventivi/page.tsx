import { PreventiviLista } from '@/components/PreventiviLista'

export const dynamic = 'force-dynamic'

// I preventivi: le richieste di prezzo che non sono ancora ordini, per marchio.
export default function PaginaPreventivi() {
  return <PreventiviLista />
}
