// Grafici del trend, disegnati in SVG lato server: nessuna libreria, nessun
// JavaScript nel browser. Il valore esatto di ogni barra sta nel <title>, così
// il numero resta leggibile al passaggio del mouse e per chi usa lo screen
// reader senza dover caricare un tooltip.

import { euro } from "@/lib/dominio";
import type { PuntoSerie } from "@/lib/vendite";

/** Andamento del periodo: barre del ricavo + linea dei pezzi. */
export function GraficoAndamento({
  serie,
  passo,
  altezza = 220,
}: {
  serie: PuntoSerie[];
  passo: "giorno" | "settimana";
  altezza?: number;
}) {
  if (serie.length === 0) return <div className="vuoto-mini">Nessun dato nel periodo.</div>;

  const larghezza = 1000;
  const padBasso = 26;
  const padAlto = 10;
  const h = altezza - padBasso - padAlto;
  const maxRicavo = Math.max(...serie.map((p) => p.ricavo), 1);
  const maxPezzi = Math.max(...serie.map((p) => p.pezzi), 1);
  const passoX = larghezza / serie.length;
  const larghezzaBarra = Math.max(1.5, Math.min(26, passoX * 0.62));

  // Etichette dell'asse: al massimo 8, altrimenti si accavallano.
  const ogni = Math.max(1, Math.ceil(serie.length / 8));

  const puntiLinea = serie
    .map((p, i) => {
      const x = i * passoX + passoX / 2;
      const y = padAlto + h - (p.pezzi / maxPezzi) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} preserveAspectRatio="none" role="img" aria-label="Andamento del venduto nel periodo">
        {[0.25, 0.5, 0.75, 1].map((q) => (
          <line
            key={q}
            x1="0"
            x2={larghezza}
            y1={padAlto + h - q * h}
            y2={padAlto + h - q * h}
            stroke="var(--hairline)"
            strokeWidth="1"
          />
        ))}
        {serie.map((p, i) => {
          const hb = (p.ricavo / maxRicavo) * h;
          const x = i * passoX + (passoX - larghezzaBarra) / 2;
          return (
            <rect
              key={i}
              x={x}
              y={padAlto + h - hb}
              width={larghezzaBarra}
              height={Math.max(p.ricavo > 0 ? 2 : 0, hb)}
              rx={Math.min(3, larghezzaBarra / 2)}
              fill="var(--gold)"
              opacity={0.85}
            >
              <title>{`${p.etichetta}: ${euro(p.ricavo)} · ${p.pezzi} pz`}</title>
            </rect>
          );
        })}
        <polyline points={puntiLinea} fill="none" stroke="var(--ink)" strokeWidth="1.6" opacity="0.55" />
        {serie.map((p, i) =>
          i % ogni === 0 ? (
            <text
              key={`e${i}`}
              x={i * passoX + passoX / 2}
              y={altezza - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-tertiary)"
            >
              {p.etichetta}
            </text>
          ) : null
        )}
      </svg>
      <div className="grafico-legenda">
        <span>
          <i className="legenda-chip" style={{ background: "var(--gold)" }} /> Ricavo per{" "}
          {passo === "giorno" ? "giorno" : "settimana"}
        </span>
        <span>
          <i className="legenda-linea" /> Pezzi venduti
        </span>
      </div>
    </div>
  );
}

/** Micro-grafico a barre per la riga di una tabella (8 settimane). */
export function Sparkline({ valori, titolo }: { valori: number[]; titolo?: string }) {
  const max = Math.max(...valori, 1);
  const w = 68;
  const h = 20;
  const passo = w / Math.max(valori.length, 1);
  const larghezza = Math.max(1.5, passo * 0.62);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="sparkline">
      {titolo && <title>{titolo}</title>}
      {valori.map((v, i) => {
        const hb = (v / max) * (h - 2);
        return (
          <rect
            key={i}
            x={i * passo + (passo - larghezza) / 2}
            y={h - hb}
            width={larghezza}
            height={Math.max(v > 0 ? 1.5 : 0, hb)}
            rx="1"
            fill={i === valori.length - 1 ? "var(--gold-strong)" : "var(--text-tertiary)"}
            opacity={i === valori.length - 1 ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}

/** Barra di quota (peso di una collezione/categoria sul ricavo). */
export function BarraQuota({ quota }: { quota: number }) {
  return (
    <div className="quota-cella">
      <div className="quota-track">
        <span className="quota-fill" style={{ width: `${Math.min(100, Math.round(quota * 100))}%` }} />
      </div>
      <span className="quota-valore">{Math.round(quota * 100)}%</span>
    </div>
  );
}
