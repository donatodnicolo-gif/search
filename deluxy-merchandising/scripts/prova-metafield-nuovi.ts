// **La prova che un prodotto NUOVO arriva su Shopify con tutti i suoi metafield.**
//
// Chiesto dall'utente il 10/09/2026: «assicurati che per tutti i prodotti nuovi
// carichiamo tutti i metafield: fai una mappatura con 10 prodotti nuovi di
// test, 1 per categoria di prodotto che usi».
//
// Cosa fa: per ogni categoria del piano crea un prodotto di PROVA passando dallo
// **stesso codice del modulo** (`creaProdottoCompleto`, cioè `leggiModulo` →
// `creaProdottoSuShopify`), coi metafield che il modulo darebbe a un prodotto
// nuovo — i campi operativi dal valore più usato su quel sito, il partner più
// usato, e uno o due campi di contenuto con la prima scelta ammessa. Poi
// **rilegge da Shopify** cosa è arrivato e lo confronta con quello che il sito
// si aspetta (i campi presenti su almeno metà delle schede attive). Il
// rapporto va in `docs/mappatura-metafield-<data>.md`.
//
// ⚠️ Scrive sui negozi VERI: i prodotti nascono in DRAFT (fase Pubblico con
// «dal» domani), col nome «TEST METAFIELD — …», e vanno cancellati a mano
// dall'admin quando la prova è finita. Con `--prova` non crea niente: stampa
// solo cosa manderebbe.
//
//   npx tsx scripts/prova-metafield-nuovi.ts --prova
//   npx tsx scripts/prova-metafield-nuovi.ts
//   npx tsx scripts/prova-metafield-nuovi.ts --solo TORTE_DOLCI,FIORI

import { writeFileSync } from "node:fs";
import { caricaEnv } from "./vecchio-gestionale";

type Caso = { categoria: string; negozio: string; tipo: string; contenuto: string[]; fissi?: Record<string, string> };

/** Un prodotto per categoria, sul sito dove quella categoria vive davvero. */
const PIANO: Caso[] = [
  { categoria: "TORTE_DOLCI", negozio: "Cake", tipo: "Torte", contenuto: ["custom.gusti"] },
  { categoria: "FIORI", negozio: "Flowers", tipo: "Fiori", contenuto: ["custom.fiori", "custom.colore", "custom.occasione"] },
  { categoria: "BOUQUET", negozio: "Flowers", tipo: "Rose", contenuto: ["custom.fiori", "custom.modello"] },
  { categoria: "VINI_SPIRITS", negozio: "Gifts", tipo: "Vini", contenuto: ["custom.vini", "custom.occasioni"] },
  { categoria: "GASTRONOMIA", negozio: "Business Deluxy", tipo: "B2B Lunch", contenuto: ["custom.occasioni", "custom.tipologia_catering"] },
  { categoria: "ORIGINALI_DELUXY", negozio: "Gifts", tipo: "Originali Deluxy", contenuto: ["custom.occasioni", "custom.classificazione"] },
  { categoria: "REGALI", negozio: "Gifts", tipo: "Box Regalo", contenuto: ["custom.occasioni", "custom.citta"] },
  { categoria: "ARTE", negozio: "Gifts", tipo: "Arte", contenuto: ["custom.occasioni"] },
  { categoria: "SERVIZI", negozio: "Business Deluxy", tipo: "Servizi Deluxy", contenuto: ["custom.occasioni"], fissi: { "custom.not_physical": "true" } },
  { categoria: "GIFT_BOX", negozio: "Business Deluxy", tipo: "B2B Regali da Personalizzare", contenuto: ["custom.dolci"], fissi: { "custom.personalizzabile": "true" } },
];

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const prova = process.argv.includes("--prova");
const solo = arg("solo")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { Prisma } = await import("@prisma/client");
  const { elencoNegozi, negoziAttivi, VERSIONE_API } = await import("../src/lib/negozi");
  const { attesiDaiProdotti } = await import("../src/lib/modulo-prodotto-dati");
  const { conCampiStorici, definizioniInCache, metafieldPerShopify, scartiMetafield } = await import("../src/lib/metafield-definizioni");
  const { CAMPI_OPERATIVI, chiaveDef } = await import("../src/lib/metafield-puro");
  const { creaProdottoCompleto } = await import("../src/lib/azioni-prodotto-nuovo");

  const negozi = await elencoNegozi();
  const attivi = await negoziAttivi();
  const conCampi = await prisma.prodotto.findMany({
    where: { statoShopify: "ACTIVE", metafieldShopify: { not: Prisma.DbNull } },
    select: { negozioNome: true, metafieldShopify: true, pubblicazioni: { where: { statoShopify: "ACTIVE" }, select: { negozio: true } } },
  });
  const { attesiPerNegozio, partnerNoti } = attesiDaiProdotti(conCampi);

  const domani = new Date(Date.now() + 24 * 3_600_000).toISOString().slice(0, 10);
  const oggi = new Date().toISOString().slice(0, 10);
  const righeMd: string[] = [
    `# Mappatura dei metafield sui prodotti nuovi — ${oggi}`,
    "",
    "Un prodotto di prova per categoria, creato **dallo stesso codice del modulo** (`creaProdottoCompleto`) con i metafield che il modulo dà a un prodotto nuovo: i campi operativi dal valore più usato sul sito, il partner più usato, uno o due campi di contenuto con la prima scelta ammessa. Poi riletto da Shopify.",
    "",
    "Legenda: **atteso** = presente su almeno metà delle schede attive di quel sito · ✅ arrivato su Shopify · ❌ mandato ma non arrivato · ⚪ atteso e non mandato (il modulo non lo compila da solo).",
    "",
  ];
  const riassunto: string[] = [];

  for (const caso of PIANO) {
    if (solo && !solo.includes(caso.categoria)) continue;
    const negozio = negozi.find((n) => n.nome === caso.negozio && n.attivo);
    if (!negozio) { console.log(`✗ ${caso.categoria}: negozio ${caso.negozio} non attivo`); continue; }
    const defs = conCampiStorici(await definizioniInCache(caso.negozio));
    const attesi = attesiPerNegozio[caso.negozio] ?? {};
    const attese = Object.entries(attesi).filter(([, a]) => a.quota >= 0.5).map(([k]) => k).sort();

    // — Quello che il modulo darebbe a un prodotto nuovo su questo sito —
    const metafield: Record<string, string> = {};
    for (const chiave of CAMPI_OPERATIVI) {
      const a = attesi[chiave];
      if (a?.tipico && a.quota >= 0.5) metafield[chiave] = a.tipico;
    }
    const partner = (partnerNoti[caso.negozio] ?? [])[0];
    if (partner) { metafield["custom.partner_id"] = partner.id; metafield["custom.partner_address"] = partner.indirizzo; }
    for (const chiave of caso.contenuto) {
      const d = defs.find((x) => chiaveDef(x) === chiave);
      if (!d) { console.log(`  (${caso.negozio} non definisce ${chiave}: saltato)`); continue; }
      const prima = d.scelte?.[0] ?? "Prova";
      metafield[chiave] = d.tipo.startsWith("list.") ? JSON.stringify([prima]) : d.tipo === "boolean" ? "true" : prima;
    }
    Object.assign(metafield, caso.fissi ?? {});
    const perShopify = metafieldPerShopify(metafield, defs);
    const scarti = scartiMetafield(metafield, defs);
    const nome = `TEST METAFIELD — ${caso.categoria} (da cancellare)`;

    console.log(`\n══ ${caso.categoria} su ${caso.negozio} · ${perShopify.length} metafield da mandare${scarti.length ? ` · ${scarti.length} scarti` : ""}`);
    for (const x of perShopify) console.log(`   ${x.namespace}.${x.key} [${x.type}] = ${x.value.slice(0, 70)}`);
    for (const s of scarti) console.log(`   ⚠️ ${s}`);
    const nonMandati = attese.filter((k) => !perShopify.some((x) => chiaveDef(x) === k));
    if (nonMandati.length) console.log(`   ⚪ attesi non mandati: ${nonMandati.join(", ")}`);
    if (prova) continue;

    // — La creazione, dallo stesso ingresso del modulo —
    const fd = new FormData();
    const campi: Record<string, string> = {
      nome, negozioId: negozio.id, categoria: caso.categoria, fase: "in_vendita", pubblicatoDal: domani,
      tipologiaVendita: "quantita", tipoShopify: caso.tipo, prezzoVendita: "1", costoProduzione: "0",
      descrizione: "Prodotto di prova per la mappatura dei metafield: da cancellare.",
      plusProdotto: "Prova: da cancellare",
      metafieldJson: JSON.stringify(metafield), tagsJson: JSON.stringify(["test-metafield"]),
      variantiJson: "[]", mediaJson: "[]", sezioniJson: "{}", negoziPubblicazioneJson: "[]", collezioniJson: "[]",
    };
    for (const [k, v] of Object.entries(campi)) fd.set(k, v);
    let esito = "";
    try {
      await creaProdottoCompleto(fd);
      esito = "finito senza redirect (?)";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const digest = (e as { digest?: string })?.digest ?? "";
      if (msg.includes("static generation store")) esito = "creato";
      else if (digest.startsWith("NEXT_REDIRECT")) esito = `rifiutato: ${decodeURIComponent(digest.split(";")[2] ?? "").replace(/^.*errore=/, "")}`;
      else esito = `errore: ${msg.split("\n")[0]}`;
    }
    console.log(`   → ${esito}`);

    // — Rilettura: cosa c'è davvero sul negozio —
    const p = await prisma.prodotto.findFirst({ where: { nome }, orderBy: { creatoIl: "desc" }, select: { id: true, codice: true, shopifyId: true, pubblicazioni: { select: { negozio: true, shopifyId: true, statoShopify: true, errore: true } } } });
    const pub = p?.pubblicazioni.find((x) => x.negozio === caso.negozio);
    const shopId = pub?.shopifyId ?? p?.shopifyId ?? null;
    const arrivati = new Map<string, string>();
    let statoOnline = "—";
    if (shopId) {
      const n = attivi.find((x) => x.nome === caso.negozio)!;
      const res = await fetch(`https://${n.dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": n.token },
        body: JSON.stringify({ query: `{ product(id:"${shopId}"){ status handle metafields(first:60){ nodes { namespace key type value } } } }` }), signal: AbortSignal.timeout(30000),
      });
      const c = (await res.json()) as { data?: { product?: { status: string; handle: string; metafields: { nodes: { namespace: string; key: string; type: string; value: string }[] } } | null } };
      statoOnline = c.data?.product?.status ?? "non trovato";
      for (const m of c.data?.product?.metafields.nodes ?? []) arrivati.set(`${m.namespace}.${m.key}`, m.value);
    }
    const mandati = perShopify.map((x) => chiaveDef(x));
    const ok = mandati.filter((k) => arrivati.has(k));
    const persi = mandati.filter((k) => !arrivati.has(k));
    console.log(`   Shopify: ${shopId ?? "nessun id"} · ${statoOnline} · arrivati ${ok.length}/${mandati.length}${persi.length ? ` · PERSI: ${persi.join(", ")}` : ""}${pub?.errore ? ` · errore: ${pub.errore}` : ""}`);

    righeMd.push(`## ${caso.categoria} → ${caso.negozio} (tipo «${caso.tipo}»)`, "", `Esito: ${esito} · Shopify ${statoOnline} · id \`${shopId ?? "—"}\` · SKU \`${p?.codice ?? "—"}\` · mandati ${mandati.length}, arrivati ${ok.length}${pub?.errore ? ` · errore: ${pub.errore}` : ""}`, "", "| Chiave | Atteso | Mandato | Su Shopify |", "|---|:-:|---|---|");
    const tutte = [...new Set([...attese, ...mandati, ...arrivati.keys()])].sort();
    for (const k of tutte) {
      const att = attese.includes(k) ? `sì (${Math.round((attesi[k]?.quota ?? 0) * 100)}%)` : "";
      const man = perShopify.find((x) => chiaveDef(x) === k)?.value ?? "";
      const arr = arrivati.get(k);
      const segno = man && arr != null ? "✅" : man && arr == null ? "❌" : !man && attese.includes(k) ? "⚪" : "";
      righeMd.push(`| \`${k}\` | ${att} | ${man ? "`" + man.slice(0, 60).replace(/\|/g, "\\|") + "`" : ""} | ${segno} ${arr != null ? "`" + String(arr).slice(0, 60).replace(/\|/g, "\\|") + "`" : ""} |`);
    }
    righeMd.push("");
    riassunto.push(`- **${caso.categoria}** su ${caso.negozio}: ${esito} · mandati ${mandati.length}, arrivati ${ok.length}${persi.length ? `, persi ${persi.length}` : ""}${nonMandati.length ? ` · attesi non compilati dal modulo: ${nonMandati.join(", ")}` : ""}`);
  }

  if (!prova) {
    const file = `docs/mappatura-metafield-${oggi}.md`;
    righeMd.splice(6, 0, "## Riassunto", "", ...riassunto, "");
    writeFileSync(file, righeMd.join("\n") + "\n");
    console.log(`\nRapporto in ${file}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
