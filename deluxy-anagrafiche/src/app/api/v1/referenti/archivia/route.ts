import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { nomeSistema } from "@/lib/merge";

// POST /api/v1/referenti/archivia — archivia (o ripristina) un referente di un
// negozio, senza toccare il golden record del partner. Pensato per Deluxy Scout,
// che ha una chiave con scope ristretto ai referenti (scritturaReferenti).
//
// Body:
//   { riferimento?: {sistema, idEsterno}, negozio?, citta?,
//     referente: {nome?, email?, telefono?}, archiviato?: bool, origine? }
// Trova il partner (xref sistema+idEsterno → negozio+città) e il referente
// (email > telefono > nome normalizzato), imposta `archiviato`. Idempotente.
export async function POST(req: NextRequest) {
  const client = await autentica(req, { referenti: true });
  if (client instanceof NextResponse) return client;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const rif = (body.riferimento ?? {}) as { sistema?: string; idEsterno?: string };
  const referente = (body.referente ?? {}) as { nome?: string; email?: string; telefono?: string };
  const negozio = typeof body.negozio === "string" ? body.negozio.trim() : null;
  const citta = typeof body.citta === "string" ? body.citta.trim() : null;
  const archiviato = body.archiviato === undefined ? true : Boolean(body.archiviato);

  if (!referente.email && !referente.telefono && !referente.nome) {
    return erroreApi(400, "Serve almeno un dato del referente: email, telefono o nome");
  }

  // --- Trova il partner: prima per riferimento esterno, poi per negozio+città ---
  const sistema = nomeSistema(client.nome, rif.sistema);
  let partnerId: string | null = null;
  if (rif.idEsterno) {
    const ref = await prisma.riferimentoEsterno.findUnique({
      where: { sistema_idEsterno: { sistema, idEsterno: String(rif.idEsterno) } },
      select: { partnerId: true },
    });
    partnerId = ref?.partnerId ?? null;
  }
  if (!partnerId && negozio) {
    const p = await prisma.partner.findFirst({
      where: {
        nome: { equals: negozio, mode: "insensitive" },
        ...(citta ? { citta: { equals: citta, mode: "insensitive" } } : {}),
      },
      select: { id: true },
    });
    partnerId = p?.id ?? null;
  }
  if (!partnerId) {
    return NextResponse.json({ ok: false, reason: "partner_non_trovato" }, { status: 404 });
  }

  // --- Trova il referente nel partner: email > telefono > nome normalizzato ---
  const contatti = await prisma.contatto.findMany({ where: { partnerId } });
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  const soloCifre = (s: string) => s.replace(/[^\d]/g, "");
  let match = referente.email
    ? contatti.find((c) => c.email && c.email.toLowerCase().trim() === referente.email!.toLowerCase().trim())
    : undefined;
  if (!match && referente.telefono) {
    const t = soloCifre(referente.telefono).slice(-9);
    match = contatti.find((c) => c.telefono && soloCifre(c.telefono).slice(-9) === t);
  }
  if (!match && referente.nome) {
    const n = norm(referente.nome);
    match = contatti.find((c) => c.nome && norm(c.nome) === n);
  }
  if (!match) {
    return NextResponse.json({ ok: false, reason: "referente_non_trovato" }, { status: 404 });
  }

  // Idempotente: ri-archiviare (o ri-ripristinare) non è un errore.
  await prisma.contatto.update({
    where: { id: match.id },
    data: { archiviato, archiviatoIl: archiviato ? new Date() : null },
  });

  return NextResponse.json({ ok: true, partnerId, contattoId: match.id, archiviato });
}
