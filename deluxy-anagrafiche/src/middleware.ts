import { NextRequest, NextResponse } from "next/server";

// CORS per le API di lettura: permette alle app Deluxy nel browser (es. l'app
// search/supplier su search-deluxy.vercel.app) di interrogare il registro che
// gira in locale. Le chiamate restano protette dalla chiave x-api-key; via CORS
// si espongono solo GET (le scritture arrivano server-to-server dalla piattaforma).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: "/api/:path*" };
