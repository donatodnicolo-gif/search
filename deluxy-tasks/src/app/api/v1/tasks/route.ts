import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { sincronizzaLivelli } from "@/lib/applica-livelli";
import { notificaProgetto } from "@/lib/callback";
import { PESO_PRIORITA, type Priorita } from "@/lib/priorita";
import { whereRicerca } from "@/lib/ricerca";
import { STATI_CHIUSI } from "@/lib/stati";
import { deveNotificareOrigine, scritturaPiuFresca } from "@/lib/sync";
import { conDefault, serializzaTask, validaTask } from "@/lib/task-api";

// GET /api/v1/tasks — elenco task con filtri e paginazione.
// Filtri: utente (email), stato, sistema, priorita, tag, q (ricerca a parole),
// scadenzaEntro (ISO: solo task con scadenza <= data), aperte (=true: esclude
// completate/annullate), attiva (default: solo attive; attiva=tutte per tutto),
// page, perPage.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const where: Prisma.TaskWhereInput = {};

  const q = p.get("q")?.trim();
  if (q) where.AND = whereRicerca(q);

  const utente = p.get("utente")?.trim();
  if (utente) where.utenteEmail = utente.toLowerCase();

  for (const campo of ["stato", "sistema", "priorita"] as const) {
    const v = p.get(campo)?.trim();
    if (v) where[campo] = v;
  }

  const tag = p.get("tag")?.trim();
  if (tag) where.tag = { has: tag };

  // aperte=true → solo task ancora da fare (esclude completate/annullate)
  if (p.get("aperte") === "true") where.stato = { notIn: [...STATI_CHIUSI] };

  const scadenzaEntro = p.get("scadenzaEntro")?.trim();
  if (scadenzaEntro) {
    const d = new Date(scadenzaEntro);
    if (!isNaN(d.getTime())) where.scadenza = { lte: d };
  }

  const attiva = p.get("attiva");
  if (attiva !== "tutte") where.attiva = attiva === "false" ? false : true;

  const pagina = Math.max(1, Number(p.get("page")) || 1);
  const perPagina = Math.min(200, Math.max(1, Number(p.get("perPage")) || 50));

  const [totale, dati] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: { livelli: true },
      // Prima le scadenze (chi non ne ha va in fondo), poi le più urgenti.
      orderBy: [{ scadenza: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
      skip: (pagina - 1) * perPagina,
      take: perPagina,
    }),
  ]);

  // Ordinamento fine per priorità a parità di scadenza (Postgres non ordina
  // per il peso semantico da solo).
  dati.sort((a, b) => {
    const sa = a.scadenza?.getTime() ?? Infinity;
    const sb = b.scadenza?.getTime() ?? Infinity;
    if (sa !== sb) return sa - sb;
    return (PESO_PRIORITA[a.priorita as Priorita] ?? 9) - (PESO_PRIORITA[b.priorita as Priorita] ?? 9);
  });

  return NextResponse.json({
    totale,
    pagina,
    perPagina,
    dati: dati.map(serializzaTask),
  });
}

// POST /api/v1/tasks — crea o aggiorna una task (richiede chiave con scrittura).
// Identità: (sistema, idEsterno). Se l'app manda un idEsterno già visto, la
// task viene aggiornata invece di duplicata. `sistema` di default è il nome
// della chiave API; può essere sovrascritto nel body.
export async function POST(req: NextRequest) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const risultato = validaTask(body, true);
  if ("errore" in risultato) return erroreApi(400, risultato.errore);

  const sistema = typeof body.sistema === "string" && body.sistema.trim() ? body.sistema.trim() : client.nome;
  const idEsterno = typeof body.idEsterno === "string" && body.idEsterno.trim() ? body.idEsterno.trim() : null;
  // Chi scrive: per default è il sistema di origine stesso (non richiede callback
  // verso sé); un'app può dichiarare di scrivere per conto di un'altra.
  const attore = typeof body.attore === "string" && body.attore.trim() ? body.attore.trim() : sistema;

  const dati = conDefault(risultato.dati);
  // Se la task viene marcata completata e non è passata una data, la stampiamo ora.
  const completataIl =
    dati.stato === "completata" ? (dati.completataIl ?? new Date()) : dati.stato ? null : undefined;

  const datiComuni = {
    utenteEmail: dati.utenteEmail!,
    utenteNome: dati.utenteNome,
    titolo: dati.titolo!,
    descrizione: dati.descrizione,
    stato: dati.stato,
    priorita: dati.priorita,
    scadenza: dati.scadenza,
    creataDa: dati.creataDa,
    link: dati.link,
    contestoTipo: dati.contestoTipo,
    contestoId: dati.contestoId,
    contestoEtichetta: dati.contestoEtichetta,
    revisioneOrigine: dati.revisioneOrigine,
    aggiornatoDaOrigine: dati.aggiornatoDaOrigine,
    ultimoAttore: attore,
    ...(dati.tag ? { tag: dati.tag } : {}),
    ...(dati.extra !== undefined ? { extra: dati.extra as Prisma.InputJsonValue } : {}),
    ...(completataIl !== undefined ? { completataIl } : {}),
  };

  // Con idEsterno: upsert sull'identità (sistema, idEsterno). Senza: sempre nuova.
  if (idEsterno) {
    const esistente = await prisma.task.findUnique({
      where: { sistema_idEsterno: { sistema, idEsterno } },
    });

    // Stabilire l'aggiornamento: se l'origine dichiara una freschezza più
    // vecchia di quella registrata, la scrittura è obsoleta → non regredire.
    if (esistente && !scritturaPiuFresca(esistente, dati.aggiornatoDaOrigine)) {
      return NextResponse.json(
        {
          esito: "ignorata_obsoleta",
          motivo: "asOf più vecchio dell'ultimo aggiornamento registrato",
          ...serializzaTask(esistente),
        },
        { status: 200 },
      );
    }

    const upserted = await prisma.task.upsert({
      where: { sistema_idEsterno: { sistema, idEsterno } },
      create: { sistema, idEsterno, ...datiComuni, attiva: true },
      // Ogni modifica fa crescere la revisione interna (cursore per il pull).
      update: { ...datiComuni, attiva: true, revisione: { increment: 1 } },
    });

    // Livelli di priorità con date diverse: sostituiscono il set e fissano il
    // livello effettivo (priorita/scadenza). Se il body non li porta, restano
    // quelli già presenti.
    if (dati.livelli !== undefined) {
      await sincronizzaLivelli(upserted.id, dati.livelli, dati.livelloSceltoNota);
    }
    const task = await prisma.task.findUnique({ where: { id: upserted.id }, include: { livelli: true } });

    const evento = esistente ? "aggiornata" : "creata";
    if (task && deveNotificareOrigine(task.sistema, attore)) await notificaProgetto(task, evento);
    return NextResponse.json(
      { esito: evento, ...serializzaTask(task!) },
      { status: esistente ? 200 : 201 },
    );
  }

  const creato = await prisma.task.create({ data: { sistema, ...datiComuni } });
  if (dati.livelli !== undefined) {
    await sincronizzaLivelli(creato.id, dati.livelli, dati.livelloSceltoNota);
  }
  const task = await prisma.task.findUnique({ where: { id: creato.id }, include: { livelli: true } });
  if (task && deveNotificareOrigine(task.sistema, attore)) await notificaProgetto(task, "creata");
  return NextResponse.json({ esito: "creata", ...serializzaTask(task!) }, { status: 201 });
}
