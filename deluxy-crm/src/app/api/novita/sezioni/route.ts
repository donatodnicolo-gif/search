import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authAttiva, configAuthCompleta, inProduzione, leggiSessione, SESSION_COOKIE } from "@/lib/auth";
import { sezioniDelMenu } from "@/lib/novita";

export const dynamic = "force-dynamic";

// Per ogni voce di menu: la data della cosa più recente (per il pallino giallo)
// e quanto lavoro aspetta (per il numero). Libro UX&UI §7.
//
// ⚠️ Non sa niente di «visto»: quello è una cosa del browser di quella persona
// (localStorage), non un fatto dell'azienda.
//
// ⚠️ L'auth è la STESSA della UI (sessione a cookie), controllata QUI: il
// middleware lascia passare /api/* con i soli CORS, contando sulle chiavi delle
// rotte /api/v1 — questa rotta invece parla col browser. E lo stesso
// fail-closed del middleware: in produzione senza configurazione l'app resta
// chiusa, date dei clienti comprese.
export async function GET() {
  if (inProduzione() && !configAuthCompleta()) {
    return NextResponse.json({ errore: "App non configurata." }, { status: 503 });
  }
  if (authAttiva()) {
    const jar = await cookies();
    const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
    if (!sessione) return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
  }
  return NextResponse.json({ sezioni: await sezioniDelMenu() });
}
