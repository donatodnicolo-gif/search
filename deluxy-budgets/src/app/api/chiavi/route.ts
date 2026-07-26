import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cifra, cifraturaConfigurata } from "@/lib/crypto";
import { CHIAVI_NOTE } from "@/lib/chiavi";

// Salva/rimuove le chiavi API impostate dall'app (Configurazione → Chiavi).
// Il valore arriva una volta sola e **non torna mai indietro**: in pagina si
// vede solo un'anteprima («sk-proj-…a1b2»), che basta a riconoscere la chiave
// senza poterla copiare da chi guarda lo schermo.

export async function PUT(req: Request) {
  if (!cifraturaConfigurata()) {
    return NextResponse.json(
      { error: "APP_SECRET non configurata: senza non si possono salvare chiavi dall'app." },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  const valore = String(body?.valore ?? "").trim();
  if (!CHIAVI_NOTE.some((c) => c.nome === nome)) {
    return NextResponse.json({ error: "Chiave non prevista da questa app." }, { status: 400 });
  }
  if (!valore) return NextResponse.json({ error: "Valore mancante." }, { status: 400 });

  // Il BOM invisibile incollato assieme alla chiave fa fallire l'header con un
  // errore incomprensibile («ByteString … 65279»): si pulisce qui, una volta.
  const pulito = valore.replace(/^﻿/, "").replace(/\s+/g, "");

  const cifrato = cifra(pulito);
  await prisma.chiaveApi.upsert({
    where: { nome },
    create: { nome, cifrato },
    update: { cifrato },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const nome = new URL(req.url).searchParams.get("nome");
  if (!nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });
  await prisma.chiaveApi.delete({ where: { nome } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
