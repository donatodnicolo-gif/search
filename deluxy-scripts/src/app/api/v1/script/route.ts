import { NextRequest } from "next/server";
import { autentica, erroreApi, rispostaApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { scriptPerApp, slugDa, slugLibero } from "@/lib/script";
import { chiaviUsate } from "@/lib/variabili";

export const dynamic = "force-dynamic";

// GET /api/v1/script?app=<chiave>
// I testi abilitati per quell'app, già composti con i suoi valori (firma, tono).
// Senza `corpo` grezzo di default: si chiede con &corpo=1 quando serve anche la
// versione coi segnaposto (per capire cosa è stato sostituito).
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof Response) return client;

  const app = req.nextUrl.searchParams.get("app")?.trim();
  if (!app) return erroreApi(400, "Manca il parametro app: ?app=<chiave dell'app>");
  const conCorpo = req.nextUrl.searchParams.get("corpo") === "1";

  const script = await scriptPerApp(app);
  if (script === null) return erroreApi(404, `App "${app}" sconosciuta o disattivata`);

  return rispostaApi({
    app,
    script: script.map((s) => ({
      slug: s.slug,
      nome: s.nome,
      descrizione: s.descrizione,
      note: s.note,
      canale: s.canale,
      categoria: s.categoria,
      tag: s.tag,
      aggiornatoIl: s.aggiornatoIl,
      oggetto: s.oggettoRisolto,
      testo: s.corpoRisolto,
      ...(conCorpo ? { corpo: s.corpo } : {}),
      variabili: s.variabili,
      daCompilare: s.daCompilare,
    })),
  });
}

// POST /api/v1/script — crea (o aggiorna, se passi `slug`) un testo, e lo
// ACCENDE per l'app che lo manda. Richiede una chiave di scrittura.
//
// ⚠️ PERCHÉ ESISTE. I testi hanno un padrone solo — quest'app — e le altre li
// leggono soltanto: due copie dello stesso testo aziendale divergono, ed è il
// motivo per cui Scripts esiste. Ma «un padrone solo» non vuol dire «si scrivono
// solo da qui»: chi risponde alle mail tutto il giorno le formule buone le
// riconosce là, mentre scrive, e obbligarlo a cambiare app per salvarle
// significa che non le salverà mai. Questa rotta lascia CREARE da fuori, mentre
// il testo continua a vivere qui: è l'opposto di copiarlo.
//
// L'abilitazione per l'app che scrive è automatica e voluta: un testo creato da
// AI Mail e non acceso per AI Mail sarebbe invisibile a chi l'ha appena scritto.
export async function POST(req: NextRequest) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof Response) return client;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const testo = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const nome = testo(body.nome);
  const corpo = typeof body.corpo === "string" ? body.corpo : "";
  if (!nome) return erroreApi(400, "Manca `nome`: il titolo con cui ritrovare il testo");
  if (!corpo.trim()) return erroreApi(400, "Manca `corpo`: il testo del messaggio");

  // Per quale app va acceso. Di default quella della chiave: chi scrive è chi
  // lo userà. Un'app che non c'è ancora si crea al volo — altrimenti il primo
  // testo mandato da un'app nuova risulterebbe scritto e invisibile.
  const chiaveApp = testo(body.app) || client.nome;
  const app = await prisma.appCollegata.upsert({
    where: { chiave: chiaveApp },
    create: { chiave: chiaveApp, nome: testo(body.nomeApp) || chiaveApp },
    update: {},
    select: { id: true, attiva: true },
  });

  const oggetto = testo(body.oggetto) || null;
  const dati = {
    nome,
    corpo,
    oggetto,
    descrizione: testo(body.descrizione) || null,
    note: testo(body.note) || null,
    canale: testo(body.canale) || "email",
    categoria: testo(body.categoria) || "vendite",
    autore: testo(body.autore) || null,
    tag: Array.isArray(body.tag) ? body.tag.filter((t): t is string => typeof t === "string") : [],
  };

  const slugRichiesto = testo(body.slug);
  const esistente = slugRichiesto
    ? await prisma.script.findUnique({ where: { slug: slugRichiesto }, select: { id: true, slug: true, nome: true } })
    : null;

  let script: { id: string; slug: string };
  let creato = false;
  if (esistente) {
    // Lo slug segue il nome solo finché nessuno l'ha usato altrove: è la chiave
    // con cui le altre app chiedono il testo, cambiarla a cuor leggero le rompe.
    const slug =
      slugDa(nome) !== slugDa(esistente.nome) ? await slugLibero(nome, esistente.id) : esistente.slug;
    script = await prisma.script.update({
      where: { id: esistente.id },
      data: { ...dati, slug },
      select: { id: true, slug: true },
    });
  } else {
    script = await prisma.script.create({
      data: { ...dati, slug: await slugLibero(nome) },
      select: { id: true, slug: true },
    });
    creato = true;
  }

  // I segnaposto {{COSÌ}} scritti nel testo e non ancora dichiarati diventano
  // variabili vere. Valgono anche nell'oggetto dell'email: si guardano entrambi.
  const usate = chiaviUsate(`${oggetto ?? ""}\n${corpo}`);
  if (usate.length > 0) {
    const gia = new Set(
      (await prisma.variabile.findMany({ where: { scriptId: script.id }, select: { chiave: true } })).map(
        (v) => v.chiave,
      ),
    );
    const nuove = usate.filter((c) => !gia.has(c));
    if (nuove.length > 0) {
      await prisma.variabile.createMany({
        data: nuove.map((chiave, i) => ({ scriptId: script.id, chiave, ordine: gia.size + i })),
        skipDuplicates: true,
      });
    }
  }

  await prisma.abilitazione.upsert({
    where: { scriptId_appId: { scriptId: script.id, appId: app.id } },
    create: { scriptId: script.id, appId: app.id, attiva: true },
    update: { attiva: true },
  });

  return rispostaApi(
    {
      esito: creato ? "creato" : "aggiornato",
      slug: script.slug,
      app: chiaveApp,
      // Se l'app era stata disattivata a mano, il testo esiste ma dalle API non
      // esce: meglio dirlo subito che lasciarlo cercare.
      avviso: app.attiva ? undefined : `L'app "${chiaveApp}" è disattivata: i suoi testi non escono dalle API.`,
      variabili: usate,
    },
    creato ? 201 : 200,
  );
}
