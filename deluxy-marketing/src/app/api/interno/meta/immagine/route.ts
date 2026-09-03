import { NextRequest, NextResponse } from "next/server";
import { accountDiBrand } from "@/lib/operazioni";
import { caricaImmagineMeta, metaPuoScrivere } from "@/lib/meta-scrittura";

// Una IMMAGINE nella libreria dell'account Meta, una per richiesta.
//
// Serve alle SCHEDE del carosello: ogni scheda ha la sua immagine, e
// mandarle tutte insieme nel form sfonderebbe il tetto dei 4,5 MB di
// Vercel. Il browser le carica una alla volta da qui e nel form viaggiano
// solo gli hash. Libreria = niente di pubblicato, come per il resto.
// Sta sotto /api/interno: protetta dalla password dell'app dal middleware.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const corpo = await req.formData();
  const brand = String(corpo.get("brand") ?? "");
  const file = corpo.get("file");
  if (!brand || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ errore: "servono brand e file" }, { status: 400 });
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    return NextResponse.json({ errore: "formato non riconosciuto: JPG, PNG o WebP" }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ errore: "immagine oltre i 4 MB (tetto di piattaforma): comprimila" }, { status: 400 });
  }
  const permesso = await metaPuoScrivere();
  if (!permesso.puo) return NextResponse.json({ errore: permesso.perche }, { status: 503 });
  const account = await accountDiBrand("meta_ads", brand);
  if (!account) return NextResponse.json({ errore: `nessun account Meta per il brand ${brand}` }, { status: 400 });
  const esito = await caricaImmagineMeta(account, new Uint8Array(await file.arrayBuffer()), file.name || "scheda.jpg");
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return NextResponse.json({ hash: esito.hash });
}
