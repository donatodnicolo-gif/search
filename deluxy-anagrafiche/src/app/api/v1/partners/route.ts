import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { calcolaMerge, mergeContatti, nomeSistema, provenienzaIniziale } from "@/lib/merge";
import { serializzaPartner, validaPartner } from "@/lib/partner-api";
import { whereRicerca } from "@/lib/ricerca";

const INCLUDE = { contatti: true, riferimenti: true } as const;

// Registra i riferimenti esterni (sistema→id) per la risoluzione futura.
async function registraRiferimenti(
  partnerId: string,
  refs: { sistema: string; idEsterno?: string | null }[],
) {
  for (const r of refs) {
    if (!r.idEsterno) continue;
    await prisma.riferimentoEsterno.upsert({
      where: { sistema_idEsterno: { sistema: r.sistema, idEsterno: r.idEsterno } },
      create: { partnerId, sistema: r.sistema, idEsterno: r.idEsterno },
      update: { partnerId },
    });
  }
}

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

// POST /api/v1/partners — upsert-merge (richiede chiave con scrittura).
// Identità risolta in cascata: riferimento esterno (sistema+idEsterno) →
// platformId → P.IVA/CF → nome+città. Se il record esiste, i campi vengono
// fusi secondo le regole di proprietà (curati dal team = bloccati; fattuali =
// vince il più fresco/autorevole; note e referenti = additivi). Body opzionale:
// `sistema`, `idEsterno` (l'id dell'app chiamante), `asOf` (freschezza ISO).
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

  const sistema = nomeSistema(client.nome, typeof body.sistema === "string" ? body.sistema : undefined);
  const idEsterno = typeof body.idEsterno === "string" ? body.idEsterno.trim() : undefined;
  const asOf = typeof body.asOf === "string" ? body.asOf : undefined;
  const platformId = typeof dati.platformId === "string" ? dati.platformId : undefined;
  const hubspotId = typeof dati.hubspotId === "string" ? dati.hubspotId : undefined;

  // --- Cascata di identità ---
  let esistente: Awaited<ReturnType<typeof prisma.partner.findFirst>> = null;
  if (idEsterno) {
    const ref = await prisma.riferimentoEsterno.findUnique({
      where: { sistema_idEsterno: { sistema, idEsterno } },
      include: { partner: true },
    });
    esistente = ref?.partner ?? null;
  }
  if (!esistente && platformId) {
    esistente = await prisma.partner.findUnique({ where: { platformId } });
  }
  if (!esistente && typeof dati.pIva === "string" && dati.pIva) {
    esistente = await prisma.partner.findFirst({ where: { pIva: dati.pIva } });
  }
  if (!esistente && typeof dati.codiceFiscale === "string" && dati.codiceFiscale) {
    esistente = await prisma.partner.findFirst({ where: { codiceFiscale: dati.codiceFiscale } });
  }
  if (!esistente && typeof dati.nome === "string") {
    esistente = await prisma.partner.findFirst({
      where: {
        nome: { equals: dati.nome, mode: "insensitive" },
        ...(typeof dati.citta === "string" && dati.citta
          ? { citta: { equals: dati.citta, mode: "insensitive" } }
          : { citta: null }),
      },
    });
  }

  const refs = [
    { sistema, idEsterno },
    { sistema: "platform", idEsterno: platformId },
    { sistema: "hubspot", idEsterno: hubspotId },
  ];

  if (esistente) {
    // Questi campi non passano dal merge: identità (xref), fonte (creatore) e
    // attivo (una scrittura di sync non resuscita né archivia un'anagrafica).
    const mergeInput = { ...dati };
    delete mergeInput.platformId;
    delete mergeInput.hubspotId;
    delete mergeInput.fonte;
    delete mergeInput.attivo;

    const { dati: datiMerge, provenienza, ignorati } = calcolaMerge(esistente, mergeInput, sistema, asOf);

    let contattiWrite: Prisma.ContattoUpdateManyWithoutPartnerNestedInput | undefined;
    if (contatti) {
      const esistentiC = await prisma.contatto.findMany({ where: { partnerId: esistente.id } });
      const ops = mergeContatti(esistentiC, contatti, sistema);
      contattiWrite = { create: ops.create, update: ops.update };
    }

    await prisma.partner.update({
      where: { id: esistente.id },
      data: {
        ...datiMerge,
        provenienza: provenienza as Prisma.InputJsonValue,
        ...(contattiWrite ? { contatti: contattiWrite } : {}),
      },
    });
    await registraRiferimenti(esistente.id, refs);
    const aggiornato = await prisma.partner.findUnique({ where: { id: esistente.id }, include: INCLUDE });
    return NextResponse.json({
      esito: "merged",
      ...serializzaPartner(aggiornato!),
      applicati: Object.keys(datiMerge),
      in_revisione: ignorati,
    });
  }

  // Nessun aggancio: nuova anagrafica. Nasce come prospect: stato, interessi e
  // account sono decisioni del team, non li imposta la sorgente esterna.
  const datiCreate = { ...dati };
  delete datiCreate.stato;
  delete datiCreate.interessi;
  delete datiCreate.account;
  delete datiCreate.attivo;
  const fonte = typeof dati.fonte === "string" && dati.fonte ? dati.fonte : sistema === "platform" ? "platform" : sistema;
  const creato = await prisma.partner.create({
    data: {
      ...datiCreate,
      fonte,
      provenienza: provenienzaIniziale(datiCreate, sistema, asOf) as Prisma.InputJsonValue,
      contatti: contatti ? { create: contatti.map((c) => ({ ...c, fonte: sistema })) } : undefined,
    },
  });
  await registraRiferimenti(creato.id, refs);
  const creatoFull = await prisma.partner.findUnique({ where: { id: creato.id }, include: INCLUDE });
  return NextResponse.json({ esito: "creato", ...serializzaPartner(creatoFull!) }, { status: 201 });
}
