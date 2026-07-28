import { formattaEuro, MESI_IT } from "@/lib/dominio";
import type { MeseVendite } from "@/lib/trend-vendite";

// Il venduto mese per mese, e dove sta andando. SVG lato server, nessuna
// libreria, solo token del design system.
//
// Tre colori per tre cose diverse, e non è decorazione: **oro** è successo,
// **grigio tratteggiato** è il mese in corso (parziale, quindi più basso di
// quello che sarà), **blu a righe** è una proiezione. Se avessero lo stesso
// aspetto, fra sei mesi nessuno saprebbe più quale barra era un dato e quale
// una stima.
export function GraficoTrend({ mesi }: { mesi: MeseVendite[] }) {
  if (mesi.length === 0) {
    return <div className="vuoto-mini">Nessun ordine nel registro: non c&apos;è un andamento da mostrare.</div>;
  }

  const w = 900;
  const h = 200;
  const gap = 4;
  const max = Math.max(...mesi.map((m) => m.vendite), 1);
  const barW = (w - gap * (mesi.length - 1)) / mesi.length;

  const colore = (t: MeseVendite["tipo"]) =>
    t === "proiezione" ? "var(--blue)" : t === "corrente" ? "var(--text-tertiary)" : "var(--gold)";

  return (
    <div>
      <svg
        className="grafico-spesa"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ height: 200 }}
        aria-hidden="true"
      >
        <defs>
          {/* Le proiezioni a righe: si vede che non è pieno come un dato vero */}
          <pattern id="stima" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--surface)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--blue)" strokeWidth="3" />
          </pattern>
        </defs>
        {mesi.map((m, i) => {
          const barH = Math.max((m.vendite / max) * (h - 8), m.vendite > 0 ? 3 : 1);
          return (
            <rect
              key={`${m.anno}-${m.mese}`}
              x={i * (barW + gap)}
              y={h - barH}
              width={barW}
              height={barH}
              rx={2}
              fill={m.tipo === "proiezione" ? "url(#stima)" : colore(m.tipo)}
              opacity={m.tipo === "corrente" ? 0.55 : 1}
            />
          );
        })}
      </svg>

      {/* Le etichette fuori dall'SVG: dentro, con preserveAspectRatio="none",
          il testo verrebbe stirato. */}
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {mesi.map((m) => (
          <div
            key={`e-${m.anno}-${m.mese}`}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              fontSize: 10.5,
              color: m.tipo === "proiezione" ? "var(--blue)" : "var(--text-tertiary)",
              fontVariantNumeric: "tabular-nums",
            }}
            title={`${MESI_IT[m.mese - 1]} ${m.anno}: ${formattaEuro(m.vendite)}${
              m.base ? ` (stima da ${MESI_IT[m.mese - 1]} ${m.base.anno}: ${formattaEuro(m.base.vendite)})` : ""
            }`}
          >
            {MESI_IT[m.mese - 1].slice(0, 3)}
            {m.mese === 1 || m.mese === 12 ? ` ${String(m.anno).slice(2)}` : ""}
          </div>
        ))}
      </div>

      <div className="grafico-legenda" style={{ marginTop: 10, gap: 16, flexWrap: "wrap" }}>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, background: "var(--gold)", borderRadius: 2, marginRight: 6 }} />
          venduto reale
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, background: "var(--text-tertiary)", opacity: 0.55, borderRadius: 2, marginRight: 6 }} />
          mese in corso (parziale)
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid var(--blue)", borderRadius: 2, marginRight: 6 }} />
          proiezione
        </span>
        <span>picco {formattaEuro(max)}</span>
      </div>
    </div>
  );
}
