import { Diario } from '@/components/Diario'

export const dynamic = 'force-dynamic'

// Il diario di lavoro: le righe che il servizio clienti si scrive per ricordare
// cosa c'è da fare su un ordine. Prima stavano in una chat interna, dove le
// vedeva solo chi le aveva scritte.
export default function PaginaDiario() {
  return <Diario />
}
