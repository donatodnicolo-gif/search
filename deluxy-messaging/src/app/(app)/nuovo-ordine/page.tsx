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
      {/* ── LE BOZZE STANNO IN CIMA ──
          ⚠️⚠️ Chiesto dall'utente: sotto il modulo non le vedeva nessuno. Il
          modulo è lungo una schermata e mezza, e una sezione che arriva DOPO si
          incontra solo se si scorre fino in fondo — cioè quando l'ordine nuovo
          è già stato fatto e la domanda «quel link l'hanno pagato?» non se la
          fa più nessuno.
          ⚠️ In cima ma COMPATTA, e con un tetto d'altezza: se le bozze in
          sospeso fossero venti spingerebbero il modulo fuori dallo schermo, e
          avremmo spostato il problema invece di risolverlo. Quando non c'è
          niente in sospeso resta una riga sola. */}
      <Bozze />
      <NuovoOrdine
        prefill={{
          nome: uno('nome'),
          email: uno('email'),
          telefono: uno('telefono'),
          negozioId: uno('negozio'),
        }}
      />
    </>
  )
}
