import { NextRequest, NextResponse } from "next/server";
import { accountDiBrand } from "@/lib/operazioni";
import { avviaVideoMeta, chiudiVideoMeta, metaPuoScrivere, pezzoVideoMeta } from "@/lib/meta-scrittura";

// Il PROXY del caricamento video verso Meta, un pezzo per richiesta.
//
// ⚠️ Su Vercel il corpo di una richiesta ha un tetto DURO a 4,5 MB: il
// browser affetta il video (pezzi da ~3 MB) e questa rotta INOLTRA ogni
// pezzo alla sessione chunked di Meta senza mai avere il file intero.
// Carica nella LIBRERIA dell'account: non pubblica e non spende niente —
// l'annuncio che userà il video nasce solo con l'esecuzione approvata.
//
// Sta sotto /api/interno: il middleware la protegge con la password
// dell'app (come /api/interno/chiavi), non serve chiave API.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const corpo = await req.formData();
  const fase = String(corpo.get("fase") ?? "");

  if (fase === "start") {
    const brand = String(corpo.get("brand") ?? "");
    const dimensione = Number(corpo.get("dimensione"));
    if (!brand || !Number.isFinite(dimensione) || dimensione <= 0) {
      return NextResponse.json({ errore: "servono brand e dimensione del file" }, { status: 400 });
    }
    const permesso = await metaPuoScrivere();
    if (!permesso.puo) return NextResponse.json({ errore: permesso.perche }, { status: 503 });
    const account = await accountDiBrand("meta_ads", brand);
    if (!account) return NextResponse.json({ errore: `nessun account Meta per il brand ${brand}` }, { status: 400 });
    const esito = await avviaVideoMeta(account, dimensione);
    if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
    return NextResponse.json({ account, sessione: esito.sessione, videoId: esito.videoId, inizio: esito.inizio, fine: esito.fine });
  }

  if (fase === "transfer") {
    const account = String(corpo.get("account") ?? "");
    const sessione = String(corpo.get("sessione") ?? "");
    const inizio = Number(corpo.get("inizio"));
    const pezzo = corpo.get("pezzo");
    if (!account || !sessione || !Number.isFinite(inizio) || !(pezzo instanceof File)) {
      return NextResponse.json({ errore: "pezzo malformato" }, { status: 400 });
    }
    const esito = await pezzoVideoMeta(account, sessione, inizio, new Uint8Array(await pezzo.arrayBuffer()));
    if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
    return NextResponse.json({ inizio: esito.inizio, fine: esito.fine });
  }

  if (fase === "finish") {
    const account = String(corpo.get("account") ?? "");
    const sessione = String(corpo.get("sessione") ?? "");
    if (!account || !sessione) return NextResponse.json({ errore: "sessione mancante" }, { status: 400 });
    const esito = await chiudiVideoMeta(account, sessione);
    if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ errore: "fase sconosciuta: start | transfer | finish" }, { status: 400 });
}
