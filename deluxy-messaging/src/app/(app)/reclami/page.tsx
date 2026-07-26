import { ReclamiLista, type PrefillReclamo } from '@/components/ReclamiLista'

export const dynamic = 'force-dynamic'

// La pagina legge i parametri (arrivano dal pulsante "Reclamo" su un ordine) e
// li passa al form come precompilazione, così non serve useSearchParams lato
// client (che richiederebbe un Suspense boundary).
export default async function PaginaReclami({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const uno = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v) ?? ''
  }
  const prefill: PrefillReclamo = {
    ordineId: uno('ordineId'),
    ordineNumero: uno('ordine'),
    negozioNome: uno('negozio'),
    clienteNome: uno('cliente'),
    telefono: uno('telefono'),
    email: uno('email'),
  }
  return <ReclamiLista prefill={prefill} />
}
