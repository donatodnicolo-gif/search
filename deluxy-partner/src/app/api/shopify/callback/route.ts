import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";

// Callback OAuth Shopify: verifica l'autenticità (HMAC col client secret), scambia
// il code con l'Admin API access token e lo salva su NegozioShopify. Stesso schema
// dell'app di smistamento, ma il token finisce nel DB di Partner (non in KV).
//   GET /api/shopify/callback?code=...&shop=...&hmac=...&state=...
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || "7a26a71c9e5fc805e63241acfebc46e5";
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const BASE = "https://deluxy-partner.vercel.app";

const shopValido = (s: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s);
const esito = (chiave: "collegato" | "errore", val: string) =>
  NextResponse.redirect(`${BASE}/impostazioni?${chiave}=${encodeURIComponent(val)}`);

// Shopify firma i parametri del callback con l'HMAC-SHA256 del client secret.
function hmacValido(sp: URLSearchParams, secret: string): boolean {
  const hmac = sp.get("hmac") ?? "";
  const coppie: string[] = [];
  for (const [k, v] of sp.entries()) if (k !== "hmac" && k !== "signature") coppie.push(`${k}=${v}`);
  const msg = coppie.sort().join("&");
  const digest = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const shop = (sp.get("shop") ?? "").trim().toLowerCase();
  const code = sp.get("code") ?? "";
  if (!shopValido(shop) || !code) return esito("errore", "Callback Shopify non valido.");
  if (!CLIENT_SECRET) return esito("errore", "OAuth non configurato: manca SHOPIFY_CLIENT_SECRET su Vercel.");
  if (!hmacValido(sp, CLIENT_SECRET)) return esito("errore", "Verifica HMAC fallita: richiesta non autentica.");

  // brand dallo state (lo avevamo messo noi all'avvio)
  let brand = "";
  try {
    brand = (JSON.parse(Buffer.from(sp.get("state") ?? "", "base64url").toString())?.brand ?? "").trim();
  } catch {
    /* state assente/illeggibile: si ripiega sul dominio */
  }

  // scambia il code con l'access token
  let token = "";
  try {
    const tr = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
    });
    if (!tr.ok) return esito("errore", `Scambio token fallito: HTTP ${tr.status}`);
    token = ((await tr.json()) as { access_token?: string })?.access_token ?? "";
  } catch (e) {
    return esito("errore", `OAuth: ${(e as Error).message}`);
  }
  if (!token) return esito("errore", "Nessun access_token ricevuto da Shopify.");

  // salva il token: sul negozio col dominio corrispondente, altrimenti crealo
  const esistente = await prisma.negozioShopify.findFirst({ where: { dominio: shop } });
  if (esistente) {
    await prisma.negozioShopify.update({ where: { id: esistente.id }, data: { token, attivo: true } });
    brand = esistente.brand;
  } else {
    if (!brand) brand = shop;
    await prisma.negozioShopify.upsert({
      where: { brand },
      create: { brand, dominio: shop, token, attivo: true },
      update: { dominio: shop, token, attivo: true },
    });
  }
  return esito("collegato", brand);
}
