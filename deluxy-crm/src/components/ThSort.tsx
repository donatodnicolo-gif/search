// Intestazione di colonna ordinabile: il click alterna asc/desc mantenendo
// TUTTI i filtri della pagina (Libro UX §8: l'ordinamento non è un filtro,
// vive nei th e preserva la ricerca). Riferimento: Finance `ThSort.tsx`.

export function ThSort({
  label,
  campo,
  sp,
  path,
  num,
  defaultAttivo,
  defaultDir = "asc",
}: {
  label: string;
  campo: string;
  sp: Record<string, string | undefined>;
  path: string;
  num?: boolean;
  // colonna evidenziata quando nessun ordinamento è stato scelto (default di pagina)
  defaultAttivo?: boolean;
  defaultDir?: "asc" | "desc";
}) {
  const sortCorrente = sp.sort;
  const attivo = sortCorrente ? sortCorrente === campo : Boolean(defaultAttivo);
  const dirCorrente = sortCorrente ? (sp.dir ?? "asc") : defaultDir;
  const dir = attivo && dirCorrente === "asc" ? "desc" : "asc";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v != null && v !== "" && k !== "sort" && k !== "dir" && k !== "page") params.set(k, v);
  }
  params.set("sort", campo);
  params.set("dir", dir);
  return (
    <th className={num ? "num" : undefined} aria-sort={attivo ? (dirCorrente === "asc" ? "ascending" : "descending") : "none"}>
      <a
        className="th-sort"
        href={`${path}?${params.toString()}`}
        style={{ color: attivo ? "var(--text)" : undefined, fontWeight: attivo ? 600 : undefined, whiteSpace: "nowrap" }}
      >
        {label}
        {attivo ? (dirCorrente === "asc" ? " ↑" : " ↓") : ""}
      </a>
    </th>
  );
}

// Ordina righe su un valore estratto (null in fondo, stringhe con localeCompare).
export function ordina<T>(
  rows: T[],
  val: (t: T) => string | number | Date | boolean | null | undefined,
  dir: string | undefined,
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
