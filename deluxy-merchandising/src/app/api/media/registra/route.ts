import { NextRequest, NextResponse } from "next/server";
import { tokenDi } from "@/lib/negozi";
import {
  attendiFile,
  caricaByteSuBersaglio,
  preparaCaricamento,
  registraFile,
  tipoDaMime,
  type FileShopify,
} from "@/lib/shopify-media";

// **Passo 2 del caricamento**: il browser ha mandato il file a Shopify e qui lo
// si registra fra i Files del negozio (`fileCreate`), poi si aspetta che
// Shopify lo elabori per restituire l'URL definitivo. Se dopo 20 secondi è
// ancora in elaborazione (capita coi video) si risponde lo stesso: il file è
// dentro, l'URL si completerà al salvataggio del prodotto.
//
// **Ripiego**: se il browser non è riuscito a caricare da solo (rete, CORS),
// manda il file qui come multipart — vale solo per file piccoli, perché su
// Vercel una richiesta accetta 4,5 MB. In quel caso è questo server a fare
// anche il passo 1.
export const maxDuration = 60;

type Voce = { resourceUrl: string; nome: string; mime: string };

export async function POST(req: NextRequest) {
  const tipoRichiesta = req.headers.get("content-type") ?? "";
  let negozioId = "";
  const voci: Voce[] = [];
  let ripiego: { nome: string; mime: string; byte: ArrayBuffer } | null = null;

  if (tipoRichiesta.includes("multipart/form-data")) {
    const fd = await req.formData();
    negozioId = String(fd.get("negozioId") ?? "");
    const f = fd.get("file");
    if (!(f instanceof File)) return NextResponse.json({ ok: false, errore: "Manca il file." }, { status: 400 });
    if (!tipoDaMime(f.type)) return NextResponse.json({ ok: false, errore: "Il file non è un'immagine né un video." }, { status: 400 });
    ripiego = { nome: f.name, mime: f.type, byte: await f.arrayBuffer() };
  } else {
    const corpo = (await req.json().catch(() => ({}))) as { negozioId?: string; file?: Partial<Voce>[] };
    negozioId = corpo.negozioId ?? "";
    for (const v of corpo.file ?? []) {
      if (v.resourceUrl && v.nome && v.mime && tipoDaMime(v.mime)) voci.push(v as Voce);
    }
  }
  if (!negozioId) return NextResponse.json({ ok: false, errore: "Scegli prima il negozio." }, { status: 400 });
  const negozio = await tokenDi(negozioId).catch(() => null);
  if (!negozio) return NextResponse.json({ ok: false, errore: "Negozio non trovato o senza credenziali." }, { status: 400 });

  if (ripiego) {
    const prep = await preparaCaricamento(negozio, [{ nome: ripiego.nome, mime: ripiego.mime, byte: ripiego.byte.byteLength }]);
    if (prep.errore) return NextResponse.json({ ok: false, errore: prep.errore }, { status: 502 });
    const invio = await caricaByteSuBersaglio(prep.bersagli[0], ripiego);
    if (!invio.ok) return NextResponse.json({ ok: false, errore: invio.errore }, { status: 502 });
    voci.push({ resourceUrl: prep.bersagli[0].resourceUrl, nome: ripiego.nome, mime: ripiego.mime });
  }
  if (voci.length === 0) return NextResponse.json({ ok: false, errore: "Nessun file da registrare." }, { status: 400 });

  const reg = await registraFile(
    negozio,
    voci.map((v) => ({ resourceUrl: v.resourceUrl, tipo: tipoDaMime(v.mime) as "immagine" | "video", alt: v.nome }))
  );
  if (reg.errore || reg.id.length === 0) {
    return NextResponse.json({ ok: false, errore: reg.errore ?? "Shopify non ha registrato il file." }, { status: 502 });
  }

  // Si aspetta in fila, non in parallelo: il tempo massimo è della richiesta.
  const file: (FileShopify & { nome: string })[] = [];
  const scadenza = Date.now() + 20_000;
  for (let i = 0; i < reg.id.length; i++) {
    const s = await attendiFile(negozio, reg.id[i], Math.max(1000, scadenza - Date.now()));
    file.push({ ...s, nome: voci[i]?.nome ?? "" });
  }
  return NextResponse.json({ ok: true, file });
}
