"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { applicaRegolaSalvata } from "./ordinamento-vetrina";
import { isRegola, regoleDaForm } from "./ordinamento-vetrina";
import { CAMPI, parsePassi, serializePassi, type Campo } from "./regole-ordine";

/** Crea una regola vuota e porta dritti a scriverla: un nome da solo non serve a niente. */
export async function creaRegolaOrdine(fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim();
  if (!nome) redirect("/visual/regole?esito=errore&messaggio=" + encodeURIComponent("Il nome serve: è come si ritrova la regola."));
  const esiste = await prisma.regolaOrdine.findUnique({ where: { nome }, select: { id: true } });
  if (esiste) {
    redirect(`/visual/regole?esito=errore&messaggio=${encodeURIComponent(`Esiste già una regola «${nome}».`)}`);
  }
  const r = await prisma.regolaOrdine.create({
    data: { nome, descrizione: String(fd.get("descrizione") ?? "").trim() || null, passi: "[]" },
  });
  redirect(`/visual/regole/${r.id}`);
}

export async function rinominaRegolaOrdine(id: string, fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim();
  const descrizione = String(fd.get("descrizione") ?? "").trim() || null;
  if (nome) await prisma.regolaOrdine.update({ where: { id }, data: { nome, descrizione } });
  revalidatePath(`/visual/regole/${id}`);
}

/**
 * Elimina una regola. Le collezioni che la usavano tornano «solo a mano»
 * (`onDelete: SetNull`): **l'ordine già scritto non si tocca**, resta quello
 * che era: cancellare una regola non è chiedere di rimescolare le vetrine.
 */
export async function eliminaRegolaOrdine(id: string) {
  await prisma.regolaOrdine.delete({ where: { id } });
  redirect("/visual/regole");
}

const isCampo = (v: string): v is Campo => CAMPI.some((c) => c.chiave === v);

/** Aggiunge un passo in fondo: l'ordine dei passi **è** la priorità. */
export async function aggiungiPasso(id: string, fd: FormData) {
  const r = await prisma.regolaOrdine.findUnique({ where: { id }, select: { passi: true } });
  const passi = parsePassi(r?.passi);
  const tipo = String(fd.get("tipo") ?? "");
  if (tipo === "metrica") {
    const m = String(fd.get("metrica") ?? "");
    if (isRegola(m) && m !== "manuale") passi.push({ t: "metrica", m });
  } else {
    const campo = String(fd.get("campo") ?? "");
    if (!isCampo(campo)) return;
    if (campo === "prezzo") {
      const da = Number.parseFloat(String(fd.get("da") ?? ""));
      const a = Number.parseFloat(String(fd.get("a") ?? ""));
      passi.push({
        t: "attr",
        campo,
        da: Number.isFinite(da) ? da : undefined,
        a: Number.isFinite(a) ? a : undefined,
      });
    } else {
      // I valori arrivano da un <select multiple>: valgono **in alternativa**
      // dentro lo stesso passo (categoria Fiori *o* Torte), come nei criteri
      // delle tipologie — stessa convenzione, non una nuova.
      const valori = fd.getAll("valori").map(String).filter(Boolean);
      if (valori.length === 0) return;
      passi.push({ t: "attr", campo, valori });
    }
  }
  await prisma.regolaOrdine.update({ where: { id }, data: { passi: serializePassi(passi) } });
  revalidatePath(`/visual/regole/${id}`);
}

/** Toglie un passo, o lo sposta su/giù: la priorità si cambia senza riscrivere tutto. */
export async function muoviPasso(id: string, indice: number, dove: "su" | "giu" | "via") {
  const r = await prisma.regolaOrdine.findUnique({ where: { id }, select: { passi: true } });
  const passi = parsePassi(r?.passi);
  if (indice < 0 || indice >= passi.length) return;
  if (dove === "via") {
    passi.splice(indice, 1);
  } else {
    const j = dove === "su" ? indice - 1 : indice + 1;
    if (j < 0 || j >= passi.length) return;
    [passi[indice], passi[j]] = [passi[j], passi[indice]];
  }
  await prisma.regolaOrdine.update({ where: { id }, data: { passi: serializePassi(passi) } });
  revalidatePath(`/visual/regole/${id}`);
}

/**
 * **Salva l'ordine che si sta guardando come regola**, dalla scheda della
 * collezione. È lì che nasce una regola vera: si prova con le metriche rapide
 * finché la fila convince, e a quel punto la si vuole tenere e riusare — non
 * ricominciare da una pagina vuota.
 *
 * La regola nasce coi passi che erano scelti, viene **assegnata e applicata**
 * alla collezione, e si finisce sulla sua scheda: da lì si aggiungono i passi
 * per attributo (categoria, prezzo, tag) che qui non si possono esprimere.
 */
export async function creaRegolaDaCollezione(collezioneId: string, fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim();
  const torna = (m: string) =>
    redirect(`/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(m)}`);
  if (!nome) torna("Il nome serve: è come si ritrova la regola.");
  if (await prisma.regolaOrdine.findUnique({ where: { nome }, select: { id: true } })) {
    torna(`Esiste già una regola «${nome}». Scegli un altro nome o applicala dall'elenco.`);
  }

  const metriche = regoleDaForm(fd);
  const r = await prisma.regolaOrdine.create({
    data: {
      nome,
      descrizione: `Nata dall'ordine della collezione, il ${new Date().toLocaleDateString("it-IT")}.`,
      passi: serializePassi(metriche.map((m) => ({ t: "metrica", m }))),
    },
  });
  // Se non c'era nessuna metrica la regola nasce vuota: si assegna comunque,
  // ma **non si riscrive l'ordine** — una regola senza passi non è «tutti i
  // prodotti», è una regola da finire, e non deve rimescolare una fila curata.
  if (metriche.length > 0) await applicaRegolaSalvata(collezioneId, r.id);
  else await prisma.collezioneShopify.update({ where: { id: collezioneId }, data: { regolaOrdineId: r.id } });
  redirect(`/visual/regole/${r.id}`);
}

/** Applica una regola salvata a una collezione (dalla scheda della collezione). */
export async function applicaRegolaSalvataAzione(collezioneId: string, fd: FormData) {
  const regolaId = String(fd.get("regolaOrdineId") ?? "");
  if (!regolaId) return;
  await applicaRegolaSalvata(collezioneId, regolaId);
  revalidatePath(`/visual/${collezioneId}`);
}

/**
 * Riapplica una regola a **tutte** le collezioni che la usano. È il motivo per
 * cui una regola si salva: la si corregge in un posto e le vetrine si rifanno.
 */
export async function riapplicaRegolaOvunque(id: string) {
  const colls = await prisma.collezioneShopify.findMany({ where: { regolaOrdineId: id }, select: { id: true } });
  for (const c of colls) await applicaRegolaSalvata(c.id, id);
  revalidatePath(`/visual/regole/${id}`);
  revalidatePath("/visual");
}
