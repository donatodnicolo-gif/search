import { REGOLE, parseRegole } from "@/lib/ordinamento-vetrina";

// Più regole in priorità: la 1ª decide l'ordine, le successive spezzano i
// pareggi. Sono tutti `<select name="regola">`: il form li manda come lista
// (fd.getAll("regola")) e `regoleDaForm` li legge in ordine. Nessun JS: bastano
// N select uno sotto l'altro, ognuno con un'opzione «nessuna».
const SENZA_MANUALE = REGOLE.filter((r) => r.chiave !== "manuale");

const STILE: React.CSSProperties = {
  font: "inherit",
  padding: "9px 12px",
  borderRadius: "var(--radius-m)",
  background: "var(--fill)",
  border: "1px solid transparent",
};

export function SelettoreRegole({
  valore,
  nuovo = false,
  livelli = 3,
}: {
  valore?: string | null;
  nuovo?: boolean;
  livelli?: number;
}) {
  const scelte = parseRegole(valore);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {Array.from({ length: livelli }).map((_, i) => (
        <select
          key={i}
          name="regola"
          defaultValue={scelte[i] ?? (nuovo && i === 0 ? "best_seller" : "")}
          style={STILE}
          aria-label={i === 0 ? "Regola principale" : `Criterio di spareggio ${i}`}
        >
          <option value="">{i === 0 ? "Solo a mano (nessuna regola)" : `— nessun ${i + 1}° criterio —`}</option>
          {SENZA_MANUALE.map((r) => (
            <option key={r.chiave} value={r.chiave}>
              {i === 0 ? r.nome : `a parità: ${r.nome}`}
            </option>
          ))}
        </select>
      ))}
      <span className="page-sub" style={{ margin: 0 }}>
        La 1ª regola decide l'ordine; le successive spezzano i pareggi (puoi lasciarle vuote).
      </span>
    </div>
  );
}
