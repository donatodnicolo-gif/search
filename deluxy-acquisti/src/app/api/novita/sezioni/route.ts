import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { sezioniDelMenu } from "@/lib/novita";

export const dynamic = "force-dynamic";

// Per la voce di menu: la data della cosa più recente (per il pallino giallo) e
// quante richieste aspettano una decisione (per il numero). Libro UX&UI §7.
//
// ⚠️ Non sa niente di «visto»: quello è una cosa del browser di quella persona
// (localStorage), non un fatto dell'azienda.
//
// ⚠️ L'auth è la STESSA della UI (cookie della password di team), controllata
// QUI: il middleware lascia passare /api/* con i soli CORS, contando sulle
// chiavi x-api-key delle rotte /api/v1 — questa rotta invece parla col browser.
// Senza ACQUISTI_APP_PASSWORD (sviluppo) la porta è aperta, come per le pagine.
async function autenticato(): Promise<boolean> {
  const password = process.env.ACQUISTI_APP_PASSWORD;
  if (!password) return true;
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  return Boolean(cookie && cookie === (await sessionToken(password)));
}

export async function GET() {
  if (!(await autenticato())) {
    return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
  }
  return NextResponse.json({ sezioni: await sezioniDelMenu() });
}
