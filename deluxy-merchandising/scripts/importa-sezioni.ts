// **Porta qui le sezioni per categoria del vecchio gestionale.**
//
// Chiesto dall'utente l'08/09/2026 («importa per le varie categorie tutte le
// sezioni — le trovi anche su questo database che ti allego»). La fonte è
// `docs/categorie-vecchio-gestionale.md`, estratto dal dump `localhost.sql`:
// 63 categorie con le loro sezioni, scritte in anni di lavoro. Reinventarle
// sarebbe stato assurdo, e sbagliarne una vuol dire una scheda prodotto che
// non dice quello che il cliente si aspetta.
//
// **Come si mappano**: le categorie del vecchio sistema sono 63 e molto fini
// («CDM Matrimoni», «CDM Laurea»…), le nostre 18 e più larghe. Si aggregano
// per famiglia: tutte le CDM danno le sezioni delle torte, i fiori danno quelle
// dei fiori. Dove due categorie vecchie danno la stessa sezione con nomi
// leggermente diversi («Personalizzazione» e «Personalizzazioni») vince la
// forma più usata: contate nel documento, una per una.
//
// Non tocca le sezioni già presenti: si può rilanciare.
//
//   npx tsx scripts/importa-sezioni.ts            # prova
//   npx tsx scripts/importa-sezioni.ts --applica

import { readFileSync } from "node:fs";

type Sezione = { nome: string; tipo: "testo" | "elenco" | "coppie"; richiesta?: boolean };

/**
 * Le sezioni per ciascuna nostra categoria, ricavate dal vecchio gestionale.
 * L'ordine è quello in cui si compilano e in cui escono nella scheda.
 */
const SEZIONI: Record<string, Sezione[]> = {
  // — Fiori: dal vecchio «Fiori» (Dettagli Prodotto, Significato, Dimensioni,
  //   Perfetto per) e «Rose» (Dettagli Prodotto, Significato, Perfetto per).
  FIORI: [
    { nome: "Dettagli Prodotto", tipo: "testo", richiesta: true },
    { nome: "Come Funziona", tipo: "elenco" },
    { nome: "Significato", tipo: "testo" },
    { nome: "Dimensioni", tipo: "coppie" },
    { nome: "Perfetto per", tipo: "elenco" },
  ],
  BOUQUET: [
    { nome: "Dettagli Prodotto", tipo: "testo", richiesta: true },
    { nome: "Come Funziona", tipo: "elenco" },
    { nome: "Significato", tipo: "testo" },
    { nome: "Dimensioni", tipo: "coppie" },
    { nome: "Perfetto per", tipo: "elenco" },
  ],
  COMPOSIZIONE: [
    { nome: "Dettagli Prodotto", tipo: "testo", richiesta: true },
    { nome: "Dimensioni", tipo: "coppie" },
    { nome: "Cura", tipo: "testo" },
    { nome: "Perfetto per", tipo: "elenco" },
  ],
  // — Piante e ghirlande: dal vecchio «Fiori in Vaso» e «Ghirlande».
  PIANTA: [
    { nome: "Dettagli Prodotto", tipo: "testo", richiesta: true },
    { nome: "Dimensioni", tipo: "coppie" },
    { nome: "Cura", tipo: "testo" },
    { nome: "Perfetto per", tipo: "elenco" },
  ],
  // — Torte e dolci: dalle quindici categorie «CDM …» (Dettagli,
  //   Personalizzazione, Ingredienti e Allergeni, Pesi e Misure, Conservazione)
  //   e da «Torte» / «Dolci».
  TORTE_DOLCI: [
    { nome: "Dettagli", tipo: "testo", richiesta: true },
    { nome: "Personalizzazione", tipo: "elenco" },
    { nome: "Ingredienti e Allergeni", tipo: "testo", richiesta: true },
    { nome: "Pesi e Misure", tipo: "coppie" },
    { nome: "Conservazione", tipo: "elenco" },
  ],
  // — Vini e spirits: dal vecchio «Spirits» (Dettagli Prodotto + Regala con Deluxy).
  //   Le cinque voci fisse le ha misurate l'analisi del 07/09.
  VINI_SPIRITS: [
    { nome: "Dettagli Prodotto", tipo: "coppie", richiesta: true },
    { nome: "Regala con Deluxy", tipo: "testo" },
  ],
  // — Gastronomia: dal vecchio «Colazioni & Brunch», «Break», «Lunch»,
  //   «Degustazioni & Aperitivi» (Menù, Allergeni, Personalizzazione).
  GASTRONOMIA: [
    { nome: "Menù", tipo: "elenco", richiesta: true },
    { nome: "Menù Opzionale", tipo: "elenco" },
    { nome: "Allergeni", tipo: "testo", richiesta: true },
    { nome: "Personalizzazione", tipo: "testo" },
    { nome: "Regala con Deluxy", tipo: "testo" },
  ],
  // — Gift box: dal vecchio «Box Regalo».
  GIFT_BOX: [
    { nome: "Dettagli Prodotti", tipo: "elenco", richiesta: true },
    { nome: "Ingredienti e Allergeni", tipo: "testo" },
    { nome: "Accompagnamento", tipo: "testo" },
    { nome: "Regala con Deluxy", tipo: "testo" },
  ],
  // — Accessori e oggetti: dal vecchio «Borse», «Accessori»,
  //   «Regali personalizzabili».
  ACCESSORIO: [
    { nome: "Dettagli", tipo: "coppie", richiesta: true },
    { nome: "Personalizzazione", tipo: "testo" },
    { nome: "Regala con Deluxy", tipo: "testo" },
  ],
  HOME_FRAGRANCE: [
    { nome: "Dettagli Prodotto", tipo: "coppie", richiesta: true },
    { nome: "Regala con Deluxy", tipo: "testo" },
  ],
  EDIZIONE_LIMITATA: [
    { nome: "Dettagli Prodotto", tipo: "testo", richiesta: true },
    { nome: "Personalizzazione", tipo: "testo" },
    { nome: "Perfetto per", tipo: "elenco" },
  ],
};

/**
 * **Le sezioni del B2B**, che sostituiscono quelle sopra sul negozio Business.
 * Dal vecchio gestionale: «B2B Colazione», «B2B Break», «B2B Lunch», «B2B
 * Aperitivo» hanno tutte Menù, Allergeni, Personalizzazione, **Occasioni** —
 * dove il D2C chiude con «Regala con Deluxy». È la prova che le sezioni vanno
 * per negozio, non solo per categoria.
 */
const SEZIONI_B2B: Record<string, Sezione[]> = {
  GASTRONOMIA: [
    { nome: "Menù", tipo: "elenco", richiesta: true },
    { nome: "Allergeni", tipo: "testo", richiesta: true },
    { nome: "Personalizzazione", tipo: "testo" },
    { nome: "Occasioni", tipo: "elenco" },
  ],
  GIFT_BOX: [
    { nome: "Dettagli Prodotti", tipo: "elenco", richiesta: true },
    { nome: "Ingredienti e Allergeni", tipo: "testo" },
    { nome: "Personalizzazione", tipo: "testo" },
    { nome: "Occasioni", tipo: "elenco" },
  ],
};

const NEGOZIO_B2B = "Business Deluxy";

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const categorie = await prisma.categoriaProdotto.findMany({ select: { chiave: true, nome: true } });
  const esistono = new Set(categorie.map((c) => c.chiave));
  const gia = await prisma.sezioneCategoria.findMany({ select: { categoria: true, negozio: true, nome: true } });
  const chiaveGia = new Set(gia.map((s) => `${s.categoria}|${s.negozio ?? ""}|${s.nome}`));

  const daCreare: { categoria: string; negozio: string | null; nome: string; tipo: string; richiesta: boolean; ordine: number }[] = [];
  const senzaCategoria: string[] = [];
  for (const [categoria, sezioni] of Object.entries(SEZIONI)) {
    if (!esistono.has(categoria)) { senzaCategoria.push(categoria); continue; }
    sezioni.forEach((s, i) => {
      if (chiaveGia.has(`${categoria}||${s.nome}`)) return;
      daCreare.push({ categoria, negozio: null, nome: s.nome, tipo: s.tipo, richiesta: !!s.richiesta, ordine: i });
    });
  }
  for (const [categoria, sezioni] of Object.entries(SEZIONI_B2B)) {
    if (!esistono.has(categoria)) { senzaCategoria.push(categoria); continue; }
    sezioni.forEach((s, i) => {
      if (chiaveGia.has(`${categoria}|${NEGOZIO_B2B}|${s.nome}`)) return;
      daCreare.push({ categoria, negozio: NEGOZIO_B2B, nome: s.nome, tipo: s.tipo, richiesta: !!s.richiesta, ordine: i });
    });
  }

  console.log(`categorie nell'app: ${categorie.length} · sezioni già presenti: ${gia.length} · da creare: ${daCreare.length}`);
  if (senzaCategoria.length) console.log(`⚠️ categorie previste ma assenti nell'app: ${[...new Set(senzaCategoria)].join(", ")}`);
  const perCat: Record<string, string[]> = {};
  for (const s of daCreare) {
    const k = s.negozio ? `${s.categoria} (${s.negozio})` : s.categoria;
    perCat[k] = [...(perCat[k] ?? []), `${s.nome}${s.richiesta ? "*" : ""}`];
  }
  for (const [k, v] of Object.entries(perCat)) console.log(`  ${k.padEnd(30)} → ${v.join(" · ")}`);

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }
  if (daCreare.length) await prisma.sezioneCategoria.createMany({ data: daCreare });
  console.log(`\nCreate ${daCreare.length} sezioni. In totale ora: ${await prisma.sezioneCategoria.count()}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
