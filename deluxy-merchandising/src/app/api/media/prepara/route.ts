import { NextRequest, NextResponse } from "next/server";
import { tokenDi } from "@/lib/negozi";
import { LIMITI_MEDIA, preparaCaricamento, tipoDaMime } from "@/lib/shopify-media";

// **Passo 1 del caricamento di foto e video**: il browser dice cosa vuole
// caricare (nome, tipo, dimensione) e riceve da Shopify un indirizzo temporaneo
// per ogni file. Il file poi lo manda **il browser direttamente a Shopify**: un
// video da 80 MB non deve passare dal nostro server, che su Vercel accetta
// 4,5 MB per richiesta. Dietro il middleware come il resto dell'app.
export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as {
    negozioId?: string;
    file?: { nome?: string; mime?: string; byte?: number }[];
  };
  if (!corpo.negozioId) return NextResponse.json({ ok: false, errore: "Scegli prima il negozio." }, { status: 400 });
  const file = (corpo.file ?? []).filter((f) => f.nome && f.mime && typeof f.byte === "number");
  if (file.length === 0) return NextResponse.json({ ok: false, errore: "Nessun file da caricare." }, { status: 400 });
  if (file.length > LIMITI_MEDIA.perProdotto) {
    return NextResponse.json({ ok: false, errore: `Al massimo ${LIMITI_MEDIA.perProdotto} file per prodotto.` }, { status: 400 });
  }
  for (const f of file) {
    const tipo = tipoDaMime(f.mime as string);
    if (!tipo) return NextResponse.json({ ok: false, errore: `«${f.nome}» non è un'immagine né un video.` }, { status: 400 });
    const tetto = tipo === "video" ? LIMITI_MEDIA.videoByte : LIMITI_MEDIA.immagineByte;
    if ((f.byte as number) > tetto) {
      return NextResponse.json(
        { ok: false, errore: `«${f.nome}» supera i ${Math.round(tetto / 1024 / 1024)} MB.` },
        { status: 400 }
      );
    }
  }

  const negozio = await tokenDi(corpo.negozioId).catch(() => null);
  if (!negozio) return NextResponse.json({ ok: false, errore: "Negozio non trovato o senza credenziali." }, { status: 400 });

  const esito = await preparaCaricamento(
    negozio,
    file.map((f) => ({ nome: f.nome as string, mime: f.mime as string, byte: f.byte as number }))
  );
  if (esito.errore) return NextResponse.json({ ok: false, errore: esito.errore }, { status: 502 });
  return NextResponse.json({ ok: true, bersagli: esito.bersagli });
}
