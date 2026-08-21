import { ChargebackLista } from '@/components/ChargebackLista'

export const dynamic = 'force-dynamic'

// Le contestazioni di pagamento: si guardano, si risponde, e si mandano le
// prove alla banca. Il dato vive in Shopify e qui si tiene una copia di lavoro
// (vedi src/lib/chargeback.ts).
export default function PaginaChargeback() {
  return <ChargebackLista />
}
