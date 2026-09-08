// **Porta qui i valori delle sezioni** scritti nel vecchio gestionale.
//
// Chiesto dall'utente l'08/09/2026: «procedi poi a importare i valori delle
// varie sezioni delle categorie utilizzando i dati del vecchio database».
// Le definizioni erano già arrivate con `importa-sezioni.ts`; questo porta il
// **contenuto**, prodotto per prodotto.
//
// **Come sono fatti i dati di là**:
//   · `product_category.categoryMetaFields` → l'elenco ORDINATO delle sezioni
//     di quella categoria: `[{"fieldName":"Menù","type":"1"}, …]`
//   · `product.productCategoryMetaFields`   → i valori, **nello stesso ordine**
//     e senza nomi: `["2 Tè in filtro…", ".", "Glutine, Latte…", "Ideale per…"]`
//   · `product.productCategory`             → l'id della categoria di là
// I due array si allineano per posizione: è l'unico legame che esiste. Se le
// lunghezze non corrispondono si prende il minimo e si conta la differenza,
// invece di far scorrere i valori di una casella — che vorrebbe dire mettere
// gli allergeni dentro il menù.
//
// ⚠️ **Si scrive solo dove la sezione esiste anche da noi**, con lo stesso nome
// (confronto senza accenti né maiuscole). Le nostre categorie sono 18 e più
// larghe delle 63 di là: «Torte» aveva Ingredienti e Allergeni separati, noi
// abbiamo «Ingredienti e Allergeni». Un valore che non trova la sua sezione
// **non si scrive**: finirebbe in un campo che nessuna schermata mostra, cioè
// sarebbe un dato invisibile. Si contano e si elencano, così si decide se
// aggiungere la sezione.
//
// ⚠️ I valori si scrivono **su ogni sito dove il prodotto è pubblicato**: di là
// le sezioni erano una sola volta per prodotto, non per sito.
//
// Non sovrascrive una sezione già compilata qui: si può rilanciare.
//
//   npx tsx scripts/importa-valori-sezioni.ts            # prova, non scrive
//   npx tsx scripts/importa-valori-sezioni.ts --applica

import { caricaEnv, leggiTabella, normalizza, pulisci } from "./vecchio-gestionale";

/**
 * **I nomi di là che sono i nostri con un altro nome.**
 *
 * Senza questa mappa si perdevano 1.525 valori sulle sole torte: di là
 * «Ingredienti» e «Allergeni» erano due sezioni, da noi sono la sezione unica
 * «Ingredienti e Allergeni». Quando due sezioni di là finiscono nella stessa
 * nostra, i testi si **uniscono** con un a capo e l'etichetta di provenienza —
 * unirli senza dire quale è quale renderebbe illeggibile un elenco di
 * allergeni attaccato a uno di ingredienti.
 *
 * ⚠️ Qui dentro ci va solo ciò che è **la stessa cosa detta diversamente**. Una
 * sezione che di là esisteva e da noi no (VINI_SPIRITS · «Menù») **non si
 * mappa a forza**: si lascia fuori e si conta, così si decide se aggiungerla.
 */
const SINONIMI: Record<string, string> = {
  "ingredienti": "Ingredienti e Allergeni",
  "allergeni": "Ingredienti e Allergeni",
  "ingredienti generici": "Ingredienti e Allergeni",
  "personalizzazioni": "Personalizzazione",
  "caratteristiche": "Dettagli",
  "dettagli prodotti": "Dettagli Prodotto",
  "ideale per": "Perfetto per",
  "personalizzazione disponibile": "Personalizzazione",
  "descrizione": "Dettagli Prodotto",
  "dettagli": "Dettagli Prodotto",
};

/** Un valore che non dice niente: nel vecchio gestionale il posto vuoto è «.» */
const vuoto = (t: string) => {
  const s = t.trim();
  return s === "" || s === "." || s === "-" || s === "n/a" || s.replace(/[.\s-]/g, "") === "";
};

function comeArray(grezzo: string | null): string[] | null {
  if (!grezzo) return null;
  try {
    const v = JSON.parse(grezzo);
    if (!Array.isArray(v)) return null;
    // Alcune righe portano la FORMA (`[{"fieldName":…}]`) invece dei valori:
    // sono categorie salvate senza compilare, non contenuto.
    if (v.some((x) => x && typeof x === "object")) return null;
    return v.map((x) => (x == null ? "" : String(x)));
  } catch {
    return null;
  }
}

function nomiSezioni(grezzo: string | null): string[] | null {
  if (!grezzo) return null;
  try {
    const v = JSON.parse(grezzo);
    if (!Array.isArray(v)) return null;
    return v.map((x) => (x && typeof x === "object" && "fieldName" in x ? String(x.fieldName ?? "") : ""));
  } catch {
    return null;
  }
}

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  // 1. Le sezioni di ogni categoria di là, in ordine.
  const categorieVecchie = await leggiTabella("product_category", ["id", "categoryName", "categoryMetaFields"]);
  const sezioniDiCategoria = new Map<string, string[]>();
  for (const c of categorieVecchie) {
    const nomi = nomiSezioni(c.categoryMetaFields);
    if (nomi && nomi.length) sezioniDiCategoria.set(String(c.id), nomi);
  }
  console.log(`Categorie di là: ${categorieVecchie.length} · con sezioni dichiarate: ${sezioniDiCategoria.size}`);

  // 2. I prodotti di là, coi valori.
  const prodottiVecchi = await leggiTabella("product", ["name", "sku", "productCategory", "productCategoryMetaFields"]);
  console.log(`Prodotti di là: ${prodottiVecchi.length}`);

  // 3. I nostri, e le sezioni che sappiamo mostrare.
  const nostri = await prisma.prodotto.findMany({
    select: {
      id: true, nome: true, codice: true, categoria: true, negozioNome: true, sezioniScheda: true,
      varianti: { select: { sku: true } },
      pubblicazioni: { select: { negozio: true, shopifyId: true } },
    },
  });
  const sezioniNostre = await prisma.sezioneCategoria.findMany({ where: { attiva: true }, select: { categoria: true, negozio: true, nome: true } });
  /** categoria nostra → nome normalizzato → nome esatto come lo scriviamo noi */
  const perCategoria = new Map<string, Map<string, string>>();
  for (const s of sezioniNostre) {
    const m = perCategoria.get(s.categoria) ?? new Map<string, string>();
    m.set(normalizza(s.nome), s.nome);
    perCategoria.set(s.categoria, m);
  }

  const perSku = new Map<string, string[]>();
  const perNome = new Map<string, string[]>();
  const agg = (m: Map<string, string[]>, k: string, id: string) => { if (k) m.set(k, [...(m.get(k) ?? []), id]); };
  for (const p of nostri) {
    agg(perSku, (p.codice ?? "").trim().toUpperCase(), p.id);
    for (const v of p.varianti) agg(perSku, (v.sku ?? "").trim().toUpperCase(), p.id);
    agg(perNome, normalizza(p.nome), p.id);
  }
  const nostroPerId = new Map(nostri.map((p) => [p.id, p]));

  const daScrivere = new Map<string, Record<string, Record<string, string>>>();
  let conValori = 0, senzaCategoria = 0, ambigui = 0, assenti = 0, disallineate = 0;
  let campiScritti = 0, campiVuoti = 0;
  const nonMappate = new Map<string, number>();
  const esempi: string[] = [];

  for (const r of prodottiVecchi) {
    const valori = comeArray(r.productCategoryMetaFields);
    if (!valori || valori.every((v) => vuoto(v))) continue;
    conValori++;
    const nomi = sezioniDiCategoria.get(String(r.productCategory ?? ""));
    if (!nomi) { senzaCategoria++; continue; }
    if (nomi.length !== valori.length) disallineate++;

    const chiaviSku = (r.sku ?? "").split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    let ids: string[] | undefined;
    for (const k of chiaviSku) { const t = perSku.get(k); if (t) { ids = t; break; } }
    if (!ids) ids = perNome.get(normalizza(r.name ?? ""));
    if (!ids) { assenti++; continue; }
    const unici = [...new Set(ids)];
    if (unici.length > 1) { ambigui++; continue; }
    const nostro = nostroPerId.get(unici[0]);
    if (!nostro) continue;

    const mappa = perCategoria.get(nostro.categoria);
    if (!mappa) continue;

    // Dove sta: ogni sito su cui è pubblicato, altrimenti il suo negozio.
    const siti = [...new Set(nostro.pubblicazioni.filter((x) => x.shopifyId).map((x) => x.negozio))];
    const destinazioni = siti.length ? siti : nostro.negozioNome ? [nostro.negozioNome] : [];
    if (!destinazioni.length) continue;

    const gia = (nostro.sezioniScheda && typeof nostro.sezioniScheda === "object" && !Array.isArray(nostro.sezioniScheda)
      ? (nostro.sezioniScheda as Record<string, Record<string, string>>)
      : {});

    const scheda: Record<string, Record<string, string>> = { ...gia };
    let toccato = false;
    for (let i = 0; i < Math.min(nomi.length, valori.length); i++) {
      const nome = (nomi[i] ?? "").trim();
      const valore = pulisci(valori[i] ?? "");
      if (!nome) continue;
      if (vuoto(valore)) { campiVuoti++; continue; }
      const sinonimo = SINONIMI[normalizza(nome)];
      const nostroNome = mappa.get(normalizza(nome)) ?? (sinonimo ? mappa.get(normalizza(sinonimo)) : undefined);
      if (!nostroNome) { nonMappate.set(`${nostro.categoria} · ${nome}`, (nonMappate.get(`${nostro.categoria} · ${nome}`) ?? 0) + 1); continue; }
      // Due sezioni di là nella stessa nostra: i testi si uniscono, con
      // l'etichetta di provenienza, invece di sovrascriversi a vicenda.
      const etichettato = sinonimo && normalizza(sinonimo) !== normalizza(nome) ? `${nome}: ${valore}` : valore;
      for (const sito of destinazioni) {
        const suo = scheda[sito] ?? {};
        const attuale = (suo[nostroNome] ?? "").trim();
        if (attuale && !attuale.startsWith(`${nome}:`) && !sinonimo) continue; // già compilata a mano: non si tocca
        if (attuale && attuale.includes(etichettato)) continue;
        suo[nostroNome] = (attuale ? `${attuale}\n${etichettato}` : etichettato).slice(0, 4000);
        scheda[sito] = suo;
        toccato = true;
        campiScritti++;
      }
      if (esempi.length < 6 && toccato) esempi.push(`${(nostro.codice ?? "").padEnd(12)} ${nostro.nome.slice(0, 28).padEnd(28)} ${destinazioni.join("+").padEnd(18)} ${nostroNome} → «${valore.replace(/\n/g, " ").slice(0, 60)}»`);
    }
    if (toccato) daScrivere.set(nostro.id, scheda);
  }

  console.log([
    "",
    `  prodotti di là con dei valori   ${String(conValori).padStart(6)}`,
    `  categoria di là senza sezioni   ${String(senzaCategoria).padStart(6)}`,
    `  nomi ambigui qui (saltati)      ${String(ambigui).padStart(6)}`,
    `  non ritrovati qui               ${String(assenti).padStart(6)}`,
    `  liste di lunghezza diversa      ${String(disallineate).padStart(6)}  (si prende il minimo)`,
    `  caselle vuote di là             ${String(campiVuoti).padStart(6)}`,
    "  --------------------------------------",
    `  PRODOTTI DA AGGIORNARE          ${String(daScrivere.size).padStart(6)}`,
    `  caselle che verrebbero scritte  ${String(campiScritti).padStart(6)}`,
  ].join("\n"));

  if (nonMappate.size) {
    console.log("\n  sezioni di là senza corrispondenza da noi (NON importate), le più frequenti:");
    for (const [k, v] of [...nonMappate.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${String(v).padStart(5)}  ${k}`);
  }
  if (esempi.length) { console.log("\n  campione:"); for (const e of esempi) console.log("   " + e); }

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }
  // ⚠️ A blocchi, non una riga per volta: 1.667 giri singoli sul pooler
  // condiviso da quattordici app sono un quarto d'ora di connessioni per una
  // scrittura che il database fa in pochi secondi. Cento per transazione: se
  // un blocco fallisce non lascia metà prodotti aggiornati.
  const voci = [...daScrivere.entries()];
  let n = 0;
  for (let i = 0; i < voci.length; i += 100) {
    const blocco = voci.slice(i, i + 100);
    await prisma.$transaction(blocco.map(([id, scheda]) => prisma.prodotto.update({ where: { id }, data: { sezioniScheda: scheda } })));
    n += blocco.length;
    console.log(`  … ${n}/${voci.length}`);
  }
  console.log(`\nAggiornati ${n} prodotti.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
