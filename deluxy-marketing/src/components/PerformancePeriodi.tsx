import { GraficoSpesa } from "@/components/GraficoSpesa";
import { prisma } from "@/lib/db";
import { formattaEuro, formattaNumero, roas } from "@/lib/dominio";

// Come sta andando, per finestre: 7 giorni · mese corrente · 30 giorni ·
// trimestre · anno, con il grafico della spesa sotto.
//
// ⚠️ Non tocca il periodo dell'app: è una lente a parte, che si sceglie con
// `?perf=` e vive nell'URL. Il periodo condiviso governa il resto della
// pagina, e sovrascriverlo da qui vorrebbe dire cambiare i numeri di tutte
// le altre sezioni con un click che sembrava innocuo.
const FINESTRE: { chiave: string; nome: string; giorni: number | "mese" | "anno" }[] = [
  { chiave: "7g", nome: "7 giorni", giorni: 7 },
  { chiave: "mese", nome: "Mese corrente", giorni: "mese" },
  { chiave: "30g", nome: "30 giorni", giorni: 30 },
  { chiave: "trimestre", nome: "Trimestre", giorni: 90 },
  { chiave: "anno", nome: "Anno", giorni: "anno" },
];

function estremi(chiave: string): { da: Date; a: Date; nome: string } {
  const f = FINESTRE.find((x) => x.chiave === chiave) ?? FINESTRE[2];
  const a = new Date();
  a.setHours(23, 59, 59, 999);
  const da = new Date();
  if (f.giorni === "mese") {
    da.setDate(1);
  } else if (f.giorni === "anno") {
    da.setMonth(0, 1);
  } else {
    da.setDate(da.getDate() - (f.giorni - 1));
  }
  da.setHours(0, 0, 0, 0);
  return { da, a, nome: f.nome };
}

export async function PerformancePeriodi({
  campagnaId,
  base,
  scelta,
}: {
  campagnaId: string;
  base: string;
  scelta?: string;
}) {
  const attiva = FINESTRE.some((f) => f.chiave === scelta) ? scelta! : "30g";
  const { da, a, nome } = estremi(attiva);

  const metriche = await prisma.metricaCampagna.findMany({
    where: { campagnaId, data: { gte: da, lte: a } },
    orderBy: { data: "asc" },
    select: { data: true, spesa: true, ricavi: true, click: true, conversioni: true, impression: true },
  });

  const somma = (f: (m: (typeof metriche)[number]) => number | null) =>
    metriche.reduce((s, m) => s + (f(m) ?? 0), 0);
  const spesa = somma((m) => m.spesa);
  const ricavi = somma((m) => m.ricavi);
  const click = somma((m) => m.click);
  const conv = somma((m) => m.conversioni);
  const r = roas(ricavi, spesa);
  const giorni = metriche.length;

  return (
    <section className="scheda" id="andamento">
      <div className="scheda-titolo">Come sta andando</div>
      <div className="pill-scelta" style={{ marginBottom: 12 }}>
        {FINESTRE.map((f) => (
          <a
            key={f.chiave}
            className={`pill-opt${attiva === f.chiave ? " attuale" : ""}`}
            // #andamento: cambiare finestra ricarica la pagina, e senza
            // àncora si tornerebbe in cima perdendo il segno.
            href={`${base}${base.includes("?") ? "&" : "?"}perf=${f.chiave}#andamento`}
          >
            {f.nome}
          </a>
        ))}
      </div>

      {giorni === 0 ? (
        <div className="vuoto-mini">
          Nessun dato in questa finestra ({nome.toLowerCase()}): la campagna non ha erogato, oppure
          lo script non ha ancora mandato quei giorni.
        </div>
      ) : (
        <>
          <div className="kpi-riga" style={{ marginBottom: 14 }}>
            <div className="kpi">
              <div className="kpi-valore">{formattaEuro(spesa)}</div>
              <div className="kpi-etichetta">
                Spesa · {giorni} giorn{giorni === 1 ? "o" : "i"} con dati
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-valore">{ricavi > 0 ? formattaEuro(ricavi) : "—"}</div>
              <div className="kpi-etichetta">Ricavi attribuiti</div>
            </div>
            <div className="kpi">
              <div className="kpi-valore">{conv > 0 ? formattaNumero(conv) : "—"}</div>
              <div className="kpi-etichetta">
                Conversioni{conv > 0 && spesa > 0 ? ` · ${formattaEuro(spesa / conv)} l'una` : ""}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-valore">{formattaNumero(click)}</div>
              <div className="kpi-etichetta">
                Click{click > 0 && spesa > 0 ? ` · ${formattaEuro(spesa / click)} di CPC` : ""}
              </div>
            </div>
            <div className="kpi">
              <div
                className="kpi-valore"
                style={{ color: r == null ? undefined : r >= 3 ? "var(--green)" : r < 1 ? "var(--red)" : undefined }}
              >
                {r != null ? `${r.toFixed(1)}×` : "—"}
              </div>
              <div className="kpi-etichetta">ROAS dichiarato</div>
            </div>
          </div>
          <GraficoSpesa punti={metriche.map((m) => ({ data: m.data, valore: m.spesa ?? 0 }))} />
        </>
      )}
    </section>
  );
}
