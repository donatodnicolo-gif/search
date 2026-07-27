"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { negoziAttivi } from "./negozi";
import { importaCollezioniDa } from "./shopify-collezioni";

/**
 * Importa le collezioni da tutti i negozi collegati e attivi.
 *
 * Un negozio che fallisce non ferma gli altri: l'esito di ognuno finisce nel
 * messaggio, perché «import fallito» senza dire di quale negozio non serve a
 * nessuno.
 */
export async function importaCollezioniAzione(negozioId: string) {
  const negozi = await negoziAttivi();
  if (negozi.length === 0) {
    redirect(
      "/collezioni?errore=" +
        encodeURIComponent("Nessun negozio collegato: collegane uno da Negozi & permessi.")
    );
  }

  // **Un negozio per richiesta.** Facendoli tutti insieme il più grande non
  // arrivava in fondo: la richiesta muore per tempo massimo e l'import resta a
  // metà senza dirlo. Un bottone per negozio è anche più chiaro su cosa sta
  // succedendo.
  const negozio = negozi.find((n) => n.id === negozioId);
  if (!negozio) {
    redirect("/collezioni?errore=" + encodeURIComponent("Negozio non trovato o non attivo."));
  }

  const esito = await importaCollezioniDa(negozio);

  revalidatePath("/collezioni");
  revalidatePath("/assortimento");
  revalidatePath("/anagrafica");
  redirect(
    `/collezioni?esito=${esito.ok ? "ok" : "errore"}&messaggio=${encodeURIComponent(`${esito.negozio}: ${esito.messaggio}`)}`
  );
}
