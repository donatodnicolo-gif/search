// Vendite dimostrative per Deluxy Merchandising.
//
// Serve a vedere trend, ipotesi di ordinativo e lettura AI funzionare quando il
// collegamento a Deluxy Orders non è ancora configurato. Genera 180 giorni di
// venduto plausibile sui prodotti in assortimento.
//
// Due garanzie, perché il database è quello condiviso di produzione:
// - inserisce SOLO righe con origine "demo" e riferimento "demo#...";
// - non cancella e non tocca nient'altro. Per toglierle:
//     node scripts/vendite-demo.mjs --pulisci
//
//   node scripts/vendite-demo.mjs [--giorni 180] [--pulisci]

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const pulisci = args.includes("--pulisci");
const giorni = (() => {
  const i = args.indexOf("--giorni");
  const n = i >= 0 ? parseInt(args[i + 1], 10) : NaN;
  return Number.isFinite(n) ? Math.max(28, Math.min(720, n)) : 180;
})();

// Generatore deterministico: rilanciando lo script escono gli stessi numeri,
// così il confronto fra due sessioni ha senso.
function rng(seme) {
  let s = seme >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CANALI = ["Flowers", "deluxy.it", "Cake Design"];

async function main() {
  if (pulisci) {
    const via = await prisma.vendita.deleteMany({ where: { origine: "demo" } });
    console.log(`Rimosse ${via.count} vendite dimostrative. Nessun altro dato toccato.`);
    return;
  }

  const gia = await prisma.vendita.count({ where: { origine: "demo" } });
  if (gia > 0) {
    console.log(`Ci sono già ${gia} vendite dimostrative: non ne aggiungo altre (usa --pulisci per rifarle).`);
    return;
  }

  const prodotti = await prisma.prodotto.findMany({
    where: { fase: { in: ["approvato", "in_vendita"] } },
    include: { varianti: true },
  });
  if (prodotti.length === 0) {
    console.log("Nessun prodotto in assortimento: prima carica i prodotti (npm run db:seed).");
    return;
  }

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const righe = [];

  prodotti.forEach((p, idx) => {
    const casuale = rng(1000 + idx * 77);
    // Ritmo di base: chi ha priorità alta e prezzo accessibile vende di più.
    const base = 0.35 + (p.priorita || 0) * 0.12 + Math.max(0, (120 - p.prezzoVendita) / 260);
    // Tendenza sul periodo: alcuni salgono, altri si spengono. -0.5 → +0.6.
    const tendenza = -0.5 + ((idx * 37) % 11) / 10;

    for (let g = giorni - 1; g >= 0; g--) {
      const data = new Date(oggi);
      data.setDate(data.getDate() - g);
      const avanzamento = (giorni - g) / giorni; // 0 = inizio periodo, 1 = oggi

      const settimana = data.getDay(); // 0 domenica
      const pesoGiorno = settimana === 0 ? 0.55 : settimana === 6 ? 1.35 : settimana === 5 ? 1.25 : 1;
      // Picchi di stagione: San Valentino, festa della mamma, Natale.
      const mese = data.getMonth();
      const giornoMese = data.getDate();
      const picco =
        (mese === 1 && giornoMese >= 10 && giornoMese <= 14) ||
        (mese === 4 && giornoMese >= 5 && giornoMese <= 11) ||
        (mese === 11 && giornoMese >= 18 && giornoMese <= 24)
          ? 2.6
          : 1;

      const atteso = base * pesoGiorno * picco * (1 + tendenza * avanzamento);
      // Rumore: il venduto giornaliero non è mai liscio.
      const q = Math.max(0, Math.round(atteso + (casuale() - 0.5) * 1.6));
      if (q === 0) continue;

      const variante = p.varianti.length > 0 ? p.varianti[Math.floor(casuale() * p.varianti.length)] : null;
      const prezzo = (p.prezzoVendita || 0) + (variante?.deltaPrezzo || 0);
      righe.push({
        data,
        prodottoId: p.id,
        varianteId: variante?.id ?? null,
        titolo: p.nome,
        sku: variante?.sku ?? p.codice,
        canale: CANALI[Math.floor(casuale() * CANALI.length)],
        quantita: q,
        ricavo: q * prezzo,
        origine: "demo",
        riferimento: `demo#${p.id}#${data.toISOString().slice(0, 10)}`,
      });
    }
  });

  // Qualche riga che non corrisponde a nessun prodotto: succede sul serio
  // (articoli di servizio, prodotti mai anagrafati) e la pagina Vendite le mostra
  // apposta come "da mappare".
  const extra = rng(999);
  const orfani = ["Vaso in ceramica smaltata", "Confezione regalo premium", "Consegna in giornata"];
  for (let g = 0; g < giorni; g += 5) {
    const data = new Date(oggi);
    data.setDate(data.getDate() - g);
    const titolo = orfani[Math.floor(extra() * orfani.length)];
    const q = 1 + Math.floor(extra() * 2);
    righe.push({
      data,
      prodottoId: null,
      varianteId: null,
      titolo,
      sku: null,
      canale: CANALI[Math.floor(extra() * CANALI.length)],
      quantita: q,
      ricavo: q * (12 + Math.floor(extra() * 20)),
      origine: "demo",
      riferimento: `demo#orfano#${data.toISOString().slice(0, 10)}#${titolo}`,
    });
  }

  let inserite = 0;
  for (let i = 0; i < righe.length; i += 500) {
    const esito = await prisma.vendita.createMany({ data: righe.slice(i, i + 500), skipDuplicates: true });
    inserite += esito.count;
  }
  console.log(`Inserite ${inserite} vendite dimostrative su ${prodotti.length} prodotti, ${giorni} giorni.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
