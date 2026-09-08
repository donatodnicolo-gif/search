// Prova vera del riempimento AI delle sezioni, su un prodotto del catalogo.
// Chiama la rotta come farebbe il modulo e stampa quello che tornerebbe nei
// campi. **Non salva niente**: serve a vedere se il testo regge prima di
// fidarsi del bottone.
//
//   npx tsx scripts/prova-ai-sezioni.ts                 # sceglie un prodotto con dei dati
//   npx tsx scripts/prova-ai-sezioni.ts CODICE          # un prodotto preciso
//   npx tsx scripts/prova-ai-sezioni.ts CODICE --locale # contro il server di sviluppo

import { createHash } from "node:crypto";
import { caricaEnv } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { sezioniDelSito } = await import("../src/lib/descrizione-shopify");
  const codice = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
  const base = process.argv.includes("--locale") ? "http://localhost:3120" : "https://deluxy-merchandising.vercel.app";

  const p = codice
    ? await prisma.prodotto.findFirst({ where: { codice }, include: { varianti: true, pubblicazioni: true } })
    : await prisma.prodotto.findFirst({
        where: { categoria: { not: "DA_CLASSIFICARE" }, note: { not: null }, pubblicazioni: { some: { shopifyId: { not: null } } } },
        include: { varianti: true, pubblicazioni: true },
      });
  if (!p) { console.log("prodotto non trovato"); await prisma.$disconnect(); return; }

  const sito = p.pubblicazioni.find((x) => x.shopifyId)?.negozio ?? p.negozioNome ?? "Gifts";
  const definite = await prisma.sezioneCategoria.findMany({
    where: { attiva: true, categoria: p.categoria },
    select: { categoria: true, negozio: true, nome: true, tipo: true, ordine: true },
  });
  const suoi = sezioniDelSito(definite, p.categoria, sito).sort((a, b) => a.ordine - b.ordine);
  const scheda = (p.sezioniScheda && typeof p.sezioniScheda === "object" && !Array.isArray(p.sezioniScheda)
    ? (p.sezioniScheda as Record<string, Record<string, string>>)[sito] ?? {}
    : {}) as Record<string, string>;

  console.log(`Prodotto : ${p.nome}  (${p.codice})`);
  console.log(`Categoria: ${p.categoria}   Sito: ${sito}`);
  console.log(`Materiali: ${p.materiali ?? "—"}`);
  console.log(`Note     : ${(p.note ?? "—").slice(0, 100)}`);
  console.log(`Sezioni previste (${suoi.length}): ${suoi.map((s) => `${s.nome}${scheda[s.nome]?.trim() ? " [già piena]" : ""}`).join(" · ")}`);

  const pw = process.env.MERCHANDISING_APP_PASSWORD ?? "";
  const cookie = `mrc_session=${createHash("sha256").update(`deluxy-merchandising::${pw}`).digest("hex")}`;
  const t0 = Date.now();
  const res = await fetch(`${base}/api/ai/sezioni`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      nome: p.nome,
      categoria: p.categoria,
      sito,
      materiali: p.materiali ?? "",
      note: p.note ?? "",
      prezzo: String(p.prezzoVendita ?? ""),
      descrizione: p.descrizione ?? "",
      varianti: p.varianti.map((v) => v.nome),
      sezioni: suoi.map((s) => ({ nome: s.nome, tipo: s.tipo })),
      gia: scheda,
    }),
  });
  const dati = (await res.json()) as { ok: boolean; sezioni?: Record<string, string>; saltate?: string[]; errore?: string; modello?: string };
  console.log(`\nrisposta: ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s${dati.modello ? ` · ${dati.modello}` : ""}`);
  if (!dati.ok) { console.log(`errore: ${dati.errore}`); await prisma.$disconnect(); return; }
  for (const [nome, testo] of Object.entries(dati.sezioni ?? {})) {
    console.log(`\n─── ${nome}`);
    console.log(testo);
  }
  if (dati.saltate?.length) console.log(`\n⚠️ lasciate vuote (niente dati per scriverle senza inventare): ${dati.saltate.join(", ")}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
