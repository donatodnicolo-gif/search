"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { slugDa, slugLibero } from "@/lib/script";
import { chiaviUsate, normalizzaChiave } from "@/lib/variabili";

// Tutte le scritture dell'app. Regola: niente logica di presentazione qui,
// niente scritture sparse nelle pagine.

function testo(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim();
}

function opzionale(fd: FormData, campo: string): string | null {
  const v = testo(fd, campo);
  return v === "" ? null : v;
}

// Il testo. I browser mandano i textarea con i fine riga in CRLF (lo dice lo
// standard HTML): li riportiamo a LF, così il messaggio incollato in WhatsApp o
// in un'email non porta con sé caratteri invisibili.
function corpoDa(fd: FormData): string {
  return String(fd.get("corpo") ?? "").replace(/\r\n/g, "\n");
}

// Le variabili usate nel testo ma non ancora dichiarate vengono create da sole,
// come testo obbligatorio: chi scrive non deve dichiararle una seconda volta.
async function allineaVariabili(scriptId: string, corpo: string) {
  const usate = chiaviUsate(corpo);
  if (usate.length === 0) return;
  const esistenti = await prisma.variabile.findMany({
    where: { scriptId },
    select: { chiave: true },
  });
  const gia = new Set(esistenti.map((v) => v.chiave));
  const nuove = usate.filter((c) => !gia.has(c));
  if (nuove.length === 0) return;
  await prisma.variabile.createMany({
    data: nuove.map((chiave, i) => ({ scriptId, chiave, ordine: gia.size + i })),
    skipDuplicates: true,
  });
}

// ---------- Script ----------

export async function creaScript(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) return;
  const slug = await slugLibero(nome);
  const corpo = corpoDa(fd);
  const oggetto = opzionale(fd, "oggetto");
  const script = await prisma.script.create({
    data: {
      slug,
      nome,
      descrizione: opzionale(fd, "descrizione"),
      canale: testo(fd, "canale") || "email",
      categoria: testo(fd, "categoria") || "vendite",
      oggetto,
      corpo,
    },
  });
  // I segnaposto valgono anche nell'oggetto dell'email: si guardano entrambi.
  await allineaVariabili(script.id, `${oggetto ?? ""}\n${corpo}`);
  revalidatePath("/");
  redirect(`/script/${slug}`);
}

export async function salvaScript(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const nome = testo(fd, "nome");
  const corpo = corpoDa(fd);
  const oggetto = opzionale(fd, "oggetto");
  const tag = testo(fd, "tag")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const attuale = await prisma.script.findUnique({ where: { id }, select: { slug: true, nome: true } });
  if (!attuale) return;
  // Lo slug segue il nome solo finché nessuno lo ha usato altrove: è la chiave
  // con cui le altre app chiedono lo script, cambiarla a cuor leggero le rompe.
  const slug =
    nome && slugDa(nome) !== slugDa(attuale.nome) ? await slugLibero(nome, id) : attuale.slug;

  await prisma.script.update({
    where: { id },
    data: {
      nome: nome || attuale.nome,
      slug,
      descrizione: opzionale(fd, "descrizione"),
      note: opzionale(fd, "note"),
      canale: testo(fd, "canale") || "email",
      categoria: testo(fd, "categoria") || "vendite",
      oggetto,
      autore: opzionale(fd, "autore"),
      corpo,
      tag,
      attivo: fd.get("attivo") === "on",
    },
  });
  await allineaVariabili(id, `${oggetto ?? ""}\n${corpo}`);
  revalidatePath("/");
  revalidatePath(`/script/${slug}`);
  if (slug !== attuale.slug) redirect(`/script/${slug}`);
}

export async function eliminaScript(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  await prisma.script.delete({ where: { id } });
  revalidatePath("/");
  redirect("/");
}

// ---------- Variabili ----------

export async function salvaVariabile(fd: FormData) {
  const id = testo(fd, "id");
  const slug = testo(fd, "slug");
  if (!id) return;
  const chiave = normalizzaChiave(testo(fd, "chiave"));
  if (!chiave) return;
  const opzioni = testo(fd, "opzioni")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  await prisma.variabile.update({
    where: { id },
    data: {
      chiave,
      etichetta: opzionale(fd, "etichetta"),
      descrizione: opzionale(fd, "descrizione"),
      tipo: testo(fd, "tipo") || "testo",
      opzioni,
      valorePredefinito: opzionale(fd, "valorePredefinito"),
      obbligatoria: fd.get("obbligatoria") === "on",
    },
  });
  revalidatePath(`/script/${slug}`);
}

export async function aggiungiVariabile(fd: FormData) {
  const scriptId = testo(fd, "scriptId");
  const slug = testo(fd, "slug");
  const chiave = normalizzaChiave(testo(fd, "chiave"));
  if (!scriptId || !chiave) return;
  const quante = await prisma.variabile.count({ where: { scriptId } });
  await prisma.variabile.upsert({
    where: { scriptId_chiave: { scriptId, chiave } },
    create: { scriptId, chiave, ordine: quante },
    update: {},
  });
  revalidatePath(`/script/${slug}`);
}

export async function eliminaVariabile(fd: FormData) {
  const id = testo(fd, "id");
  const slug = testo(fd, "slug");
  if (!id) return;
  await prisma.variabile.delete({ where: { id } });
  revalidatePath(`/script/${slug}`);
}

// ---------- Abilitazione per app ----------

// Accende o spegne un testo per un'app. Il record resta anche da spento: così i
// valori delle variabili di quell'app (la firma, il tono) non si perdono.
export async function cambiaAbilitazione(fd: FormData) {
  const scriptId = testo(fd, "scriptId");
  const appId = testo(fd, "appId");
  const slug = testo(fd, "slug");
  if (!scriptId || !appId) return;
  const attiva = testo(fd, "attiva") === "1";
  await prisma.abilitazione.upsert({
    where: { scriptId_appId: { scriptId, appId } },
    create: { scriptId, appId, attiva },
    update: { attiva },
  });
  revalidatePath(`/script/${slug}`);
  revalidatePath("/");
}

// I valori che le variabili assumono per una singola app.
export async function salvaValori(fd: FormData) {
  const abilitazioneId = testo(fd, "abilitazioneId");
  const slug = testo(fd, "slug");
  if (!abilitazioneId) return;
  const abilitazione = await prisma.abilitazione.findUnique({
    where: { id: abilitazioneId },
    include: { script: { include: { variabili: true } } },
  });
  if (!abilitazione) return;

  for (const variabile of abilitazione.script.variabili) {
    const valore = String(fd.get(`valore-${variabile.id}`) ?? "").trim();
    if (valore === "") {
      await prisma.valoreVariabile.deleteMany({ where: { abilitazioneId, variabileId: variabile.id } });
      continue;
    }
    await prisma.valoreVariabile.upsert({
      where: { abilitazioneId_variabileId: { abilitazioneId, variabileId: variabile.id } },
      create: { abilitazioneId, variabileId: variabile.id, valore },
      update: { valore },
    });
  }
  await prisma.abilitazione.update({
    where: { id: abilitazioneId },
    data: { note: opzionale(fd, "note") },
  });
  revalidatePath(`/script/${slug}`);
}

// ---------- App collegate ----------

export async function creaApp(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) return;
  const chiave = (testo(fd, "chiave") || slugDa(nome)).toLowerCase();
  await prisma.appCollegata.upsert({
    where: { chiave },
    create: {
      chiave,
      nome,
      descrizione: opzionale(fd, "descrizione"),
      colore: testo(fd, "colore") || "#b8963e",
      ordine: await prisma.appCollegata.count(),
    },
    update: { nome, descrizione: opzionale(fd, "descrizione"), attiva: true },
  });
  revalidatePath("/app");
  revalidatePath("/");
}

export async function salvaApp(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  await prisma.appCollegata.update({
    where: { id },
    data: {
      nome: testo(fd, "nome"),
      descrizione: opzionale(fd, "descrizione"),
      colore: testo(fd, "colore") || "#b8963e",
      attiva: fd.get("attiva") === "on",
    },
  });
  revalidatePath("/app");
  revalidatePath("/");
}

export async function eliminaApp(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  await prisma.appCollegata.delete({ where: { id } });
  revalidatePath("/app");
  revalidatePath("/");
}

// ---------- Chiavi API ----------

// Le chiavi si creano dal terminale (`npm run chiave -- <app>`), come nelle
// altre app Deluxy: qui si possono solo revocare o riattivare, così la chiave in
// chiaro non passa mai da una pagina web.
export async function cambiaStatoChiave(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  await prisma.apiKey.update({ where: { id }, data: { attiva: testo(fd, "attiva") === "1" } });
  revalidatePath("/impostazioni");
}

export async function eliminaChiave(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  await prisma.apiKey.delete({ where: { id } });
  revalidatePath("/impostazioni");
}
