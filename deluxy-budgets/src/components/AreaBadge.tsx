"use client";

import { usePathname } from "next/navigation";
import { areaDi, AREE } from "@/lib/aree";

// Etichetta in cima a ogni pagina: dice se stai guardando dati di BUDGET
// (pianificati) o di CONSUNTIVO (reali). Una sola resa, valida ovunque.
export function AreaBadge() {
  const pathname = usePathname();
  const area = areaDi(pathname);
  const meta = AREE[area];
  return (
    <div className="area-strip">
      <span className={`badge ${meta.badge}`}>
        <span className="dot" />
        {meta.label}
      </span>
      <span className="area-sub">{meta.sub}</span>
    </div>
  );
}
