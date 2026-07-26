import { RimborsiLista, type PrefillRimborso } from '@/components/RimborsiLista'

export const dynamic = 'force-dynamic'

// I parametri arrivano dal pulsante "Rimborso" su un ordine e riempiono il
// modulo: si leggono qui lato server, come per i reclami, così il componente non
// ha bisogno di useSearchParams (che vorrebbe un confine Suspense).
export default async function PaginaRimborsi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const uno = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v) ?? ''
  }
  const prefill: PrefillRimborso = {
    ordineId: uno('ordineId'),
    ordineNumero: uno('ordine'),
    negozioNome: uno('negozio'),
    clienteNome: uno('cliente'),
    telefono: uno('telefono'),
    email: uno('email'),
    importoOrdine: uno('totale'),
    statoPagamento: uno('pagamento'),
  }
  return <RimborsiLista prefill={prefill} />
}
