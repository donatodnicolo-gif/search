// Il server (Vercel) vive in UTC ma l'app parla l'ora di Roma. Un input
// <input type="datetime-local"> arriva "naive" (senza fuso): interpretarlo con
// `new Date(testo)` sul server lo sposterebbe di 1–2 ore. Qui si interpreta
// SEMPRE come ora italiana, qualunque sia il fuso del runtime.

function offsetRomaMinuti(d: Date): number {
  const testo = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    timeZoneName: "longOffset",
  }).format(d);
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(testo);
  if (!m) return 60;
  const segno = m[1] === "-" ? -1 : 1;
  return segno * (Number(m[2]) * 60 + Number(m[3]));
}

// "2026-08-24T19:30" (ora di Roma) → Date (istante UTC corretto).
export function daOraItaliana(testo: string | null | undefined): Date | null {
  if (!testo) return null;
  const [data, ora] = testo.split("T");
  const [y, m, g] = (data ?? "").split("-").map(Number);
  if (!y || !m || !g) return null;
  const [h, min] = (ora ?? "12:00").split(":").map(Number);
  const candidataUtc = Date.UTC(y, m - 1, g, h ?? 12, min ?? 0);
  // L'offset dipende dalla data stessa (ora legale): si calcola sulla candidata.
  const offset = offsetRomaMinuti(new Date(candidataUtc));
  return new Date(candidataUtc - offset * 60_000);
}

// Date → "2026-08-24T19:30" in ora di Roma (per precompilare i datetime-local).
export function aOraItaliana(d: Date | null | undefined): string {
  if (!d) return "";
  const parti = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return parti.replace(" ", "T");
}
