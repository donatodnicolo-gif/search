import { promises as fs } from "fs";
import path from "path";
import { importaAnalisiDaDrive } from "./analisi-drive";
import { prisma } from "./db";
import { segreto } from "./segreti";

// Indicizzazione (SOLA LETTURA) della cartella ufficiale "ADV DELUXY SRL",
// sincronizzata in locale da Google Drive per Desktop. L'app non scrive mai
// dentro la cartella: legge l'albero e tiene un indice in DocumentoDrive.
// La radice si imposta con DRIVE_ADV_DIR (default: G:\Il mio Drive\ADV DELUXY SRL).
//
// ⚠️ Trappola pagata il 28/07/2026: la sync toccava 179 documenti su 669 e
// moriva, senza lasciare niente nel registro. La causa non era il Drive: era
// UNA QUERY PER FILE (findUnique + update, ~1.350 andate e ritorno) più una
// delete per ogni file sparito. Su Vercel la funzione scadeva a metà strada.
// Ora si fa una lettura sola dell'indice, il confronto in memoria e scritture
// in blocco; e la corsa si annota in `SyncDrive` PRIMA di cominciare, così
// anche una sync morta lascia scritto che è morta.

export const DRIVE_DIR_DEFAULT = "G:\\Il mio Drive\\ADV DELUXY SRL";
export const CHIAVE_CARTELLA = "drive.cartella";
export const CHIAVE_APIKEY = "drive.apikey";

// Quanto può durare una passata prima di fermarsi da sola. Sotto il limite
// delle funzioni Vercel: meglio fermarsi ordinatamente e ripartire, che essere
// uccisi a metà di una scrittura.
const BUDGET_MS = Number(process.env.DRIVE_SYNC_BUDGET_MS ?? 45_000);

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
  // ⚠️ L'AMBIENTE COMANDA, il database è il ripiego. Prima era il contrario:
  // mettere la chiave fra le variabili non disattivava quella salvata, che
  // restava in chiaro su un Postgres condiviso da quattordici app — e nessuno
  // se ne accorgeva, perché l'app funzionava lo stesso. Vedi `lib/segreti.ts`.
  return segreto(CHIAVE_APIKEY);
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
  analisi: number;
  // true = la passata si è fermata da sola per non scadere: l'indice è
  // aggiornato fin dove è arrivata, e la prossima riparte da lì.
  interrotta: boolean;
  ripartiDa?: string | null;
  errore?: string;
};

// Un file visto durante la passata, prima di toccare il database.
type Trovato = {
  percorso: string;
  nome: string;
  cartella: string;
  estensione: string;
  brand: string;
  categoria: string;
  dimensione: number;
  modificatoIl: Date;
};

// ---------- Il pezzo comune: dal risultato della passata al database ----------

// Confronto in memoria e scritture in blocco. Qui non si entra mai con una
// query per file: si legge l'indice una volta, si guarda cosa è cambiato e si
// scrive solo quello.
async function applica(
  trovati: Trovato[],
  opzioni: { completa: boolean },
  esito: EsitoSync
) {
  const indice = await prisma.documentoDrive.findMany({
    select: { id: true, percorso: true, dimensione: true, modificatoIl: true },
  });
  const perPercorso = new Map(indice.map((d) => [d.percorso, d]));

  const nuovi: Trovato[] = [];
  const cambiati: Trovato[] = [];
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
    // createMany in un colpo solo; skipDuplicates perché due passate
    // sovrapposte non devono far esplodere niente.
    await prisma.documentoDrive.createMany({
      data: nuovi.map((t) => ({ ...t, sincronizzatoIl: new Date() })),
      skipDuplicates: true,
    });
    esito.nuovi = nuovi.length;
  }

  // Gli aggiornamenti restano uno per file, ma sono solo quelli davvero
  // cambiati: in un giorno normale sono una manciata, non 669.
  for (const t of cambiati) {
    await prisma.documentoDrive.update({
      where: { percorso: t.percorso },
      data: { ...t, sincronizzatoIl: new Date() },
    });
  }
  esito.aggiornati = cambiati.length;

  // I file spariti si dimenticano SOLO se la passata è arrivata in fondo: con
  // un elenco parziale si cancellerebbe mezzo indice.
  if (opzioni.completa) {
    const visti = new Set(trovati.map((t) => t.percorso));
    const spariti = indice.filter((d) => !visti.has(d.percorso)).map((d) => d.id);
    if (spariti.length > 0) {
      await prisma.documentoDrive.deleteMany({ where: { id: { in: spariti } } });
      esito.rimossi = spariti.length;
    }
  }
}

// Apre la corsa nel registro PRIMA di lavorare: se la funzione muore, resta
// scritto che è morta e da dove ripartire.
async function apriCorsa(radice: string, ripartiDa: string | null) {
  return prisma.syncDrive.create({
    data: { stato: "in_corso", radice, ripartiDa },
  });
}

async function chiudiCorsa(id: string, esito: EsitoSync) {
  const stato = esito.errore ? "errore" : esito.interrotta ? "interrotta" : "completata";
  const messaggio =
    esito.errore ??
    (esito.ripartiDa
      ? `Fermata a "${esito.ripartiDa}" per non scadere: la prossima passata riparte da lì.`
      : esito.interrotta
        ? "Passata di ripresa: recuperato quello che mancava. Il giro intero (con la pulizia dei file spariti) si rifà alla prossima."
        : null);
  await prisma.syncDrive
    .update({
      where: { id },
      data: {
        stato,
        trovati: esito.trovati,
        nuovi: esito.nuovi,
        aggiornati: esito.aggiornati,
        rimossi: esito.rimossi,
        analisi: esito.analisi,
        ripartiDa: esito.ripartiDa ?? null,
        completataIl: stato === "completata" ? new Date() : null,
        messaggio,
      },
    })
    .catch(() => {});
}

// Da dove ripartire: se l'ultima corsa si è fermata a metà, si riprende dalla
// cartella su cui si era fermata invece di rifare tutto da capo.
export async function ripresaDaUltimaCorsa(): Promise<string | null> {
  const ultima = await prisma.syncDrive
    .findFirst({ orderBy: { iniziataIl: "desc" } })
    .catch(() => null);
  if (!ultima) return null;
  if (ultima.stato === "interrotta" || ultima.stato === "in_corso") return ultima.ripartiDa;
  return null;
}

// La cartella su disco, se c'è. Da Vercel non c'è mai; dal PC di chi lavora
// quasi sempre sì, anche quando la sync gira in modalità online.
async function cartellaLocaleSeCe(): Promise<string | null> {
  const locale = process.env.DRIVE_ADV_DIR || DRIVE_DIR_DEFAULT;
  try {
    await fs.access(locale);
    return locale;
  } catch {
    return null;
  }
}

export async function ultimaSyncDrive() {
  return prisma.syncDrive.findFirst({ orderBy: { iniziataIl: "desc" } }).catch(() => null);
}

// Una cartella si può saltare del tutto quando la ripresa è più avanti nel
// giro. L'ordine di visita è alfabetico e quindi deterministico: senza questo,
// "riprendi da" non vorrebbe dire niente.
function saltabile(percorsoCartella: string, ripartiDa: string | null): boolean {
  if (!ripartiDa) return false;
  if (percorsoCartella === "") return false;
  if (ripartiDa === percorsoCartella) return false;
  if (ripartiDa.startsWith(`${percorsoCartella}/`)) return false; // contiene il punto di ripresa
  // Stesso confronto usato per ordinare la visita: se i due metri non
  // combaciano, "riparti da" salta le cartelle sbagliate.
  return percorsoCartella.localeCompare(ripartiDa) < 0;
}

// ---------- Sincronizzazione dalla cartella locale ----------

export async function sincronizzaDrive(): Promise<EsitoSync> {
  let radice = await driveDir();
  // Se l'impostazione è un Google Drive online, si sincronizza via API…
  const idDrive = idCartellaDrive(radice);
  if (idDrive) {
    const apiKey = await driveApiKey();
    if (apiKey) return sincronizzaDriveApi(idDrive);
    // …ma senza chiave API si ripiega sulla cartella locale, se c'è:
    // meglio una sync locale riuscita che un errore ripetuto.
    const locale = process.env.DRIVE_ADV_DIR || DRIVE_DIR_DEFAULT;
    try {
      await fs.access(locale);
      radice = locale;
    } catch {
      return {
        radice: `drive:${idDrive}`, trovati: 0, nuovi: 0, aggiornati: 0, rimossi: 0, analisi: 0,
        interrotta: false,
        errore: "Modalità Google Drive online senza chiave API e nessuna cartella locale disponibile: aggiungi la chiave in Impostazioni.",
      };
    }
  }

  const esito: EsitoSync = {
    radice, trovati: 0, nuovi: 0, aggiornati: 0, rimossi: 0, analisi: 0, interrotta: false,
  };

  try {
    await fs.access(radice);
  } catch {
    esito.errore = `Cartella Drive non raggiungibile: ${radice}. Verificare Google Drive per Desktop o DRIVE_ADV_DIR.`;
    return esito;
  }

  const ripartiDa = await ripresaDaUltimaCorsa();
  const corsa = await apriCorsa(radice, ripartiDa);
  const scadenza = Date.now() + BUDGET_MS;
  const trovati: Trovato[] = [];
  let fermatoA: string | null = null;

  async function visita(dir: string, prefisso: string) {
    if (fermatoA) return;
    if (saltabile(prefisso, ripartiDa)) return;
    if (Date.now() > scadenza) {
      fermatoA = prefisso;
      return;
    }
    let voci;
    try {
      voci = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // cartella non leggibile: si salta senza fermare la sync
    }
    // Ordine alfabetico: è quello che rende sensato "riparti da".
    voci.sort((a, b) => a.name.localeCompare(b.name));

    for (const voce of voci) {
      if (daSaltare(voce.name)) continue;
      const pieno = path.join(dir, voce.name);
      const relativo = prefisso ? `${prefisso}/${voce.name}` : voce.name;
      if (voce.isDirectory()) {
        await visita(pieno, relativo);
        if (fermatoA) return;
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
  esito.trovati = trovati.length;
  esito.interrotta = fermatoA != null || ripartiDa != null;
  esito.ripartiDa = fermatoA;

  await applica(trovati, { completa: fermatoA == null && ripartiDa == null }, esito);

  // Le analisi vivono su Drive: qui diventano record dell'app. Se il tempo era
  // già finito non si comincia nemmeno: si farà alla ripresa.
  if (fermatoA == null) {
    const analisi = await importaAnalisiDaDrive(radice);
    esito.analisi = analisi.create;
    if (analisi.errore) esito.errore = analisi.errore;
  }

  await chiudiCorsa(corsa.id, esito);
  return esito;
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
  const esito: EsitoSync = {
    radice: `drive:${idRadice}`, trovati: 0, nuovi: 0, aggiornati: 0, rimossi: 0, analisi: 0,
    interrotta: false,
  };
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

  const ripartiDa = await ripresaDaUltimaCorsa();
  const corsa = await apriCorsa(esito.radice, ripartiDa);
  const scadenza = Date.now() + BUDGET_MS;
  const trovati: Trovato[] = [];
  let fermatoA: string | null = null;

  async function visita(idCartella: string, prefisso: string) {
    if (fermatoA) return;
    // Saltare una cartella qui vale doppio: è anche una chiamata di rete
    // risparmiata, ed è la rete a far scadere la funzione.
    if (saltabile(prefisso, ripartiDa)) return;
    if (Date.now() > scadenza) {
      fermatoA = prefisso;
      return;
    }
    let voci: FileDrive[];
    try {
      voci = await elenca(idCartella);
    } catch (e) {
      // errore alla radice = fatale; su sottocartelle si prosegue
      if (prefisso === "") esito.errore = (e as Error).message;
      return;
    }
    voci.sort((a, b) => a.name.localeCompare(b.name));

    for (const voce of voci) {
      if (daSaltare(voce.name)) continue;
      const relativo = prefisso ? `${prefisso}/${voce.name}` : voce.name;
      if (voce.mimeType === MIME_CARTELLA) {
        await visita(voce.id, relativo);
        if (fermatoA) return;
        continue;
      }
      const estensione = estensioneDa(voce.name, voce.mimeType);
      if (!ESTENSIONI.has(estensione)) continue;
      const { brand, categoria } = classifica(relativo);
      trovati.push({
        percorso: relativo,
        nome: voce.name,
        cartella: prefisso,
        estensione,
        brand,
        categoria,
        dimensione: voce.size ? Number(voce.size) : 0,
        modificatoIl: voce.modifiedTime ? new Date(voce.modifiedTime) : new Date(),
      });
    }
  }

  await visita(idRadice, "");
  esito.trovati = trovati.length;

  if (esito.errore) {
    // Radice irraggiungibile: non si tocca l'indice, si scrive perché.
    await chiudiCorsa(corsa.id, esito);
    return esito;
  }

  esito.interrotta = fermatoA != null || ripartiDa != null;
  esito.ripartiDa = fermatoA;
  await applica(trovati, { completa: fermatoA == null && ripartiDa == null }, esito);

  // Via API la cartella locale può non esistere (Vercel): le analisi si creano
  // lo stesso, con la sintesi che dice che il documento non è stato letto.
  if (fermatoA == null) {
    // Anche in modalità online, se la stessa cartella è montata in locale
    // (Google Drive per Desktop sul PC di chi lancia la sync) i percorsi
    // combaciano: si leggono le prime righe invece di scrivere "non letto".
    const locale = await cartellaLocaleSeCe();
    const analisi = await importaAnalisiDaDrive(locale);
    esito.analisi = analisi.create;
    if (analisi.errore) esito.errore = analisi.errore;
  }

  await chiudiCorsa(corsa.id, esito);
  return esito;
}
