import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { eseguiSyncOrdini } from "@/lib/sync";
import { importaFeedback } from "@/lib/feedback";

// Sincronizzazione automatica degli ordini Shopify (cron Vercel, vedi
// vercel.json). Scarica gli ordini recenti da tutti i negozi collegati e li
// aggiorna, senza toccare la classificazione Deluxy già impostata.
//
// DUE GIRI, NON UNO (vedi vercel.json):
//  · ogni 15 minuti con `?giorni=2` — serve a far comparire in fretta gli ordini
//    NUOVI. È la ragione per cui esiste: le app a valle (Customer Service) si
//    aggiornano ogni quarto d'ora, ma se qui si scaricasse una volta al giorno
//    interrogherebbero una fonte ferma, e un ordine delle 10:00 si vedrebbe il
//    mattino dopo.
//  · una volta al giorno con la finestra piena (90 giorni) — serve a raccogliere
//    quello che cambia DOPO: rimborsi, annullamenti, evasioni, correzioni. Un
//    ordine di tre settimane fa può cambiare oggi, e il giro veloce non lo
//    guarda.
// Girare sempre a 90 giorni ogni quarto d'ora vorrebbe dire ripassare migliaia
// di ordini 96 volte al giorno per trovarne due nuovi.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>" (Vercel lo invia da
// solo se la variabile CRON_SECRET è impostata). Senza segreto configurato la
// rotta risponde 503, così non resta un endpoint aperto.
export const dynamic = "force-dynamic";
// La sync riscrive solo gli ordini davvero cambiati (vedi src/lib/sync.ts),
// quindi normalmente finisce in pochi secondi; il margine serve alle giornate
// con molti ordini nuovi.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: sincronizzazione automatica disattivata." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const negozi = await prisma.negozioShopify.count({ where: { attivo: true } });
  if (negozi === 0) {
    return NextResponse.json({ saltato: "Nessun negozio Shopify collegato." }, { status: 200 });
  }

  // `giorni` decide quale dei due giri è: piccolo = quello veloce dei 15 minuti,
  // assente = la passata piena di una volta al giorno.
  const richiesti = Number(req.nextUrl.searchParams.get("giorni"));
  const giorni = Number.isFinite(richiesti) && richiesti > 0 ? Math.min(365, richiesti) : 90;
  const veloce = giorni <= 7;

  try {
    const esito = await eseguiSyncOrdini(giorni);
    // I feedback del Customer Service (reclami e voti) si tirano giù solo nella
    // passata piena: sono una chiamata a un'altra app, e ripeterla ogni quarto
    // d'ora costerebbe senza servire — un reclamo non è un ordine che si aspetta.
    // Se non è configurata, l'errore torna in chiaro dentro la risposta: un
    // problema là non deve far fallire l'import da Shopify, che è la ragione per
    // cui il cron esiste.
    const feedback = veloce
      ? "saltati (giro veloce)"
      : await importaFeedback().catch((e) => ({ errore: (e as Error).message }));
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, giorni, veloce, ...esito, feedback });
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 });
  }
}
