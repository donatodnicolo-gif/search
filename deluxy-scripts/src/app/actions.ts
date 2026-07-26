"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aiConfigurata, type Proposta, RITOCCHI, scriviBozza, sistemaTesto } from "@/lib/ai";
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

// Una chiave nuova per un'app che deve leggere i testi. Nel database finisce
// solo lo SHA-256: la chiave in chiaro esiste per il tempo di questa risposta,
// compare una volta sola nella pagina e non è più recuperabile — nemmeno da qui.
// Torna dentro il risultato dell'azione e non in un redirect: così non passa mai
// dall'indirizzo del browser, dove finirebbe nella cronologia e nei log.
export type EsitoChiave = { chiave?: string; nome?: string; avviso?: string; errore?: string };

export async function creaChiaveApi(_precedente: EsitoChiave | null, fd: FormData): Promise<EsitoChiave> {
  const nome = slugDa(testo(fd, "nome"));
  if (!nome || nome === "script") return { errore: "Dai un nome all'app che userà la chiave." };

  const esistente = await prisma.apiKey.findUnique({ where: { nome } });
  const rigenera = fd.get("rigenera") === "on";
  if (esistente && !rigenera) {
    return {
      errore: `Esiste già una chiave per "${nome}". Spunta «rigenera» per sostituirla — quella di prima smetterà di funzionare — oppure scegli un altro nome.`,
    };
  }

  const { createHash, randomBytes } = await import("crypto");
  const chiave = `dlxs_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(chiave).digest("hex");
  const scrittura = testo(fd, "permessi") === "scrittura";

  await prisma.apiKey.upsert({
    where: { nome },
    create: { nome, hash, scrittura },
    update: { hash, scrittura, attiva: true, ultimoUso: null },
  });

  revalidatePath("/impostazioni");
  return {
    chiave,
    nome,
    avviso: esistente
      ? "La chiave precedente con questo nome non funziona più: aggiornala ovunque fosse in uso."
      : undefined,
  };
}

// Revoca, riattivazione ed eliminazione. La chiave in chiaro non ricompare mai:
// se si è persa, se ne rigenera una nuova.
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

// ---------- AI ----------
//
// L'AI propone e basta: queste due azioni restituiscono una bozza a schermo e
// NON scrivono niente nel database. Il salvataggio è un gesto separato
// (`applicaProposta`, oppure il normale «Crea il testo»), fatto da una persona
// che ha riletto. Sono server action e non rotte API: così passano dalla stessa
// porta protetta da password del resto della UI, e la chiave OpenAI non è
// raggiungibile da fuori.

export type EsitoAi = { proposta?: Proposta; errore?: string };

function messaggioErrore(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // Gli errori dell'SDK sono in inglese e spesso lunghi: si tiene la prima riga.
  return m.split("\n")[0].slice(0, 300);
}

export async function proponiBozza(_precedente: EsitoAi | null, fd: FormData): Promise<EsitoAi> {
  if (!aiConfigurata()) return { errore: "L'AI è spenta: manca OPENAI_API_KEY." };
  const brief = testo(fd, "brief");
  if (!brief) return { errore: "Scrivi due righe di brief: a chi si manda e cosa deve dire." };
  try {
    const proposta = await scriviBozza({
      brief,
      categoria: testo(fd, "categoria") || "vendite",
      canale: testo(fd, "canale") || "email",
      destinatario: testo(fd, "destinatario") || undefined,
      obiettivo: testo(fd, "obiettivo") || undefined,
      daDire: testo(fd, "daDire") || undefined,
      daNonDire: testo(fd, "daNonDire") || undefined,
      tono: testo(fd, "tono") || undefined,
      lunghezza: testo(fd, "lunghezza") || undefined,
    });
    return { proposta };
  } catch (e) {
    return { errore: messaggioErrore(e) };
  }
}

export async function proponiRitocco(_precedente: EsitoAi | null, fd: FormData): Promise<EsitoAi> {
  if (!aiConfigurata()) return { errore: "L'AI è spenta: manca OPENAI_API_KEY." };
  const id = testo(fd, "id");
  const script = id ? await prisma.script.findUnique({ where: { id } }) : null;
  if (!script) return { errore: "Testo non trovato." };

  const scelto = RITOCCHI.find((r) => r.valore === testo(fd, "ritocco"));
  const istruzione = testo(fd, "istruzione") || scelto?.istruzione;
  if (!istruzione) return { errore: "Scegli un ritocco o scrivi cosa vuoi cambiare." };

  try {
    const proposta = await sistemaTesto({
      titolo: script.nome,
      oggetto: script.oggetto,
      corpo: script.corpo,
      categoria: script.categoria,
      canale: script.canale,
      istruzione,
    });
    return { proposta };
  } catch (e) {
    return { errore: messaggioErrore(e) };
  }
}

// Sostituisce oggetto e corpo con la versione proposta dall'AI. Lo fa solo
// quando una persona preme «usa questa versione»: le variabili nuove nascono
// come sempre da `allineaVariabili`, quelle vecchie restano dove sono.
export async function applicaProposta(fd: FormData) {
  const id = testo(fd, "id");
  const slug = testo(fd, "slug");
  if (!id) return;
  const corpo = corpoDa(fd);
  // Oggetto vuoto NON vuol dire «cancellalo»: vuol dire che il modello non ne
  // ha proposto uno (succede sempre quando si chiede di adattare a WhatsApp).
  // Sovrascriverlo con null farebbe sparire in silenzio l'oggetto dell'email,
  // che nessuno ha chiesto di togliere.
  const oggetto = opzionale(fd, "oggetto");
  await prisma.script.update({
    where: { id },
    data: oggetto ? { corpo, oggetto } : { corpo },
  });
  await allineaVariabili(id, `${oggetto ?? ""}\n${corpo}`);
  revalidatePath(`/script/${slug}`);
  revalidatePath("/");
}
