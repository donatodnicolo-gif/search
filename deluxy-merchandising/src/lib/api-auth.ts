// Autenticazione delle API di Merchandising: chiave nell'header `x-api-key`
// (o `Authorization: Bearer …`), come in tutte le altre app Deluxy.
//
// Nel database c'è solo lo SHA-256 della chiave: se il database finisse in mano
// a qualcuno, le chiavi non ci sarebbero comunque.

import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./db";

export function improntaChiave(chiave: string): string {
  return createHash("sha256").update(chiave).digest("hex");
}

export function generaChiave(): string {
  return `dlxm_${randomBytes(24).toString("hex")}`;
}

export function erroreApi(stato: number, messaggio: string) {
  return NextResponse.json({ errore: messaggio }, { status: stato });
}

/** Ritorna il nome del client, oppure la risposta di errore già pronta. */
export async function autentica(req: NextRequest): Promise<{ nome: string } | NextResponse> {
  const diretta = req.headers.get("x-api-key");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const chiave = (diretta || bearer || "").trim();
  if (!chiave) return erroreApi(401, "Chiave API mancante: header x-api-key oppure Authorization: Bearer.");

  const riga = await prisma.apiKey.findUnique({ where: { hash: improntaChiave(chiave) } });
  if (!riga || !riga.attiva) return erroreApi(403, "Chiave API non valida o disattivata.");

  // Serve a capire quali integrazioni sono vive e quali no.
  await prisma.apiKey.update({ where: { id: riga.id }, data: { ultimoUso: new Date() } });
  return { nome: riga.nome };
}
