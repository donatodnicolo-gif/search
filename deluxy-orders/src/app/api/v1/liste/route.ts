import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { conteggiListe } from "@/lib/clienti";
import { FAMIGLIE, LISTE, SOGLIE } from "@/lib/segmenti";

// GET /api/v1/liste — il catalogo delle liste di clienti, con i conteggi.
// Serve alle altre app (Marketing su tutte) per sapere quali pubblici esistono
// prima di chiederne il contenuto a /api/v1/liste/{chiave}.
//
// I numeri escludono gli ordini annullati, come /api/v1/ordini: un annullato
// resta spesso «pagato» e gonfierebbe il valore del cliente.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const conteggi = await conteggiListe();

  return NextResponse.json({
    soglie: SOGLIE,
    famiglie: FAMIGLIE,
    liste: LISTE.map((l) => ({
      chiave: l.chiave,
      nome: l.nome,
      famiglia: l.famiglia,
      criterio: l.criterio,
      consiglio: l.consiglio,
      clienti: conteggi.get(l.chiave)?.clienti ?? 0,
      speso: Math.round((conteggi.get(l.chiave)?.speso ?? 0) * 100) / 100,
    })),
  });
}
