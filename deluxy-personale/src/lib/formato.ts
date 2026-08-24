// Formattazione e parsing in italiano.
//
// Due trappole già pagate altrove, da rispettare:
// - i numeri di 4 cifre in it-IT NON si raggruppano senza useGrouping "always"
//   ((2000).toLocaleString("it-IT") → "2000"), e qui le cifre a 4 zeri sono
//   la norma (RAL, netti);
// - le date solo-giorno (@db.Date) arrivano come mezzanotte UTC: si mostrano
//   con timeZone "UTC", altrimenti sul server (UTC) o in fusi negativi si
//   scala di un giorno.

const fmtEuro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
  useGrouping: "always" as Intl.NumberFormatOptions["useGrouping"],
});

const fmtEuroCent = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always" as Intl.NumberFormatOptions["useGrouping"],
});

const fmtNumero = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 2,
  useGrouping: "always" as Intl.NumberFormatOptions["useGrouping"],
});

export function euro(v: number): string {
  return Number.isInteger(v) ? fmtEuro.format(v) : fmtEuroCent.format(v);
}

export function numero(v: number): string {
  return fmtNumero.format(v);
}

const fmtData = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC", // per le date solo-giorno (@db.Date)
});

export function dataIt(d: Date | null | undefined): string {
  return d ? fmtData.format(d) : "—";
}

const fmtDataOra = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome", // i timestamp veri si mostrano in ora italiana
});

export function dataOraIt(d: Date | null | undefined): string {
  return d ? fmtDataOra.format(d) : "—";
}

// Valore di un <input type="date"> ("2026-08-24") per una data @db.Date.
export function dataInput(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

// Parsing di un importo scritto all'italiana: "28.500,50" → 28500.5.
// Restituisce null se non è un numero: chi chiama decide se rifiutare
// (azzerare in silenzio è peggio che rifiutare).
export function parseImporto(testo: string): number | null {
  const pulito = testo.trim();
  if (!pulito) return null;
  const normalizzato = pulito.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalizzato)) return null;
  const n = Number(normalizzato);
  return Number.isFinite(n) ? n : null;
}

// Parsing di una data da <input type="date"> ("2026-08-24") → Date UTC o null.
export function parseData(testo: string): Date | null {
  const pulito = testo.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pulito)) return null;
  const d = new Date(`${pulito}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
