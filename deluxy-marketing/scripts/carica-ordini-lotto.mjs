import { PrismaClient } from "@prisma/client";
import fs from "fs";
const prisma = new PrismaClient();
const percorsi = process.argv.slice(2).flatMap((p) => {
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).filter((f) => f.endsWith(".json")).map((f) => p + "/" + f);
  return [p];
});
const dati = percorsi.flatMap((p) => JSON.parse(fs.readFileSync(p, "utf8")));
console.log("file letti:", percorsi.length, "· ordini nel lotto:", dati.length);
function categoriaDa(titolo, tipo) {
  const t = `${titolo} ${tipo ?? ""}`.toLowerCase();
  if (/selections|riconsegna|spedizion|delivery|extra|gift card/.test(t)) return 'servizio';
  // I fiori si riconoscono per primi: molti nomi d'autore contengono parole
  // che altrimenti finirebbero in dolci o vini (Dolce Vita, Champagne Rosé).
  if (/rose|fior|bouquet|peoni|ortens|girasol|orchide|pianta|cappellier|cesto|lavanda|monet|botticelli|hokusai|dal.|frida|munch|wagner|tchaikovsky|venere|giverny/.test(t)) return 'fiori';
  if (/tort|cake|crostata|millefoglie|tiramis|sacher|cheesecake|saint|essenza|alexander|favolosa|otello|gianduia|coccinella|primavera|cioccolat/.test(t)) return 'torte';
  if (/colazion|brunch/.test(t)) return 'colazioni';
  if (/pralin|mignon|macaron|dolci/.test(t)) return 'dolci';
  if (/palloncin|balloon/.test(t)) return 'palloncini';
  if (/vino|sommelier|prosecco|bollicine/.test(t)) return 'vini';
  return 'altro';
}
let nuovi = 0, aggiornati = 0;
for (const o of dati) {
  const idEsterno = o.id.split("/").pop();
  const visita = o.customerJourneySummary?.lastVisit ?? null;
  const d = {
    brand: "gifts",
    numero: o.name,
    data: new Date(o.createdAt),
    totale: Number(o.currentTotalPriceSet?.shopMoney?.amount ?? 0),
    netto: Number(o.currentSubtotalPriceSet?.shopMoney?.amount ?? 0),
    stato: o.cancelledAt ? "annullato" : o.displayFinancialStatus === "REFUNDED" ? "rimborsato" : o.displayFinancialStatus === "PARTIALLY_REFUNDED" ? "parzialmente_rimborsato" : "pagato",
    citta: o.shippingAddress?.city ?? null,
    origine: visita?.source ?? null,
    utmSource: visita?.utmParameters?.source ?? null,
    utmCampagna: visita?.utmParameters?.campaign ?? null,
  };
  const righe = o.lineItems.nodes.map((r) => ({
    titolo: r.title,
    tipo: r.product?.productType ?? null,
    quantita: r.quantity ?? 1,
    totale: Number(r.discountedTotalSet?.shopMoney?.amount ?? 0),
    categoria: categoriaDa(r.title, r.product?.productType),
  }));
  const esistente = await prisma.ordine.findUnique({ where: { negozio_idEsterno: { negozio: "deluxygifts", idEsterno } } });
  if (esistente) {
    await prisma.rigaOrdine.deleteMany({ where: { ordineId: esistente.id } });
    await prisma.ordine.update({ where: { id: esistente.id }, data: { ...d, righe: { create: righe } } });
    aggiornati++;
  } else {
    await prisma.ordine.create({ data: { negozio: "deluxygifts", idEsterno, ...d, righe: { create: righe } } });
    nuovi++;
  }
}
await prisma.registroEvento.create({ data: { autore: "import", tipo: "import", entita: "ordine", titolo: "Ordini deluxy.it dal connettore Shopify (9-16 luglio)", dettaglio: `${nuovi} nuovi · ${aggiornati} aggiornati` } });
console.log("nuovi", nuovi, "aggiornati", aggiornati);
await prisma.$disconnect();
