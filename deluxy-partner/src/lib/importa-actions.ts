"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { importaAttivi } from "./importa-registro";

// «Portali in Finance»: l'import a mano, per non aspettare il cron della notte.
export async function importaAttiviOra() {
  const esito = await importaAttivi("manuale");
  revalidatePath("/partner", "layout");
  const messaggio = esito.errore
    ? esito.errore
    : esito.creati.length === 0 && esito.collegati.length === 0
      ? "Nessuna anagrafica attiva da portare dentro: erano già tutte qui."
      : `${esito.creati.length} schede create` +
        (esito.collegati.length ? `, ${esito.collegati.length} collegate a schede già esistenti` : "") +
        (esito.creati.length ? `: ${esito.creati.slice(0, 8).join(", ")}` : "");
  redirect(
    `/partner?${esito.errore ? "importErrore" : "importFatto"}=${encodeURIComponent(messaggio)}`
  );
}
