"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { eseguiRegola, isFrequenza, isModo } from "./rotazione";

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/** Crea una regola di rotazione. */
export async function creaRotazione(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) return;
  const frequenza = testo(fd, "frequenza");
  const modo = testo(fd, "modo");
  const passo = Number(fd.get("passo"));
  await prisma.regolaRotazione.create({
    data: {
      nome,
      frequenza: isFrequenza(frequenza) ? frequenza : "settimanale",
      modo: isModo(modo) ? modo : "rinfresca",
      passo: Number.isFinite(passo) && passo > 0 ? Math.floor(passo) : 1,
      // Di proposito non si può accendere l'invio automatico a Shopify qui: si
      // decide dopo, sulla regola già creata, guardando a quali collezioni tocca.
      spingiSuShopify: false,
    },
  });
  revalidatePath("/visual/rotazioni");
  revalidatePath("/visual");
}

/** Cambia i parametri di una regola, compreso l'invio automatico a Shopify. */
export async function aggiornaRotazione(id: string, fd: FormData) {
  const nome = testo(fd, "nome");
  const frequenza = testo(fd, "frequenza");
  const modo = testo(fd, "modo");
  const passo = Number(fd.get("passo"));
  await prisma.regolaRotazione.update({
    where: { id },
    data: {
      ...(nome ? { nome } : {}),
      frequenza: isFrequenza(frequenza) ? frequenza : undefined,
      modo: isModo(modo) ? modo : undefined,
      passo: Number.isFinite(passo) && passo > 0 ? Math.floor(passo) : undefined,
      attiva: fd.get("attiva") != null,
      spingiSuShopify: fd.get("spingiSuShopify") != null,
    },
  });
  revalidatePath("/visual/rotazioni");
  revalidatePath("/visual");
}

/** Iscrive più collezioni alla stessa rotazione (il «vale per più collezioni»). */
export async function assegnaCollezioniARotazione(fd: FormData) {
  const rotazioneId = testo(fd, "rotazioneId");
  const ids = fd.getAll("collezioni").filter((v): v is string => typeof v === "string");
  if (!rotazioneId) return;
  // Si riscrive l'iscrizione di questa regola: chi è stato tolto dalla selezione
  // esce davvero, altrimenti l'elenco direbbe una cosa e la rotazione un'altra.
  await prisma.collezioneShopify.updateMany({ where: { rotazioneId }, data: { rotazioneId: null } });
  if (ids.length > 0) {
    await prisma.collezioneShopify.updateMany({ where: { id: { in: ids } }, data: { rotazioneId } });
  }
  revalidatePath("/visual/rotazioni");
  revalidatePath("/visual");
}

/** Esegue la regola adesso, senza aspettare il turno (bottone «prova adesso»). */
export async function eseguiRotazioneAdesso(id: string) {
  const esito = await eseguiRegola(id);
  revalidatePath("/visual/rotazioni");
  revalidatePath("/visual");
  const messaggio =
    `«${esito.regola}»: ${esito.collezioni} collezioni rimesse in ordine` +
    (esito.spinte ? `, ${esito.spinte} mandate a Shopify` : "") +
    (esito.errori.length ? ` · ${esito.errori.length} errori: ${esito.errori.slice(0, 2).join(" · ")}` : ".");
  redirect(
    `/visual/rotazioni?esito=${esito.errori.length ? "errore" : "ok"}&messaggio=${encodeURIComponent(messaggio)}`
  );
}

/** Elimina una regola. Le collezioni restano, semplicemente non ruotano più. */
export async function eliminaRotazione(id: string) {
  await prisma.regolaRotazione.delete({ where: { id } });
  revalidatePath("/visual/rotazioni");
  revalidatePath("/visual");
  redirect("/visual/rotazioni");
}
