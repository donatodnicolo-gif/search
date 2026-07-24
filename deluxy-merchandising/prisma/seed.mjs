// Seed dimostrativo di Deluxy Merchandising.
// Popola collezioni stagionali, prodotti lungo il ciclo di vita, varianti,
// fornitori e allestimenti di visual merchandising. Idempotente: svuota e ricrea.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Pulizia (ordine rispettoso delle FK)
  await prisma.vetrinaProdotto.deleteMany();
  await prisma.vetrina.deleteMany();
  await prisma.tappaSviluppo.deleteMany();
  await prisma.variante.deleteMany();
  await prisma.prodotto.deleteMany();
  await prisma.collezione.deleteMany();
  await prisma.fornitore.deleteMany();

  // — Fornitori / atelier —
  const atelier = await prisma.fornitore.create({
    data: { nome: "Atelier Botanico Milano", tipo: "atelier", citta: "Milano", referente: "Chiara Fossati", email: "chiara@atelierbotanico.it" },
  });
  const vivaio = await prisma.fornitore.create({
    data: { nome: "Vivai San Remo", tipo: "vivaio", citta: "Sanremo", referente: "Marco Lanteri", email: "ordini@vivaisanremo.it" },
  });
  const packaging = await prisma.fornitore.create({
    data: { nome: "Cartotecnica Deluxe", tipo: "packaging", citta: "Como", referente: "Ufficio ordini" },
  });

  // — Collezioni —
  const primavera = await prisma.collezione.create({
    data: {
      nome: "Fioritura Notturna",
      stagione: "SS26",
      anno: 2026,
      tema: "L'ora blu: fiori che si aprono al crepuscolo, tra indaco e oro.",
      descrizione: "La collezione di punta primavera/estate 2026. Composizioni scultoree in palette scura e accenti dorati.",
      stato: "in_vendita",
      margineTarget: 62,
      dataLancio: new Date("2026-03-01"),
      note: "Vetrina flagship + campagna social dedicata.",
    },
  });
  const holiday = await prisma.collezione.create({
    data: {
      nome: "Rituale d'Inverno",
      stagione: "HOLIDAY26",
      anno: 2026,
      tema: "Il calore delle feste: rosso lacca, abete, resine e candele.",
      descrizione: "Capsule per le festività: gifting premium e centrotavola.",
      stato: "in_sviluppo",
      margineTarget: 58,
      dataLancio: new Date("2026-11-15"),
    },
  });
  const cruise = await prisma.collezione.create({
    data: {
      nome: "Giardino Mediterraneo",
      stagione: "CRUISE26",
      anno: 2026,
      tema: "Agrumi, ulivo e ceramica: la Riviera in fiore.",
      stato: "archiviata",
      margineTarget: 60,
      dataLancio: new Date("2025-05-01"),
    },
  });

  // — Prodotti —
  // helper per creare prodotto + tappe coerenti con la fase
  const fasiOrdine = ["concept", "prototipo", "approvato", "in_vendita", "archiviato"];
  async function creaProdotto(d, tappe = []) {
    const p = await prisma.prodotto.create({ data: d });
    for (const t of tappe) {
      await prisma.tappaSviluppo.create({ data: { prodottoId: p.id, ...t } });
    }
    return p;
  }

  const p1 = await creaProdotto(
    {
      codice: "FN-26-001",
      nome: "Bouquet Ora Blu",
      collezioneId: primavera.id,
      categoria: "BOUQUET",
      fase: "in_vendita",
      brief: "Il pezzo icona della collezione: anemoni indaco, ranuncoli avorio, tocco dorato.",
      materiali: "Anemoni, ranuncoli, eucalipto, foglia oro",
      palette: "Indaco · avorio · oro",
      fornitoreId: atelier.id,
      costoProduzione: 34,
      prezzoVendita: 95,
      priorita: 10,
      shopifyStato: "pubblicato",
      shopifyId: "gid://shopify/Product/1001",
      shopifySyncIl: new Date("2026-03-02"),
    },
    [
      { da: "concept", a: "prototipo", nota: "Primo mockup validato", creataIl: new Date("2026-01-10") },
      { da: "prototipo", a: "approvato", nota: "Ok direzione creativa", creataIl: new Date("2026-02-05") },
      { da: "approvato", a: "in_vendita", nota: "Lancio flagship", creataIl: new Date("2026-03-01") },
    ]
  );
  await prisma.variante.createMany({
    data: [
      { prodottoId: p1.id, nome: "Medium", sku: "FN-26-001-M", deltaCosto: 0, deltaPrezzo: 0, giacenza: 24 },
      { prodottoId: p1.id, nome: "Deluxe", sku: "FN-26-001-D", deltaCosto: 18, deltaPrezzo: 55, giacenza: 8 },
    ],
  });

  const p2 = await creaProdotto(
    {
      codice: "FN-26-002",
      nome: "Composizione Crepuscolo",
      collezioneId: primavera.id,
      categoria: "COMPOSIZIONE",
      fase: "in_vendita",
      materiali: "Dalie, astri, felce, vaso in vetro fumé",
      palette: "Prugna · verde bosco",
      fornitoreId: atelier.id,
      costoProduzione: 48,
      prezzoVendita: 130,
      priorita: 7,
      shopifyStato: "pubblicato",
      shopifyId: "gid://shopify/Product/1002",
      shopifySyncIl: new Date("2026-03-02"),
    },
    [
      { da: "approvato", a: "in_vendita", nota: "In assortimento", creataIl: new Date("2026-03-01") },
    ]
  );
  await prisma.variante.create({ data: { prodottoId: p2.id, nome: "Unica", sku: "FN-26-002-U", giacenza: 12 } });

  const p3 = await creaProdotto(
    {
      codice: "FN-26-003",
      nome: "Gift Box Aurora",
      collezioneId: primavera.id,
      categoria: "GIFT_BOX",
      fase: "approvato",
      brief: "Cofanetto regalo: mini bouquet + candela + biglietto calligrafato.",
      materiali: "Mini bouquet, candela di soia, packaging rigido",
      fornitoreId: packaging.id,
      costoProduzione: 22,
      prezzoVendita: 68,
      priorita: 5,
      shopifyStato: "bozza",
    },
    [
      { da: "concept", a: "prototipo", creataIl: new Date("2026-02-01") },
      { da: "prototipo", a: "approvato", nota: "Pronto per il listino", creataIl: new Date("2026-02-20") },
    ]
  );

  // Prodotto con margine sotto target: utile per gli allarmi in Costi.
  await creaProdotto(
    {
      codice: "FN-26-004",
      nome: "Pianta Firmamento",
      collezioneId: primavera.id,
      categoria: "PIANTA",
      fase: "prototipo",
      materiali: "Orchidea Phalaenopsis, cachepot ceramica dipinta a mano",
      fornitoreId: vivaio.id,
      costoProduzione: 41,
      prezzoVendita: 79, // margine ~48%, sotto il target 62%
      priorita: 3,
      shopifyStato: "non_pubblicato",
    },
    [{ da: "concept", a: "prototipo", nota: "Cachepot da rivedere sui costi", creataIl: new Date("2026-02-15") }]
  );

  // Holiday (in sviluppo)
  await creaProdotto({
    codice: "RI-26-001",
    nome: "Centrotavola Lacca",
    collezioneId: holiday.id,
    categoria: "COMPOSIZIONE",
    fase: "concept",
    brief: "Centrotavola per le feste: amaryllis rosso, abete, pigne dorate.",
    palette: "Rosso lacca · verde abete · oro",
    fornitoreId: atelier.id,
    costoProduzione: 39,
    prezzoVendita: 110,
    priorita: 6,
    shopifyStato: "non_pubblicato",
  });
  await creaProdotto({
    codice: "RI-26-002",
    nome: "Ghirlanda Resina & Agrumi",
    collezioneId: holiday.id,
    categoria: "HOME_FRAGRANCE",
    fase: "concept",
    materiali: "Abete, arance essiccate, cannella, bacche",
    costoProduzione: 26,
    prezzoVendita: 72,
    shopifyStato: "non_pubblicato",
  });
  await creaProdotto({
    codice: "RI-26-003",
    nome: "Edizione Limitata Nocturne",
    collezioneId: holiday.id,
    categoria: "EDIZIONE_LIMITATA",
    fase: "prototipo",
    brief: "Serie numerata 100 pezzi per i clienti top.",
    costoProduzione: 62,
    prezzoVendita: 180,
    priorita: 9,
    shopifyStato: "non_pubblicato",
  });

  // Cruise (archiviata)
  await creaProdotto({
    codice: "GM-25-001",
    nome: "Bouquet Zagara",
    collezioneId: cruise.id,
    categoria: "BOUQUET",
    fase: "archiviato",
    materiali: "Fiori d'arancio, mimosa, ulivo",
    costoProduzione: 28,
    prezzoVendita: 82,
    shopifyStato: "pubblicato",
    shopifyId: "gid://shopify/Product/900",
    shopifySyncIl: new Date("2025-05-01"),
  });

  // — Visual merchandising: allestimenti —
  const vetrinaFlagship = await prisma.vetrina.create({
    data: {
      nome: "Vetrina Flagship — Ora Blu",
      stagione: "SS26",
      tipo: "vetrina",
      descrizione: "Allestimento della boutique di via Montenapoleone per il lancio SS26.",
    },
  });
  await prisma.vetrinaProdotto.createMany({
    data: [
      { vetrinaId: vetrinaFlagship.id, prodottoId: p1.id, posizione: 0 },
      { vetrinaId: vetrinaFlagship.id, prodottoId: p2.id, posizione: 1 },
      { vetrinaId: vetrinaFlagship.id, prodottoId: p3.id, posizione: 2 },
    ],
  });

  const lookbook = await prisma.vetrina.create({
    data: {
      nome: "Lookbook SS26",
      stagione: "SS26",
      tipo: "lookbook",
      descrizione: "Sequenza per il catalogo digitale e la newsletter.",
    },
  });
  await prisma.vetrinaProdotto.createMany({
    data: [
      { vetrinaId: lookbook.id, prodottoId: p2.id, posizione: 0 },
      { vetrinaId: lookbook.id, prodottoId: p1.id, posizione: 1 },
    ],
  });

  const counts = {
    collezioni: await prisma.collezione.count(),
    prodotti: await prisma.prodotto.count(),
    varianti: await prisma.variante.count(),
    vetrine: await prisma.vetrina.count(),
    fornitori: await prisma.fornitore.count(),
  };
  console.log("Seed completato:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
