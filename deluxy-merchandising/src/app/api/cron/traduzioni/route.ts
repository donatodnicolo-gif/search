import { NextRequest, NextResponse } from "next/server";
import { negoziAttivi } from "@/lib/negozi";
import { stessoSegreto } from "@/lib/segreto-cron";
import { completaTraduzioniDelNegozio } from "@/lib/traduzioni-automatiche";

// **Le traduzioni mancanti, ogni notte.**
//
// Chiesto dall'utente l'08/09/2026: «dobbiamo fare anche le traduzioni usando
// l'AI ed essere sicuri ci siano poi per ogni prodotto che carico». Il modulo
// dell'app traduce ciò che nasce da lì, ma **l'import non traduce niente**: un
// prodotto caricato dall'admin di Shopify, o arrivato con un negozio nuovo,
// resterebbe senza traduzioni per sempre e nessuno se ne accorgerebbe. Questo
// giro passa dopo e completa quello che manca.
//
// **Orario: 04:40 UTC**, dopo l'import del catalogo (03:10–04:15, così lavora
// su prodotti freschi) e prima delle rotazioni delle 05:20. Non si sovrappone
// a nessun altro cron dell'app: qui il pool del database è condiviso con le
// altre app del cluster.
//
// ⚠️ **Tetto per giro (`?max=`, di norma 20 per negozio).** Qui ogni riga costa
// una chiamata all'AI e una scrittura sul negozio: meglio un arretrato che cala
// ogni notte di una corsa che finisce il budget o il tempo della funzione a
// metà. Con l'arretrato smaltito i giri diventano quasi vuoti, perché i
// prodotti nuovi di una notte sono pochi.
//
// Protezione: `Authorization: Bearer <CRON_SECRET>`, come gli altri cron.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) return NextResponse.json({ errore: "CRON_SECRET non configurato." }, { status: 503 });
  if (!stessoSegreto(req.headers.get("authorization") ?? "", `Bearer ${segreto}`)) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const max = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 20) || 20));
  const chiesto = req.nextUrl.searchParams.get("negozio")?.trim();
  const attivi = await negoziAttivi();
  const negozi = chiesto ? attivi.filter((n) => n.nome.toLowerCase() === chiesto.toLowerCase()) : attivi;
  if (negozi.length === 0) {
    return NextResponse.json({ ok: false, errore: chiesto ? `Nessun negozio attivo si chiama «${chiesto}».` : "Nessun negozio attivo." }, { status: 404 });
  }

  const esiti = [];
  for (const n of negozi) {
    try {
      esiti.push(await completaTraduzioniDelNegozio(n, max));
    } catch (e) {
      // Un negozio che si rompe non deve fermare gli altri: l'errore si
      // riporta e il giro prosegue.
      esiti.push({
        negozio: n.nome, lingueAttive: [], esaminati: 0, daTradurre: 0, tradotti: 0, daRiparare: 0, falliti: 1,
        messaggi: [e instanceof Error ? e.message : "Errore sconosciuto."],
      });
    }
  }

  const tradotti = esiti.reduce((a, e) => a + e.tradotti, 0);
  // ⭐ 11/09/2026: quanti erano **riparazioni** (traduzione c'era, ma piatta):
  // serve a vedere l'arretrato delle 307 schede calare notte dopo notte.
  const riparati = esiti.reduce((a, e) => a + e.daRiparare, 0);
  const falliti = esiti.reduce((a, e) => a + e.falliti, 0);
  return NextResponse.json({ ok: falliti === 0, tradotti, riparati, falliti, esiti });
}
