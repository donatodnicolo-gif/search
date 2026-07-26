import { NextRequest } from "next/server";
import { autentica, rispostaApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Le app collegate: serve a sapere quale valore passare in ?app=…
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof Response) return client;
  const app = await prisma.appCollegata.findMany({
    where: { attiva: true },
    orderBy: [{ ordine: "asc" }, { nome: "asc" }],
    select: { chiave: true, nome: true, descrizione: true, colore: true },
  });
  return rispostaApi({ app });
}
