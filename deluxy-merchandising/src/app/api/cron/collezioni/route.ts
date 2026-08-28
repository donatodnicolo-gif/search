import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { negoziAttivi } from "@/lib/negozi";
import { stessoSegreto } from "@/lib/segreto-cron";
import { importaCollezioniDa, type EsitoImportCollezioni } from "@/lib/shopify-collezioni";

// L'**import del catalogo e delle collezioni da Shopify**, tutte le notti.
//
// Perché esiste (26/08/2026): fino a oggi questo import era **solo un bottone**
// in `/collezioni`, e l'ultima volta che qualcuno l'aveva premuto era il
// **4 agosto** — ventidue giorni. Non era un cron rotto: non era mai stato
// scritto. Il guaio è che `statoShopify`, `pubblicataShopify`, `ggDispMin`, il
// GID del prodotto, le foto, i prezzi e le appartenenze alle collezioni **si
// popolano solo qui**: quindi il «1.100 prodotti attivi» su cui poggiano il
// cruscotto e il punto aperto dei costi era una fotografia dei negozi vecchia di
// tre settimane, e nessuna pagina lo diceva. È lo stesso guasto che il venduto
// aveva fino al 10/08, risolto allo stesso modo — con un giro automatico.
//
// **UN NEGOZIO PER CHIAMATA** (`?negozio=Gifts`), non tutti e tre in fila. Non è
// una precauzione teorica: farli insieme era già stato provato e il più grande
// (Gifts, ~2.900 prodotti e 234 collezioni) **non arrivava in fondo** — la
// richiesta moriva per tempo massimo e l'import restava a metà *senza dirlo*.
// Per questo in pagina c'è un bottone per negozio, e per questo in `vercel.json`
// ci sono tre voci sfalsate invece di una.
//
// Gli orari stanno **prima delle rotazioni delle 05:20 UTC**: le vetrine si
// rifanno sul catalogo di stanotte, non su quello di ieri.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>", che Vercel invia da
// solo quando la variabile è impostata. Senza segreto la rotta risponde 503
// invece di restare un endpoint aperto: da qui si legge l'intero catalogo dei
// negozi e si riscrivono le appartenenze.
export const dynamic = "force-dynamic";
// Un negozio grande sono migliaia di prodotti letti a pagine, con le collezioni
// annidate: Shopify fa pagare i campi, non le richieste.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: import automatico del catalogo disattivato." },
      { status: 503 }
    );
  }
  if (!stessoSegreto(req.headers.get("authorization") ?? "", `Bearer ${segreto}`)) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const chiesto = req.nextUrl.searchParams.get("negozio")?.trim();

  try {
    const attivi = await negoziAttivi();

    // Senza `?negozio=` si fanno tutti, in fila. Serve al lancio a mano; il cron
    // passa sempre un nome, perché tre negozi in una richiesta è la cosa che
    // sopra è dichiarata come già fallita.
    if (!chiesto) {
      const esiti: EsitoImportCollezioni[] = [];
      for (const n of attivi) esiti.push(await importaCollezioniDa(n));
      const ok = esiti.every((e) => e.ok);
      return NextResponse.json(
        {
          ok,
          avvertenza:
            "Chiamata senza ?negozio=: fatti tutti in una richiesta sola. Se un negozio è grande può non arrivare in fondo — il cron ne fa uno per volta.",
          esiti,
        },
        { status: ok ? 200 : 500 }
      );
    }

    const negozio = attivi.find((n) => n.nome.toLowerCase() === chiesto.toLowerCase());
    if (!negozio) {
      // ⚠️ Un negozio sparisce da `negoziAttivi` anche solo perché il suo token
      // non si rinnova. Dire «non trovato» manderebbe a cercare un errore di
      // battitura mentre il guasto è la credenziale, quindi i due casi si
      // distinguono qui — e un cron che non trova il suo negozio risponde
      // **500**, se no nei log di Vercel resta un giro «riuscito» che non ha
      // importato niente e nessuno lo guarda.
      const esiste = await prisma.negozioShopify.findFirst({
        where: { nome: { equals: chiesto, mode: "insensitive" } },
        select: { nome: true, attivo: true },
      });
      const dettaglio = !esiste
        ? `Nessun negozio si chiama «${chiesto}».`
        : !esiste.attivo
          ? `Il negozio «${esiste.nome}» è disattivato in Negozi & permessi.`
          : `Il negozio «${esiste.nome}» esiste ma non sa autenticarsi su Shopify: controlla Client ID/Secret o il token in Negozi & permessi.`;
      return NextResponse.json(
        { errore: dettaglio, negoziAttivi: attivi.map((n) => n.nome) },
        { status: 500 }
      );
    }

    const esito = await importaCollezioniDa(negozio);
    // Come il cron del venduto: un import fallito risponde 500 apposta.
    return NextResponse.json(esito, { status: esito.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ errore: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}
