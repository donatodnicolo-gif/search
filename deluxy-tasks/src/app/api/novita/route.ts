import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { leggiSessione, SESSION_COOKIE } from "@/lib/auth";
import { novitaDa } from "@/lib/novita";
import { isAdmin } from "@/lib/ruoli";

export const dynamic = "force-dynamic";

// Le attività arrivate dalle altre app dopo `?da=` (per i riquadri in basso a
// destra). Senza `da` torna solo il segnaposto: la prima chiamata non mostra
// niente. Libro UX&UI §7; auth: la stessa sessione della UI, controllata qui
// (vedi il commento in /api/novita/sezioni).
export async function GET(req: NextRequest) {
  const authAttiva = Boolean(process.env.TASKS_SESSION_SECRET);
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  if (authAttiva && !sessione) {
    return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
  }
  const admin = sessione ? isAdmin(sessione.ruolo) : true;

  const grezzo = req.nextUrl.searchParams.get("da");
  const da = grezzo ? new Date(grezzo) : null;
  return NextResponse.json(await novitaDa(da, { admin, email: sessione?.email ?? null }));
}
