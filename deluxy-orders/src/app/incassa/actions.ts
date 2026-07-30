"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
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

// Dopo aver aggiunto un permesso in Shopify, il token che abbiamo in mano è
// ancora quello vecchio: dura ~24 ore e i permessi ce li ha **dentro**. Senza
// questo pulsante il permesso nuovo entrerebbe in vigore il giorno dopo, e nel
// frattempo sembrerebbe che l'aggiunta non abbia funzionato.
// Qui si fa scadere il token: al primo uso l'app se ne conia uno nuovo da sé
// (client credentials grant), coi permessi aggiornati.
export async function rileggiPermessi() {
  await prisma.negozioShopify.updateMany({
    where: { clientId: { not: null }, clientSecret: { not: null } },
    data: { tokenScadeIl: new Date(0) },
  });
  revalidatePath("/incassa");
  revalidatePath("/impostazioni");
}
