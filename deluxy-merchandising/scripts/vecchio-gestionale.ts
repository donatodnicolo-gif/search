// **Il lettore del dump del vecchio gestionale.**
//
// Nato l'08/09/2026 estraendo il parser da `importa-plus-prodotto.ts`, quando è
// servito leggere una seconda colonna (`productCategoryMetaFields`, i valori
// delle sezioni) e poi una terza (`alternateProductName`). Tre copie dello
// stesso parser sarebbero divergute alla prima correzione.
//
// ⚠️ Due trappole già pagate, e sono nel codice qui sotto:
// 1. **L'INSERT è spezzato su più righe**: l'intestazione con le colonne finisce
//    con `) VALUES` e le tuple stanno nelle righe successive, fino a quella che
//    chiude con `;`. Cercandole sulla stessa riga si leggono **zero prodotti
//    senza nessun errore** — l'import «riesce» e non importa niente.
// 2. **Il dump dichiara `CHARSET=latin1` ma i byte sono UTF-8**: leggendolo in
//    latin1, «specialità» diventa «specialitÃ » e «€» diventa «â¬». Si guarda
//    il contenuto, non l'intestazione.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export const DUMP_PREDEFINITO = "C:/Users/nicol/Downloads/localhost.sql";

/**
 * Spacchetta una tupla `(...)` di un INSERT MySQL rispettando apici ed escape.
 * Con una regexp si sbaglia sul primo testo che contiene una virgola dentro le
 * virgolette — e qui i testi sono descrizioni di prodotto piene di virgole.
 */
export function valori(tupla: string): (string | null)[] {
  const out: (string | null)[] = [];
  let i = 0;
  while (i < tupla.length) {
    while (i < tupla.length && (tupla[i] === " " || tupla[i] === "," || tupla[i] === "\n" || tupla[i] === "\r")) i++;
    if (i >= tupla.length) break;
    if (tupla[i] === "'") {
      i++;
      let s = "";
      while (i < tupla.length) {
        const c = tupla[i];
        if (c === "\\") {
          const n = tupla[i + 1];
          s += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n === "0" ? "" : n;
          i += 2;
          continue;
        }
        if (c === "'") {
          if (tupla[i + 1] === "'") { s += "'"; i += 2; continue; }
          i++;
          break;
        }
        s += c;
        i++;
      }
      out.push(s);
    } else {
      let s = "";
      while (i < tupla.length && tupla[i] !== ",") { s += tupla[i]; i++; }
      const t = s.trim();
      out.push(t === "NULL" ? null : t);
    }
  }
  return out;
}

/** Le tuple di un INSERT multi-riga: `(...),(...),(...);` */
export function tuple(coda: string): string[] {
  const out: string[] = [];
  let i = 0, prof = 0, inizio = -1, apici = false;
  while (i < coda.length) {
    const c = coda[i];
    if (apici) {
      if (c === "\\") { i += 2; continue; }
      if (c === "'") apici = false;
      i++;
      continue;
    }
    if (c === "'") { apici = true; i++; continue; }
    if (c === "(") { if (prof === 0) inizio = i + 1; prof++; i++; continue; }
    if (c === ")") { prof--; if (prof === 0 && inizio >= 0) out.push(coda.slice(inizio, i)); i++; continue; }
    i++;
  }
  return out;
}

/**
 * Legge una tabella del dump e torna una riga per record, con le sole colonne
 * chieste. `colonneVolute` sono i nomi del vecchio gestionale.
 */
export async function leggiTabella(
  tabella: string,
  colonneVolute: string[],
  dump: string = DUMP_PREDEFINITO,
): Promise<Record<string, string | null>[]> {
  const prefisso = "INSERT INTO `" + tabella + "` (";
  const righe: Record<string, string | null>[] = [];
  let colonne: string[] | null = null;
  let dentro = false;
  let buffer = "";
  const svuota = () => {
    if (!buffer || !colonne) { buffer = ""; return; }
    const indici = colonneVolute.map((c) => [c, (colonne as string[]).indexOf(c)] as const);
    for (const t of tuple(buffer)) {
      const v = valori(t);
      const r: Record<string, string | null> = {};
      for (const [nome, i] of indici) r[nome] = i >= 0 ? v[i] ?? null : null;
      righe.push(r);
    }
    buffer = "";
  };
  const rl = createInterface({ input: createReadStream(dump, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const linea of rl) {
    if (linea.startsWith(prefisso)) {
      svuota();
      const fine = linea.indexOf(") VALUES");
      if (fine < 0) continue;
      if (!colonne) {
        colonne = linea.slice(linea.indexOf("(") + 1, fine).split(",").map((c) => c.trim().replace(/`/g, ""));
        const mancanti = colonneVolute.filter((c) => (colonne as string[]).indexOf(c) < 0);
        if (mancanti.length) throw new Error(`colonne assenti in ${tabella}: ${mancanti.join(", ")}`);
      }
      dentro = true;
      buffer = linea.slice(fine + 8);
      if (linea.trimEnd().endsWith(";")) { svuota(); dentro = false; }
      continue;
    }
    if (!dentro) continue;
    if (/^(INSERT|CREATE|ALTER|DROP|LOCK|UNLOCK|\/\*)/.test(linea)) { svuota(); dentro = false; continue; }
    buffer += "\n" + linea;
    if (linea.trimEnd().endsWith(";")) { svuota(); dentro = false; }
  }
  svuota();
  return righe;
}

/** Via l'HTML e gli spazi doppi: quello che resta è testo da leggere. */
export function pulisci(testo: string): string {
  return testo
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&egrave;/gi, "è").replace(/&agrave;/gi, "à").replace(/&ograve;/gi, "ò")
    .replace(/&igrave;/gi, "ì").replace(/&ugrave;/gi, "ù").replace(/&eacute;/gi, "é")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n").map((r) => r.trim()).join("\n")
    .trim();
}

/** Il nome normalizzato, per riconoscere lo stesso prodotto senza SKU. */
export const normalizza = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Carica il `.env` dell'app: gli script girano fuori da Next. */
export function caricaEnv(): void {
  const fs = require("node:fs") as typeof import("node:fs");
  for (const line of fs.readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
