import Link from "next/link";

// Intestazione di colonna ordinabile: click alterna asc/desc mantenendo i filtri.
// `chiave` distingue tabelle diverse nella stessa pagina (usa sortX/dirX invece
// di sort/dir), così ogni tabella si ordina senza toccare le altre.
export function ThSort({
  label,
  campo,
  sp,
  path,
  num,
  chiave = "",
  defaultAttivo,
}: {
  label: string;
  campo: string;
  sp: Record<string, string | undefined>;
  path: string;
  num?: boolean;
  chiave?: string;
  // colonna evidenziata quando nessun ordinamento è stato scelto (default di pagina)
  defaultAttivo?: boolean;
}) {
  const kSort = `sort${chiave}`;
  const kDir = `dir${chiave}`;
  const sortCorrente = sp[kSort];
  const dirCorrente = sp[kDir];
  const attivo = sortCorrente ? sortCorrente === campo : Boolean(defaultAttivo);
  const dir = attivo && (dirCorrente ?? "asc") === "asc" ? "desc" : "asc";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v != null && v !== "" && k !== kSort && k !== kDir) params.set(k, v);
  }
  params.set(kSort, campo);
  params.set(kDir, dir);
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
        {attivo ? ((dirCorrente ?? "asc") === "asc" ? " ↑" : " ↓") : ""}
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
