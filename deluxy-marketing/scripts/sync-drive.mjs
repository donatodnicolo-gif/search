// Sincronizza l'indice DocumentoDrive dalla cartella locale "ADV DELUXY SRL"
// (Google Drive per Desktop). SOLA LETTURA: la cartella non viene mai scritta.
//   npm run sync-drive          (usa DRIVE_ADV_DIR o il default G:\Il mio Drive\ADV DELUXY SRL)
// Nota: replica la logica di src/lib/drive.ts in versione standalone (lo
// script gira senza Next); tenere le due versioni allineate.
import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const radice = process.env.DRIVE_ADV_DIR || "G:\\Il mio Drive\\ADV DELUXY SRL";
const ESTENSIONI = new Set([".md", ".txt", ".xlsx", ".xls", ".csv", ".docx", ".pdf", ".gdoc", ".gsheet"]);

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

try {
  await fs.access(radice);
} catch {
  console.error(`Cartella Drive non raggiungibile: ${radice}`);
  console.error("Verificare Google Drive per Desktop o impostare DRIVE_ADV_DIR.");
  process.exit(1);
}

const visti = new Set();
let nuovi = 0;
let aggiornati = 0;

async function visita(dir) {
  let voci;
  try {
    voci = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const voce of voci) {
    if (daSaltare(voce.name)) continue;
    const pieno = path.join(dir, voce.name);
    if (voce.isDirectory()) {
      await visita(pieno);
      continue;
    }
    const estensione = path.extname(voce.name).toLowerCase();
    if (!ESTENSIONI.has(estensione)) continue;
    const relativo = path.relative(radice, pieno).split(path.sep).join("/");
    let stat;
    try {
      stat = await fs.stat(pieno);
    } catch {
      continue;
    }
    visti.add(relativo);
    const { brand, categoria } = classifica(relativo);
    const dati = {
      nome: voce.name,
      cartella: path.dirname(relativo).split(path.sep).join("/"),
      estensione,
      brand,
      categoria,
      dimensione: stat.size,
      modificatoIl: stat.mtime,
      sincronizzatoIl: new Date(),
    };
    const esistente = await prisma.documentoDrive.findUnique({ where: { percorso: relativo } });
    if (!esistente) {
      await prisma.documentoDrive.create({ data: { percorso: relativo, ...dati } });
      nuovi++;
    } else if (esistente.dimensione !== stat.size || esistente.modificatoIl.getTime() !== stat.mtime.getTime()) {
      await prisma.documentoDrive.update({ where: { percorso: relativo }, data: dati });
      aggiornati++;
    }
  }
}

await visita(radice);

const tutti = await prisma.documentoDrive.findMany({ select: { id: true, percorso: true } });
let rimossi = 0;
for (const doc of tutti) {
  if (!visti.has(doc.percorso)) {
    await prisma.documentoDrive.delete({ where: { id: doc.id } });
    rimossi++;
  }
}

console.log(`Sync completata da: ${radice}`);
console.log(`Documenti trovati: ${visti.size} · nuovi: ${nuovi} · aggiornati: ${aggiornati} · rimossi: ${rimossi}`);
await prisma.$disconnect();
