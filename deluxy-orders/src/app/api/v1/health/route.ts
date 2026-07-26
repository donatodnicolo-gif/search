import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Sonda di salute pubblica (nessuna chiave). Utile per monitor/uptime.
//
// Dice anche QUANDO si è scaricato l'ultima volta da Shopify: serve alle app a
// valle (per prima il Customer Service) per mostrare tutta la catena
// Shopify → Orders → loro. Senza, a valle si legge solo «ho letto Orders 3
// minuti fa», che non distingue «non ci sono ordini nuovi» da «Orders è fermo da
// ieri» — due situazioni molto diverse per chi sta aspettando un ordine.
//
// È un orario, non un dato di business: resta pubblico come il resto della sonda.
export async function GET() {
  const ultimo = await prisma.negozioShopify
    .aggregate({ where: { attivo: true }, _max: { ultimaSync: true } })
    .catch(() => null);

  return NextResponse.json({
    ok: true,
    app: "deluxy-orders",
    versione: "v1",
    ultimoImport: ultimo?._max.ultimaSync?.toISOString() ?? null,
  });
}
