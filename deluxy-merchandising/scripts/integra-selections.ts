// **I «… - Selections» diventano una voce del prodotto padre, e poi si archiviano.**
//
// Deciso dall'utente l'08/09/2026: «tutti i prodotti selections devono essere
// integrati nel prodotto a cui il nome li collega con valore Aggiunte a
// Pagamento» e, alla domanda se dopo restino o spariscano, «Sparisce».
//
// ⚠️ **Non si cancella: si ARCHIVIA.** L'utente aveva detto «sparisce», e la
// prova a vuoto ha cambiato la risposta: **58 di quei 60 hanno vendite** — 178
// righe, 179 pezzi, 1.554,17 €, l'ultima del 06/09/2026, due giorni prima.
// Cancellandole, `Vendita.prodottoId` va a `null` (è `onDelete: SetNull`) e 178
// righe di venduto restano nei conti senza sapere più a cosa appartengono.
// Archiviare le fa sparire dall'elenco lo stesso, e il venduto resta attaccato.
// Deciso con l'utente l'08/09/2026.
//
// Le altre cautele:
//   · si tocca **solo chi ha UN padre solo** (il nome senza «- Selections»
//     corrisponde a un prodotto e uno soltanto). Gli altri si elencano e basta:
//     «Sacher» trova sette padri, e sceglierne uno a caso vorrebbe dire
//     attaccare un dolce da 5 € alla torta sbagliata;
//   · prima di toccare si **esporta tutto** in `docs/selections-archiviati-<data>.json`;
//   · **chi sta su un negozio non si tocca**: là il cliente lo vede, e toglierlo
//     dal nostro elenco senza toglierlo dal sito creerebbe due verità.
//
//   npx tsx scripts/integra-selections.ts            # prova, non scrive
//   npx tsx scripts/integra-selections.ts --applica

import { writeFileSync } from "node:fs";
import { caricaEnv } from "./vecchio-gestionale";

const SEZIONE = "Aggiunte a Pagamento";

const normalizza = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function radice(nome: string): string | null {
  const m = nome.match(/^(.*?)\s*[-–—]\s*selections?\s*$/i);
  return m && m[1].trim() ? m[1].trim() : null;
}

const euro = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const tutti = await prisma.prodotto.findMany({
    select: {
      id: true, nome: true, codice: true, categoria: true, prezzoVendita: true, negozioNome: true,
      sezioniScheda: true,
      pubblicazioni: { select: { negozio: true, shopifyId: true } },
      varianti: { select: { id: true } },
      _count: { select: { vendite: true, media: true, tappe: true } },
    },
  });
  const sel = tutti.filter((p) => radice(p.nome));
  const padri = new Map<string, typeof tutti>();
  for (const p of tutti) {
    if (radice(p.nome)) continue;
    const k = normalizza(p.nome);
    padri.set(k, [...(padri.get(k) ?? []), p]);
  }

  type Lavoro = { figlio: (typeof tutti)[number]; padre: (typeof tutti)[number] };
  const daFare: Lavoro[] = [];
  const ambigui: string[] = [];
  const senzaPadre: string[] = [];
  const daNonToccare: string[] = [];

  for (const f of sel) {
    const r = radice(f.nome) as string;
    const cand = padri.get(normalizza(r)) ?? [];
    if (!cand.length) { senzaPadre.push(`${f.codice} — ${f.nome}`); continue; }
    if (cand.length > 1) { ambigui.push(`${f.codice} — ${f.nome}  (${cand.length} padri: ${cand.slice(0, 3).map((c) => c.codice).join(", ")}…)`); continue; }
    // ⚠️ Chi sta **su un negozio** resta fuori anche dall'archiviazione: là il
    // cliente lo vede, e toglierlo dal nostro elenco senza toglierlo dal sito
    // creerebbe due verità. Le vendite invece non sono più un ostacolo: si
    // archivia, non si cancella, e restano attaccate.
    if (f.pubblicazioni.some((x) => x.shopifyId)) {
      daNonToccare.push(`${f.codice} — ${f.nome}  (pubblicato su ${f.pubblicazioni.filter((x) => x.shopifyId).length} negozi)`);
      continue;
    }
    daFare.push({ figlio: f, padre: cand[0] });
  }

  console.log([
    `Prodotti «- Selections»: ${sel.length}`,
    `  da integrare e archiviare  ${String(daFare.length).padStart(4)}`,
    `  con più padri (fermi)      ${String(ambigui.length).padStart(4)}`,
    `  senza padre (fermi)        ${String(senzaPadre.length).padStart(4)}`,
    `  pubblicati su un negozio (fermi)   ${String(daNonToccare.length).padStart(4)}`,
  ].join("\n"));

  // Cosa finirebbe scritto sul padre
  const perPadre = new Map<string, { padre: (typeof tutti)[number]; voci: string[] }>();
  for (const l of daFare) {
    const v = perPadre.get(l.padre.id) ?? { padre: l.padre, voci: [] };
    v.voci.push(`${radice(l.figlio.nome)}: ${euro(l.figlio.prezzoVendita)}`);
    perPadre.set(l.padre.id, v);
  }
  console.log(`\n  padri toccati: ${perPadre.size}`);
  for (const { padre, voci } of [...perPadre.values()].slice(0, 8)) {
    console.log(`   ${(padre.codice ?? "").padEnd(14)} ${padre.nome.slice(0, 30).padEnd(30)} ← ${voci.join(" · ")}`);
  }
  if (ambigui.length) { console.log("\n  ⚠️ con più padri, NON toccati:"); for (const a of ambigui.slice(0, 25)) console.log("   " + a); }
  if (senzaPadre.length) { console.log("\n  ⚠️ senza padre, NON toccati:"); for (const a of senzaPadre) console.log("   " + a); }
  if (daNonToccare.length) { console.log("\n  ⚠️ con vendite o su un negozio, NON toccati:"); for (const a of daNonToccare) console.log("   " + a); }

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }

  // 1. La copia su file, PRIMA di toccare qualcosa.
  const copia = daFare.map((l) => ({ ...l.figlio, padre: { id: l.padre.id, codice: l.padre.codice, nome: l.padre.nome } }));
  const file = `docs/selections-archiviati-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify(copia, null, 1), "utf8");
  console.log(`\nCopia di sicurezza: ${file} (${copia.length} schede)`);

  // 2. La sezione «Aggiunte a Pagamento» deve esistere per le categorie dei padri.
  const categorie = [...new Set([...perPadre.values()].map((x) => x.padre.categoria))];
  const gia = await prisma.sezioneCategoria.findMany({ where: { nome: SEZIONE }, select: { categoria: true, negozio: true } });
  const nuove = categorie
    .filter((c) => !gia.some((g) => g.categoria === c && !g.negozio))
    .map((categoria) => ({ categoria, negozio: null, nome: SEZIONE, tipo: "coppie", richiesta: false, ordine: 90, attiva: true }));
  if (nuove.length) await prisma.sezioneCategoria.createMany({ data: nuove });
  console.log(`Sezione «${SEZIONE}» creata per ${nuove.length} categorie.`);

  // 3. La voce sul padre, sito per sito (dove il padre sta).
  let scritti = 0;
  for (const { padre, voci } of perPadre.values()) {
    const gia = (padre.sezioniScheda && typeof padre.sezioniScheda === "object" && !Array.isArray(padre.sezioniScheda)
      ? (padre.sezioniScheda as Record<string, Record<string, string>>)
      : {});
    const siti = [...new Set(padre.pubblicazioni.filter((x) => x.shopifyId).map((x) => x.negozio))];
    const dove = siti.length ? siti : padre.negozioNome ? [padre.negozioNome] : Object.keys(gia);
    if (!dove.length) continue;
    const scheda = { ...gia };
    for (const sito of dove) {
      const suo = { ...(scheda[sito] ?? {}) };
      const prima = (suo[SEZIONE] ?? "").split("\n").map((r) => r.trim()).filter(Boolean);
      const insieme = [...new Set([...prima, ...voci])];
      suo[SEZIONE] = insieme.join("\n").slice(0, 4000);
      scheda[sito] = suo;
    }
    await prisma.prodotto.update({ where: { id: padre.id }, data: { sezioniScheda: scheda } });
    scritti++;
  }
  console.log(`Scritta la voce su ${scritti} prodotti padre.`);

  // 4. Solo adesso si archivia. La scheda resta, con le sue vendite; esce
  //    dall'elenco di lavoro perché la fase diventa «archiviato».
  const ids = daFare.map((l) => l.figlio.id);
  const fatti = await prisma.prodotto.updateMany({ where: { id: { in: ids } }, data: { fase: "archiviato" } });
  console.log(`Archiviate ${fatti.count} schede «- Selections» (le vendite restano attaccate).`);
  const restano = (await prisma.prodotto.findMany({ where: { fase: { not: "archiviato" } }, select: { nome: true } })).filter((p) => radice(p.nome)).length;
  console.log(`Ancora attive con «- Selections» nel nome: ${restano}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
