// Crea i prodotti di Merchandising a partire dal venduto reale importato da
// Deluxy Orders, e vi aggancia le vendite già in archivio.
//
// Serve quando il catalogo è vuoto (o parziale) rispetto a quello che si vende
// davvero sui negozi: senza prodotti anagrafati, trend e ipotesi di ordinativo
// vedono solo i totali.
//
// Cosa fa, e cosa NON fa:
// - un prodotto per ogni TITOLO venduto, con le sue varianti prese dagli SKU e
//   dai nomi di variante scelti dai clienti;
// - prezzo = media davvero incassata sul periodo (dato reale, non listino);
// - costo = 0 e categoria «Da classificare»: NON si indovinano dal titolo. Il
//   margine resta a zero finché una persona non mette il costo — meglio un buco
//   dichiarato di un margine inventato;
// - giacenza 0 su tutte le varianti: qui non arriva nessun magazzino, quindi le
//   ipotesi di ordinativo vanno lette sapendo che partono da scorta ignota;
// - stato Shopify invariato ("non pubblicato"): quel campo dice cosa ha
//   pubblicato QUESTA app, non cosa esiste sul negozio.
//
//   node scripts/prodotti-da-vendite.mjs [--min 1] [--dry]
//     --min N   crea solo i titoli venduti almeno N pezzi (default 1 = tutto)
//     --dry     mostra cosa farebbe, senza scrivere

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const min = (() => {
  const i = args.indexOf("--min");
  const n = i >= 0 ? parseInt(args[i + 1], 10) : NaN;
  return Number.isFinite(n) ? Math.max(1, n) : 1;
})();

const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

function slug(titolo) {
  const s = titolo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return s || "ARTICOLO";
}

// Se tutti gli SKU del gruppo sono varianti dello stesso codice (ICQLBN-1,
// ICQLBN-2...), quel codice è il codice del prodotto: è già la lingua del negozio.
function codiceDaSku(skus) {
  const basi = new Set(skus.map((s) => s.replace(/-\d+$/, "").trim()).filter((s) => s.length >= 4));
  return basi.size === 1 ? [...basi][0] : null;
}

async function main() {
  const righe = await prisma.vendita.findMany({
    where: { origine: "orders", prodottoId: null },
    select: { titolo: true, varianteNome: true, sku: true, quantita: true, ricavo: true, data: true },
  });
  if (righe.length === 0) {
    console.log("Nessuna riga di vendita da agganciare: o il catalogo è già completo, o non c'è import.");
    return;
  }

  // — Raggruppa per titolo —
  const gruppi = new Map();
  for (const r of righe) {
    const k = norm(r.titolo);
    const g =
      gruppi.get(k) ??
      { titolo: r.titolo.trim(), titoliVisti: new Set(), pezzi: 0, ricavo: 0, varianti: new Map() };
    g.titoliVisti.add(r.titolo);
    g.pezzi += r.quantita;
    g.ricavo += r.ricavo;
    const chiaveVar = r.sku ? `sku:${r.sku}` : r.varianteNome ? `nome:${norm(r.varianteNome)}` : null;
    if (chiaveVar) {
      const v = g.varianti.get(chiaveVar) ?? { sku: r.sku, nome: r.varianteNome, ultima: r.data };
      // A parità di SKU tengo il nome più recente: i negozi rinominano le taglie.
      if (r.varianteNome && r.data >= v.ultima) {
        v.nome = r.varianteNome;
        v.ultima = r.data;
      }
      g.varianti.set(chiaveVar, v);
    }
    gruppi.set(k, g);
  }

  const candidati = [...gruppi.values()].filter((g) => g.pezzi >= min).sort((a, b) => b.ricavo - a.ricavo);
  const scartati = gruppi.size - candidati.length;

  // — Codici univoci —
  const esistenti = new Set(
    (await prisma.prodotto.findMany({ select: { codice: true } })).map((p) => p.codice.toUpperCase())
  );
  const skuOccupati = new Set(
    (await prisma.variante.findMany({ where: { sku: { not: null } }, select: { sku: true } })).map((v) => v.sku)
  );

  for (const g of candidati) {
    const base = codiceDaSku([...g.varianti.values()].map((v) => v.sku).filter(Boolean)) ?? slug(g.titolo);
    let codice = base.toUpperCase();
    let n = 2;
    while (esistenti.has(codice)) codice = `${base.toUpperCase()}-${n++}`;
    esistenti.add(codice);
    g.codice = codice;
  }

  console.log(
    `Titoli venduti: ${gruppi.size} · da creare: ${candidati.length}` +
      (scartati ? ` · sotto la soglia di ${min} pezzi: ${scartati}` : "")
  );
  if (dry) {
    for (const g of candidati.slice(0, 15)) {
      console.log(
        `  ${g.codice.padEnd(26)} ${g.titolo.slice(0, 44).padEnd(46)} ${String(g.pezzi).padStart(5)} pz  ${Math.round(g.ricavo).toString().padStart(7)} €  ${g.varianti.size} varianti`
      );
    }
    console.log("(--dry: non ho scritto niente)");
    return;
  }

  // — Creazione prodotti —
  const oggi = new Date().toLocaleDateString("it-IT");
  for (let i = 0; i < candidati.length; i += 200) {
    const blocco = candidati.slice(i, i + 200);
    await prisma.prodotto.createMany({
      data: blocco.map((g) => ({
        codice: g.codice,
        nome: g.titolo.slice(0, 200),
        categoria: "DA_CLASSIFICARE",
        fase: "in_vendita",
        costoProduzione: 0,
        prezzoVendita: Math.round((g.ricavo / Math.max(1, g.pezzi)) * 100) / 100,
        noteSviluppo: `Creato dal venduto reale (Deluxy Orders) il ${oggi}: ${g.pezzi} pezzi, ${Math.round(g.ricavo)} € negli ultimi 12 mesi. Costo di produzione e categoria da compilare.`,
      })),
      skipDuplicates: true,
    });
    process.stdout.write(`\rProdotti creati: ${Math.min(i + 200, candidati.length)}/${candidati.length}`);
  }
  console.log();

  const creati = new Map(
    (await prisma.prodotto.findMany({ select: { id: true, codice: true } })).map((p) => [p.codice, p.id])
  );

  // — Varianti —
  const varianti = [];
  for (const g of candidati) {
    const id = creati.get(g.codice);
    if (!id) continue;
    for (const v of g.varianti.values()) {
      // Lo SKU è unico a livello di app: se è già di un'altra variante lo lascio
      // fuori invece di far fallire tutto il blocco.
      if (v.sku && skuOccupati.has(v.sku)) continue;
      if (v.sku) skuOccupati.add(v.sku);
      varianti.push({
        prodottoId: id,
        nome: (v.nome || v.sku || "Unica").slice(0, 120),
        sku: v.sku ?? null,
        giacenza: 0,
      });
    }
  }
  for (let i = 0; i < varianti.length; i += 300) {
    await prisma.variante.createMany({ data: varianti.slice(i, i + 300), skipDuplicates: true });
    process.stdout.write(`\rVarianti create: ${Math.min(i + 300, varianti.length)}/${varianti.length}`);
  }
  console.log();

  // — Aggancio delle vendite già in archivio —
  let agganciate = 0;
  let fatti = 0;
  for (const g of candidati) {
    const id = creati.get(g.codice);
    if (!id) continue;
    const esito = await prisma.vendita.updateMany({
      where: { origine: "orders", prodottoId: null, titolo: { in: [...g.titoliVisti] } },
      data: { prodottoId: id },
    });
    agganciate += esito.count;
    if (++fatti % 100 === 0) process.stdout.write(`\rVendite agganciate: ${agganciate} (${fatti}/${candidati.length} prodotti)`);
  }
  console.log(`\rVendite agganciate a un prodotto: ${agganciate}${" ".repeat(20)}`);

  // — Aggancio delle varianti (per SKU) —
  const varianteId = await prisma.variante.findMany({
    where: { sku: { not: null } },
    select: { id: true, sku: true, prodottoId: true },
  });
  let conVariante = 0;
  for (let i = 0; i < varianteId.length; i++) {
    const v = varianteId[i];
    const esito = await prisma.vendita.updateMany({
      where: { origine: "orders", sku: v.sku, varianteId: null },
      data: { varianteId: v.id },
    });
    conVariante += esito.count;
    if (i % 200 === 0) process.stdout.write(`\rVendite con variante: ${conVariante} (${i}/${varianteId.length})`);
  }
  console.log(`\rVendite agganciate anche alla variante: ${conVariante}${" ".repeat(20)}`);

  const rimaste = await prisma.vendita.count({ where: { origine: "orders", prodottoId: null } });
  console.log(`Righe ancora senza prodotto: ${rimaste}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
