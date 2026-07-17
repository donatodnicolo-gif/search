import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { serializzaPartner, validaPartner } from "@/lib/partner-api";
import { whereRicerca } from "@/lib/ricerca";

const INCLUDE = { contatti: true } as const;

// GET /api/v1/partners — elenco con filtri e paginazione.
// Filtri: q (ricerca a parole su tutti i campi e i contatti), categoria, citta,
// provincia, regione, stato, fonte, platformId, attivo (default: solo attivi;
// attivo=tutti per tutto).
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const where: Prisma.PartnerWhereInput = {};

  const q = p.get("q")?.trim();
  if (q) where.AND = whereRicerca(q);
  for (const campo of ["categoria", "citta", "provincia", "regione", "stato", "fonte"] as const) {
    const v = p.get(campo)?.trim();
    if (v) where[campo] = campo === "categoria" ? v.toUpperCase() : v;
  }
  const platformId = p.get("platformId")?.trim();
  if (platformId) where.platformId = platformId;

  const attivo = p.get("attivo");
  if (attivo !== "tutti") where.attivo = attivo === "false" ? false : true;

  const pagina = Math.max(1, Number(p.get("page")) || 1);
  const perPagina = Math.min(200, Math.max(1, Number(p.get("perPage")) || 50));

  const [totale, dati] = await Promise.all([
    prisma.partner.count({ where }),
    prisma.partner.findMany({
      where,
      include: INCLUDE,
      orderBy: { nome: "asc" },
      skip: (pagina - 1) * perPagina,
      take: perPagina,
    }),
  ]);

  return NextResponse.json({
    totale,
    pagina,
    perPagina,
    dati: dati.map(serializzaPartner),
  });
}

// POST /api/v1/partners — crea un'anagrafica (richiede chiave con scrittura).
// Se il body ha un platformId già registrato, aggiorna quell'anagrafica (upsert):
// è il percorso usato dalla piattaforma consegne quando crea o modifica un partner.
export async function POST(req: NextRequest) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const risultato = validaPartner(body, true);
  if ("errore" in risultato) return erroreApi(400, risultato.errore);
  const { dati, contatti } = risultato;
  if (!dati.fonte) dati.fonte = client.nome === "deluxy-platform" ? "platform" : "manuale";

  let esistente = dati.platformId
    ? await prisma.partner.findUnique({ where: { platformId: dati.platformId } })
    : null;

  // Dedup per le segnalazioni senza platformId (es. app search/supplier):
  // stesso nome nella stessa città = stessa anagrafica, anche se disattivata.
  // In quel caso si aggiornano i dati ma NON stato/attivo/fonte, che sono
  // decisioni del team (una segnalazione ripetuta non riporta a "prospect"
  // chi è già in trattativa, né resuscita chi è stato rimosso).
  if (!esistente && !dati.platformId) {
    esistente = await prisma.partner.findFirst({
      where: {
        nome: { equals: dati.nome, mode: "insensitive" },
        ...(dati.citta ? { citta: { equals: dati.citta, mode: "insensitive" } } : { citta: null }),
      },
    });
    if (esistente) {
      delete dati.stato;
      delete dati.attivo;
      delete dati.fonte;
      // La nota nuova si accoda a quella esistente invece di sovrascriverla
      if (dati.note && esistente.note && !esistente.note.includes(dati.note)) {
        dati.note = `${esistente.note}\n${dati.note}`;
      } else if (esistente.note && !dati.note) {
        delete dati.note;
      }
    }
  }

  if (esistente) {
    const aggiornato = await prisma.partner.update({
      where: { id: esistente.id },
      data: {
        ...dati,
        contatti: contatti
          ? { deleteMany: {}, create: contatti }
          : undefined,
      },
      include: INCLUDE,
    });
    return NextResponse.json(serializzaPartner(aggiornato));
  }

  const creato = await prisma.partner.create({
    data: { ...dati, contatti: contatti ? { create: contatti } : undefined },
    include: INCLUDE,
  });
  return NextResponse.json(serializzaPartner(creato), { status: 201 });
}
