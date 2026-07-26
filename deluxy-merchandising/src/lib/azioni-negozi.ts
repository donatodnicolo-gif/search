"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { salvaNegozio, verificaNegozio } from "./negozi";

function testo(fd: FormData, chiave: string): string {
  const v = fd.get(chiave);
  return typeof v === "string" ? v : "";
}

/** Crea o aggiorna un negozio Shopify e torna in pagina con l'esito. */
export async function salvaNegozioAzione(fd: FormData) {
  const id = testo(fd, "id") || null;
  const esito = await salvaNegozio({
    id,
    nome: testo(fd, "nome"),
    dominio: testo(fd, "dominio"),
    token: testo(fd, "token") || null,
  });
  revalidatePath("/impostazioni");
  if (!esito.ok) redirect(`/impostazioni?errore=${encodeURIComponent(esito.errore)}`);
  // Appena salvato si verifica da solo: sapere subito se il token funziona vale
  // più di un messaggio "salvato" che non dice niente.
  await verificaNegozio(esito.id);
  revalidatePath("/impostazioni");
  redirect(`/impostazioni?esito=salvato#negozio-${esito.id}`);
}

export async function verificaNegozioAzione(id: string) {
  await verificaNegozio(id);
  revalidatePath("/impostazioni");
}

export async function attivaNegozio(id: string, attivo: boolean) {
  await prisma.negozioShopify.update({ where: { id }, data: { attivo } });
  revalidatePath("/impostazioni");
}

export async function eliminaNegozio(id: string) {
  await prisma.negozioShopify.delete({ where: { id } });
  revalidatePath("/impostazioni");
  redirect("/impostazioni?esito=eliminato");
}
