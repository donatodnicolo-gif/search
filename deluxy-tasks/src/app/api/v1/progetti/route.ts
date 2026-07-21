import type { Progetto } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// Registro dei progetti che dialogano con Tasks. Registrare un progetto serve a:
//  - dare un nome leggibile al `sistema`,
//  - dire a Tasks a quale URL "richiamare" il progetto (callbackUrl) quando una
//    sua task cambia qui,
//  - e con quale segreto firmare quella chiamata (HMAC).

// Non espone mai il segreto in chiaro: dice solo se è impostato.
function serializza(p: Progetto) {
  return {
    sistema: p.sistema,
    nome: p.nome,
    callbackUrl: p.callbackUrl,
    callbackConfigurato: Boolean(p.callbackSegreto),
    attivo: p.attivo,
    ultimoCursore: p.ultimoCursore,
    creatoIl: p.creatoIl.toISOString(),
    aggiornatoIl: p.aggiornatoIl.toISOString(),
  };
}

// GET /api/v1/progetti — elenco dei progetti registrati (senza segreti).
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;
  const dati = await prisma.progetto.findMany({ orderBy: { nome: "asc" } });
  return NextResponse.json({ dati: dati.map(serializza) });
}

// POST /api/v1/progetti — registra o aggiorna un progetto (richiede scrittura).
// Body: { sistema, nome, callbackUrl?, callbackSegreto?, attivo? }.
// L'upsert è sulla chiave `sistema`.
export async function POST(req: NextRequest) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const sistema = typeof body.sistema === "string" ? body.sistema.trim() : "";
  if (!sistema) return erroreApi(400, "sistema è obbligatorio");
  const nome = typeof body.nome === "string" && body.nome.trim() ? body.nome.trim() : sistema;

  const callbackUrl = typeof body.callbackUrl === "string" ? body.callbackUrl.trim() : undefined;
  if (callbackUrl && !/^https?:\/\//i.test(callbackUrl)) {
    return erroreApi(400, "callbackUrl deve essere un URL http(s)");
  }
  const callbackSegreto =
    typeof body.callbackSegreto === "string" && body.callbackSegreto.trim()
      ? body.callbackSegreto.trim()
      : undefined;
  const attivo = typeof body.attivo === "boolean" ? body.attivo : undefined;

  const dati = {
    nome,
    ...(callbackUrl !== undefined ? { callbackUrl: callbackUrl || null } : {}),
    ...(callbackSegreto !== undefined ? { callbackSegreto } : {}),
    ...(attivo !== undefined ? { attivo } : {}),
  };

  const esistente = await prisma.progetto.findUnique({ where: { sistema } });
  const progetto = await prisma.progetto.upsert({
    where: { sistema },
    create: { sistema, ...dati },
    update: dati,
  });

  return NextResponse.json(
    { esito: esistente ? "aggiornato" : "creato", ...serializza(progetto) },
    { status: esistente ? 200 : 201 },
  );
}
