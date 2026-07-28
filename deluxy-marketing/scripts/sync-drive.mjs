// Sincronizza l'indice DocumentoDrive dalla cartella locale "ADV DELUXY SRL"
// (Google Drive per Desktop). SOLA LETTURA: la cartella non viene mai scritta.
//   npm run sync-drive          (usa DRIVE_ADV_DIR o il default G:\Il mio Drive\ADV DELUXY SRL)
//
// Nota: replica la logica di src/lib/drive.ts in versione standalone (lo
// script gira senza Next); tenere le due versioni allineate.
//
// ⚠️ Come lì: una lettura sola dell'indice e il confronto in memoria. La
// versione con findUnique+update per ogni file faceva ~1.350 andate e ritorno
// e sul server scadeva a metà (28/07/2026, 179 documenti su 669).
import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const radice = process.env.DRIVE_ADV_DIR || "G:\\Il mio Drive\\ADV DELUXY SRL";
const ESTENSIONI = new Set([".md", ".txt", ".xlsx", ".xls", ".csv", ".docx", ".pdf", ".gdoc", ".gsheet"]);
const CATEGORIE_ANALISI = ["analisi", "audit"];

function daSaltare(nome) {
  return nome.startsWith("_CESTINO") || nome.startsWith("_to_delete") || nome.startsWith(".");
}

function classifica(percorso) {
  const p = percorso.toLowerCase();
  let brand = "altro";
  if (p.startsWith("flowers/")) brand = "flowers";
  else if (p.startsWith("cake/")) brand = "cake";
  else if (p.startsWith("deluxygifts/")) brand = "gifts";
  else if (p.startsWith("ads/")) brand = "cross";
  else if (p.startsWith("pubblici/")) brand = "pubblici";
  else if (p.startsWith("analisi performance/")) brand = "performance";

  let categoria = "altro";
  if (p.includes("/definitivi/")) categoria = "definitivi";
  else if (p.includes("/analisi/")) categoria = "analisi";
  else if (p.includes("/piani/")) categoria = "piani";
  else if (p.includes("/audit/")) categoria = "audit";
  else if (p.includes("/archivio/")) categoria = "archivio";
  else if (p.includes("pubblici/")) categoria = "pubblici";
  else if (p.includes("creativit")) categoria = "creativita";
  else if (p.includes("/seo/")) categoria = "seo";
  return { brand, categoria };
}

// Stessa deduzione di src/lib/analisi-drive.ts.
function tipoAnalisiDa(nome, categoria) {
  const t = nome.toLowerCase();
  if (/report\s*settiman/.test(t)) return "report_settimanale";
  if (/audit/.test(t) && /meta|facebook|instagram/.test(t)) return "audit_meta";
  if (/audit/.test(t) && /google|ads/.test(t)) return "audit_google";
  if (/landing|sito|pagina/.test(t)) return "revisione_landing";
  if (/creativ|copy|annunci/.test(t)) return "revisione_creativi";
  if (/pubblic|audience|segment/.test(t)) return "analisi_pubblici";
  if (/performance|vendite|delta/.test(t)) return "analisi_performance";
  if (categoria === "audit") return "audit_google";
  return "analisi";
}

// Come in src/lib/analisi-drive.ts: la categoria non basta a tenere fuori il
// vecchio (un file in ".../Analisi/Archivio/" viene classificato `analisi`) e i
// documenti superati lo dicono nel nome.
function daNonImportare(percorso, nome) {
  const p = percorso.toLowerCase();
  if (p.includes("/archivio/") || p.startsWith("archivio/")) return true;
  return /^\s*(superato|archiviato|obsoleto)\b/i.test(nome);
}

function sintesiDa(testo) {
  const righe = testo
    .split(/\r?\n/)
    .map((r) => r.replace(/^[#>*\-\s]+/, "").trim())
    .filter((r) => r.length > 25 && !/^[=_-]+$/.test(r));
  if (righe.length === 0) return null;
  return righe.slice(0, 4).join(" ").slice(0, 600);
}

try {
  await fs.access(radice);
} catch {
  console.error(`Cartella Drive non raggiungibile: ${radice}`);
  console.error("Verificare Google Drive per Desktop o impostare DRIVE_ADV_DIR.");
  process.exit(1);
}

const trovati = [];

async function visita(dir, prefisso) {
  let voci;
  try {
    voci = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  voci.sort((a, b) => a.name.localeCompare(b.name));
  for (const voce of voci) {
    if (daSaltare(voce.name)) continue;
    const pieno = path.join(dir, voce.name);
    const relativo = prefisso ? `${prefisso}/${voce.name}` : voce.name;
    if (voce.isDirectory()) {
      await visita(pieno, relativo);
      continue;
    }
    const estensione = path.extname(voce.name).toLowerCase();
    if (!ESTENSIONI.has(estensione)) continue;
    let stat;
    try {
      stat = await fs.stat(pieno);
    } catch {
      continue;
    }
    const { brand, categoria } = classifica(relativo);
    trovati.push({
      percorso: relativo,
      nome: voce.name,
      cartella: prefisso,
      estensione,
      brand,
      categoria,
      dimensione: stat.size,
      modificatoIl: stat.mtime,
    });
  }
}

await visita(radice, "");

// Confronto in memoria, scritture in blocco.
const indice = await prisma.documentoDrive.findMany({
  select: { id: true, percorso: true, dimensione: true, modificatoIl: true },
});
const perPercorso = new Map(indice.map((d) => [d.percorso, d]));

const nuovi = [];
const cambiati = [];
for (const t of trovati) {
  const esistente = perPercorso.get(t.percorso);
  if (!esistente) nuovi.push(t);
  else if (
    esistente.dimensione !== t.dimensione ||
    esistente.modificatoIl.getTime() !== t.modificatoIl.getTime()
  ) {
    cambiati.push(t);
  }
}

if (nuovi.length > 0) {
  await prisma.documentoDrive.createMany({
    data: nuovi.map((t) => ({ ...t, sincronizzatoIl: new Date() })),
    skipDuplicates: true,
  });
}
for (const t of cambiati) {
  await prisma.documentoDrive.update({
    where: { percorso: t.percorso },
    data: { ...t, sincronizzatoIl: new Date() },
  });
}

const visti = new Set(trovati.map((t) => t.percorso));
const spariti = indice.filter((d) => !visti.has(d.percorso)).map((d) => d.id);
if (spariti.length > 0) {
  await prisma.documentoDrive.deleteMany({ where: { id: { in: spariti } } });
}

// I documenti di analisi e audit diventano record Analisi: senza questo pezzo
// un'analisi scritta su Drive resta una riga in un elenco di file.
const [documenti, giaImportate] = await Promise.all([
  prisma.documentoDrive.findMany({
    where: { categoria: { in: CATEGORIE_ANALISI } },
    orderBy: { modificatoIl: "desc" },
    select: { percorso: true, nome: true, brand: true, categoria: true, estensione: true, modificatoIl: true },
  }),
  prisma.analisi.findMany({ where: { fileDrive: { not: null } }, select: { fileDrive: true } }),
]);
const note = new Set(giaImportate.map((a) => a.fileDrive));
let analisiCreate = 0;
for (const d of documenti) {
  if (note.has(d.percorso)) continue;
  if (daNonImportare(d.percorso, d.nome)) continue;
  let sintesi = null;
  if (d.estensione === ".md" || d.estensione === ".txt") {
    try {
      sintesi = sintesiDa(await fs.readFile(path.join(radice, ...d.percorso.split("/")), "utf8"));
    } catch {
      sintesi = null;
    }
  }
  const analisi = await prisma.analisi.create({
    data: {
      titolo: d.nome.replace(/\.[^.]+$/, ""),
      tipo: tipoAnalisiDa(d.nome, d.categoria),
      brand: ["flowers", "cake", "gifts"].includes(d.brand) ? d.brand : "cross",
      sintesi:
        sintesi ??
        `Documento su Drive non ancora letto dall'app (${d.estensione || "senza estensione"}): la sintesi si legge aprendo il file. Percorso: ${d.percorso}`,
      fileDrive: d.percorso,
      dataAnalisi: d.modificatoIl,
      origine: "drive-import",
      note: "Creata dalla sincronizzazione del Drive: il documento completo resta su Drive, che è la fonte di verità.",
    },
  });
  analisiCreate++;
  await prisma.registroEvento
    .create({
      data: {
        autore: "drive-import",
        tipo: "import",
        entita: "analisi",
        entitaId: analisi.id,
        titolo: `Analisi importata dal Drive: ${analisi.titolo}`,
        dettaglio: d.percorso,
      },
    })
    .catch(() => {});
}

await prisma.syncDrive.create({
  data: {
    stato: "completata",
    radice,
    trovati: trovati.length,
    nuovi: nuovi.length,
    aggiornati: cambiati.length,
    rimossi: spariti.length,
    analisi: analisiCreate,
    completataIl: new Date(),
    messaggio: "Lanciata da npm run sync-drive",
  },
});

console.log(`Sync completata da: ${radice}`);
console.log(
  `Documenti trovati: ${trovati.length} · nuovi: ${nuovi.length} · aggiornati: ${cambiati.length} · rimossi: ${spariti.length} · analisi importate: ${analisiCreate}`
);
await prisma.$disconnect();
