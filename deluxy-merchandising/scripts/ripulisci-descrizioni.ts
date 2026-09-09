// **Il campo «descrizione» torna a essere il solo testo libero.**
//
// L'utente (09/09/2026), guardando «Magnum Rosé - Ruinart» su deluxy.it: «la
// descrizione dei prodotti già esistenti rimane ad elenco senza titoli o
// paragrafi sul modulo».
//
// Il difetto misurato: su parecchie schede il campo `descrizione` contiene
// **tutta la pagina appiattita** — i tre punti, il testo, e anche i titoli e i
// testi delle sezioni, che stanno già (giustamente) in `sezioniScheda`. È il
// residuo degli import fatti prima che esistesse `spezzaDescrizioneHtml`.
//
// ⚠️ Perché conta: `descrizionePerNegozio` ricompone la pagina mettendo il
// campo `descrizione` sotto il titolo del testo libero **e poi** le sezioni.
// Con il campo sporco, ogni sezione finisce sulla scheda del cliente **due
// volte** — provato sul Ruinart prima di scrivere questo script.
//
// La regola è conservativa: si toglie **solo** ciò che si ritrova altrove
// parola per parola (il testo di una sezione, il suo titolo, uno dei tre
// punti). Quello che non si riconosce **resta**: meglio un campo ancora lungo
// che una descrizione amputata.
//
//   npx tsx scripts/ripulisci-descrizioni.ts            # censimento, non scrive
//   npx tsx scripts/ripulisci-descrizioni.ts --applica

import { writeFileSync } from "node:fs";
import { caricaEnv } from "./vecchio-gestionale";

/**
 * Spazi tutti uguali e entità HTML sciolte.
 *
 * ⚠️ La decodifica sta **qui dentro**, non in un passo a parte, perché i tagli
 * si fanno con `slice` sulla lunghezza del pezzo: se i due lati fossero
 * decodificati in modo diverso — «Degustazioni &amp; Aperitivi» da una parte e
 * «Degustazioni & Aperitivi» dall'altra — la lunghezza non tornerebbe e il
 * taglio mangerebbe le lettere accanto. Passando tutto da qui, testo e pezzi
 * sono sempre nella stessa forma.
 */
const piatto = (s: string) =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

/** Confronto insensibile a maiuscole e accenti, per ritrovare i pezzi. */
const chiave = (s: string) =>
  piatto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Le forme in cui un pezzo può presentarsi nel testo appiattito: com'è, e senza
 * la punteggiatura finale. I due plus del sito sono scritti in Impostazioni con
 * il punto finale («…dove vuoi tu.») ma sulle schede vecchie quel punto non
 * c'è: senza questa tolleranza il secondo e il terzo punto non si riconoscono.
 */
function forme(pezzo: string): string[] {
  const p = piatto(pezzo);
  const senzaCoda = p.replace(/[.;,:!?]+$/, "").trim();
  return senzaCoda !== p ? [p, senzaCoda] : [p];
}

/** `testo` comincia con `pezzo`? (senza maiuscole né accenti) */
function iniziaCon(testo: string, pezzo: string): boolean {
  const p = piatto(pezzo);
  return p.length >= 8 && chiave(testo).startsWith(chiave(p));
}

/** `testo` finisce con `pezzo`? */
function finisceCon(testo: string, pezzo: string): boolean {
  const p = piatto(pezzo);
  return p.length >= 8 && chiave(testo).endsWith(chiave(p));
}

type Scheda = Record<string, Record<string, string>>;

/**
 * Il testo libero che resta, tolti i punti e le sezioni.
 *
 * ⚠️⚠️ **Si taglia solo dalla TESTA e dalla CODA, mai in mezzo.** Due versioni
 * precedenti cercavano i pezzi ovunque nel campo, e il censimento le ha bocciate
 * tutte e due sullo stesso prodotto:
 *
 *   «I Biscotti al burro a forma di renna sono un dolce classico, realizzati
 *    con ingredienti di alta qualità»
 *   → «I sono un dolce classico, realizzati con di alta qualità»
 *
 * Aveva tolto il nome della sezione «Ingredienti» e il testo del primo punto
 * **da dentro una frase**, perché lì erano parole normali della lingua, non
 * pezzi ripetuti. La ripetizione vera invece ha una posizione: l'appiattimento
 * ha concatenato la pagina nell'ordine in cui stava — prima i tre punti, poi il
 * testo libero, poi le sezioni. Quindi i punti si tolgono solo se il campo
 * **comincia** con loro, e le sezioni solo se **finisce** con loro. Quello che
 * sta in mezzo è testo, e resta.
 */
export function soloTestoLibero(
  descrizione: string,
  punti: (string | null | undefined)[],
  scheda: Scheda | null,
): { testo: string; etichetta: string | null } {
  let t = piatto(descrizione);
  let etichetta: string | null = null;

  // --- la testa: i tre punti, nell'ordine in cui stanno sulla pagina ---
  //
  // ⭐ Qui si recupera anche **l'etichetta in grassetto del primo punto** —
  // quella che l'utente ha chiesto il 09/09/2026 («metti la categoria in
  // grassetto prima del plus»). Sul sito il primo punto è «<b>Champagne</b>:
  // Ruinart Rosé Magnum», ma nel nostro campo `plusProdotto` è rimasto solo
  // «Magnum Rosé di Ruinart»: l'etichetta si era persa in un import. Nel testo
  // appiattito invece c'è ancora, davanti al plus — è la stessa pagina, scritta
  // di seguito. Si legge da lì, invece di indovinarla dalla categoria.
  for (let giro = 0; giro < 6; giro++) {
    let tagliato = false;
    for (const p of punti) {
      if (!p) continue;
      // Sul sito il due punti ha lo spazio davanti: «Champagne : Ruinart…».
      const varianti = forme(p).flatMap((x) => [x, x.replace(/\s*:\s*/, " : ")]);
      for (const forma of varianti) {
        if (!iniziaCon(t, forma)) continue;
        t = t.slice(piatto(forma).length).trim();
        tagliato = true;
        break;
      }
      if (tagliato) break;
      // Non comincia col plus nudo: forse davanti c'è l'etichetta perduta.
      // Si accetta solo se è corta e senza punteggiatura di frase — «Champagne»
      // sì, mezza riga di testo no.
      const m = t.match(/^([^:.!?]{2,28})\s*:\s*/);
      if (m && iniziaCon(t.slice(m[0].length), piatto(p))) {
        etichetta = m[1].trim();
        t = t.slice(m[0].length + piatto(p).length).trim();
        tagliato = true;
        break;
      }
    }
    if (!tagliato) break;
  }

  // --- la coda: le sezioni, dall'ultima alla prima ---
  for (let giro = 0; giro < 24; giro++) {
    let tagliato = false;
    for (const perSito of Object.values(scheda ?? {})) {
      for (const [nome, testo] of Object.entries(perSito ?? {})) {
        if (typeof testo !== "string" || !testo.trim()) continue;
        for (const forma of [`${nome} ${testo}`, testo]) {
          if (!finisceCon(t, forma)) continue;
          t = t.slice(0, t.length - piatto(forma).length).trim();
          // il titolo può essere rimasto appeso: «… sinuoso. Dettagli Prodotto»
          if (finisceCon(t, nome) || chiave(t).endsWith(chiave(nome))) t = t.slice(0, t.length - piatto(nome).length).trim();
          tagliato = true;
          break;
        }
      }
    }
    if (!tagliato) break;
  }

  return { testo: t.replace(/\s+/g, " ").trim(), etichetta };
}

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const prodotti = await prisma.prodotto.findMany({
    where: { descrizione: { not: null } },
    select: { id: true, codice: true, nome: true, descrizione: true, plusProdotto: true, sezioniScheda: true },
  });
  const negozi = await prisma.negozioShopify.findMany({ select: { nome: true, plusUno: true, plusDue: true } });
  const plusDeiSiti = negozi.flatMap((n) => [n.plusUno, n.plusDue]);

  const cambi: { id: string; prima: string; dopo: string; plus?: string }[] = [];
  const esempi: string[] = [];
  const etichette = new Map<string, number>();
  let tolti = 0;

  for (const p of prodotti) {
    const scheda = (p.sezioniScheda && typeof p.sezioniScheda === "object" && !Array.isArray(p.sezioniScheda)
      ? (p.sezioniScheda as Scheda) : null);
    const prima = p.descrizione as string;
    const { testo: dopo, etichetta } = soloTestoLibero(prima, [p.plusProdotto, ...plusDeiSiti], scheda);
    // L'etichetta ritrovata si rimette davanti al plus: «Champagne: Ruinart…».
    // È la forma che `punto()` già rende in grassetto, e che 40 schede hanno
    // ancora — non serve un campo nuovo sul database condiviso.
    const plusNudo = (p.plusProdotto ?? "").trim();
    const plus = etichetta && plusNudo && !plusNudo.includes(":") ? `${etichetta}: ${plusNudo}` : undefined;
    if (etichetta) etichette.set(etichetta, (etichette.get(etichetta) ?? 0) + 1);
    if (dopo === piatto(prima) && !plus) continue;
    if (!dopo) continue; // non si svuota mai un campo: se resta niente, si lascia com'era
    cambi.push({ id: p.id, prima, dopo, plus });
    tolti += piatto(prima).length - dopo.length;
    if (esempi.length < 6)
      esempi.push(`${(p.codice ?? "").padEnd(12)} ${p.nome.slice(0, 30).padEnd(30)} ${String(piatto(prima).length).padStart(5)} → ${String(dopo.length).padStart(5)}${plus ? `   punto: «${plus.slice(0, 40)}»` : ""}`);
  }

  console.log(`Schede con una descrizione: ${prodotti.length}`);
  console.log(`  da ripulire:               ${cambi.length}`);
  console.log(`  caratteri che se ne vanno: ${tolti.toLocaleString("it-IT")}`);
  if (esempi.length) { console.log("\n  esempi:"); for (const e of esempi) console.log("   " + e); }
  if (cambi.length) {
    const c = cambi.find((x) => x.plus) ?? cambi[0];
    console.log("\n  uno per esteso:");
    console.log("   PRIMA: " + piatto(c.prima).slice(0, 380));
    console.log("   DOPO : " + c.dopo.slice(0, 380));
    if (c.plus) console.log("   PUNTO: " + c.plus);
  }
  console.log(`\n  etichette del primo punto ritrovate: ${[...etichette.values()].reduce((a, b) => a + b, 0)} su ${etichette.size} nomi diversi`);
  for (const [k, v] of [...etichette.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`   ${String(v).padStart(4)}  ${k}`);
  console.log(`  di queste, scritte davanti al plus: ${cambi.filter((c) => c.plus).length}`);

  if (!applica) { console.log("\nCensimento: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }

  const file = `docs/descrizioni-prima-di-ripulire-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify(cambi, null, 1), "utf8");
  console.log(`\nCopia di sicurezza: ${file} (${cambi.length} schede)`);
  let n = 0;
  for (let i = 0; i < cambi.length; i += 100) {
    const blocco = cambi.slice(i, i + 100);
    await prisma.$transaction(blocco.map((c) => prisma.prodotto.update({
      where: { id: c.id },
      data: c.plus ? { descrizione: c.dopo, plusProdotto: c.plus.slice(0, 140) } : { descrizione: c.dopo },
    })));
    n += blocco.length;
  }
  console.log(`Ripulite ${n} descrizioni.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
