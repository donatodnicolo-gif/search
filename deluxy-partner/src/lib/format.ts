const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function euro(v: number | null | undefined): string {
  if (v == null) return "—";
  // evita "-0,00"
  const x = Math.abs(v) < 0.005 ? 0 : v;
  return eur.format(x);
}

export function dataIt(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function pctIt(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toLocaleString("it-IT")}%`;
}
