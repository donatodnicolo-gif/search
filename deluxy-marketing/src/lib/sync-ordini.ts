import { prisma } from "@/lib/db";

// Gli ordini dal registro centrale Deluxy Orders, in una funzione sola che
// serve sia al cron notturno sia a chi la chiama a mano.
//
// PERCHÉ ESISTE. La stessa logica viveva solo in
// `scripts/import-ordini-da-orders.mjs`, cioè girava soltanto quando qualcuno
// la lanciava dal proprio PC: il 29/07/2026 la spesa era aggiornata a oggi e
// gli ordini fermi al 27, due giorni indietro. Ma gli ordini sono la metà
// "vendite" di ogni KPI — ROS reale, MER, costo di acquisizione — e con la
// spesa di oggi contro le vendite di due giorni fa quei rapporti risultano
// PEGGIORI DEL VERO senza dirlo. È lo stesso difetto che aveva Meta finché
// l'unica porta era un bottone.
//
// Lo script resta: serve ai caricamenti storici lunghi, che in una funzione
// serverless non ci starebbero mai.

const URL_ORDERS = (process.env.ORDERS_URL || "https://deluxy-orders.vercel.app").replace(/\/+$/, "");

// I brand si chiamano diversamente nelle due app: in Orders sono i negozi,
// qui sono i marchi. Il `negozio` tiene lo stesso handle già usato dall'import
// diretto da Shopify, altrimenti gli stessi ordini entrerebbero due volte.
const BRAND: Record<string, { brand: string; negozio: string }> = {
  "deluxy.it": { brand: "gifts", negozio: "deluxygifts" },
  Flowers: { brand: "flowers", negozio: "deluxyflowers" },
  "cakedesign.me": { brand: "cake", negozio: "cakedesignme" },
};

// Categoria normalizzata: la stessa lingua usata da keywords e landing.
// (Copia consapevole di import-ordini-da-orders.mjs: le due strade devono
// classificare allo stesso modo, o /offerte mostrerebbe due mondi diversi.)
export function categoriaDa(titolo: string, variante?: string | null): string {
  const t = `${titolo} ${variante ?? ""}`.toLowerCase();
  if (/selections|riconsegna|spedizion|delivery|extra|gift card/.test(t)) return "servizio";
  if (/rose|fior|bouquet|peoni|ortens|girasol|orchide|pianta|cappellier|cesto|lavanda|monet|botticelli|hokusai|dal.|frida|munch|wagner|tchaikovsky|venere|giverny/.test(t)) return "fiori";
  if (/tort|cake|crostata|millefoglie|tiramis|sacher|cheesecake|saint|essenza|alexander|favolosa|otello|gianduia|coccinella|primavera|cioccolat/.test(t)) return "torte";
  if (/colazion|brunch/.test(t)) return "colazioni";
  if (/pralin|mignon|macaron|dolci/.test(t)) return "dolci";
  if (/palloncin|balloon/.test(t)) return "palloncini";
  if (/vino|sommelier|prosecco|bollicine/.test(t)) return "vini";
  return "altro";
}

function statoDa(finanziario?: string | null, annullato?: boolean): string {
  if (annullato) return "annullato";
  if (finanziario === "REFUNDED" || finanziario === "VOIDED") return "rimborsato";
  if (finanziario === "PARTIALLY_REFUNDED") return "parzialmente_rimborsato";
  return "pagato";
}

// "gid://shopify/Order/17947803386186" → "17947803386186": l'import diretto da
// Shopify salvava il numero nudo, e la chiave di riconoscimento è quella.
// Senza ridurlo, gli ordini già presenti rientrerebbero tutti come doppioni.
const idNudo = (gid: unknown) => String(gid ?? "").split("/").pop() ?? "";

export type EsitoSyncOrdini =
  | { ok: false; codice: number; errore: string }
  | {
      ok: true;
      periodo: { da: string; a: string | null };
      nuovi: number;
      aggiornati: number;
      invariati: number;
      saltati: number;
      righe: number;
      perBrand: Record<string, number>;
      pagineLette: number;
      pagineTotali: number;
      completo: boolean;
      nota?: string;
    };

export async function eseguiSyncOrdini(
  opzioni: { da?: string; a?: string; brand?: string; annullati?: boolean; budgetMs?: number } = {},
  autore = "cron"
): Promise<EsitoSyncOrdini> {
  const chiave = (process.env.ORDERS_API_KEY || "").trim();
  if (!chiave) {
    return {
      ok: false,
      codice: 503,
      errore:
        "ORDERS_API_KEY non impostata: senza la chiave di sola lettura di deluxy-orders non si può leggere niente. Si crea da lì con `npm run chiave -- deluxy-marketing --sola-lettura` e va messa fra le variabili d'ambiente del progetto.",
    };
  }

  // Di default una settimana indietro, non un giorno: un ordine cambia stato
  // dopo essere stato creato (rimborso, annullamento) e ripassare la settimana
  // costa poco. È lo stesso ragionamento della finestra di 7 giorni su Meta.
  const oggi = new Date();
  const da = opzioni.da ?? new Date(oggi.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const a = opzioni.a ?? null;

  // Su Vercel la funzione ha pochi secondi: ci si ferma da soli lasciando
  // scritto dove si è arrivati, invece di essere uccisi a metà pagina.
  const scadenza = Date.now() + (opzioni.budgetMs ?? 45_000);

  const conteggi = { nuovi: 0, aggiornati: 0, invariati: 0, saltati: 0, righe: 0 };
  const perBrand: Record<string, number> = {};

  async function leggiPagina(page: number) {
    const q = new URLSearchParams({ da, limit: "200", page: String(page) });
    if (a) q.set("a", a);
    if (opzioni.brand) {
      const voce = Object.entries(BRAND).find(([, v]) => v.brand === opzioni.brand);
      if (!voce) throw new Error(`Brand sconosciuto: ${opzioni.brand} (ammessi: gifts, flowers, cake)`);
      q.set("brand", voce[0]);
    }
    if (opzioni.annullati) q.set("annullati", "inclusi");

    let attesa = 2000;
    for (let tentativo = 1; tentativo <= 3; tentativo++) {
      try {
        const risposta = await fetch(`${URL_ORDERS}/api/v1/ordini?${q}`, { headers: { "x-api-key": chiave } });
        if (risposta.ok) return risposta.json();
        // 4xx: è un errore nostro, ritentare non serve
        if (risposta.status < 500) {
          throw new Error(`Orders ha risposto ${risposta.status}: ${(await risposta.text()).slice(0, 200)}`);
        }
      } catch (e) {
        if (tentativo === 3 || /Orders ha risposto 4/.test(String(e))) throw e;
      }
      await new Promise((r) => setTimeout(r, attesa));
      attesa *= 3;
    }
    throw new Error(`Pagina ${page}: esauriti i tentativi`);
  }

  let page = 1;
  let pagine = 1;
  let lette = 0;
  try {
    do {
      const blocco = await leggiPagina(page);
      pagine = blocco.pagine ?? 1;
      const ordini: Record<string, never>[] = blocco.ordini ?? [];

      // Una query sola per l'intera pagina invece di una per ordine: con 8.000
      // ordini la differenza fra le due strade è di ore, non di minuti.
      const chiavi = ordini
        .map((o) => ({ mappa: BRAND[String((o as Record<string, unknown>).brand)], idEsterno: idNudo((o as Record<string, unknown>).orderId) }))
        .filter((x) => x.mappa && x.idEsterno);
      const gia = new Map<string, { id: string; totale: number | null; stato: string; numero: string; origine: string | null; utmSource: string | null; _count: { righe: number } }>();
      if (chiavi.length > 0) {
        const trovati = await prisma.ordine.findMany({
          where: { OR: chiavi.map((x) => ({ negozio: x.mappa.negozio, idEsterno: x.idEsterno })) },
          select: { id: true, negozio: true, idEsterno: true, totale: true, stato: true, numero: true, origine: true, utmSource: true, _count: { select: { righe: true } } },
        });
        for (const t of trovati) gia.set(`${t.negozio}|${t.idEsterno}`, t);
      }

      for (const grezzo of ordini) {
        const o = grezzo as Record<string, never> & Record<string, unknown>;
        const mappa = BRAND[String(o.brand)];
        const idEsterno = idNudo(o.orderId);
        if (!mappa || !idEsterno) {
          // Un negozio nuovo in Orders non si inventa un brand qui: si dichiara.
          conteggi.saltati++;
          continue;
        }
        const cliente = (o.cliente ?? {}) as Record<string, string | undefined>;
        const spedizione = (o.spedizione ?? {}) as Record<string, string | undefined>;
        const marketing = (o.marketing ?? {}) as Record<string, string | undefined>;
        const shopify = (o.shopify ?? {}) as Record<string, unknown>;

        // Solo i campi che Orders conosce davvero: netto, spedizione, sconto e
        // utm non ci sono, e scriverli a null cancellerebbe quelli già
        // importati da Shopify.
        const dati = {
          brand: mappa.brand,
          numero: String(o.numero),
          data: new Date(String(o.data)),
          totale: (o.totale as number) ?? null,
          valuta: (o.valuta as string) || "EUR",
          stato: statoDa(shopify.financialStatus as string, shopify.annullato as boolean),
          cliente: cliente.nome ?? undefined,
          email: cliente.email ?? undefined,
          citta: spedizione.citta ?? undefined,
          paese: spedizione.paese ?? undefined,
          // Da dove è arrivato l'ordine secondo Shopify, attribuito al PRIMO
          // contatto del percorso: è l'altra campana rispetto alle conversioni
          // dichiarate da Google e Meta, ed è il confronto fra le due a dire
          // se il tracciamento regge.
          ...(marketing.canale ? { origine: marketing.canale } : {}),
          ...(marketing.utmSource ? { utmSource: marketing.utmSource } : {}),
          ...(marketing.campagna ? { utmCampagna: marketing.campagna } : {}),
        };

        const righe = ((o.righe ?? []) as Record<string, unknown>[]).map((r) => ({
          titolo: String(r.titolo),
          sku: (r.sku as string) ?? null,
          quantita: (r.quantita as number) ?? 1,
          prezzo: (r.prezzo as number) ?? null,
          totale: r.prezzo != null ? (r.prezzo as number) * ((r.quantita as number) ?? 1) : null,
          categoria: categoriaDa(String(r.titolo), r.variante as string),
        }));

        const esistente = gia.get(`${mappa.negozio}|${idEsterno}`);
        if (esistente) {
          // Si riscrive solo ciò che è cambiato davvero: su un archivio storico
          // la stragrande maggioranza degli ordini non cambia più.
          const cambiato =
            esistente.totale !== dati.totale ||
            esistente.stato !== dati.stato ||
            esistente.numero !== dati.numero ||
            (dati.origine != null && esistente.origine !== dati.origine) ||
            (dati.utmSource != null && esistente.utmSource !== dati.utmSource);
          if (cambiato) await prisma.ordine.update({ where: { id: esistente.id }, data: dati });
          // Le righe si riscrivono solo se mancano: rifarle a ogni giro
          // cancellerebbe e ricreerebbe migliaia di righe per niente.
          if (esistente._count.righe === 0 && righe.length > 0) {
            await prisma.rigaOrdine.createMany({ data: righe.map((r) => ({ ...r, ordineId: esistente.id })) });
            conteggi.righe += righe.length;
          }
          if (cambiato) conteggi.aggiornati++;
          else conteggi.invariati++;
        } else {
          try {
            await prisma.ordine.create({
              data: { negozio: mappa.negozio, idEsterno, ...dati, righe: { create: righe } },
            });
            conteggi.righe += righe.length;
            conteggi.nuovi++;
          } catch (e) {
            // P2002 = qualcun altro ha creato lo stesso ordine fra la lettura e
            // la scrittura: capita se due import girano insieme. L'ordine c'è,
            // si aggiorna e si va avanti.
            if ((e as { code?: string })?.code !== "P2002") throw e;
            await prisma.ordine.update({
              where: { negozio_idEsterno: { negozio: mappa.negozio, idEsterno } },
              data: dati,
            });
            conteggi.aggiornati++;
          }
        }
        perBrand[mappa.brand] = (perBrand[mappa.brand] || 0) + 1;
      }

      lette++;
      page++;
      if (Date.now() > scadenza) break;
    } while (page <= pagine);
  } catch (e) {
    await annota(autore, conteggi, "errore");
    return { ok: false, codice: 502, errore: String(e).slice(0, 300) };
  }

  await annota(autore, conteggi, "ok");

  const completo = lette >= pagine;
  return {
    ok: true,
    periodo: { da, a },
    ...conteggi,
    perBrand,
    pagineLette: lette,
    pagineTotali: pagine,
    completo,
    nota: completo
      ? undefined
      : `Tempo finito dopo ${lette} pagine su ${pagine}: il resto entra al giro successivo. Per un caricamento lungo usare lo script \`npm run import:ordini-orders\`, che non ha il limite delle funzioni serverless.`,
  };
}

// La consegna si annota come tutte le altre, così "Dati in arrivo" sa dire
// anche degli ordini: una fonte che tace è esattamente ciò che quella pagina
// esiste per mostrare.
async function annota(
  autore: string,
  c: { nuovi: number; aggiornati: number; invariati: number; saltati: number },
  esito: string
) {
  await prisma.ricezioneDati
    .create({
      data: {
        fonte: "orders",
        tipo: "ordini",
        chiave: autore,
        righe: c.nuovi + c.aggiornati + c.invariati,
        nuove: c.nuovi,
        aggiornate: c.aggiornati,
        scartate: c.saltati,
        esito,
      },
    })
    .catch(() => {});
}
