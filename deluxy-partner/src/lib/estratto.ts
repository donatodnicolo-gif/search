import * as XLSX from "xlsx";
import { createHash } from "crypto";

// Parser tollerante degli estratti conto bancari (CSV o XLSX).
// Ogni banca esporta con colonne e formati diversi: qui riconosciamo le
// intestazioni più comuni delle banche italiane e i numeri/date in formato
// italiano. Se il riconoscimento fallisce, l'errore elenca le intestazioni
// trovate così da capire cosa manca.

export type MovimentoEstratto = {
  data: Date;
  importo: number; // > 0 accredito, < 0 addebito
  descrizione: string;
  controparte: string | null;
  hash: string;
};

export type EsitoParse = {
  movimenti: MovimentoEstratto[];
  scartate: number; // righe non interpretabili (totali, intestazioni ripetute…)
  intestazioni: string[];
};

const SIN_DATA = ["data contabile", "data operazione", "data valuta", "data reg", "data mov", "data", "date", "booking date", "started date", "completed date"];
const SIN_IMPORTO = ["importo", "amount", "movimento", "importo eur", "importo (eur)", "importo euro"];
const SIN_DARE = ["dare", "uscite", "addebiti", "addebito", "debit", "money out", "out"];
const SIN_AVERE = ["avere", "entrate", "accrediti", "accredito", "credit", "money in", "in"];
const SIN_DESC = ["descrizione operazione", "descrizione estesa", "descrizione", "causale", "dettagli", "description", "operazione", "note", "reference"];
const SIN_CONTROPARTE = ["ordinante", "beneficiario", "controparte", "nome controparte", "counterparty", "payee", "payer", "denominazione"];

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// "1.234,56" | "1234,56" | "1,234.56" | "-45,00" | "(45,00)" → numero
export function parseImportoIt(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  let t = String(v).trim().replace(/[€\s]/g, "").replace(/EUR/gi, "");
  if (t === "") return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  if (t.startsWith("+")) t = t.slice(1);
  const virgola = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  if (virgola > punto) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

export function parseDataIt(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && v > 20000 && v < 60000) {
    // seriale Excel
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function hashMovimento(data: Date, importo: number, descrizione: string): string {
  return createHash("sha256")
    .update(`${data.toISOString().slice(0, 10)}|${importo.toFixed(2)}|${descrizione.trim().toUpperCase()}`)
    .digest("hex")
    .slice(0, 32);
}

// CSV: rileva il delimitatore e gestisce i campi tra virgolette
function parseCsv(testo: string): string[][] {
  const righeGrezze = testo.split(/\r?\n/).filter((r) => r.trim() !== "");
  const campione = righeGrezze.slice(0, 5).join("\n");
  const conta = (c: string) => (campione.match(new RegExp(`\\${c}`, "g")) ?? []).length;
  const delim = [";", ",", "\t"].sort((a, b) => conta(b) - conta(a))[0];

  return righeGrezze.map((riga) => {
    const campi: string[] = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < riga.length; i++) {
      const ch = riga[i];
      if (ch === '"') {
        if (inQuote && riga[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === delim && !inQuote) {
        campi.push(cur); cur = "";
      } else cur += ch;
    }
    campi.push(cur);
    return campi;
  });
}

function trovaColonna(intestazioni: string[], sinonimi: string[]): number {
  // match esatto prima, poi per inizio
  for (const sin of sinonimi) {
    const i = intestazioni.findIndex((h) => h === sin);
    if (i >= 0) return i;
  }
  for (const sin of sinonimi) {
    const i = intestazioni.findIndex((h) => h.startsWith(sin) || sin.startsWith(h) && h.length >= 4);
    if (i >= 0) return i;
  }
  return -1;
}

export function parseEstratto(buffer: Buffer, nomeFile: string): EsitoParse {
  let righe: unknown[][];
  if (/\.(xlsx|xls)$/i.test(nomeFile)) {
    const wb = XLSX.read(buffer, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    righe = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
  } else {
    righe = parseCsv(buffer.toString("utf8").replace(/^﻿/, ""));
  }

  // trova la riga di intestazione nelle prime 15 righe
  let headerIdx = -1;
  let col = { data: -1, importo: -1, dare: -1, avere: -1, desc: -1, contro: -1 };
  for (let i = 0; i < Math.min(15, righe.length); i++) {
    const hs = (righe[i] ?? []).map(norm);
    const c = {
      data: trovaColonna(hs, SIN_DATA),
      importo: trovaColonna(hs, SIN_IMPORTO),
      dare: trovaColonna(hs, SIN_DARE),
      avere: trovaColonna(hs, SIN_AVERE),
      desc: trovaColonna(hs, SIN_DESC),
      contro: trovaColonna(hs, SIN_CONTROPARTE),
    };
    if (c.data >= 0 && (c.importo >= 0 || c.avere >= 0 || c.dare >= 0)) {
      headerIdx = i; col = c; break;
    }
  }
  if (headerIdx < 0) {
    const trovate = (righe[0] ?? []).map((x) => String(x ?? "")).filter(Boolean).join(" · ");
    throw new Error(
      `Non riconosco le colonne dell'estratto. Servono almeno una colonna data (es. "Data contabile") e una di importo (es. "Importo" oppure "Dare"/"Avere"). Prime intestazioni trovate: ${trovate || "nessuna"}.`
    );
  }

  const intestazioni = (righe[headerIdx] ?? []).map((x) => String(x ?? ""));
  const movimenti: MovimentoEstratto[] = [];
  let scartate = 0;

  for (let i = headerIdx + 1; i < righe.length; i++) {
    const r = righe[i] ?? [];
    const data = parseDataIt(r[col.data]);
    let importo: number | null = null;
    if (col.importo >= 0) importo = parseImportoIt(r[col.importo]);
    if (importo == null && (col.dare >= 0 || col.avere >= 0)) {
      const dare = col.dare >= 0 ? parseImportoIt(r[col.dare]) : null;
      const avere = col.avere >= 0 ? parseImportoIt(r[col.avere]) : null;
      if (dare != null || avere != null) importo = (avere ?? 0) - Math.abs(dare ?? 0);
    }
    const descrizione = col.desc >= 0 ? String(r[col.desc] ?? "").trim() : "";
    const controparte = col.contro >= 0 ? String(r[col.contro] ?? "").trim() || null : null;

    if (!data || importo == null || importo === 0) { scartate++; continue; }
    movimenti.push({
      data,
      importo,
      descrizione: descrizione || controparte || "(senza descrizione)",
      controparte,
      hash: hashMovimento(data, importo, descrizione + (controparte ?? "")),
    });
  }

  return { movimenti, scartate, intestazioni };
}
