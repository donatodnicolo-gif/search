/**
 * Deluxy Fondo — grafico della serie storica, in SVG puro.
 *
 * Niente librerie: sono poche centinaia di punti e un SVG server-side non spedisce
 * JavaScript al browser. Il titolo e il benchmark sono normalizzati a 100 alla prima data
 * comune, perché confrontare due prezzi in valore assoluto non dice nulla.
 *
 * Ogni grafico dichiara se la serie è rettificata per dividendi e operazioni sul capitale:
 * su TIM c'è un raggruppamento 1:10 di mezzo, e un grafico non rettificato mostrerebbe un
 * crollo del 90% mai avvenuto.
 */

import type { EventoManagement, SerieStorica } from "@/lib/tipi";
import { dataBreve } from "@/lib/formato";

type Punto = { x: number; y: number };

function percorso(punti: Punto[]): string {
  return punti.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

export function Grafico({
  serie,
  benchmark,
  eventi = [],
  da,
  altezza = 260,
  titoloBenchmark = "FTSE MIB",
}: {
  serie: SerieStorica;
  benchmark?: SerieStorica | null;
  eventi?: EventoManagement[];
  /** Data ISO da cui partire; se assente usa tutta la serie. */
  da?: string;
  altezza?: number;
  titoloBenchmark?: string;
}) {
  const L = 1000;
  const A = altezza;
  const margine = { su: 14, giu: 26, sx: 4, dx: 46 };

  const barre = da ? serie.barre.filter((b) => b.data >= da) : serie.barre;
  if (barre.length < 2) {
    return <div className="vuoto">Serie troppo corta per essere disegnata.</div>;
  }

  // Normalizzazione a 100 sulla prima data: rende confrontabili titolo e indice.
  const base = barre[0].chiusura;
  const mappaBench = benchmark ? new Map(benchmark.barre.map((b) => [b.data, b.chiusura])) : null;
  const baseBench = mappaBench ? mappaBench.get(barre.find((b) => mappaBench.has(b.data))?.data ?? "") ?? null : null;

  const valori: number[] = [];
  const puntiTitolo: Punto[] = [];
  const puntiBench: Punto[] = [];

  const larghezzaUtile = L - margine.sx - margine.dx;
  barre.forEach((b, i) => {
    const x = margine.sx + (i / (barre.length - 1)) * larghezzaUtile;
    const v = (b.chiusura / base) * 100;
    valori.push(v);
    puntiTitolo.push({ x, y: v });
    if (mappaBench && baseBench) {
      const cb = mappaBench.get(b.data);
      if (cb) {
        const vb = (cb / baseBench) * 100;
        valori.push(vb);
        puntiBench.push({ x, y: vb });
      }
    }
  });

  const min = Math.min(...valori);
  const max = Math.max(...valori);
  const intervallo = max - min || 1;
  const scalaY = (v: number) => margine.su + (1 - (v - min) / intervallo) * (A - margine.su - margine.giu);

  const titoloScalato = puntiTitolo.map((p) => ({ x: p.x, y: scalaY(p.y) }));
  const benchScalato = puntiBench.map((p) => ({ x: p.x, y: scalaY(p.y) }));

  // Marcatori degli eventi: solo quelli dentro la finestra disegnata.
  const marcatori = eventi
    .map((e) => {
      const i = barre.findIndex((b) => b.data >= e.dataAnnuncio);
      if (i < 0) return null;
      return { evento: e, x: margine.sx + (i / (barre.length - 1)) * larghezzaUtile };
    })
    .filter((m): m is { evento: EventoManagement; x: number } => m !== null);

  const tacche = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = min + f * intervallo;
    return { v, y: scalaY(v) };
  });

  return (
    <div>
      <svg className="grafico" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Andamento di ${serie.nome} a base 100`}>
        {tacche.map((t) => (
          <g key={t.v}>
            <line x1={margine.sx} x2={L - margine.dx} y1={t.y} y2={t.y} stroke="var(--hairline)" strokeWidth={1} />
            <text x={L - margine.dx + 6} y={t.y + 3.5} fontSize={10} fill="var(--text-tertiary)">
              {Math.round(t.v)}
            </text>
          </g>
        ))}

        {marcatori.map((m) => (
          <g key={m.evento.id}>
            <line
              x1={m.x}
              x2={m.x}
              y1={margine.su}
              y2={A - margine.giu}
              stroke={m.evento.contaminato ? "var(--red)" : "var(--gold)"}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.75}
            />
            <circle cx={m.x} cy={margine.su} r={3} fill={m.evento.contaminato ? "var(--red)" : "var(--gold)"} />
          </g>
        ))}

        {benchScalato.length > 1 ? (
          <path d={percorso(benchScalato)} fill="none" stroke="var(--text-tertiary)" strokeWidth={1.5} opacity={0.7} />
        ) : null}
        <path d={percorso(titoloScalato)} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />

        <text x={margine.sx} y={A - 8} fontSize={10} fill="var(--text-tertiary)">
          {dataBreve(barre[0].data)}
        </text>
        <text x={L - margine.dx} y={A - 8} fontSize={10} fill="var(--text-tertiary)" textAnchor="end">
          {dataBreve(barre[barre.length - 1].data)}
        </text>
      </svg>

      <div className="grafico-legenda">
        <span>
          <i style={{ background: "var(--ink)" }} /> {serie.nome}
        </span>
        {benchScalato.length > 1 ? (
          <span>
            <i style={{ background: "var(--text-tertiary)" }} /> {titoloBenchmark}
          </span>
        ) : null}
        {marcatori.length ? (
          <>
            <span>
              <i style={{ background: "var(--gold)" }} /> evento di management
            </span>
            <span>
              <i style={{ background: "var(--red)" }} /> evento contaminato da altro
            </span>
          </>
        ) : null}
        <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>
          base 100 alla prima data · {serie.fonte}
        </span>
      </div>
    </div>
  );
}
