import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";

// GET /api/v1/test-meta?stato=&brand= — il backlog dei test Meta
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;
  const p = req.nextUrl.searchParams;
  const test = await prisma.testMeta.findMany({
    where: {
      ...(p.get("stato") ? { stato: p.get("stato")! } : {}),
      ...(p.get("brand") ? { brand: p.get("brand")! } : {}),
    },
    orderBy: [{ dataVerifica: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
  });
  return NextResponse.json({ test });
}

// POST /api/v1/test-meta — crea o aggiorna (per id) un test.
// Body: { id?, titolo*, ipotesi*, brand?, fase?, variabile?, pubblico?, formato?, metricaSuccesso?,
//         guardrail?, budgetGiornaliero?, dataInizio?, dataVerifica?, stato?, esito?, lezione?, fonte?, note? }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;
  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  if (!body.id && (!body.titolo || !body.ipotesi)) {
    return erroreApi(400, "Campi obbligatori: titolo, ipotesi");
  }
  const dati = {
    ...(body.titolo ? { titolo: String(body.titolo) } : {}),
    ...(body.ipotesi ? { ipotesi: String(body.ipotesi) } : {}),
    ...(body.brand ? { brand: body.brand } : {}),
    ...(body.fase !== undefined ? { fase: body.fase } : {}),
    ...(body.variabile !== undefined ? { variabile: body.variabile } : {}),
    ...(body.pubblico !== undefined ? { pubblico: body.pubblico } : {}),
    ...(body.formato !== undefined ? { formato: body.formato } : {}),
    ...(body.metricaSuccesso !== undefined ? { metricaSuccesso: body.metricaSuccesso } : {}),
    ...(body.guardrail !== undefined ? { guardrail: body.guardrail } : {}),
    ...(body.budgetGiornaliero !== undefined
      ? { budgetGiornaliero: body.budgetGiornaliero != null ? Number(body.budgetGiornaliero) : null }
      : {}),
    ...(body.dataInizio !== undefined ? { dataInizio: body.dataInizio ? new Date(body.dataInizio) : null } : {}),
    ...(body.dataVerifica !== undefined ? { dataVerifica: body.dataVerifica ? new Date(body.dataVerifica) : null } : {}),
    ...(body.stato ? { stato: body.stato } : {}),
    ...(body.esito !== undefined ? { esito: body.esito } : {}),
    ...(body.lezione !== undefined ? { lezione: body.lezione } : {}),
    ...(body.fonte !== undefined ? { fonte: body.fonte } : {}),
    ...(body.note !== undefined ? { note: body.note } : {}),
  };
  let test;
  if (body.id) {
    const esistente = await prisma.testMeta.findUnique({ where: { id: String(body.id) } });
    if (!esistente) return erroreApi(404, "Test non trovato");
    test = await prisma.testMeta.update({ where: { id: esistente.id }, data: dati });
    await registra({ autore: cliente.nome, tipo: "modifica", entita: "test_meta", entitaId: test.id, titolo: `Test Meta aggiornato: ${test.titolo}` });
  } else {
    test = await prisma.testMeta.create({ data: dati as never });
    await registra({ autore: cliente.nome, tipo: "creazione", entita: "test_meta", entitaId: test.id, titolo: `Test Meta creato: ${test.titolo}` });
  }
  return NextResponse.json({ test }, { status: body.id ? 200 : 201 });
}
