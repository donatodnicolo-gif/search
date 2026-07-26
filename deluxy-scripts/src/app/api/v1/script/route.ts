import { NextRequest } from "next/server";
import { autentica, erroreApi, rispostaApi } from "@/lib/api-auth";
import { scriptPerApp } from "@/lib/script";

export const dynamic = "force-dynamic";

// GET /api/v1/script?app=<chiave>
// Gli script abilitati per quell'app, già composti con i suoi valori.
// Senza `corpo` grezzo di default: si chiede con &corpo=1 quando serve anche la
// versione coi segnaposto (per capire cosa è stato sostituito).
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof Response) return client;

  const app = req.nextUrl.searchParams.get("app")?.trim();
  if (!app) return erroreApi(400, "Manca il parametro app: ?app=<chiave dell'app>");
  const conCorpo = req.nextUrl.searchParams.get("corpo") === "1";

  const script = await scriptPerApp(app);
  if (script === null) return erroreApi(404, `App "${app}" sconosciuta o disattivata`);

  return rispostaApi({
    app,
    script: script.map((s) => ({
      slug: s.slug,
      nome: s.nome,
      descrizione: s.descrizione,
      note: s.note,
      linguaggio: s.linguaggio,
      tag: s.tag,
      aggiornatoIl: s.aggiornatoIl,
      testo: s.corpoRisolto,
      ...(conCorpo ? { corpo: s.corpo } : {}),
      variabili: s.variabili,
      daCompilare: s.daCompilare,
    })),
  });
}
