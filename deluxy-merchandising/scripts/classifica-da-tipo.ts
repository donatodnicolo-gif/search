// **Riempie la categoria interna partendo dal «Tipo» di Shopify**, raggruppando
// per macro categorie. Scrive **solo qui**: sul negozio non tocca niente.
//
// Perché: il «Tipo» di Shopify è la vetrina — trentaquattro voci per i clienti,
// dove «Fiori», «Fiori d'Arte», «Rose» e «Cesti Floreali» sono cose diverse. Per
// ragionare da merchandising servono poche famiglie grandi: quante torte
// vendiamo, quanto pesano i fiori. La categoria interna è **la lente nostra**, ed
// è per questo che è un campo a parte da `tipoShopify` invece di essere lo
// stesso dato scritto due volte.
//
// **Le famiglie le decide una persona, non un algoritmo**: stanno qui sotto,
// scritte. «Cappelliere» sta nei fiori perché una cappelliera Deluxy è una scatola
// di rose, non un cappello — nessuna somiglianza fra stringhe lo avrebbe capito.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/classifica-da-tipo.ts --dry   ← solo il conto
//   npx tsx scripts/classifica-da-tipo.ts         ← scrive

import { readFileSync } from "node:fs";

type Macro = { chiave: string; nome: string; colore?: string; tipi: string[] };

const MACRO: Macro[] = [
  {
    chiave: "FIORI",
    nome: "Fiori",
    colore: "var(--green)",
    // «Fiori e fiori d'Arte vanno dentro fiori» — indicazione dell'utente, e da
    // lì il resto della famiglia floreale.
    tipi: ["Fiori", "Fiori d'Arte", "Rose", "Cesti Floreali", "Abbonamento Fiori", "Rosa Eterna", "Piante", "Cappelliere", "Fiori Originali", "Fiori Classici", "Ghirlande", "Fiori e Caramelle"],
  },
  {
    chiave: "TORTE_DOLCI",
    nome: "Torte e dolci",
    tipi: ["Cake Design", "Torte", "Dolci", "Mignon", "Cioccolateria", "Panettone Artigianale", "Dolci di Natale", "Dolci di Pasqua", "Colomba", "Praline", "Caramelle e cioccolato", "Macarons", "Alta pasticceria", "Prodotti da forno", "Dessert", "Semifreddo", "Gelato", "Baguette"],
  },
  {
    chiave: "VINI_SPIRITS",
    nome: "Vini e spirits",
    tipi: ["Vini", "Spirits", "Degustazioni & Aperitivi", "Aperitivi", "Drinks", "Bottiglie", "Champagne&Spumanti", "Gin", "Liquori"],
  },
  {
    chiave: "GASTRONOMIA",
    nome: "Gastronomia",
    tipi: ["Cene", "Food", "Gastronomia", "Colazioni & Brunch", "Uova", "Colazioni", "Brunch", "Cofanetto Colazioni & Brunch", "Primi e secondi piatti gia pronti", "Primi e secondi piatti già pronti", "Box Gourmet"],
  },
  {
    // Non è una famiglia di prodotto ma **una linea nostra**, e vale la pena
    // tenerla separata: è la domanda «quanto pesa quello che facciamo noi».
    chiave: "ORIGINALI_DELUXY",
    nome: "Originali Deluxy",
    tipi: ["Originali Deluxy"],
  },
  {
    chiave: "REGALI",
    nome: "Regali e accessori",
    tipi: ["Box Regalo", "Gift Card", "Palloncini", "Peluche", "Cosmetici", "Borse", "Gioielli", "Gioielli e Regali", "Accessori", "Drawstring Bag", "Belt bag", "Shopper Bag", "Pouch Bag", "Bucket Bag", "Tote", "Shoulder Bag", "Top Handle Bag", "Anelli", "Set Regalo", "Box", "Box Pasqua", "Box Natale", "cesti di natale", "Set Deluxy", "Giochi", "Telegramma", "Romantici"],
  },
  { chiave: "ARTE", nome: "Arte", tipi: ["Arte", "Quadri"] },
  { chiave: "CASA", nome: "Casa e decoro", tipi: ["Home Decor", "Arredo"] },
  // Gli articoli per animali sono un mondo a se: dentro «Regali» avrebbero fatto
  // sembrare regalo una cuccia.
  { chiave: "ANIMALI", nome: "Animali", tipi: ["Lettini per cani", "Cucce per gatti", "Giochi per gatti", "Articoli per animali"] },
  { chiave: "SERVIZI", nome: "Servizi", tipi: ["Servizi Deluxy", "Boutique Activation", "Luxury Delivery", "SorpreseDeluxy", "Experience Natale"] },
];

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  const secco = process.argv.includes("--dry");
  const { prisma } = await import("../src/lib/db");

  const tipi = await prisma.prodotto.groupBy({ by: ["tipoShopify"], where: { tipoShopify: { not: null } }, _count: true });
  const quanti = new Map(tipi.map((t) => [t.tipoShopify as string, t._count]));

  // **Quello che nessuna famiglia prende si dice**, non si lascia indietro in
  // silenzio: un tipo dimenticato vorrebbe dire prodotti che restano «Da
  // classificare» senza che nessuno se ne accorga.
  const presi = new Set(MACRO.flatMap((m) => m.tipi.map((t) => t.toLowerCase())));
  const fuori = [...quanti.entries()].filter(([t]) => !presi.has(t.toLowerCase()));

  console.log("— le famiglie —");
  for (const m of MACRO) {
    const n = m.tipi.reduce((s, t) => s + (quanti.get(t) ?? 0), 0);
    console.log(`  ${m.nome.padEnd(20)} ${String(n).padStart(5)}  ←  ${m.tipi.join(", ")}`);
  }
  if (fuori.length) console.log("\n⚠️  tipi senza famiglia (restano «Da classificare»):", fuori.map(([t, n]) => `${t} ${n}`).join(" · "));
  else console.log("\nnessun tipo resta fuori.");
  if (secco) return void (await prisma.$disconnect());

  for (const m of MACRO) {
    await prisma.categoriaProdotto.upsert({
      where: { chiave: m.chiave },
      update: { nome: m.nome, colore: m.colore ?? null },
      create: { chiave: m.chiave, nome: m.nome, colore: m.colore ?? null, descrizione: `Dal «Tipo» di Shopify: ${m.tipi.join(", ")}.` },
    });
  }

  let fatti = 0;
  for (const m of MACRO) {
    // **Non si sovrascrive una classificazione già fatta da una persona**: si
    // riempie solo quello che è ancora «Da classificare». Rilanciare lo script
    // non disfa il lavoro di nessuno.
    const r = await prisma.prodotto.updateMany({
      where: { tipoShopify: { in: m.tipi }, categoria: "DA_CLASSIFICARE" },
      data: { categoria: m.chiave },
    });
    fatti += r.count;
    console.log(`  ${m.nome}: ${r.count} prodotti`);
  }
  console.log(`\nclassificati ${fatti} prodotti (solo in app, su Shopify non è cambiato niente).`);

  // — Seconda passata: **gli Originali Deluxy che sono fiori** —
  //
  // «Originali Deluxy» e' il Tipo che il negozio da' alle **composizioni**: fiori
  // piu' qualcos'altro (Rose Rosse e Praline, Cappelliera Rose e Palloncino,
  // Monet - Bouquet e Palloncini). Tenendoli tutti in una famiglia a se',
  // cercando i fiori se ne perdevano quarantotto — segnalato dall'utente, che ha
  // deciso: **vanno sotto Fiori comunque**.
  //
  // Il criterio non e' «indovina dal nome»: si guarda un **tag floreale** o il
  // **negozio Flowers**, che sono dati scritti su Shopify. Il nome entra solo
  // come terzo segnale e su parole inequivocabili (ortensie, bouquet, peonie),
  // per non lasciare fuori casi come «Ortensie Balloon» che di floreale non
  // hanno ne' tag ne' negozio. Qui si **sovrascrive** una categoria gia'
  // assegnata, ed e' voluto: e' l'unico punto dello script che lo fa.
  const composizioni = await prisma.prodotto.findMany({
    where: { categoria: "ORIGINALI_DELUXY" },
    select: {
      id: true,
      nome: true,
      tagShopify: true,
      collezioniShopify: { select: { collezione: { select: { negozio: true } } }, take: 1 },
    },
  });
  const FLOREALE = /fior|rose|rosa|bouquet|orchid|ortensi|tulipan|peon/i;
  const NOME_FLOREALE = /fior|rose|bouquet|orchid|ortensi|tulipan|peon|cappellier/i;
  const daSpostare = composizioni.filter(
    (p) =>
      FLOREALE.test(p.tagShopify ?? "") ||
      p.collezioniShopify[0]?.collezione.negozio === "Flowers" ||
      NOME_FLOREALE.test(p.nome),
  );
  if (daSpostare.length > 0) {
    await prisma.prodotto.updateMany({ where: { id: { in: daSpostare.map((p) => p.id) } }, data: { categoria: "FIORI" } });
  }
  console.log(`
Originali Deluxy che sono composizioni floreali → Fiori: ${daSpostare.length}`);

  const dopo = await prisma.prodotto.groupBy({ by: ["categoria"], where: { statoShopify: "ACTIVE" }, _count: true });
  console.log("— attivi per categoria interna —");
  for (const c of dopo.sort((a, b) => b._count - a._count)) console.log(`  ${c.categoria.padEnd(20)} ${c._count}`);
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
