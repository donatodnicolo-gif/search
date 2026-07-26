import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { eseguiSyncOrdini } from "@/lib/sync";
import { importaFeedback } from "@/lib/feedback";

// Sincronizzazione automatica notturna degli ordini Shopify (cron Vercel, vedi
// vercel.json). Scarica gli ordini recenti da tutti i negozi collegati e li
// aggiorna, senza toccare la classificazione Deluxy già impostata.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>" (Vercel lo invia da
// solo se la variabile CRON_SECRET è impostata). Senza segreto configurato la
// rotta risponde 503, così non resta un endpoint aperto.
export const dynamic = "force-dynamic";
// La sync quotidiana riscrive solo gli ordini davvero cambiati (vedi
// src/lib/sync.ts), quindi normalmente finisce in pochi secondi; il margine
// serve alle giornate con molti ordini nuovi.
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

  try {
    const esito = await eseguiSyncOrdini(90);
    // Nello stesso giro si tirano giù i feedback del Customer Service (reclami
    // e voti sugli ordini). Se non è configurato, `importaFeedback` torna
    // l'errore in chiaro dentro la risposta: un problema là non deve far
    // fallire l'import da Shopify, che è la ragione per cui il cron esiste.
    const feedback = await importaFeedback().catch((e) => ({ errore: (e as Error).message }));
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, ...esito, feedback });
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 });
  }
}
