import { NextResponse } from "next/server";

// Endpoint di salute, senza autenticazione: le app lo usano per capire
// se il servizio anagrafiche è raggiungibile.
export function GET() {
  return NextResponse.json({ ok: true, servizio: "deluxy-anagrafiche" });
}
