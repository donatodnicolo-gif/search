import { NextRequest } from "next/server";
import { autentica, erroreApi, rispostaApi } from "@/lib/api-auth";
import { scriptPerApp } from "@/lib/script";

export const dynamic = "force-dynamic";

// GET /api/v1/script/<slug>?app=<chiave>
// Un solo script, se è abilitato per quell'app.
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

  return rispostaApi({
    app,
    slug: s.slug,
    nome: s.nome,
    descrizione: s.descrizione,
    note: s.note,
    linguaggio: s.linguaggio,
    tag: s.tag,
    aggiornatoIl: s.aggiornatoIl,
    testo: s.corpoRisolto,
    corpo: s.corpo,
    variabili: s.variabili,
    daCompilare: s.daCompilare,
  });
}
