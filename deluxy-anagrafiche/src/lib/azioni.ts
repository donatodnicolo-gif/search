"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { isStato } from "./stati";
import { ARCHIVIATA, registraPassaggio } from "./storico";

// Cambio di stato dalla scheda partner (UI interna). Le app esterne passano
// dalle API /api/v1 con le chiavi; qui la UI è già protetta dal login.
export async function cambiaStato(partnerId: string, fd: FormData) {
  const nuovo = String(fd.get("stato") ?? "");
  if (!isStato(nuovo)) return;
  const attuale = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { stato: true },
  });
  if (!attuale) return;
  await prisma.partner.update({
    where: { id: partnerId },
    data: { stato: nuovo },
  });
  await registraPassaggio(partnerId, attuale.stato, nuovo, "ui");
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/");
}

// Archivia (attivo=false) o ripristina un'anagrafica. Le archiviate spariscono
// da elenchi, sidebar e API (salvo attivo=false/tutti) e vivono nella sezione
// "Archiviati". Stessa semantica del DELETE delle API.
export async function impostaArchiviato(partnerId: string, archiviato: boolean) {
  const p = await prisma.partner.update({
    where: { id: partnerId },
    data: { attivo: !archiviato },
  });
  await registraPassaggio(
    partnerId,
    archiviato ? p.stato : ARCHIVIATA,
    archiviato ? ARCHIVIATA : p.stato,
    "ui",
  );
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/");
}
