"use server";

import { revalidatePath } from "next/cache";
import { creaChiave, eliminaChiave, rigeneraChiave, type EsitoChiave } from "@/lib/chiavi";

// Le azioni delle chiavi API.
//
// ⚠️ La chiave in chiaro torna nel VALORE di ritorno dell'azione e non passa mai
// da un redirect: un segreto in una querystring finisce nella cronologia del
// browser e nei log del server, dove resta per sempre e nessuno lo cerca.

export async function creaChiaveApi(nome: string, scrittura: boolean): Promise<EsitoChiave> {
  const esito = await creaChiave(nome, scrittura);
  if (esito.ok) revalidatePath("/impostazioni");
  return esito;
}

export async function rigeneraChiaveApi(id: string): Promise<EsitoChiave> {
  const esito = await rigeneraChiave(id);
  if (esito.ok) revalidatePath("/impostazioni");
  return esito;
}

export async function eliminaChiaveApi(id: string): Promise<{ ok: boolean; motivo?: string }> {
  const esito = await eliminaChiave(id);
  if (esito.ok) revalidatePath("/impostazioni");
  return esito;
}
