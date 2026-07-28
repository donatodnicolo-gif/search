import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/health — sonda di salute PUBBLICA, nella posizione che lo standard
// Deluxy prevede: il Hub interroga `<url-app>/api/health` su tutte le app per
// la sua pagina «stato dei servizi».
//
// Formato della convenzione: { ok, app, database } dove `database` è il
// risultato di una query banale. Serve a distinguere i due guasti che da fuori
// si somigliano ma non sono per niente la stessa cosa: **il server è giù**
// (nessuno risponde) e **il server è su ma il database no** (la pagina si apre
// e poi ogni cosa dà errore). Il secondo caso, senza questa sonda, si scopre
// solo quando qualcuno prova a lavorare.
//
// ⚠️ Nessuna chiave: se richiedesse `x-api-key` il Hub non potrebbe leggerla, e
// una sonda di salute che serve un segreto per dire «sto bene» è inutile.
// Non espone nulla: solo se il server e il database rispondono.
//
// Resta anche /api/v1/health, che dice quando è avvenuto l'ultimo import da
// Shopify — informazione diversa, per le app a valle (Customer Service).
export async function GET() {
  let database = false;
  try {
    // La query più banale possibile: interessa che la connessione risponda,
    // non cosa c'è dentro.
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    // `ok: true` resta: il SERVER sta rispondendo (è questa richiesta). È
    // `database: false` a dire cosa non va — se rispondessimo 500 il Hub
    // direbbe «app giù», che è falso e manda a cercare il guasto nel posto
    // sbagliato.
  }
  return NextResponse.json(
    { ok: true, app: "deluxy-orders", database },
    { headers: { "Cache-Control": "no-store" } },
  );
}
