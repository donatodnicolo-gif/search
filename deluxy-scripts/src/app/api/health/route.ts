import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/health — sonda di salute PUBBLICA, nella posizione che lo standard
// Deluxy prevede (§6): il Hub interroga `<url-app>/api/health` su tutte le app
// per la sua pagina «stato dei servizi».
//
// ⚠️ PERCHÉ È NATA (08/09/2026, custode delle prestazioni). Scripts era l'unica
// app dell'ecosistema senza questa rotta: `/api/health` rispondeva **404**, e il
// ripiego del Hub su `/api/v1/health` rispondeva **401**, perché quella chiede
// la chiave `x-api-key`. Risultato: il Hub non ha **mai** potuto leggere lo
// stato del database di Scripts — vedeva solo che il server rispondeva. Una
// pagina di stato che non sa distinguere «l'app è su» da «l'app è su ma il
// database no» mente proprio nel momento in cui la si apre per capire cosa non
// va.
//
// Formato della convenzione: { ok, app, database }, dove `database` è l'esito
// di una query banale.
//
// ⚠️ Nessuna chiave, ed è il punto: una sonda di salute che pretende un segreto
// per dire «sto bene» non serve a chi la deve leggere. Non espone nulla — solo
// se il server e il database rispondono.
//
// Resta anche `/api/v1/health`, che è un'altra cosa: protetta da chiave, per le
// app a valle che leggono i testi.
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
    { ok: true, app: "deluxy-scripts", database },
    { headers: { "Cache-Control": "no-store" } },
  );
}
