import { NuovoOrdine } from '@/components/NuovoOrdine'
import { Bozze } from '@/components/Bozze'

export const dynamic = 'force-dynamic'

// I dati del cliente arrivano dalla conversazione (bottone «Nuovo ordine» in
// inbox): si leggono qui lato server e si passano come prop, come per reclami e
// rimborsi — così il componente non ha bisogno di useSearchParams.
export default async function PaginaNuovoOrdine({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const uno = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v) ?? ''
  }
  return (
    <>
      <NuovoOrdine
        prefill={{
          nome: uno('nome'),
          email: uno('email'),
          telefono: uno('telefono'),
          negozioId: uno('negozio'),
        }}
      />
      {/* ⚠️ SOTTO il modulo, non in una pagina a parte: la domanda «quel link
          l'hanno pagato?» viene a chi sta per farne un altro, ed e' li' che
          deve trovare la risposta. */}
      <Bozze />
    </>
  )
}
