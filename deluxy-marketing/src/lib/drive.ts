import { promises as fs } from "fs";
import path from "path";
import { prisma } from "./db";

// Indicizzazione (SOLA LETTURA) della cartella ufficiale "ADV DELUXY SRL",
// sincronizzata in locale da Google Drive per Desktop. L'app non scrive mai
// dentro la cartella: legge l'albero e tiene un indice in DocumentoDrive.
// La radice si imposta con DRIVE_ADV_DIR (default: G:\Il mio Drive\ADV DELUXY SRL).

export const DRIVE_DIR_DEFAULT = "G:\\Il mio Drive\\ADV DELUXY SRL";

export function driveDir(): string {
  return process.env.DRIVE_ADV_DIR || DRIVE_DIR_DEFAULT;
}

// Estensioni indicizzate: documenti di lavoro, non asset binari pesanti.
const ESTENSIONI = new Set([".md", ".txt", ".xlsx", ".xls", ".csv", ".docx", ".pdf", ".gdoc", ".gsheet"]);

// Cartelle da saltare: cestini di bonifica e servizio.
function daSaltare(nome: string): boolean {
  return nome.startsWith("_CESTINO") || nome.startsWith("_to_delete") || nome.startsWith(".");
}

// brand + categoria a partire dal percorso relativo (con "/").
function classifica(percorso: string): { brand: string; categoria: string } {
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

export type EsitoSync = {
  radice: string;
  trovati: number;
  nuovi: number;
  aggiornati: number;
  rimossi: number;
  errore?: string;
};

export async function sincronizzaDrive(): Promise<EsitoSync> {
  const radice = driveDir();
  const esito: EsitoSync = { radice, trovati: 0, nuovi: 0, aggiornati: 0, rimossi: 0 };

  try {
    await fs.access(radice);
  } catch {
    esito.errore = `Cartella Drive non raggiungibile: ${radice}. Verificare Google Drive per Desktop o DRIVE_ADV_DIR.`;
    return esito;
  }

  const visti = new Set<string>();

  async function visita(dir: string) {
    let voci;
    try {
      voci = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // cartella non leggibile: si salta senza fermare la sync
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
      esito.trovati++;

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
        esito.nuovi++;
      } else if (
        esistente.dimensione !== stat.size ||
        esistente.modificatoIl.getTime() !== stat.mtime.getTime()
      ) {
        await prisma.documentoDrive.update({ where: { percorso: relativo }, data: dati });
        esito.aggiornati++;
      } else {
        await prisma.documentoDrive.update({
          where: { percorso: relativo },
          data: { sincronizzatoIl: new Date() },
        });
      }
    }
  }

  await visita(radice);

  // File spariti dal Drive: l'indice li dimentica (il Drive resta la verità).
  const tutti = await prisma.documentoDrive.findMany({ select: { id: true, percorso: true } });
  for (const doc of tutti) {
    if (!visti.has(doc.percorso)) {
      await prisma.documentoDrive.delete({ where: { id: doc.id } });
      esito.rimossi++;
    }
  }

  return esito;
}
