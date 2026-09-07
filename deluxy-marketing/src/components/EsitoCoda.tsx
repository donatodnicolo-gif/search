import { ultimeOperazioniRichieste } from "@/lib/coda-recente";
import { PannelloCoda } from "@/components/PannelloCoda";

// L'esito di «metti in coda» sulla pagina da cui si è accodato: legge le
// ultime richieste dell'ambito e apre il pannello laterale. Se nell'indirizzo
// non c'è un esito, non c'è niente da mostrare.
//
// Si monta su OGNI pagina che `esitoInCoda` (lib/azioni.ts) può usare come
// ritorno: una pagina nell'elenco di là senza questo componente qui sarebbe
// un click muto — l'operazione entra in coda e la schermata resta identica.
export async function EsitoCoda({
  sp,
  campagnaId,
  gruppoId,
  ritorno,
  ambito,
}: {
  sp: { esito?: string; avvisi?: string; saltate?: string };
  campagnaId?: string;
  gruppoId?: string;
  // Dove tornare da /operazioni dopo aver approvato
  ritorno: string;
  ambito?: string;
}) {
  if (!sp.esito) return null;
  const righe = await ultimeOperazioniRichieste({ campagnaId, gruppoId });
  return (
    <PannelloCoda
      esito={sp.esito}
      avvisi={sp.avvisi}
      saltate={sp.saltate}
      righe={righe}
      linkOperazioni={`/operazioni?torna=${encodeURIComponent(ritorno)}`}
      ambito={ambito ?? ""}
    />
  );
}
