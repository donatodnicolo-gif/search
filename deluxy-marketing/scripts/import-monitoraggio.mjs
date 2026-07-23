// Importa il file "Monitoraggio 2026.xlsx" nell'app Marketing:
//   - SALES GLOBAL 26 - REVISED  → VenditaMensile (vendite/B2B/eventi/budget ADV per sito)
//   - Budget adv                 → BudgetMensile (con ripartizione canali/campagne)
//   - 2026 / 2025                → SettimanaMkt scope "totale" (confronto anno su anno)
//   - Deluxy / Flowers / CakeDM (+ versioni 2025) → SettimanaMkt per brand
//   - Flowers ADS Google (+ENG)  → CopyAnnuncio (titoli/descrizioni RSA e keyword)
// Idempotente: upsert su chiavi naturali, rilanciare non duplica.
//   npm run import:monitoraggio -- "C:\percorso\Monitoraggio 2026.xlsx"
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const prisma = new PrismaClient();
const percorso = process.argv.slice(2).filter((a) => a !== "--")[0];
if (!percorso) {
  console.error('Uso: npm run import:monitoraggio -- "<percorso del file .xlsx>"');
  process.exit(1);
}
const wb = XLSX.readFile(percorso);
const conteggi = {};
const conta = (k, n = 1) => (conteggi[k] = (conteggi[k] ?? 0) + n);

function foglio(nome) {
  const ws = wb.Sheets[nome];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

// Excel serial → Date (UTC, senza ora)
function dataDaSeriale(seriale) {
  if (typeof seriale !== "number" || seriale < 20000 || seriale > 60000) return null;
  const d = new Date(Math.round((seriale - 25569) * 86400 * 1000));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const intero = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v) : null);

const SITO_DA_TITOLO = [
  [/deluxyflower/i, "flowers"],
  [/cakedesign/i, "cake"],
  [/deluxy\.it/i, "gifts"],
];
function sitoDa(testo) {
  if (typeof testo !== "string") return null;
  for (const [re, sito] of SITO_DA_TITOLO) if (re.test(testo)) return sito;
  return null;
}

// ---------- 1. SALES GLOBAL 26 - REVISED → VenditaMensile ----------
async function importaSales() {
  const righe = foglio("SALES GLOBAL 26 - REVISED");
  if (!righe) return;
  let sito = null;
  for (const r of righe) {
    if (!r) continue;
    const s = sitoDa(r[0]);
    if (s) { sito = s; continue; }
    if (!sito) continue;
    const data = dataDaSeriale(r[0]);
    if (!data) continue;
    await prisma.venditaMensile.upsert({
      where: { anno_mese_sito: { anno: data.getUTCFullYear(), mese: data.getUTCMonth() + 1, sito } },
      create: {
        anno: data.getUTCFullYear(), mese: data.getUTCMonth() + 1, sito,
        vendite: num(r[1]), quotaAnno: num(r[2]), b2b: num(r[4]), eventi: num(r[5]),
        totale: num(r[6]), budgetAdv: num(r[8]),
      },
      update: {
        vendite: num(r[1]), quotaAnno: num(r[2]), b2b: num(r[4]), eventi: num(r[5]),
        totale: num(r[6]), budgetAdv: num(r[8]),
      },
    });
    conta("vendite mensili");
  }
}

// ---------- 2. Budget adv → BudgetMensile ----------
const MESE_DA_NOME = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};
async function importaBudget() {
  const righe = foglio("Budget adv");
  if (!righe) return;
  let sito = null;
  let voci = [];   // nomi colonne canale/campagna (da col 5 in poi)
  let quote = [];  // quota % per voce
  for (const r of righe) {
    if (!r) continue;
    const s = sitoDa(r[0]);
    if (s) { sito = s; voci = []; quote = []; continue; }
    if (!sito) continue;
    // riga intestazione voci: contiene "VENDITA HP" in colonna 1
    if (typeof r[1] === "string" && /VENDITA/i.test(r[1])) {
      voci = r.slice(5).map((v) => (typeof v === "string" ? v.trim() : null));
      continue;
    }
    // riga delle quote: numeri <= 1 sotto l'intestazione
    if (voci.length > 0 && quote.length === 0 && r[0] == null && typeof r[5] === "number") {
      quote = r.slice(5).map((v) => num(v));
      continue;
    }
    const mese = typeof r[0] === "string" ? MESE_DA_NOME[r[0].trim().toLowerCase()] : null;
    if (!mese) continue;
    const ripartizione = {};
    voci.forEach((voce, i) => {
      if (voce && num(r[5 + i]) != null) {
        ripartizione[voce] = { quota: quote[i] ?? null, giorno: num(r[5 + i]) };
      }
    });
    await prisma.budgetMensile.upsert({
      where: { anno_mese_sito: { anno: 2026, mese, sito } },
      create: {
        anno: 2026, mese, sito,
        venditaPrevista: num(r[1]), ros: num(r[2]), budgetMese: num(r[3]), budgetGiorno: num(r[4]),
        ripartizione: JSON.stringify(ripartizione),
      },
      update: {
        venditaPrevista: num(r[1]), ros: num(r[2]), budgetMese: num(r[3]), budgetGiorno: num(r[4]),
        ripartizione: JSON.stringify(ripartizione),
      },
    });
    conta("budget mensili");
  }
}

// ---------- 3. Settimane MKT (totale + brand) → SettimanaMkt ----------
// I fogli hanno: riga con i seriali di inizio settimana, righe metrica con
// etichetta in colonna 0. Le colonne "FM" (fine mese) e "vs 2025" si saltano.
const METRICHE = [
  [/^google( spesa)?$/i, "google", num],
  [/^meta$/i, "meta", num],
  [/^totale mkt$/i, "totaleMkt", num],
  [/^vendite$/i, "vendite", num],
  [/^media margine$/i, "margine", num],
  [/^risultato$/i, "risultato", num],
  [/^num ordini$/i, "ordini", intero],
  [/^media ordine$/i, "mediaOrdine", num],
  [/^costo conv\.?$/i, "costoConv", num],
  [/^nuovi clienti$/i, "nuoviClienti", intero],
  [/^azioni$/i, "note", (v) => (typeof v === "string" && v.trim() ? v.trim() : null)],
];
async function importaSettimane(nomeFoglio, scope) {
  const righe = foglio(nomeFoglio);
  if (!righe) return;
  // trova la riga dei seriali di inizio (la prima con >3 seriali validi)
  let rigaSeriali = null;
  for (let i = 0; i < Math.min(4, righe.length); i++) {
    const seriali = (righe[i] || []).filter((v) => dataDaSeriale(v));
    if (seriali.length > 3) { rigaSeriali = i; break; }
  }
  if (rigaSeriali == null) return;
  const colonne = [];
  (righe[rigaSeriali] || []).forEach((v, c) => {
    const d = dataDaSeriale(v);
    if (d) colonne.push({ c, inizio: d });
  });
  // raccogli le righe metrica
  const valori = new Map(); // c -> record
  for (const r of righe) {
    if (!r || r[0] == null) continue;
    const etichetta = String(r[0]).trim();
    const metrica = METRICHE.find(([re]) => re.test(etichetta));
    if (!metrica) continue;
    const [, campo, trasforma] = metrica;
    for (const { c, inizio } of colonne) {
      const chiave = inizio.toISOString();
      if (!valori.has(chiave)) valori.set(chiave, { inizio });
      const rec = valori.get(chiave);
      // la prima riga che matcha l'etichetta vince (le righe % vengono dopo)
      if (rec[campo] === undefined) rec[campo] = trasforma(r[c]);
    }
  }
  for (const rec of valori.values()) {
    const { inizio, ...campi } = rec;
    const anno = inizio.getUTCFullYear();
    // settimane completamente vuote non si salvano
    if (Object.values(campi).every((v) => v == null)) continue;
    await prisma.settimanaMkt.upsert({
      where: { anno_inizio_scope: { anno, inizio, scope } },
      create: { anno, inizio, scope, ...campi },
      update: campi,
    });
    conta(`settimane ${scope}`);
  }
}

// ---------- 4. Copy RSA (Flowers ADS Google + ENG) → CopyAnnuncio ----------
async function importaCopy(nomeFoglio, lingua) {
  const righe = foglio(nomeFoglio);
  if (!righe) return;
  const blocchi = [0, 4, 8, 12]; // quattro campagne affiancate
  for (const base of blocchi) {
    let campagna = null;
    let inKeywords = false;
    for (const r of righe) {
      if (!r) continue;
      const cella = r[base];
      const testo = r[base + 1];
      if (typeof cella === "string" && !/^(Headline|Description|Keywords|CTR)/i.test(cella.trim()) && cella.trim() !== "") {
        if (inKeywords && campagna) {
          // dentro il blocco keywords: la cella è la keyword
          await salvaCopy(campagna, "keyword", null, cella.trim(), lingua, num(r[base + 1]), num(r[base + 2]));
          continue;
        }
        campagna = cella.trim();
        inKeywords = false;
        continue;
      }
      if (typeof cella === "string" && /^CTR/i.test(cella.trim()) && campagna) {
        await salvaCopy(campagna, "nota", null, cella.trim(), lingua, null, null);
        continue;
      }
      if (typeof cella === "string" && /^Keywords/i.test(cella.trim())) { inKeywords = true; continue; }
      const m = typeof cella === "string" ? cella.trim().match(/^(Headline|Description) (\d+)$/i) : null;
      if (m && campagna && typeof testo === "string" && testo.trim() !== "") {
        inKeywords = false;
        const tipo = /^Headline/i.test(m[1]) ? "titolo" : "descrizione";
        await salvaCopy(campagna, tipo, Number(m[2]), testo.trim(), lingua, null, null);
      }
      if (cella == null && r[base + 1] == null) inKeywords = false;
    }
  }
}
async function salvaCopy(campagna, tipo, posizione, testo, lingua, incasso, spesa) {
  const brand = /flower/i.test(campagna) && !/milano|roma|firenze/i.test(campagna) ? "flowers" : "gifts";
  const esistente = await prisma.copyAnnuncio.findFirst({
    where: { campagna, tipo, posizione: posizione ?? undefined, testo },
  });
  const dati = {
    brand, canale: "google_ads", campagna, lingua, tipo,
    posizione, testo, caratteri: tipo === "titolo" || tipo === "descrizione" ? testo.length : null,
    incasso, spesa,
  };
  if (esistente) await prisma.copyAnnuncio.update({ where: { id: esistente.id }, data: dati });
  else await prisma.copyAnnuncio.create({ data: dati });
  conta(`copy ${tipo}`);
}

// ---------- esecuzione ----------
await importaSales();
await importaBudget();
await importaSettimane("2025", "totale");
await importaSettimane("2026", "totale");
await importaSettimane("Deluxy2025", "gifts");
await importaSettimane("Deluxy", "gifts");
await importaSettimane("Flowers2025", "flowers");
await importaSettimane("Flowers", "flowers");
await importaSettimane("CakeDM2025", "cake");
await importaSettimane("CakeDM", "cake");
await importaCopy("Flowers ADS Google", "it");
await importaCopy("Flower ADS Google ENG", "en");

await prisma.registroEvento.create({
  data: {
    autore: "import",
    tipo: "import",
    entita: "vendite",
    titolo: `Import Monitoraggio: ${percorso.split(/[\\/]/).pop()}`,
    dettaglio: Object.entries(conteggi).map(([k, v]) => `${k}: ${v}`).join(" · "),
  },
});

console.log("Import completato da:", percorso);
for (const [k, v] of Object.entries(conteggi)) console.log(`  ${k}: ${v}`);
await prisma.$disconnect();
