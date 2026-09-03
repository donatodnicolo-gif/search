import { RimborsiLista, type PrefillRimborso } from '@/components/RimborsiLista'
import { utenteCorrente } from '@/lib/sessione'

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
  // ⚠️ Il ruolo si legge QUI, sul server: serve a non mostrare il bottone del
  // rimborso vero a chi la rotta rifiuterebbe comunque. Il controllo che
  // conta e quello della rotta — questo e solo educazione dell interfaccia.
  const io = await utenteCorrente()
  return <RimborsiLista prefill={prefill} ruolo={io?.ruolo ?? 'operatore'} />
}
