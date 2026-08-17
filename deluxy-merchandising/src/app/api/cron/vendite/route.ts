import { NextRequest, NextResponse } from "next/server";
import { importaVendite, ordersConfigurato } from "@/lib/orders";
import { stessoSegreto } from "@/lib/segreto-cron";

// Il **venduto si aggiorna da solo** (vedi vercel.json).
//
// Fino a oggi l'import da Deluxy Orders era soltanto un bottone in `/vendite`:
// se nessuno lo premeva, l'app continuava a rispondere — senza dirlo — su una
// fotografia vecchia. Non è un dettaglio estetico: le regole d'ordine «più
// venduti», le classifiche e le rotazioni notturne delle vetrine decidono
// esattamente su quei numeri. Il 10/08/2026 l'ultima vendita in archivio era del
// 25/07: sedici giorni di negozio che l'app non sapeva.
//
// **Due ritmi, non uno** (17/08/2026), perché servono a due cose diverse:
//
// - **ogni 15 minuti, ultimi 2 giorni** (`?giorni=2`): è l'aggiornamento vero e
//   proprio. Deluxy Orders si sincronizza da Shopify con lo stesso ritmo, quindi
//   più in fretta di così non si può andare: il collo di bottiglia sarebbe lui.
//   Prima il giro era solo notturno e un ordine delle 9 del mattino si vedeva
//   qui il giorno dopo — misurato il 17/08: Orders aveva un ordine di undici
//   minuti prima, l'app non lo sapeva.
// - **una volta al giorno, ultimi 30 giorni** (alle 06:30, dopo il giro
//   completo di Orders delle 06:00): serve a **riallineare gli stati** più
//   indietro nel tempo — un ordine incassato o rimborsato giorni dopo. Il giro
//   corto non ci arriverebbe mai. Il primo giro reale (10/08/2026) ha trovato
//   **34 righe** che avevano cambiato verdetto.
//
// Il limite resta dichiarato: un rimborso che arrivasse dopo trenta giorni non
// viene raccolto da nessuno dei due, ed è il prezzo per non rileggere un anno di
// ordini ogni notte.
//
// Le rotazioni delle vetrine girano alle 05:20: con l'aggiornamento ogni quarto
// d'ora trovano sempre venduto fresco, senza bisogno di incastri di orari.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>", che Vercel invia da
// solo quando la variabile è impostata sul progetto. Senza segreto la rotta
// risponde 503 invece di restare un endpoint aperto a chiunque.
export const dynamic = "force-dynamic";
// Trenta giorni di ordini di tre negozi, letti a pagine da 200.
export const maxDuration = 300;

const GIORNI_DEFAULT = 30;
// Il giro corto non deve poter diventare lungo per un parametro sbagliato:
// ogni quarto d'ora un import da un anno saturerebbe il pool e l'API di Orders.
const GIORNI_MAX = 90;

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: aggiornamento automatico del venduto disattivato." },
      { status: 503 }
    );
  }
  if (!stessoSegreto(req.headers.get("authorization") ?? "", `Bearer ${segreto}`)) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }
  if (!ordersConfigurato()) {
    return NextResponse.json(
      { errore: "Manca ORDERS_API_KEY: non c'è da dove leggere il venduto." },
      { status: 503 }
    );
  }

  const chiesti = Number(req.nextUrl.searchParams.get("giorni"));
  const giorni = Number.isFinite(chiesti) && chiesti > 0 ? Math.min(chiesti, GIORNI_MAX) : GIORNI_DEFAULT;

  try {
    const esito = await importaVendite(giorni, { automatico: true });
    // Un import che fallisce risponde 500 apposta: nei log di Vercel un cron
    // "riuscito" che dentro dice «non ha funzionato» non lo guarda nessuno.
    return NextResponse.json({ giorni, ...esito }, { status: esito.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ errore: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}
