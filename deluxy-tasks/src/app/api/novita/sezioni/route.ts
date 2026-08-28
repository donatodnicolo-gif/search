import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { leggiSessione, SESSION_COOKIE } from "@/lib/auth";
import { sezioniDelMenu } from "@/lib/novita";
import { isAdmin } from "@/lib/ruoli";

export const dynamic = "force-dynamic";

// Per la voce di menu: la data della cosa più recente (per il pallino giallo) e
// quanto lavoro aspetta (per il numero). Libro UX&UI §7.
//
// ⚠️ Non sa niente di «visto»: quello è una cosa del browser di quella persona
// (localStorage), e tenerlo sul server vorrebbe dire una tabella in più per un
// pallino.
//
// ⚠️ L'auth è la STESSA della UI (sessione a cookie del Hub), controllata QUI:
// il middleware lascia passare /api/* con i soli CORS, contando sulle chiavi
// x-api-key delle rotte /api/v1 — questa rotta invece parla col browser.
// Senza TASKS_SESSION_SECRET (sviluppo) l'app è aperta e si guarda da admin,
// come fa la pagina.
export async function GET() {
  const authAttiva = Boolean(process.env.TASKS_SESSION_SECRET);
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  if (authAttiva && !sessione) {
    return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
  }
  const admin = sessione ? isAdmin(sessione.ruolo) : true;
  return NextResponse.json({ sezioni: await sezioniDelMenu({ admin, email: sessione?.email ?? null }) });
}
