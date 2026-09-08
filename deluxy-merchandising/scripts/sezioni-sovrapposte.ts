// **Quali sezioni dicono la stessa cosa due volte.**
//
// L'utente (08/09/2026), guardando un padre dei Selections: «sistema le due
// sezioni doppie ingredienti, portale ad essere una; verifica se ci sono altre
// sovrapposizioni». Su «Gruè» convivevano «Ingredienti» e «Ingredienti e
// Allergeni» con lo stesso testo: sulla scheda online sarebbero due tab quasi
// identiche.
//
// Sono venute dagli import di stasera, che hanno preso i nomi delle sezioni
// così come stavano scritti sui negozi — e i negozi, negli anni, le hanno
// chiamate in modi diversi.
//
// Due misure, diverse fra loro:
//   1. **coppie che convivono** sullo stesso prodotto e sullo stesso sito, con
//      quanto si somigliano i testi (parole in comune);
//   2. **nomi che sembrano sinonimi** (uno contenuto nell'altro, o uguali a
//      meno di accenti e maiuscole) anche quando non convivono.
// Non scrive niente.
//
//   npx tsx scripts/sezioni-sovrapposte.ts

import { caricaEnv } from "./vecchio-gestionale";

const senza = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const parole = (s: string) =>
  new Set(senza(s).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3));

/** Quanto due testi si somigliano: quota delle parole del più corto presenti nell'altro. */
function somiglianza(a: string, b: string): number {
  const A = parole(a), B = parole(b);
  if (!A.size || !B.size) return 0;
  const [piccolo, grande] = A.size <= B.size ? [A, B] : [B, A];
  let comuni = 0;
  for (const w of piccolo) if (grande.has(w)) comuni++;
  return comuni / piccolo.size;
}

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");

  const prodotti = await prisma.prodotto.findMany({
    where: { fase: { not: "archiviato" } },
    select: { id: true, nome: true, codice: true, categoria: true, sezioniScheda: true },
  });

  /** "sito|A|B" → quante volte convivono, e quanto si somigliano in media */
  const coppie = new Map<string, { volte: number; somma: number; esempio: string }>();
  /** nome → quante volte compare */
  const nomi = new Map<string, number>();

  for (const p of prodotti) {
    const s = p.sezioniScheda;
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    for (const [sito, val] of Object.entries(s as Record<string, unknown>)) {
      if (!val || typeof val !== "object" || Array.isArray(val)) continue;
      const voci = Object.entries(val as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string" && (v as string).trim())
        .map(([k, v]) => [k, v as string] as const);
      for (const [k] of voci) nomi.set(k, (nomi.get(k) ?? 0) + 1);
      for (let i = 0; i < voci.length; i++) {
        for (let j = i + 1; j < voci.length; j++) {
          const [a, ta] = voci[i], [b, tb] = voci[j];
          const sim = somiglianza(ta, tb);
          if (sim < 0.5) continue;
          const chiave = `${sito}|${[a, b].sort().join("  ⇄  ")}`;
          const g = coppie.get(chiave) ?? { volte: 0, somma: 0, esempio: "" };
          g.volte++; g.somma += sim;
          if (!g.esempio) g.esempio = `${p.codice} — ${p.nome}`;
          coppie.set(chiave, g);
        }
      }
    }
  }

  console.log(`Prodotti letti: ${prodotti.length} · nomi di sezione diversi in uso: ${nomi.size}`);

  console.log("\n══ 1. COPPIE CHE DICONO LA STESSA COSA (stesso prodotto, stesso sito) ══");
  const ordinate = [...coppie.entries()].filter(([, g]) => g.volte >= 3).sort((a, b) => b[1].volte - a[1].volte);
  if (!ordinate.length) console.log("   nessuna");
  for (const [k, g] of ordinate.slice(0, 20)) {
    const [sito, nomiCoppia] = k.split("|");
    console.log(`   ${String(g.volte).padStart(4)} prodotti  ${(g.somma / g.volte * 100).toFixed(0).padStart(3)}% uguali   ${sito.padEnd(16)} ${nomiCoppia}`);
    console.log(`        es. ${g.esempio}`);
  }

  console.log("\n══ 2. NOMI CHE SEMBRANO SINONIMI ══");
  const elenco = [...nomi.entries()].sort((a, b) => b[1] - a[1]);
  const visti = new Set<string>();
  for (const [a, va] of elenco) {
    for (const [b, vb] of elenco) {
      if (a === b) continue;
      const A = senza(a), B = senza(b);
      const chiave = [a, b].sort().join("|");
      if (visti.has(chiave)) continue;
      if (A === B || A.includes(B) || B.includes(A)) {
        visti.add(chiave);
        console.log(`   «${a}» (${va})   ⇄   «${b}» (${vb})`);
      }
    }
  }

  console.log("\n══ 3. LE SEZIONI DEFINITE, per categoria e sito ══");
  const def = await prisma.sezioneCategoria.findMany({ where: { attiva: true }, orderBy: [{ categoria: "asc" }, { ordine: "asc" }], select: { categoria: true, negozio: true, nome: true } });
  const perCat = new Map<string, string[]>();
  for (const d of def) {
    const k = d.negozio ? `${d.categoria} (${d.negozio})` : d.categoria;
    perCat.set(k, [...(perCat.get(k) ?? []), d.nome]);
  }
  for (const [k, v] of perCat) {
    const doppi = v.filter((x, i) => v.some((y, j) => i !== j && (senza(x).includes(senza(y)) || senza(y).includes(senza(x)))));
    if (doppi.length) console.log(`   ⚠️ ${k.padEnd(32)} ${[...new Set(doppi)].join(" ⇄ ")}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
