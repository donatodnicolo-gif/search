// **Porta qui il nome alternativo del vecchio gestionale.**
//
// Chiesto dall'utente l'08/09/2026: «metti un campo anche per inserire un nome
// visibile ai partner da flaggare nel caso il nome al pubblico sia diverso dal
// nome da far vedere ai partner». Di là la coppia esisteva già —
// `alternateProductName` col suo `isAlternateProductName` — ed è la stessa
// idea: il nome commerciale racconta, quello di lavorazione dice cosa mettere
// nella scatola.
//
// ⚠️ Si importa **solo dove la spunta di là è accesa** (`isAlternateProductName
// = 1`) e il nome c'è: un campo pieno con la spunta spenta è un valore rimasto
// lì, non una decisione. Stessa regola che abbiamo messo nel modulo.
//
// Non sovrascrive un nome già scritto qui: si può rilanciare.
//
//   npx tsx scripts/importa-nome-partner.ts            # prova, non scrive
//   npx tsx scripts/importa-nome-partner.ts --applica

import { caricaEnv, leggiTabella, normalizza, pulisci } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const vecchi = await leggiTabella("product", ["name", "sku", "alternateProductName", "isAlternateProductName"]);
  const conNome = vecchi.filter((r) => r.isAlternateProductName === "1" && (r.alternateProductName ?? "").trim().length > 1);
  const spuntaSenzaNome = vecchi.filter((r) => r.isAlternateProductName === "1" && !(r.alternateProductName ?? "").trim()).length;
  const nomeSenzaSpunta = vecchi.filter((r) => r.isAlternateProductName !== "1" && (r.alternateProductName ?? "").trim().length > 1).length;
  console.log(`Prodotti di là: ${vecchi.length} · con spunta accesa e nome: ${conNome.length}`);
  console.log(`  spunta accesa ma nome vuoto: ${spuntaSenzaNome} · nome scritto ma spunta spenta (NON importati): ${nomeSenzaSpunta}`);

  const nostri = await prisma.prodotto.findMany({
    select: { id: true, nome: true, codice: true, nomePartner: true, varianti: { select: { sku: true } } },
  });
  const perSku = new Map<string, string[]>();
  const perNome = new Map<string, string[]>();
  const agg = (m: Map<string, string[]>, k: string, id: string) => { if (k) m.set(k, [...(m.get(k) ?? []), id]); };
  for (const p of nostri) {
    agg(perSku, (p.codice ?? "").trim().toUpperCase(), p.id);
    for (const v of p.varianti) agg(perSku, (v.sku ?? "").trim().toUpperCase(), p.id);
    agg(perNome, normalizza(p.nome), p.id);
  }
  const gia = new Map(nostri.map((p) => [p.id, p.nomePartner]));
  const nostroPerId = new Map(nostri.map((p) => [p.id, p]));

  const daScrivere = new Map<string, string>();
  let ambigui = 0, assenti = 0, giaScritti = 0, uguali = 0;
  for (const r of conNome) {
    const testo = pulisci(r.alternateProductName as string).replace(/\n/g, " ").slice(0, 200);
    const chiavi = (r.sku ?? "").split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    let ids: string[] | undefined;
    for (const k of chiavi) { const t = perSku.get(k); if (t) { ids = t; break; } }
    if (!ids) ids = perNome.get(normalizza(r.name ?? ""));
    if (!ids) { assenti++; continue; }
    const unici = [...new Set(ids)];
    if (unici.length > 1) { ambigui++; continue; }
    const id = unici[0];
    if ((gia.get(id) ?? "").trim()) { giaScritti++; continue; }
    // Un «nome alternativo» identico al nome pubblico non è un'alternativa.
    if (normalizza(nostroPerId.get(id)?.nome ?? "") === normalizza(testo)) { uguali++; continue; }
    daScrivere.set(id, testo);
  }

  console.log([
    "",
    `  già scritti qui (saltati) ${String(giaScritti).padStart(5)}`,
    `  uguali al nome pubblico   ${String(uguali).padStart(5)}`,
    `  nomi ambigui (saltati)    ${String(ambigui).padStart(5)}`,
    `  non ritrovati qui         ${String(assenti).padStart(5)}`,
    "  ------------------------------",
    `  DA SCRIVERE               ${String(daScrivere.size).padStart(5)}`,
  ].join("\n"));

  for (const [id, testo] of [...daScrivere.entries()].slice(0, 8)) {
    const p = nostroPerId.get(id);
    if (p) console.log(`   ${(p.codice ?? "").padEnd(12)} pubblico «${p.nome.slice(0, 30)}» → partner «${testo.slice(0, 40)}»`);
  }

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }
  const voci = [...daScrivere.entries()];
  let n = 0;
  for (let i = 0; i < voci.length; i += 100) {
    const blocco = voci.slice(i, i + 100);
    await prisma.$transaction(blocco.map(([id, testo]) => prisma.prodotto.update({ where: { id }, data: { nomePartner: testo, nomePartnerAttivo: true } })));
    n += blocco.length;
  }
  console.log(`\nScritti ${n} nomi per i partner.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
