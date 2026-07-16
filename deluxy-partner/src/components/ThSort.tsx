import Link from "next/link";

// Intestazione di colonna ordinabile: click alterna asc/desc mantenendo i filtri.
export function ThSort({
  label,
  campo,
  sp,
  path,
  num,
}: {
  label: string;
  campo: string;
  sp: Record<string, string | undefined>;
  path: string;
  num?: boolean;
}) {
  const attivo = sp.sort === campo;
  const dir = attivo && sp.dir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v != null && v !== "" && k !== "sort" && k !== "dir") params.set(k, v);
  }
  params.set("sort", campo);
  params.set("dir", dir);
  return (
    <th className={num ? "num" : undefined}>
      <Link
        href={`${path}?${params.toString()}`}
        style={{
          color: attivo ? "var(--text)" : undefined,
          fontWeight: attivo ? 600 : undefined,
          whiteSpace: "nowrap",
        }}
      >
        {label}
        {attivo ? (sp.dir === "asc" ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );
}

// Ordina righe su un valore estratto (null in fondo, stringhe con localeCompare)
export function ordina<T>(
  rows: T[],
  val: (t: T) => string | number | Date | boolean | null | undefined,
  dir: string | undefined
): T[] {
  const mult = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" && typeof vb === "string") {
      return mult * va.localeCompare(vb, "it", { sensitivity: "base" });
    }
    const na = va instanceof Date ? va.getTime() : Number(va);
    const nb = vb instanceof Date ? vb.getTime() : Number(vb);
    return mult * (na - nb);
  });
}
