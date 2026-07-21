import { NextRequest, NextResponse } from "next/server";

// Avvio OAuth Shopify: reindirizza il negozio alla pagina di autorizzazione.
// Stesso schema dell'app di smistamento (client_id + scope + redirect_uri).
//   GET /api/shopify/authorize?brand=<brand>&shop=<xxx>.myshopify.com
// Al ritorno, /api/shopify/callback scambia il code col token e lo salva.
//
// Env (Vercel): SHOPIFY_CLIENT_ID (pubblico — c'è un default), SHOPIFY_CLIENT_SECRET.
// L'ID client è pubblico (compare nell'URL di autorizzazione), quindi ha un default;
// il segreto NO, va messo su Vercel come SHOPIFY_CLIENT_SECRET.
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || "7a26a71c9e5fc805e63241acfebc46e5";
const SCOPES = "read_orders";
const REDIRECT = "https://deluxy-partner.vercel.app/api/shopify/callback";

const shopValido = (s: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const shop = (sp.get("shop") ?? "").trim().toLowerCase();
  const brand = (sp.get("brand") ?? "").trim();
  if (!shopValido(shop)) {
    return NextResponse.redirect(
      "https://deluxy-partner.vercel.app/impostazioni?errore=" +
        encodeURIComponent("Dominio .myshopify.com del negozio non valido.")
    );
  }
  // il brand viaggia dentro lo state (Shopify lo rimanda indietro nel callback)
  const state = Buffer.from(JSON.stringify({ brand, shop })).toString("base64url");
  const url =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
    `&state=${encodeURIComponent(state)}`;
  return NextResponse.redirect(url);
}
