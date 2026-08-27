import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessioneCorrente } from "@/lib/sessione-server";

// Scarica un certificato. Il file è un dato sanitario: lo vedono solo chi l'ha
// caricato e gli amministratori. Il controllo sta qui, non nella pagina che
// mostra il link — l'indirizzo si può digitare a mano.
// Sta sotto /cartellino (e non sotto /api) apposta: così passa dal middleware
// del portale, che pretende una sessione valida prima ancora di arrivarci.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessione = await sessioneCorrente();
  if (!sessione) return new NextResponse("Non autenticato", { status: 401 });

  const { id } = await params;
  const c = await prisma.certificato.findUnique({ where: { id } });
  if (!c) return new NextResponse("Certificato non trovato", { status: 404 });

  if (c.utenteId !== sessione.uid && sessione.ruolo !== "admin") {
    return new NextResponse("Questo certificato non è tuo", { status: 403 });
  }

  // Il nome del file finisce in un header: si manda ripulito in ASCII e, a
  // parte, la versione completa codificata (filename*), come vuole la RFC 5987.
  const semplice = c.nomeFile.replace(/[^\w.\- ]/g, "_");

  return new NextResponse(new Uint8Array(c.dati), {
    headers: {
      "Content-Type": c.tipoMime,
      "Content-Length": String(c.dimensione),
      // `attachment`, non `inline`: il file si scarica invece di aprirsi
      // nell'origine del Hub. Con `X-Content-Type-Options: nosniff` (header
      // globali) toglie ogni rischio che un contenuto caricato con un MIME
      // dichiarato falso venga interpretato come pagina nella nostra origine.
      "Content-Disposition": `attachment; filename="${semplice}"; filename*=UTF-8''${encodeURIComponent(c.nomeFile)}`,
      "X-Content-Type-Options": "nosniff",
      // Mai in cache condivisa: è un documento sanitario di una persona sola.
      "Cache-Control": "private, no-store",
    },
  });
}
