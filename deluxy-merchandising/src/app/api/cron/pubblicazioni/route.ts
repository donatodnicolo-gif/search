import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fineGiorno } from "@/lib/vendite";
import { giornoRoma } from "@/lib/fuso";
import { negoziAttivi } from "@/lib/negozi";
import { stessoSegreto } from "@/lib/segreto-cron";
import { erroriDi, graphqlNegozio } from "@/lib/shopify-scrittura";

// **La finestra di pubblicazione dei prodotti, ogni notte.**
//
// Un prodotto creato con «Pubblico dal …» nasce sul negozio come **bozza**;
// questo giro lo mette **attivo** il giorno in cui la finestra si apre, e lo
// rimette in **bozza** il giorno dopo la chiusura (`pubblicatoFinoAl`
// compreso), riportando la fase ad «approvato». Scrive prima su Shopify e
// solo se il negozio accetta aggiorna qui: l'app non deve raccontare uno stato
// che il sito non ha. Gira dopo l'import del catalogo (03:10–03:50 UTC) e
// prima delle rotazioni (05:20), così le vetrine si rifanno col catalogo giusto.
//
// Protezione: `Authorization: Bearer <CRON_SECRET>`, come gli altri cron.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function cambiaStato(
  negozio: { dominio: string; token: string },
  shopifyId: string,
  status: "ACTIVE" | "DRAFT"
): Promise<string | null> {
  const r = await graphqlNegozio(
    negozio.dominio,
    negozio.token,
    `mutation cambiaStato($input: ProductInput!) {
       productUpdate(input: $input) { product { id status } userErrors { field message } }
     }`,
    { input: { id: shopifyId, status } }
  );
  const err = erroriDi(r, "productUpdate");
  return err.length ? err.join(" · ") : null;
}

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) return NextResponse.json({ errore: "CRON_SECRET non configurato." }, { status: 503 });
  if (!stessoSegreto(req.headers.get("authorization") ?? "", `Bearer ${segreto}`)) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const oggi = giornoRoma(new Date());
  const fineOggi = fineGiorno(new Date());
  const negozi = new Map((await negoziAttivi()).map((n) => [n.nome, n]));
  const esito = { accesi: [] as string[], spenti: [] as string[], errori: [] as string[] };

  // Da accendere: finestra aperta da oggi (o prima), non ancora attivi sul negozio.
  const daAccendere = await prisma.prodotto.findMany({
    where: {
      shopifyId: { not: null },
      pubblicatoDal: { lte: fineOggi },
      fase: "in_vendita",
      shopifyStato: { not: "pubblicato" },
      OR: [{ pubblicatoFinoAl: null }, { pubblicatoFinoAl: { gte: oggi } }],
    },
    select: { id: true, nome: true, shopifyId: true, negozioNome: true },
  });
  for (const p of daAccendere) {
    const negozio = p.negozioNome ? negozi.get(p.negozioNome) : null;
    if (!negozio) {
      esito.errori.push(`${p.nome}: negozio «${p.negozioNome ?? "—"}» non disponibile.`);
      continue;
    }
    const errore = await cambiaStato(negozio, p.shopifyId as string, "ACTIVE");
    if (errore) {
      esito.errori.push(`${p.nome}: ${errore}`);
      continue;
    }
    await prisma.prodotto.update({
      where: { id: p.id },
      data: { shopifyStato: "pubblicato", statoShopify: "ACTIVE", shopifySyncIl: new Date() },
    });
    await prisma.tappaSviluppo.create({
      data: { prodottoId: p.id, da: "in_vendita", a: "in_vendita", nota: "Acceso sul negozio: la finestra di pubblicazione si è aperta.", origine: "cron" },
    });
    esito.accesi.push(p.nome);
  }

  // Da spegnere: finestra chiusa ieri o prima, ancora attivi sul negozio.
  const daSpegnere = await prisma.prodotto.findMany({
    where: { shopifyId: { not: null }, pubblicatoFinoAl: { lt: oggi }, shopifyStato: "pubblicato" },
    select: { id: true, nome: true, shopifyId: true, negozioNome: true, fase: true },
  });
  for (const p of daSpegnere) {
    const negozio = p.negozioNome ? negozi.get(p.negozioNome) : null;
    if (!negozio) {
      esito.errori.push(`${p.nome}: negozio «${p.negozioNome ?? "—"}» non disponibile.`);
      continue;
    }
    const errore = await cambiaStato(negozio, p.shopifyId as string, "DRAFT");
    if (errore) {
      esito.errori.push(`${p.nome}: ${errore}`);
      continue;
    }
    await prisma.prodotto.update({
      where: { id: p.id },
      data: { shopifyStato: "bozza", statoShopify: "DRAFT", fase: "approvato", shopifySyncIl: new Date() },
    });
    await prisma.tappaSviluppo.create({
      data: { prodottoId: p.id, da: p.fase, a: "approvato", nota: "Spento sul negozio: la finestra di pubblicazione si è chiusa.", origine: "cron" },
    });
    esito.spenti.push(p.nome);
  }

  return NextResponse.json({ ok: esito.errori.length === 0, ...esito }, { status: esito.errori.length ? 500 : 200 });
}
