"use server";

import { revalidatePath } from "next/cache";
import {
  annullaLinkIncasso,
  creaLinkIncasso,
  statoLink,
  type DatiLink,
  type EsitoCreazione,
  type EsitoStato,
} from "@/lib/incassa";

// Le azioni della pagina «Fatti pagare». Il link non torna mai dal database:
// arriva da Shopify al momento, perché contiene un segreto e perché una bozza
// pagata o cancellata non deve continuare a mostrare un indirizzo che non porta
// più da nessuna parte.

export async function creaLink(dati: DatiLink): Promise<EsitoCreazione> {
  const esito = await creaLinkIncasso(dati);
  if (esito.ok) revalidatePath("/incassa");
  return esito;
}

export async function aggiornaStatoLink(linkId: string): Promise<EsitoStato> {
  const esito = await statoLink(linkId);
  revalidatePath("/incassa");
  return esito;
}

export async function annullaLink(linkId: string): Promise<{ ok: boolean; motivo?: string }> {
  const esito = await annullaLinkIncasso(linkId);
  revalidatePath("/incassa");
  return esito;
}
