import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { novitaDa } from "@/lib/novita";

export const dynamic = "force-dynamic";

// Le richieste di acquisto arrivate dopo `?da=` (per i riquadri in basso a
// destra). Senza `da` torna solo il segnaposto: la prima chiamata non mostra
// niente. Libro UX&UI §7; auth: lo stesso cookie della UI, controllato qui
// (vedi il commento in /api/novita/sezioni).
async function autenticato(): Promise<boolean> {
  const password = process.env.ACQUISTI_APP_PASSWORD;
  if (!password) return true;
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  return Boolean(cookie && cookie === (await sessionToken(password)));
}

export async function GET(req: NextRequest) {
  if (!(await autenticato())) {
    return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
  }
  const grezzo = req.nextUrl.searchParams.get("da");
  const da = grezzo ? new Date(grezzo) : null;
  return NextResponse.json(await novitaDa(da));
}
