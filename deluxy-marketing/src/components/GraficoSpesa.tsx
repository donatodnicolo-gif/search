import { formattaEuro } from "@/lib/dominio";

// Grafico a barre della spesa giornaliera, SVG renderizzato lato server:
// nessuna libreria, solo token del design system.
export function GraficoSpesa({ punti }: { punti: { data: Date; valore: number }[] }) {
  if (punti.length === 0) {
    return <div className="vuoto-mini">Nessuna metrica di spesa registrata</div>;
  }
  const w = 600;
  const h = 120;
  const gap = 3;
  const max = Math.max(...punti.map((p) => p.valore), 1);
  const barW = (w - gap * (punti.length - 1)) / punti.length;
  const totale = punti.reduce((s, p) => s + p.valore, 0);

  return (
    <div>
      <svg className="grafico-spesa" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        {punti.map((p, i) => {
          const barH = Math.max((p.valore / max) * (h - 8), p.valore > 0 ? 3 : 1);
          return (
            <rect
              key={i}
              x={i * (barW + gap)}
              y={h - barH}
              width={barW}
              height={barH}
              rx={2}
              fill={p.valore > 0 ? "var(--gold)" : "var(--fill-active)"}
            />
          );
        })}
      </svg>
      <div className="grafico-legenda">
        <span>
          {punti[0].data.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} →{" "}
          {punti[punti.length - 1].data.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
        </span>
        <span>
          Totale {formattaEuro(totale)} · picco {formattaEuro(max)}
        </span>
      </div>
    </div>
  );
}
