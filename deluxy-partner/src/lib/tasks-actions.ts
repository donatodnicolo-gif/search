"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function d(fd: FormData, k: string): Date | null {
  const t = s(fd, k);
  if (!t) return null;
  const date = new Date(t + "T00:00:00.000Z");
  return isNaN(date.getTime()) ? null : date;
}

export async function creaTask(fd: FormData) {
  const titolo = s(fd, "titolo");
  if (!titolo) redirect("/tasks?errore=" + encodeURIComponent("Il titolo è obbligatorio."));
  const partnerId = s(fd, "partnerId");
  const partner = partnerId ? await prisma.partner.findUnique({ where: { id: partnerId }, select: { nome: true } }) : null;
  await prisma.taskFinance.create({
    data: {
      titolo,
      note: s(fd, "note"),
      priorita: s(fd, "priorita") ?? "media",
      scadenza: d(fd, "scadenza"),
      partnerId,
      partnerNome: partner?.nome ?? null,
      riferimento: s(fd, "riferimento"),
    },
  });
  revalidatePath("/tasks", "layout");
  revalidatePath("/", "layout");
  redirect("/tasks?creato=1");
}

// Cambia lo stato (aperto → in_corso → fatto e ritorni).
export async function cambiaStatoTask(id: string, stato: string) {
  await prisma.taskFinance.update({
    where: { id },
    data: { stato, completatoIl: stato === "fatto" ? new Date() : null },
  });
  revalidatePath("/tasks", "layout");
  revalidatePath("/", "layout");
}

export async function eliminaTask(id: string) {
  await prisma.taskFinance.delete({ where: { id } });
  revalidatePath("/tasks", "layout");
  revalidatePath("/", "layout");
}
