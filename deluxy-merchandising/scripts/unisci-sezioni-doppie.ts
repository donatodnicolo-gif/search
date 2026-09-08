// **Due sezioni che dicono la stessa cosa diventano una.**
//
// L'utente (08/09/2026): «sistema le due sezioni doppie ingredienti, portale ad
// essere una; verifica se ci sono altre sovrapposizioni». Il censimento
// (`scripts/sezioni-sovrapposte.ts`) le ha misurate: su Gifts «Ingredienti» e
// «Ingredienti e Allergeni» convivono su 23 prodotti con testi **identici al
// 100%**, «Allergeni» su 22 con l'87%.
//
// ⚠️ **Si unisce solo dove lo prova il contenuto, non dove si somigliano i
// nomi.** Il censimento segnala anche coppie al 50% — «Dettagli Prodotto ⇄
// Dimensioni», «Dettagli Prodotto ⇄ Perfetto per» — ma lì la somiglianza sono
// le parole comuni della stessa scheda, non lo stesso dato: unirle
// cancellerebbe una sezione vera.
//
// ⚠️ Restano separate anche due coppie che *sembrano* la stessa cosa:
//   · **«Dettagli» e «Dettagli Prodotto»**: sono la stessa idea con due nomi,
//     ma ciascuna categoria usa il suo, e sui siti pubblicati è così che si
//     chiamano — Cake dice «Dettagli», Flowers «Dettagli Prodotto». Uniformarle
//     vorrebbe dire rinominare una tab che il cliente vede già.
//   · **«Dettagli Prodotti»** (al plurale) è il nome vero della sezione di
//     GIFT_BOX: assomiglia a «Dettagli Prodotto» ma non è un errore.
//   · **«Menù» e «Menù Opzionale»** sono due cose diverse per definizione.
//
//   npx tsx scripts/unisci-sezioni-doppie.ts            # prova, non scrive
//   npx tsx scripts/unisci-sezioni-doppie.ts --applica

import { writeFileSync } from "node:fs";
import { caricaEnv } from "./vecchio-gestionale";

const senza = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** chi sparisce → dove finisce il suo testo. Chiavi normalizzate. */
const UNISCI: Record<string, string> = {
  // contenuto identico o quasi, misurato
  "ingredienti": "Ingredienti e Allergeni",
  "allergeni": "Ingredienti e Allergeni",
  "ingredienti generici": "Ingredienti e Allergeni",
  "caratteristiche": "Dettagli",
  "consigli per la consumazione": "Conservazione",
  "regala con deluxy flowers": "Regala con Deluxy",
  // stesso nome scritto in un altro modo
  "regala con deluxy": "Regala con Deluxy",
  "dettagli": "Dettagli",
  "dettagli prodotto": "Dettagli Prodotto",
  "significato": "Significato",
  "significato fiori": "Significato",
  "menu": "Menù",
  "personalizzazione": "Personalizzazione",
  "conservazione": "Conservazione",
  "perfetto per": "Perfetto per",
  "dimensioni": "Dimensioni",
  "come funziona": "Come Funziona",
  "pesi e misure": "Pesi e Misure",
  "occasioni": "Occasioni",
  "cura": "Cura",
  "ingredienti e allergeni": "Ingredienti e Allergeni",
  "dettagli prodotti": "Dettagli Prodotti",
};

/** Un nome in cui è finito dentro il contenuto: «ALLERGENI: B, G, I  C, F». */
function nomeSporco(nome: string): string | null {
  const m = nome.match(/^\s*(allergeni|ingredienti)\s*:/i);
  return m ? "Ingredienti e Allergeni" : null;
}

/** Dove va a finire questa sezione. `null` = resta dov'è. */
function destinazione(nome: string): string | null {
  const sporco = nomeSporco(nome);
  if (sporco) return sporco;
  const d = UNISCI[senza(nome)];
  return d && d !== nome ? d : null;
}

/** Unisce due testi senza ripetere le righe che ci sono già. */
function unisciTesti(a: string, b: string): string {
  const righe: string[] = [];
  const viste = new Set<string>();
  for (const t of [a, b]) {
    for (const r of t.split("\n").map((x) => x.trim())) {
      if (!r) continue;
      const k = senza(r);
      if (viste.has(k)) continue;
      viste.add(k);
      righe.push(r);
    }
  }
  return righe.join("\n").slice(0, 4000);
}

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const prodotti = await prisma.prodotto.findMany({
    select: { id: true, nome: true, codice: true, categoria: true, sezioniScheda: true },
  });

  // ⚠️⚠️ **La destinazione deve esistere per quella categoria su quel sito.**
  // Senza questo controllo la mappa avrebbe rinominato «Allergeni» in
  // «Ingredienti e Allergeni» anche su GASTRONOMIA, dove «Allergeni» è il nome
  // giusto — misurato sulle schede pubblicate — e «Ingredienti e Allergeni» non
  // esiste. E avrebbe unito «Ingredienti» e «Allergeni» su Business Deluxy,
  // che invece li tiene separati apposta. Unire due sezioni è un conto;
  // inventare il nome di una tab che il cliente vede è un altro.
  const definite = await prisma.sezioneCategoria.findMany({ where: { attiva: true }, select: { categoria: true, negozio: true, nome: true } });
  const esiste = (categoria: string, sito: string, nome: string) => {
    const sue = definite.filter((d) => d.categoria === categoria && d.negozio === sito);
    const valide = sue.length ? sue : definite.filter((d) => d.categoria === categoria && !d.negozio);
    return valide.some((d) => senza(d.nome) === senza(nome));
  };

  const cambi: { id: string; scheda: Record<string, Record<string, string>> }[] = [];
  const conta = new Map<string, number>();
  const esempi: string[] = [];
  let sezioniTolte = 0;

  for (const p of prodotti) {
    const s = p.sezioniScheda;
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const scheda = s as Record<string, Record<string, string>>;
    let toccato = false;
    const nuova: Record<string, Record<string, string>> = {};
    for (const [sito, val] of Object.entries(scheda)) {
      if (!val || typeof val !== "object" || Array.isArray(val)) { nuova[sito] = val; continue; }
      const dentro: Record<string, string> = {};
      for (const [nome, testo] of Object.entries(val)) {
        if (typeof testo !== "string") continue;
        const proposta = destinazione(nome);
        // Si sposta solo se la destinazione è una sezione vera di questa
        // categoria su questo sito, **o** se il prodotto ce l'ha già scritta:
        // in quel caso il doppione è nero su bianco.
        const dove = proposta && (esiste(p.categoria, sito, proposta) || Object.keys(val).some((k) => senza(k) === senza(proposta)))
          ? proposta
          : nome;
        if (dove !== nome) {
          toccato = true;
          sezioniTolte++;
          conta.set(`${nome} → ${dove}`, (conta.get(`${nome} → ${dove}`) ?? 0) + 1);
          if (esempi.length < 8) esempi.push(`${(p.codice ?? "").padEnd(14)} ${sito.padEnd(16)} «${nome}» → «${dove}»`);
        }
        dentro[dove] = dentro[dove] ? unisciTesti(dentro[dove], testo) : testo;
      }
      nuova[sito] = dentro;
    }
    if (toccato) cambi.push({ id: p.id, scheda: nuova });
  }

  console.log(`Prodotti con sezioni: ${prodotti.filter((p) => p.sezioniScheda).length} · da sistemare: ${cambi.length} · sezioni riassorbite: ${sezioniTolte}`);
  console.log("\n  cosa confluisce dove:");
  for (const [k, v] of [...conta.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(5)}  ${k}`);
  if (esempi.length) { console.log("\n  esempi:"); for (const e of esempi) console.log("   " + e); }

  // le definizioni che restano senza uso
  const def = await prisma.sezioneCategoria.findMany({ where: { attiva: true }, select: { id: true, categoria: true, negozio: true, nome: true } });
  const daSpegnere = def.filter((d) => { const t = destinazione(d.nome); return t && esiste(d.categoria, d.negozio ?? "", t); });
  console.log(`\n  definizioni di sezione da disattivare: ${daSpegnere.length}`);
  for (const d of daSpegnere.slice(0, 12)) console.log(`   ${(d.negozio ?? "tutti").padEnd(16)} ${d.categoria.padEnd(14)} «${d.nome}» → «${destinazione(d.nome)}»`);

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }

  const file = `docs/sezioni-prima-di-unire-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify(prodotti.filter((p) => cambi.some((c) => c.id === p.id)), null, 1), "utf8");
  console.log(`\nCopia di sicurezza: ${file}`);

  let n = 0;
  for (let i = 0; i < cambi.length; i += 100) {
    const blocco = cambi.slice(i, i + 100);
    await prisma.$transaction(blocco.map((c) => prisma.prodotto.update({ where: { id: c.id }, data: { sezioniScheda: c.scheda } })));
    n += blocco.length;
  }
  console.log(`Sistemati ${n} prodotti.`);
  if (daSpegnere.length) {
    await prisma.sezioneCategoria.updateMany({ where: { id: { in: daSpegnere.map((d) => d.id) } }, data: { attiva: false } });
    console.log(`Disattivate ${daSpegnere.length} definizioni doppie.`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
