import { promises as fs } from "fs";
import path from "path";
import { prisma } from "./db";

// Indicizzazione (SOLA LETTURA) della cartella ufficiale "ADV DELUXY SRL",
// sincronizzata in locale da Google Drive per Desktop. L'app non scrive mai
// dentro la cartella: legge l'albero e tiene un indice in DocumentoDrive.
// La radice si imposta con DRIVE_ADV_DIR (default: G:\Il mio Drive\ADV DELUXY SRL).

export const DRIVE_DIR_DEFAULT = "G:\\Il mio Drive\\ADV DELUXY SRL";
export const CHIAVE_CARTELLA = "drive.cartella";
export const CHIAVE_APIKEY = "drive.apikey";

// La cartella si sceglie in Impostazioni; se non è mai stata scelta valgono
// la variabile d'ambiente e poi il percorso di default. Può essere un percorso
// locale (Google Drive per Desktop) OPPURE un link/ID di cartella Google Drive:
// nel secondo caso la sync legge via API e funziona da qualsiasi dispositivo.
export async function driveDir(): Promise<string> {
  const salvata = await prisma.impostazione
    .findUnique({ where: { chiave: CHIAVE_CARTELLA } })
    .catch(() => null);
  return salvata?.valore || process.env.DRIVE_ADV_DIR || DRIVE_DIR_DEFAULT;
}

async function driveApiKey(): Promise<string | null> {
  const salvata = await prisma.impostazione
    .findUnique({ where: { chiave: CHIAVE_APIKEY } })
    .catch(() => null);
  return salvata?.valore || process.env.GOOGLE_DRIVE_API_KEY || null;
}

// Riconosce se l'impostazione è un Google Drive (link o ID cartella) invece di
// un percorso su disco, ed estrae l'id della cartella.
export function idCartellaDrive(valore: string): string | null {
  const v = valore.trim();
  const daUrl = v.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{20,})/);
  if (daUrl) return daUrl[1];
  const daOpen = v.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  if (daOpen) return daOpen[1];
  // Solo id nudo (nessuna barra, nessun backslash, lunghezza tipica)
  if (/^[A-Za-z0-9_-]{25,}$/.test(v)) return v;
  return null;
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
  let radice = await driveDir();
  // Se l'impostazione è un Google Drive online, si sincronizza via API…
  const idDrive = idCartellaDrive(radice);
  if (idDrive) {
    const apiKey = await (async () => {
      const salvata = await prisma.impostazione
        .findUnique({ where: { chiave: CHIAVE_APIKEY } })
        .catch(() => null);
      return salvata?.valore || process.env.GOOGLE_DRIVE_API_KEY || null;
    })();
    if (apiKey) return sincronizzaDriveApi(idDrive);
    // …ma senza chiave API si ripiega sulla cartella locale, se c'è:
    // meglio una sync locale riuscita che un errore ripetuto.
    const locale = process.env.DRIVE_ADV_DIR || DRIVE_DIR_DEFAULT;
    try {
      await fs.access(locale);
      radice = locale;
    } catch {
      return {
        radice: `drive:${idDrive}`, trovati: 0, nuovi: 0, aggiornati: 0, rimossi: 0,
        errore: "Modalità Google Drive online senza chiave API e nessuna cartella locale disponibile: aggiungi la chiave in Impostazioni.",
      };
    }
  }

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

  await scordaFileSpariti(visti, esito);
  return esito;
}

// File spariti dal Drive: l'indice li dimentica (il Drive resta la verità).
async function scordaFileSpariti(visti: Set<string>, esito: EsitoSync) {
  const tutti = await prisma.documentoDrive.findMany({ select: { id: true, percorso: true } });
  for (const doc of tutti) {
    if (!visti.has(doc.percorso)) {
      await prisma.documentoDrive.delete({ where: { id: doc.id } });
      esito.rimossi++;
    }
  }
}

// ---------- Sincronizzazione via API Google Drive ----------
// Funziona da qualsiasi server/dispositivo: legge la cartella condivisa
// "chiunque abbia il link" con una chiave API Google (sola lettura). Serve
// GOOGLE_DRIVE_API_KEY (o l'impostazione drive.apikey). L'app non scrive mai.

type FileDrive = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string };

const MIME_CARTELLA = "application/vnd.google-apps.folder";
// Estensione dedotta dal MIME per i documenti nativi Google (che non hanno estensione nel nome).
const ESTENSIONE_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": ".gdoc",
  "application/vnd.google-apps.spreadsheet": ".gsheet",
  "application/vnd.google-apps.presentation": ".gslides",
  "application/pdf": ".pdf",
  "text/markdown": ".md",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

function estensioneDa(nome: string, mime: string): string {
  const daNome = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")).toLowerCase() : "";
  if (daNome && ESTENSIONI.has(daNome)) return daNome;
  return ESTENSIONE_MIME[mime] ?? daNome;
}

export async function sincronizzaDriveApi(idRadice: string): Promise<EsitoSync> {
  const esito: EsitoSync = { radice: `drive:${idRadice}`, trovati: 0, nuovi: 0, aggiornati: 0, rimossi: 0 };
  const apiKey = await driveApiKey();
  if (!apiKey) {
    esito.errore =
      "Manca la chiave API Google Drive: impostala in Impostazioni (o GOOGLE_DRIVE_API_KEY). La cartella dev'essere condivisa “chiunque abbia il link può visualizzare”.";
    return esito;
  }

  async function elenca(idCartella: string): Promise<FileDrive[]> {
    const risultati: FileDrive[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("q", `'${idCartella}' in parents and trashed=false`);
      url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size,modifiedTime)");
      url.searchParams.set("pageSize", "1000");
      url.searchParams.set("key", apiKey!);
      url.searchParams.set("supportsAllDrives", "true");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const r = await fetch(url);
      if (!r.ok) {
        throw new Error(`Drive API ${r.status}: ${(await r.text()).slice(0, 200)}`);
      }
      const dati = (await r.json()) as { files?: FileDrive[]; nextPageToken?: string };
      risultati.push(...(dati.files ?? []));
      pageToken = dati.nextPageToken;
    } while (pageToken);
    return risultati;
  }

  const visti = new Set<string>();

  async function visita(idCartella: string, prefisso: string) {
    let voci: FileDrive[];
    try {
      voci = await elenca(idCartella);
    } catch (e) {
      // errore alla radice = fatale; su sottocartelle si prosegue
      if (prefisso === "") esito.errore = (e as Error).message;
      return;
    }
    for (const voce of voci) {
      if (daSaltare(voce.name)) continue;
      const relativo = prefisso ? `${prefisso}/${voce.name}` : voce.name;
      if (voce.mimeType === MIME_CARTELLA) {
        await visita(voce.id, relativo);
        continue;
      }
      const estensione = estensioneDa(voce.name, voce.mimeType);
      if (!ESTENSIONI.has(estensione)) continue;
      visti.add(relativo);
      esito.trovati++;

      const { brand, categoria } = classifica(relativo);
      const modificatoIl = voce.modifiedTime ? new Date(voce.modifiedTime) : new Date();
      const dati = {
        nome: voce.name,
        cartella: prefisso,
        estensione,
        brand,
        categoria,
        dimensione: voce.size ? Number(voce.size) : 0,
        modificatoIl,
        sincronizzatoIl: new Date(),
      };
      const esistente = await prisma.documentoDrive.findUnique({ where: { percorso: relativo } });
      if (!esistente) {
        await prisma.documentoDrive.create({ data: { percorso: relativo, ...dati } });
        esito.nuovi++;
      } else if (
        esistente.dimensione !== dati.dimensione ||
        esistente.modificatoIl.getTime() !== modificatoIl.getTime()
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

  await visita(idRadice, "");
  if (esito.errore) return esito; // radice irraggiungibile: non cancellare l'indice
  await scordaFileSpariti(visti, esito);
  return esito;
}
