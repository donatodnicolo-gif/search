"use server";

// **«Recupera dalla piattaforma».**
//
// Segnalazione dell'utente (11/09/2026, sul prodotto vero «Torta Damianino»):
// «mancano ancora le varianti e altre informazioni da recuperare da app
// delivery, verifica come mai».
//
// Il perché, misurato: la piattaforma **non le manda**. La sua spinta
// (`inviaOra`) mette nel corpo nove campi più quattro per il partner; varianti,
// `partnerId`, insegna, plus, note e foto non ci sono. Da qui non si possono
// inventare.
//
// Però **si possono andare a prendere**: il canale app della piattaforma ha già
// `GET /api/v1/app/prodotti`, che torna le varianti, il partner e il prezzo
// pubblico. Questo tasto fa quella lettura e completa la scheda.
//
// La regola di che cosa si scrive sta in `recupero-piattaforma.ts`, perché la
// usa anche lo script che la applica in blocco: qui restano solo il giro della
// pagina (revalidate e messaggio) e niente di deciso.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recuperaUnProdotto } from "./recupero-piattaforma";

export async function recuperaDallaPiattaforma(id: string) {
  const esito = await recuperaUnProdotto(id);
  if (!esito.ok) {
    redirect(`/prodotti/${id}?errore=` + encodeURIComponent(`Non ho potuto recuperare: ${esito.messaggio}`));
  }
  for (const percorso of ["/prodotti", "/sviluppo", `/prodotti/${id}`]) revalidatePath(percorso);
  redirect(`/prodotti/${id}?esito=` + encodeURIComponent(esito.riassunto));
}
