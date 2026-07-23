import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";

// GET /api/v1/ordini?da=AAAA-MM-GG&brand=&limite= — ordini con le loro righe
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;
  const p = req.nextUrl.searchParams;
  const da = p.get("da");
  const ordini = await prisma.ordine.findMany({
    where: {
      ...(da ? { data: { gte: new Date(da) } } : {}),
      ...(p.get("brand") ? { brand: p.get("brand")! } : {}),
      ...(p.get("negozio") ? { negozio: p.get("negozio")! } : {}),
    },
    orderBy: { data: "desc" },
    take: Number(p.get("limite") ?? 200),
    include: { righe: true },
  });
  return NextResponse.json({ ordini });
}

// POST /api/v1/ordini — carica ordini (batch). Le sessioni Claude che hanno
// accesso a Shopify possono usarlo al posto dello script con token.
// Body: { negozio*, brand?, ordini: [{ idEsterno*, numero*, data*, totale?, netto?,
//   spedizione?, sconto?, stato?, cliente?, email?, citta?, paese?, origine?,
//   utmSource?, utmCampagna?, righe: [{ titolo*, sku?, vendor?, tipo?, quantita?, prezzo?, totale?, categoria? }] }] }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;
  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  const negozio = body.negozio;
  if (!negozio) return erroreApi(400, "Campo obbligatorio: negozio");
  const lista = Array.isArray(body.ordini) ? body.ordini : [];
  if (lista.length === 0) return erroreApi(400, "Nessun ordine da caricare");

  let nuovi = 0;
  let aggiornati = 0;
  for (const o of lista) {
    if (!o?.idEsterno || !o?.numero || !o?.data) continue;
    const idEsterno = String(o.idEsterno);
    const dati = {
      brand: o.brand ?? body.brand ?? "gifts",
      numero: String(o.numero),
      data: new Date(o.data),
      totale: o.totale != null ? Number(o.totale) : null,
      netto: o.netto != null ? Number(o.netto) : null,
      spedizione: o.spedizione != null ? Number(o.spedizione) : null,
      sconto: o.sconto != null ? Number(o.sconto) : null,
      valuta: o.valuta ?? "EUR",
      stato: o.stato ?? "pagato",
      cliente: o.cliente ?? null,
      email: o.email ?? null,
      citta: o.citta ?? null,
      paese: o.paese ?? null,
      origine: o.origine ?? null,
      utmSource: o.utmSource ?? null,
      utmCampagna: o.utmCampagna ?? null,
    };
    const righe = (Array.isArray(o.righe) ? o.righe : [])
      .filter((r: { titolo?: string }) => r?.titolo)
      .map((r: Record<string, unknown>) => ({
        titolo: String(r.titolo),
        sku: (r.sku as string) ?? null,
        vendor: (r.vendor as string) ?? null,
        tipo: (r.tipo as string) ?? null,
        quantita: r.quantita != null ? Math.round(Number(r.quantita)) : 1,
        prezzo: r.prezzo != null ? Number(r.prezzo) : null,
        totale: r.totale != null ? Number(r.totale) : null,
        categoria: (r.categoria as string) ?? null,
      }));

    const esistente = await prisma.ordine.findUnique({
      where: { negozio_idEsterno: { negozio, idEsterno } },
    });
    if (esistente) {
      await prisma.rigaOrdine.deleteMany({ where: { ordineId: esistente.id } });
      await prisma.ordine.update({ where: { id: esistente.id }, data: { ...dati, righe: { create: righe } } });
      aggiornati++;
    } else {
      await prisma.ordine.create({ data: { negozio, idEsterno, ...dati, righe: { create: righe } } });
      nuovi++;
    }
  }
  await registra({
    autore: cliente.nome,
    tipo: "import",
    entita: "ordine",
    titolo: `Ordini caricati via API (${negozio})`,
    dettaglio: `${nuovi} nuovi · ${aggiornati} aggiornati`,
  });
  return NextResponse.json({ nuovi, aggiornati }, { status: 201 });
}
