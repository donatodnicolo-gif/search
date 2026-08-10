import { NextRequest, NextResponse } from "next/server";
import { importaVendite, ordersConfigurato } from "@/lib/orders";

// Il **venduto si aggiorna da solo** (vedi vercel.json).
//
// Fino a oggi l'import da Deluxy Orders era soltanto un bottone in `/vendite`:
// se nessuno lo premeva, l'app continuava a rispondere — senza dirlo — su una
// fotografia vecchia. Non è un dettaglio estetico: le regole d'ordine «più
// venduti», le classifiche e le rotazioni notturne delle vetrine decidono
// esattamente su quei numeri. Il 10/08/2026 l'ultima vendita in archivio era del
// 25/07: sedici giorni di negozio che l'app non sapeva.
//
// Gira **prima delle rotazioni** (05:00, contro le 05:20): l'ordine conta, così
// le vetrine si rifanno sul venduto di stanotte e non su quello di ieri.
//
// La finestra è di 30 giorni, non 90: il giro deve restare corto abbastanza da
// finire dentro `maxDuration`, e serve anche a **riallineare gli stati** — un
// ordine incassato o rimborsato dopo il primo import viene corretto qui. Girando
// ogni notte, ogni ordine viene ricontrollato per trenta giorni di fila: un
// rimborso che arrivasse più tardi resterebbe fuori, ed è il limite che si
// accetta per non rileggere un anno di ordini ogni notte. Il primo giro reale
// (10/08/2026) ha trovato **34 righe** che avevano cambiato verdetto.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>", che Vercel invia da
// solo quando la variabile è impostata sul progetto. Senza segreto la rotta
// risponde 503 invece di restare un endpoint aperto a chiunque.
export const dynamic = "force-dynamic";
// Trenta giorni di ordini di tre negozi, letti a pagine da 200.
export const maxDuration = 300;

const GIORNI = 30;

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: aggiornamento automatico del venduto disattivato." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }
  if (!ordersConfigurato()) {
    return NextResponse.json(
      { errore: "Manca ORDERS_API_KEY: non c'è da dove leggere il venduto." },
      { status: 503 }
    );
  }

  try {
    const esito = await importaVendite(GIORNI, { automatico: true });
    // Un import che fallisce risponde 500 apposta: nei log di Vercel un cron
    // "riuscito" che dentro dice «non ha funzionato» non lo guarda nessuno.
    return NextResponse.json({ giorni: GIORNI, ...esito }, { status: esito.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ errore: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}
