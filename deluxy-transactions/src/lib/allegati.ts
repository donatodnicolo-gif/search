import { createHash } from "crypto";
import { prisma } from "./db";
import { registra } from "./audit";

// Allegati delle richieste: documenti a corredo («richiesta») e prove di
// pagamento («prova»).
//
// Regole decise con la giuria del 28/08/2026:
//  • i BYTE stanno in una tabella a parte (AllegatoDati): nessun elenco può
//    tirarli giù per sbaglio. Interim dichiarato: oltre 500 MB complessivi o
//    2.000 allegati si migra a object storage;
//  • il tipo NON si prende in parola dal chiamante: si verifica sui magic
//    bytes (un HTML travestito da PNG non entra);
//  • la «prova» la scrive solo un operatore di quest'app, mai l'app che ha
//    chiesto il pagamento — la prova non la scrive l'accusato;
//  • sha256 su ogni file: verifica end-to-end per chi scarica e dedup del
//    doppio upload.

export const TIPI_ALLEGATO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

// 1,5 MB: lo stesso tetto delle ricevute del Customer Service, per lo stesso
// motivo (payload delle funzioni serverless) più il cluster condiviso.
export const TETTO_ALLEGATO = 1_500_000;
export const MAX_ALLEGATI_PER_RICHIESTA = 5;

/** Il tipo VERO, letto dai primi byte. null = non riconosciuto. */
export function tipoDaiMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

/** Nome file ripulito: niente percorsi, niente caratteri strani. */
export function nomeFilePulito(nome: string, tipo: string): string {
  const base = (nome ?? "").split(/[\\/]/).pop() ?? "";
  const pulito = base.replace(/[^\w.\- ]/g, "").trim().slice(0, 120);
  const estensione = TIPI_ALLEGATO[tipo];
  if (!pulito || pulito.startsWith(".")) return `allegato.${estensione}`;
  return pulito.toLowerCase().endsWith(`.${estensione}`) ? pulito : `${pulito}.${estensione}`;
}

export type EsitoAllegato =
  | { ok: true; allegato: { id: string; nome: string; tipo: string; byte: number; sha256: string; ruolo: string }; ripetuto: boolean }
  | { ok: false; stato: number; errore: string };

export async function salvaAllegato(dati: {
  richiestaId: string;
  ruolo: "richiesta" | "prova";
  nome: string;
  buffer: Buffer;
  caricatoDa: string;
  ip?: string | null;
}): Promise<EsitoAllegato> {
  if (dati.buffer.length === 0) return { ok: false, stato: 400, errore: "File vuoto." };
  if (dati.buffer.length > TETTO_ALLEGATO) {
    return { ok: false, stato: 413, errore: `File troppo grande: il limite è ${Math.round(TETTO_ALLEGATO / 1000)} KB.` };
  }
  const tipo = tipoDaiMagicBytes(dati.buffer);
  if (!tipo) {
    return {
      ok: false,
      stato: 415,
      errore: "Tipo di file non riconosciuto: si accettano solo immagini (png, jpg, webp, gif) e PDF.",
    };
  }

  const richiesta = await prisma.richiesta.findUnique({
    where: { id: dati.richiestaId },
    select: { id: true, riferimento: true, _count: { select: { allegati: true } } },
  });
  if (!richiesta) return { ok: false, stato: 404, errore: "Richiesta inesistente." };
  if (richiesta._count.allegati >= MAX_ALLEGATI_PER_RICHIESTA) {
    return { ok: false, stato: 409, errore: `Questa richiesta ha già ${MAX_ALLEGATI_PER_RICHIESTA} allegati: è il massimo.` };
  }

  // Impronta dei BYTE grezzi: chi scarica la verifica con un normale
  // sha256 del file, senza sapere come lo conserviamo noi.
  const impronta = createHash("sha256").update(dati.buffer).digest("hex");

  // Stesso file già presente: si risponde con quello, non si duplica.
  const esistente = await prisma.allegato.findUnique({
    where: { richiestaId_sha256: { richiestaId: richiesta.id, sha256: impronta } },
  });
  if (esistente) {
    return {
      ok: true,
      ripetuto: true,
      allegato: {
        id: esistente.id,
        nome: esistente.nome,
        tipo: esistente.tipo,
        byte: esistente.byte,
        sha256: esistente.sha256,
        ruolo: esistente.ruolo,
      },
    };
  }

  const nome = nomeFilePulito(dati.nome, tipo);
  const creato = await prisma.allegato.create({
    data: {
      richiestaId: richiesta.id,
      ruolo: dati.ruolo,
      nome,
      tipo,
      byte: dati.buffer.length,
      sha256: impronta,
      caricatoDa: dati.caricatoDa,
      dati: { create: { dati: dati.buffer.toString("base64") } },
    },
  });

  await registra(
    "richiesta.aggiornata",
    dati.caricatoDa,
    { riferimento: richiesta.riferimento, allegato: nome, ruolo: dati.ruolo, byte: dati.buffer.length, sha256: impronta },
    { richiestaId: richiesta.id, ip: dati.ip },
  );

  return {
    ok: true,
    ripetuto: false,
    allegato: { id: creato.id, nome, tipo, byte: creato.byte, sha256: impronta, ruolo: creato.ruolo },
  };
}

/** Metadati degli allegati di una richiesta (mai i byte). */
export async function elencaAllegati(richiestaId: string) {
  return prisma.allegato.findMany({
    where: { richiestaId },
    orderBy: { creatoIl: "asc" },
    select: { id: true, ruolo: true, nome: true, tipo: true, byte: true, sha256: true, caricatoDa: true, creatoIl: true },
  });
}

/** Intestazioni di difesa per servire un allegato: mai inline, mai sniffing. */
export function intestazioniDownload(a: { nome: string; tipo: string }): Record<string, string> {
  return {
    // Il Content-Type esce dalla whitelist, non dal database.
    "Content-Type": TIPI_ALLEGATO[a.tipo] ? a.tipo : "application/octet-stream",
    "Content-Disposition": `attachment; filename="${a.nome.replace(/"/g, "")}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };
}
