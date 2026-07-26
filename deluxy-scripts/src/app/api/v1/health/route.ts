import { NextRequest } from "next/server";
import { autentica, rispostaApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Serve a un'app client per verificare che chiave e URL siano giusti.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof Response) return client;
  const [script, app] = await Promise.all([
    prisma.script.count({ where: { attivo: true } }),
    prisma.appCollegata.count({ where: { attiva: true } }),
  ]);
  return rispostaApi({ ok: true, client: client.nome, script, app });
}
