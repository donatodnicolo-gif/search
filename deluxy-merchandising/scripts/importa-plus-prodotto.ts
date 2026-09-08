// **Porta qui il «plus del prodotto» del vecchio gestionale.**
//
// Chiesto dall'utente l'08/09/2026: «importa da vecchio database tutti i plus
// del prodotto». Nel dump MySQL (`localhost.sql`) la colonna è
// `product.productAdvantageDesc`: è il primo dei tre punti in cima alla scheda,
// quello che parla di QUEL prodotto. Gli altri due sono del sito e stanno nelle
// impostazioni del negozio.
//
// ⚠️ **Come si riconosce lo stesso prodotto**: prima per **SKU** (la colonna
// `sku` del vecchio gestionale contro `Prodotto.codice` e gli SKU delle
// varianti), poi per **nome esatto normalizzato**. Il nome da solo non è una
// chiave — nel catalogo ci sono omonimi su negozi diversi — quindi un nome che
// corrisponde a più di un prodotto nostro **non viene importato**: si conta e
// si mostra, ma non si indovina. Meglio un plus mancante che un plus di un
// altro prodotto.
//
// Non sovrascrive un plus già scritto qui: si può rilanciare.
//
//   npx tsx scripts/importa-plus-prodotto.ts                 # prova, non scrive
//   npx tsx scripts/importa-plus-prodotto.ts --applica

import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const DUMP = process.argv.find((a) => a.startsWith("--dump="))?.slice(7) ?? "C:/Users/nicol/Downloads/localhost.sql";

type Riga = { name: string; sku: string | null; plus: string | null };

/**
 * Spacchetta una tupla `(...)` di un INSERT MySQL rispettando apici ed escape.
 * Farlo con una regexp sbaglia sul primo testo che contiene una virgola dentro
 * le virgolette — e qui i testi sono descrizioni di prodotto piene di virgole.
 */
function valori(tupla: string): (string | null)[] {
  const out: (string | null)[] = [];
  let i = 0;
  while (i < tupla.length) {
    while (i < tupla.length && (tupla[i] === " " || tupla[i] === ",")) i++;
    if (i >= tupla.length) break;
    if (tupla[i] === "'") {
      i++;
      let s = "";
      while (i < tupla.length) {
        const c = tupla[i];
        if (c === "\\") {
          const n = tupla[i + 1];
          s += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n === "0" ? "" : n;
          i += 2;
          continue;
        }
        if (c === "'") {
          if (tupla[i + 1] === "'") { s += "'"; i += 2; continue; }
          i++;
          break;
        }
        s += c;
        i++;
      }
      out.push(s);
    } else {
      let s = "";
      while (i < tupla.length && tupla[i] !== ",") { s += tupla[i]; i++; }
      const t = s.trim();
      out.push(t === "NULL" ? null : t);
    }
  }
  return out;
}

/** Le tuple di un INSERT multi-riga: `(...),(...),(...);` */
function tuple(coda: string): string[] {
  const out: string[] = [];
  let i = 0, prof = 0, inizio = -1, apici = false;
  while (i < coda.length) {
    const c = coda[i];
    if (apici) {
      if (c === "\\") { i += 2; continue; }
      if (c === "'") apici = false;
      i++;
      continue;
    }
    if (c === "'") { apici = true; i++; continue; }
    if (c === "(") { if (prof === 0) inizio = i + 1; prof++; i++; continue; }
    if (c === ")") { prof--; if (prof === 0 && inizio >= 0) out.push(coda.slice(inizio, i)); i++; continue; }
    i++;
  }
  return out;
}

const normalizza = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * ⚠️ In questo dump l'INSERT è spezzato su più righe: la prima porta l'elenco
 * delle colonne e finisce con `) VALUES`, le tuple stanno nelle righe dopo,
 * fino a quella che chiude con `;`. Cercando le tuple sulla stessa riga
 * dell'intestazione si leggono **zero prodotti** senza nessun errore — che è
 * il modo peggiore di sbagliare: l'import «riesce» e non importa niente.
 */
async function leggiDump(): Promise<Riga[]> {
  const righe: Riga[] = [];
  let colonne: string[] | null = null;
  let dentro = false;
  let buffer = "";
  const svuota = () => {
    if (!buffer || !colonne) { buffer = ""; return; }
    const iName = colonne.indexOf("name");
    const iSku = colonne.indexOf("sku");
    const iPlus = colonne.indexOf("productAdvantageDesc");
    for (const t of tuple(buffer)) {
      const v = valori(t);
      righe.push({ name: String(v[iName] ?? ""), sku: v[iSku] ?? null, plus: v[iPlus] ?? null });
    }
    buffer = "";
  };
  const rl = createInterface({ input: // ⚠️ Il dump dichiara `CHARSET=latin1` sulle tabelle ma i byte sono UTF-8:
// leggendolo in latin1 «specialità» diventa «specialitÃ » e «€» diventa «â¬».
// Si guarda il contenuto, non l'intestazione.
createReadStream(DUMP, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const linea of rl) {
    if (linea.startsWith("INSERT INTO `product` (")) {
      svuota();
      const fine = linea.indexOf(") VALUES");
      if (fine < 0) continue;
      if (!colonne) {
        colonne = linea.slice(linea.indexOf("(") + 1, fine).split(",").map((c) => c.trim().replace(/`/g, ""));
        if (colonne.indexOf("productAdvantageDesc") < 0) throw new Error("colonna productAdvantageDesc assente nell'INSERT");
      }
      dentro = true;
      buffer = linea.slice(fine + 8);
      if (linea.trimEnd().endsWith(";")) { svuota(); dentro = false; }
      continue;
    }
    if (!dentro) continue;
    // Un'altra istruzione: l'INSERT è finito comunque.
    if (/^(INSERT|CREATE|ALTER|DROP|LOCK|UNLOCK|\/\*)/.test(linea)) { svuota(); dentro = false; continue; }
    buffer += "\n" + linea;
    if (linea.trimEnd().endsWith(";")) { svuota(); dentro = false; }
  }
  svuota();
  return righe;
}

/** Il plus è una riga sola: via l'HTML, gli a-capo e gli spazi doppi. */
function pulisci(testo: string): string {
  return testo
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&egrave;/gi, "è").replace(/&agrave;/gi, "à").replace(/&ograve;/gi, "ò")
    .replace(/&igrave;/gi, "ì").replace(/&ugrave;/gi, "ù").replace(/&eacute;/gi, "é")
    .replace(/\s+/g, " ")
    .trim();
}

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

  const vecchi = await leggiDump();
  // ⚠️ **Non tutto quello che c'è nella colonna è un plus.** Fra i valori veri
  // ci sono prove rimaste lì («ciao»), parole sole («chantilly») e residui di
  // compilazione. Un plus finisce **in cima alla scheda che legge il cliente**:
  // meglio un prodotto senza plus che «ciao» sopra un bouquet da 90 €. Soglia:
  // almeno 12 caratteri e almeno due parole. Quelli scartati si contano, così
  // la scelta è visibile e non silenziosa.
  const abbastanza = (t: string) => t.length >= 12 && t.split(/\s+/).filter(Boolean).length >= 2;
  const conTesto = vecchi.filter((r) => r.plus && pulisci(r.plus).length > 1);
  const conPlus = conTesto.filter((r) => abbastanza(pulisci(r.plus as string)));
  const scartatiCorti = conTesto.length - conPlus.length;
  console.log(`Dump: ${vecchi.length} prodotti · con qualcosa scritto nel plus: ${conTesto.length} · troppo corti o una parola sola, scartati: ${scartatiCorti}`);

  const nostri = await prisma.prodotto.findMany({
    select: { id: true, nome: true, codice: true, plusProdotto: true, varianti: { select: { sku: true } } },
  });
  const perSku = new Map<string, string[]>();
  const perNome = new Map<string, string[]>();
  const aggiungi = (m: Map<string, string[]>, k: string, id: string) => { if (!k) return; m.set(k, [...(m.get(k) ?? []), id]); };
  for (const p of nostri) {
    aggiungi(perSku, (p.codice ?? "").trim().toUpperCase(), p.id);
    for (const v of p.varianti) aggiungi(perSku, (v.sku ?? "").trim().toUpperCase(), p.id);
    aggiungi(perNome, normalizza(p.nome), p.id);
  }
  const gia = new Map(nostri.map((p) => [p.id, p.plusProdotto]));

  const daScrivere = new Map<string, string>();
  let perSkuN = 0, perNomeN = 0, ambigui = 0, assenti = 0, giaScritti = 0;
  const esempiAmbigui: string[] = [];
  const esempiAssenti: string[] = [];
  for (const r of conPlus) {
    const testo = pulisci(r.plus as string).slice(0, 140);
    const chiaviSku = (r.sku ?? "").split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    let ids: string[] | undefined;
    let via = "";
    for (const k of chiaviSku) { const t = perSku.get(k); if (t) { ids = t; via = "sku"; break; } }
    if (!ids) { const t = perNome.get(normalizza(r.name)); if (t) { ids = t; via = "nome"; } }
    if (!ids) { assenti++; if (esempiAssenti.length < 5) esempiAssenti.push(`${r.name.slice(0, 40)} (sku ${r.sku ?? "-"})`); continue; }
    const unici = [...new Set(ids)];
    if (unici.length > 1) { ambigui++; if (esempiAmbigui.length < 5) esempiAmbigui.push(`${r.name.slice(0, 40)} → ${unici.length} prodotti`); continue; }
    const id = unici[0];
    if ((gia.get(id) ?? "").trim()) { giaScritti++; continue; }
    if (daScrivere.has(id)) continue;
    daScrivere.set(id, testo);
    if (via === "sku") perSkuN++; else perNomeN++;
  }

  console.log([
    "",
    `  riconosciuti per SKU      ${String(perSkuN).padStart(5)}`,
    `  riconosciuti per nome     ${String(perNomeN).padStart(5)}`,
    `  già scritti qui (saltati) ${String(giaScritti).padStart(5)}`,
    `  nomi ambigui (saltati)    ${String(ambigui).padStart(5)}`,
    `  non ritrovati qui         ${String(assenti).padStart(5)}`,
    "  ------------------------------",
    `  DA SCRIVERE               ${String(daScrivere.size).padStart(5)}`,
  ].join("\n"));
  if (esempiAmbigui.length) console.log("\n  ambigui, esempi:\n   " + esempiAmbigui.join("\n   "));
  if (esempiAssenti.length) console.log("\n  non ritrovati, esempi:\n   " + esempiAssenti.join("\n   "));

  const campione = [...daScrivere.entries()].slice(0, 8);
  if (campione.length) {
    console.log("\n  campione di quello che verrebbe scritto:");
    for (const [id, testo] of campione) {
      const p = nostri.find((x) => x.id === id);
      if (!p) continue;
      console.log(`   ${(p.codice ?? "").padEnd(12)} ${p.nome.slice(0, 32).padEnd(32)} → «${testo.slice(0, 88)}»`);
    }
  }

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }
  let n = 0;
  for (const [id, testo] of daScrivere) {
    await prisma.prodotto.update({ where: { id }, data: { plusProdotto: testo } });
    n++;
  }
  console.log(`\nScritti ${n} plus. In totale ora: ${await prisma.prodotto.count({ where: { plusProdotto: { not: null } } })}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
