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
export async function importaCollezioniAzione() {
  const negozi = await negoziAttivi();
  if (negozi.length === 0) {
    redirect(
      "/collezioni?errore=" +
        encodeURIComponent("Nessun negozio collegato: collegane uno da Negozi & permessi.")
    );
  }

  // Un negozio per volta, con una pausa in mezzo: il credito di query di
  // Shopify è per negozio ma si esaurisce lo stesso se si tira senza respiro,
  // e il terzo negozio si prendeva un «Throttled» in faccia.
  const esiti = [];
  for (const [i, n] of negozi.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 3000));
    esiti.push(await importaCollezioniDa(n));
  }

  const riuscite = esiti.filter((e) => e.ok);
  const messaggio = esiti
    .map((e) => `${e.negozio}: ${e.ok ? `${e.collezioniLette} collezioni, ${e.abbinamenti} abbinamenti` : e.messaggio}`)
    .join(" · ");

  revalidatePath("/collezioni");
  revalidatePath("/assortimento");
  redirect(
    `/collezioni?esito=${riuscite.length === esiti.length ? "ok" : "parziale"}&messaggio=${encodeURIComponent(messaggio)}`
  );
}
