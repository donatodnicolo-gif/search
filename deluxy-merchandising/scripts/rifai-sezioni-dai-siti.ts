// **Rifà le sezioni per categoria e sito leggendole dalle schede pubblicate.**
//
// L'utente (08/09/2026): «le sezioni per categoria e sito sono sbagliate,
// controlla con vecchio database e precedenti prodotti già pubblicati».
//
// ⚠️ **Perché quelle di prima erano sbagliate**: venivano dal vecchio
// gestionale, mappato a mano dalle sue 63 categorie alle nostre 18. Era una
// deduzione, e per giunta **senza il sito**: le sezioni erano quasi tutte
// «comuni a tutti i negozi». Misurando le schede vere si vede che non è così —
// sulle torte, **Cake** usa «Ingredienti e Allergeni» unito, **Business Deluxy**
// li tiene separati («Ingredienti» + «Allergeni») e chiude con «Regala con
// Deluxy» che su Cake non c'è. Sono due racconti diversi dello stesso prodotto.
//
// **La regola**: per ogni coppia sito × categoria con almeno 5 schede lette, una
// sezione entra se compare in **almeno metà** delle schede. Sotto quella soglia
// è una scelta di un singolo prodotto, non una sezione della categoria. Della
// grafia vince quella più usata («Dettagli» batte «DETTAGLI» se è più
// frequente), e l'ordine è quello medio in cui compaiono sulle schede — è
// l'ordine che il cliente già conosce.
//
// ⚠️ Non cancella niente: le sezioni che non trovano conferma vengono
// **disattivate** (`attiva = false`), così i valori già scritti restano al loro
// posto e si possono riaccendere.
//
//   npx tsx scripts/rifai-sezioni-dai-siti.ts            # prova, non scrive
//   npx tsx scripts/rifai-sezioni-dai-siti.ts --applica

import { caricaEnv } from "./vecchio-gestionale";

const QUANTI = 150;
const senzaAccenti = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Il tipo si deduce da come è scritto il contenuto sulle schede vere. */
function tipoDa(campioni: string[]): string {
  const conPiuRighe = campioni.filter((t) => t.split("\n").filter(Boolean).length > 1).length;
  const conDuePunti = campioni.filter((t) => /^[^\n:]{1,28}:/m.test(t)).length;
  if (conDuePunti > campioni.length / 2) return "coppie";
  if (conPiuRighe > campioni.length / 2) return "elenco";
  return "testo";
}

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { spezzaDescrizioneHtml } = await import("../src/lib/descrizione-shopify");
  const applica = process.argv.includes("--applica");

  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { nome: true, dominio: true } });

  type Voce = { volte: number; grafie: Map<string, number>; posizioni: number[]; testi: string[] };
  const dati = new Map<string, Map<string, { schede: number; sezioni: Map<string, Voce> }>>();

  for (const n of negozi) {
    const righe = await prisma.pubblicazioneNegozio.findMany({
      where: { negozio: n.nome, statoShopify: "ACTIVE", handle: { not: null } },
      select: { handle: true, prodotto: { select: { categoria: true } } },
      take: QUANTI,
    });
    for (const r of righe) {
      const cat = r.prodotto?.categoria;
      if (!cat || cat === "DA_CLASSIFICARE") continue;
      let html = "";
      try {
        const res = await fetch(`https://${n.dominio}/products/${r.handle}.js`);
        if (!res.ok) continue;
        html = ((await res.json()) as { description?: string }).description ?? "";
      } catch { continue; }
      if (!html.trim()) continue;
      const perSito = dati.get(n.nome) ?? new Map();
      const perCat = perSito.get(cat) ?? { schede: 0, sezioni: new Map<string, Voce>() };
      perCat.schede++;
      spezzaDescrizioneHtml(html).sezioni.forEach((s, i) => {
        const k = senzaAccenti(s.nome);
        const v = perCat.sezioni.get(k) ?? { volte: 0, grafie: new Map<string, number>(), posizioni: [], testi: [] };
        v.volte++;
        v.grafie.set(s.nome.trim(), (v.grafie.get(s.nome.trim()) ?? 0) + 1);
        v.posizioni.push(i);
        if (v.testi.length < 20) v.testi.push(s.testo);
        perCat.sezioni.set(k, v);
      });
      perSito.set(cat, perCat);
      dati.set(n.nome, perSito);
    }
    console.log(`${n.nome} letto`);
  }

  const daCreare: { categoria: string; negozio: string; nome: string; tipo: string; ordine: number; richiesta: boolean }[] = [];
  console.log("\n══════ COSA DICONO LE SCHEDE PUBBLICATE ══════");
  for (const [sito, perSito] of dati) {
    for (const [cat, { schede, sezioni }] of perSito) {
      if (schede < 5) continue;
      const soglia = Math.ceil(schede / 2);
      const tenute = [...sezioni.entries()]
        .filter(([, v]) => v.volte >= soglia)
        .map(([, v]) => {
          const grafia = [...v.grafie.entries()].sort((a, b) => b[1] - a[1])[0][0];
          const media = v.posizioni.reduce((a, b) => a + b, 0) / v.posizioni.length;
          return { nome: grafia, volte: v.volte, media, tipo: tipoDa(v.testi) };
        })
        .sort((a, b) => a.media - b.media);
      if (!tenute.length) continue;
      console.log(`\n── ${sito} · ${cat}  (${schede} schede, soglia ${soglia})`);
      for (const t of tenute) console.log(`   ${String(t.volte).padStart(4)}/${schede}  ${t.nome.padEnd(28)} ${t.tipo}`);
      tenute.forEach((t, i) => {
        daCreare.push({ categoria: cat, negozio: sito, nome: t.nome, tipo: t.tipo, ordine: i, richiesta: t.volte >= schede * 0.9 });
      });
    }
  }

  const vecchie = await prisma.sezioneCategoria.findMany({ select: { id: true, categoria: true, negozio: true, nome: true, attiva: true } });
  // ⚠️⚠️ **Si AGGIUNGE, non si sostituisce.** La prima stesura spegneva tutto
  // ciò che le schede non confermavano: 63 sezioni via, 23 rimaste, e le
  // categorie con pochi prodotti online (BOUQUET, COMPOSIZIONE, GIFT_BOX,
  // ACCESSORIO…) sarebbero rimaste **senza nessuna sezione** — coi valori già
  // importati diventati invisibili. L'assenza di prove non è la prova di
  // un'assenza: quelle categorie hanno pochi prodotti pubblicati, non nessuna
  // sezione.
  // Quindi: le sezioni **del sito** che le schede confermano si creano o si
  // aggiornano, e vincono su quelle comuni (è la regola che il modulo applica
  // già); le comuni **restano** come ripiego per tutto il resto. Si spegne solo
  // una sezione DI QUEL SITO che le sue stesse schede smentiscono.
  const coppieMisurate = new Set(daCreare.map((x) => `${x.categoria}|${x.negozio}`));
  const nuoveChiavi = new Set(daCreare.map((x) => `${x.categoria}|${x.negozio}|${senzaAccenti(x.nome)}`));
  const daSpegnere = vecchie.filter(
    (v) => v.attiva && v.negozio && coppieMisurate.has(`${v.categoria}|${v.negozio}`) && !nuoveChiavi.has(`${v.categoria}|${v.negozio}|${senzaAccenti(v.nome)}`)
  );

  console.log(`\n══════ RIEPILOGO ══════`);
  console.log(`  sezioni confermate dalle schede : ${daCreare.length}  (su ${new Set(daCreare.map((x) => `${x.negozio}·${x.categoria}`)).size} coppie sito × categoria)`);
  console.log(`  sezioni che avevamo, attive     : ${vecchie.filter((v) => v.attiva).length}`);
  console.log(`  ➖ da disattivare (solo sezioni DI QUEL SITO che le sue schede smentiscono): ${daSpegnere.length}`);
  console.log(`  ↩︎ le comuni restano come ripiego dove non ci sono prove`);
  for (const v of daSpegnere.slice(0, 14)) console.log(`       ${(v.negozio ?? "tutti").padEnd(16)} ${v.categoria.padEnd(14)} ${v.nome}`);
  if (daSpegnere.length > 14) console.log(`       … e altre ${daSpegnere.length - 14}`);

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }

  // Le vecchie non confermate si spengono, non si cancellano: i valori già
  // scritti restano dove sono e la sezione si può riaccendere.
  if (daSpegnere.length) {
    await prisma.sezioneCategoria.updateMany({ where: { id: { in: daSpegnere.map((v) => v.id) } }, data: { attiva: false } });
  }
  let create = 0, riaccese = 0;
  for (const s of daCreare) {
    const gia = vecchie.find((v) => v.categoria === s.categoria && v.negozio === s.negozio && senzaAccenti(v.nome) === senzaAccenti(s.nome));
    if (gia) {
      await prisma.sezioneCategoria.update({ where: { id: gia.id }, data: { attiva: true, tipo: s.tipo, ordine: s.ordine, richiesta: s.richiesta, nome: s.nome } });
      riaccese++;
    } else {
      await prisma.sezioneCategoria.create({ data: { ...s, attiva: true } });
      create++;
    }
  }
  console.log(`\nCreate ${create} · aggiornate ${riaccese} · disattivate ${daSpegnere.length}. Attive ora: ${await prisma.sezioneCategoria.count({ where: { attiva: true } })}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
