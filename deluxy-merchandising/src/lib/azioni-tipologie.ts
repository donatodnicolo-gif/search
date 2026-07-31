"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { criteriDaForm, serializeCriteri } from "./criteri-tipologia";
import { applicaRegoleACollezione, parseRegole, regoleDaForm, serializeRegole } from "./ordinamento-vetrina";

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Crea una tipologia coi suoi criteri e porta **sulla sua scheda**: lì si vede
 * quali prodotti ha preso e si sceglie la priorità d'ordine. Prima si guarda cosa
 * si è selezionato, poi si decide come ordinarlo.
 */
export async function creaTipologia(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) return;
  const t = await prisma.tipologiaCollezione.create({
    data: {
      nome,
      descrizione: testo(fd, "descrizione") || null,
      criteri: serializeCriteri(criteriDaForm(fd)),
      regolaOrdinamento: serializeRegole(regoleDaForm(fd)),
    },
  });
  revalidatePath("/visual/tipologie");
  redirect(`/visual/tipologie/${t.id}`);
}

/** Cambia nome/descrizione/criteri. Non tocca le regole d'ordine: si scelgono a parte. */
export async function aggiornaCriteriTipologia(id: string, fd: FormData) {
  const nome = testo(fd, "nome");
  await prisma.tipologiaCollezione.update({
    where: { id },
    data: {
      ...(nome ? { nome } : {}),
      descrizione: testo(fd, "descrizione") || null,
      criteri: serializeCriteri(criteriDaForm(fd)),
    },
  });
  revalidatePath(`/visual/tipologie/${id}`);
  revalidatePath("/visual/tipologie");
}

/** Cambia le regole d'ordine. Se cambiano, le riapplica subito alle sue collezioni. */
export async function aggiornaTipologia(id: string, fd: FormData) {
  const nuovaRegola = serializeRegole(regoleDaForm(fd));
  const prima = await prisma.tipologiaCollezione.findUnique({ where: { id }, select: { regolaOrdinamento: true } });
  await prisma.tipologiaCollezione.update({
    where: { id },
    data: { regolaOrdinamento: nuovaRegola },
  });
  if (nuovaRegola !== (prima?.regolaOrdinamento ?? null) && parseRegole(nuovaRegola).length > 0) {
    await applicaTipologiaAlleSueCollezioni(id);
  }
  revalidatePath(`/visual/tipologie/${id}`);
  revalidatePath("/visual/tipologie");
}

/** Elimina una tipologia. Le collezioni restano, solo senza tipologia (SetNull). */
export async function eliminaTipologia(id: string) {
  await prisma.tipologiaCollezione.delete({ where: { id } });
  revalidatePath("/visual/tipologie");
  revalidatePath("/visual");
  // Si può eliminare anche dalla scheda della tipologia: senza questo si
  // resterebbe su una pagina che non esiste più.
  redirect("/visual/tipologie");
}

/**
 * Assegna una tipologia a più collezioni in un colpo solo (il «estendi a più
 * collezioni»). Se la tipologia ha una regola, la applica subito a ognuna, così
 * l'ordine è già quello previsto senza doverlo fare collezione per collezione.
 */
export async function assegnaCollezioniATipologia(fd: FormData) {
  const tipologiaId = testo(fd, "tipologiaId");
  const ids = fd.getAll("collezioni").filter((v) => typeof v === "string") as string[];
  if (!tipologiaId || ids.length === 0) return;
  await prisma.collezioneShopify.updateMany({ where: { id: { in: ids } }, data: { tipologiaId } });
  const tip = await prisma.tipologiaCollezione.findUnique({ where: { id: tipologiaId }, select: { regolaOrdinamento: true } });
  const regole = parseRegole(tip?.regolaOrdinamento);
  if (regole.length > 0) {
    for (const cid of ids) await applicaRegoleACollezione(cid, regole);
  }
  revalidatePath("/visual/tipologie");
  revalidatePath("/visual");
}

/** Toglie la tipologia da una collezione (non tocca l'ordine già scritto). */
export async function togliTipologia(collezioneId: string) {
  await prisma.collezioneShopify.update({ where: { id: collezioneId }, data: { tipologiaId: null } });
  revalidatePath("/visual/tipologie");
  revalidatePath(`/visual/${collezioneId}`);
}

/** Riapplica la regola della tipologia a tutte le sue collezioni (bottone «riapplica ora»). */
export async function applicaTipologiaAlleSueCollezioni(tipologiaId: string) {
  const tip = await prisma.tipologiaCollezione.findUnique({
    where: { id: tipologiaId },
    select: { regolaOrdinamento: true, collezioni: { select: { id: true } } },
  });
  const regole = parseRegole(tip?.regolaOrdinamento);
  if (!tip || regole.length === 0) return;
  for (const c of tip.collezioni) await applicaRegoleACollezione(c.id, regole);
  revalidatePath("/visual/tipologie");
  revalidatePath("/visual");
}
