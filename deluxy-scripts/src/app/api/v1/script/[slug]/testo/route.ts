import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { scriptPerApp } from "@/lib/script";

export const dynamic = "force-dynamic";

// GET /api/v1/script/<slug>/testo?app=<chiave>
// Solo il testo dello script, in text/plain: comodo per `curl … | node -` o per
// incollarlo dove serve senza passare dal JSON.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const client = await autentica(req);
  if (client instanceof Response) return client;

  const { slug } = await params;
  const app = req.nextUrl.searchParams.get("app")?.trim();
  if (!app) return erroreApi(400, "Manca il parametro app: ?app=<chiave dell'app>");

  const script = await scriptPerApp(app, slug);
  if (script === null) return erroreApi(404, `App "${app}" sconosciuta o disattivata`);
  const s = script[0];
  if (!s) return erroreApi(404, `Script "${slug}" non abilitato per l'app "${app}"`);

  return new NextResponse(s.corpoRisolto, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // Le variabili obbligatorie ancora scoperte, per chi consuma il testo da
      // riga di comando e non legge il JSON.
      "X-Da-Compilare": s.daCompilare.join(",") || "nessuna",
    },
  });
}
