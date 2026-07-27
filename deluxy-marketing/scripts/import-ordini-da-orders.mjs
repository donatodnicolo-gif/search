// Importa gli ordini di TUTTI i brand dal registro centrale Deluxy Orders.
//
// PERCHÉ NON DA SHOPIFY: gli ordini veri stanno già in deluxy-orders, che li
// tiene allineati con i tre negozi. Chiedere di nuovo a Shopify vorrebbe dire
// tre token Admin da custodire e due fonti che possono divergere. Qui si legge
// da una fonte sola, con una chiave di sola lettura.
//
//   npm run import:ordini-orders                          # dal 2025-01-01
//   npm run import:ordini-orders -- --da 2026-01-01
//   npm run import:ordini-orders -- --brand flowers
//   npm run import:ordini-orders -- --annullati           # include gli annullati
//
// Serve nel .env (o come variabile d'ambiente):
//   ORDERS_API_KEY=dlxo_...        (chiave di sola lettura di deluxy-orders)
//   ORDERS_URL=https://deluxy-orders.vercel.app   (opzionale)
//
// Idempotente: upsert su (negozio, id Shopify). Rilanciarlo non duplica.
//
// COSA NON ARRIVA, e va saputo:
// - gli ordini ANNULLATI non escono dalle API di Orders se non li si chiede
//   apposta (--annullati): un annullato resta spesso "pagato" e conteggiarlo
//   gonfierebbe il fatturato;
// - l'attribuzione (`origine`, `utmSource`, `utmCampagna`) è quella di Shopify
//   al PRIMO contatto del percorso, non all'ultimo clic: è volutamente diversa
//   da come contano Google e Meta, ed è proprio il confronto fra le due che
//   dice se il tracciamento regge;
// - il valore NETTO merce, la spedizione e lo sconto non sono esposti da
//   Orders: sulle righe già presenti non vengono toccati, sulle nuove restano
//   vuoti. Il `totale` è quello Shopify, IVA e spedizione incluse.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const argomenti = process.argv.slice(2).filter((a) => a !== "--");
const valoreDi = (nome, predefinito = null) => {
  const i = argomenti.indexOf(`--${nome}`);
  return i >= 0 && argomenti[i + 1] && !argomenti[i + 1].startsWith("--") ? argomenti[i + 1] : predefinito;
};
const da = valoreDi("da", "2025-01-01");
const a = valoreDi("a");
const soloBrand = valoreDi("brand");
const conAnnullati = argomenti.includes("--annullati");

const URL_ORDERS = (process.env.ORDERS_URL || "https://deluxy-orders.vercel.app").replace(/\/+$/, "");
const CHIAVE = process.env.ORDERS_API_KEY;
if (!CHIAVE) {
  console.error("Manca ORDERS_API_KEY (chiave di sola lettura di deluxy-orders).");
  console.error("Si crea da lì: npm run chiave -- deluxy-marketing");
  process.exit(1);
}

// I brand si chiamano diversamente nelle due app: in Orders sono i negozi
// ("deluxy.it", "Flowers", "cakedesign.me"), qui sono i marchi. Il `negozio`
// tiene lo stesso handle già usato dall'import diretto da Shopify, altrimenti
// gli stessi ordini entrerebbero due volte.
const BRAND = {
  "deluxy.it": { brand: "gifts", negozio: "deluxygifts" },
  Flowers: { brand: "flowers", negozio: "deluxyflowers" },
  "cakedesign.me": { brand: "cake", negozio: "cakedesignme" },
};

// Categoria normalizzata: la stessa lingua usata da keywords e landing.
// (Copia consapevole di import-ordini-shopify.mjs: le due fonti devono
// classificare allo stesso modo, o /offerte mostrerebbe due mondi diversi.)
function categoriaDa(titolo, variante) {
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

function statoDa(finanziario, annullato) {
  if (annullato) return "annullato";
  if (finanziario === "REFUNDED" || finanziario === "VOIDED") return "rimborsato";
  if (finanziario === "PARTIALLY_REFUNDED") return "parzialmente_rimborsato";
  return "pagato";
}

// "gid://shopify/Order/17947803386186" → "17947803386186": l'import diretto da
// Shopify salvava il numero nudo, e la chiave di riconoscimento è quella.
const idNudo = (gid) => String(gid ?? "").split("/").pop();

async function pagina(page) {
  const q = new URLSearchParams({ da, limit: "200", page: String(page) });
  if (a) q.set("a", a);
  if (soloBrand) {
    const voce = Object.entries(BRAND).find(([, v]) => v.brand === soloBrand);
    if (!voce) throw new Error(`Brand sconosciuto: ${soloBrand} (ammessi: gifts, flowers, cake)`);
    q.set("brand", voce[0]);
  }
  if (conAnnullati) q.set("annullati", "inclusi");

  // Un import lungo attraversa mezz'ora di rete: un singolo intoppo non deve
  // buttare via tutto il lavoro fatto. Tre tentativi con attesa crescente.
  let attesa = 3000;
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const risposta = await fetch(`${URL_ORDERS}/api/v1/ordini?${q}`, {
        headers: { "x-api-key": CHIAVE },
      });
      if (risposta.ok) return risposta.json();
      // 4xx: è un errore nostro, ritentare non serve
      if (risposta.status < 500) {
        throw new Error(`Orders ha risposto ${risposta.status}: ${(await risposta.text()).slice(0, 200)}`);
      }
      console.log(`  (pagina ${page}: HTTP ${risposta.status}, ritento fra ${attesa / 1000}s)`);
    } catch (e) {
      if (tentativo === 3 || /Orders ha risposto 4/.test(String(e))) throw e;
      console.log(`  (pagina ${page}: ${String(e.cause?.code || e.message)}, ritento fra ${attesa / 1000}s)`);
    }
    await new Promise((r) => setTimeout(r, attesa));
    attesa *= 3;
  }
  throw new Error(`Pagina ${page}: esauriti i tentativi`);
}

const conteggi = { nuovi: 0, aggiornati: 0, invariati: 0, saltati: 0, righe: 0 };
const perBrand = {};

console.log(`Leggo da ${URL_ORDERS} · dal ${da}${a ? ` al ${a}` : ""}${soloBrand ? ` · solo ${soloBrand}` : ""}${conAnnullati ? " · annullati inclusi" : ""}`);

let page = 1;
let pagine = 1;
do {
  const blocco = await pagina(page);
  pagine = blocco.pagine;
  if (page === 1) console.log(`${blocco.totale} ordini da importare in ${pagine} pagine`);

  // Una query sola per l'intera pagina invece di una per ordine: con 8.000
  // ordini la differenza fra le due strade è di ore, non di minuti.
  const chiavi = blocco.ordini
    .map((o) => ({ mappa: BRAND[o.brand], idEsterno: idNudo(o.orderId) }))
    .filter((x) => x.mappa && x.idEsterno);
  const gia = new Map();
  if (chiavi.length > 0) {
    const trovati = await prisma.ordine.findMany({
      where: { OR: chiavi.map((x) => ({ negozio: x.mappa.negozio, idEsterno: x.idEsterno })) },
      select: { id: true, negozio: true, idEsterno: true, totale: true, stato: true, numero: true, origine: true, utmSource: true, _count: { select: { righe: true } } },
    });
    for (const t of trovati) gia.set(`${t.negozio}|${t.idEsterno}`, t);
  }

  for (const o of blocco.ordini) {
    const mappa = BRAND[o.brand];
    if (!mappa) {
      // Un negozio nuovo in Orders non si inventa un brand qui: si dichiara.
      conteggi.saltati++;
      continue;
    }
    const idEsterno = idNudo(o.orderId);
    if (!idEsterno) {
      conteggi.saltati++;
      continue;
    }

    // Solo i campi che Orders conosce davvero: netto, spedizione, sconto e utm
    // non ci sono, e se li scrivessimo a null cancelleremmo quelli già
    // importati da Shopify.
    const dati = {
      brand: mappa.brand,
      numero: o.numero,
      data: new Date(o.data),
      totale: o.totale,
      valuta: o.valuta || "EUR",
      stato: statoDa(o.shopify?.financialStatus, o.shopify?.annullato),
      cliente: o.cliente?.nome ?? undefined,
      email: o.cliente?.email ?? undefined,
      citta: o.spedizione?.citta ?? undefined,
      paese: o.spedizione?.paese ?? undefined,
      // Da dove è arrivato l'ordine secondo Shopify, attribuito al PRIMO
      // contatto del percorso. È l'altra campana rispetto alle conversioni che
      // dichiarano Google e Meta: serve a vedere se il tracciamento regge.
      ...(o.marketing?.canale ? { origine: o.marketing.canale } : {}),
      ...(o.marketing?.utmSource ? { utmSource: o.marketing.utmSource } : {}),
      ...(o.marketing?.campagna ? { utmCampagna: o.marketing.campagna } : {}),
    };

    const esistente = gia.get(`${mappa.negozio}|${idEsterno}`);

    const righe = (o.righe ?? []).map((r) => ({
      titolo: r.titolo,
      sku: r.sku ?? null,
      quantita: r.quantita ?? 1,
      prezzo: r.prezzo ?? null,
      totale: r.prezzo != null ? r.prezzo * (r.quantita ?? 1) : null,
      categoria: categoriaDa(r.titolo, r.variante),
    }));

    if (esistente) {
      // Si riscrive solo ciò che è cambiato davvero: su un archivio storico la
      // stragrande maggioranza degli ordini non cambia più.
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
        // P2002 = qualcun altro ha creato lo stesso ordine fra la lettura e la
        // scrittura: capita se due import girano insieme. Non è un errore da
        // fermare tutto — l'ordine c'è, si aggiorna e si va avanti.
        if (e?.code !== "P2002") throw e;
        await prisma.ordine.update({
          where: { negozio_idEsterno: { negozio: mappa.negozio, idEsterno } },
          data: dati,
        });
        conteggi.aggiornati++;
      }
    }
    perBrand[mappa.brand] = (perBrand[mappa.brand] || 0) + 1;
  }

  const ultimo = blocco.ordini[blocco.ordini.length - 1];
  console.log(`  pagina ${page}/${pagine} · nuovi ${conteggi.nuovi} · aggiornati ${conteggi.aggiornati} · invariati ${conteggi.invariati}` + (ultimo ? ` · sono arrivato al ${ultimo.data.slice(0, 10)}` : ""));
  page++;
} while (page <= pagine);

console.log();
console.log(`Fatto: ${conteggi.nuovi} ordini nuovi, ${conteggi.aggiornati} aggiornati, ${conteggi.invariati} già uguali, ${conteggi.righe} righe prodotto`);
console.log("Per brand:", Object.entries(perBrand).map(([b, n]) => `${b} ${n}`).join(" · "));
if (conteggi.saltati > 0) console.log(`⚠ ${conteggi.saltati} ordini saltati: negozio non mappato in BRAND`);
if (!conAnnullati) console.log("Gli ordini annullati non sono inclusi (--annullati per averli).");

await prisma.$disconnect();
