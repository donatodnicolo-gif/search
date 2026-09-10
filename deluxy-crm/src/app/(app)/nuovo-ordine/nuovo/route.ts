import { NextRequest, NextResponse } from "next/server";

// «Ordine per un cliente nuovo»: l'email digitata diventa il codice della
// pagina del modulo (che accetta le email in chiaro, come Orders). Una rotta
// e non una pagina: serve solo a costruire l'indirizzo giusto.
export function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return NextResponse.redirect(new URL("/nuovo-ordine", req.url));
  return NextResponse.redirect(new URL(`/clienti/${encodeURIComponent(email)}/nuovo-ordine`, req.url));
}
