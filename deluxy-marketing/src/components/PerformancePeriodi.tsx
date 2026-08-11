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

  // ⚠️ Una lettura sola per TUTTE le finestre: si prende il periodo più
  // lungo (l'anno) e le altre si ritagliano in memoria. Cinque query sullo
  // stesso Postgres condiviso per cinque somme è il modo di far aspettare
  // una pagina per niente.
  const inizioAnno = estremi("anno").da;
  const primoInizio = da < inizioAnno ? da : inizioAnno;
  const tutte = await prisma.metricaCampagna.findMany({
    where: { campagnaId, data: { gte: primoInizio, lte: a } },
    orderBy: { data: "asc" },
    select: { data: true, spesa: true, ricavi: true, click: true, conversioni: true, impression: true },
  });
  const metriche = tutte.filter((m) => m.data >= da && m.data <= a);

  // Il confronto a colpo d'occhio: le stesse cinque finestre, una riga per
  // ognuna. La tab qui sopra decide solo quale si vede nel grafico.
  const confronto = FINESTRE.map((f) => {
    const e = estremi(f.chiave);
    const righe = tutte.filter((m) => m.data >= e.da && m.data <= e.a);
    const sp = righe.reduce((s, m) => s + (m.spesa ?? 0), 0);
    const ri = righe.reduce((s, m) => s + (m.ricavi ?? 0), 0);
    const cv = righe.reduce((s, m) => s + (m.conversioni ?? 0), 0);
    const cl = righe.reduce((s, m) => s + (m.click ?? 0), 0);
    return {
      chiave: f.chiave,
      nome: f.nome,
      giorni: righe.length,
      spesa: sp,
      ricavi: ri,
      conversioni: cv,
      click: cl,
      resa: roas(ri, sp),
      // La media al giorno è l'unico modo di confrontare finestre di
      // lunghezza diversa senza farsi ingannare: 223 € in 7 giorni e
      // 900 € in 30 non si leggono uno accanto all'altro.
      spesaGiorno: righe.length > 0 ? sp / righe.length : null,
    };
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
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        Le finestre a confronto, tutte insieme. La colonna <b>al giorno</b> è quella da leggere per
        capire se sta andando meglio o peggio: la spesa totale di sette giorni e quella di un anno
        non si confrontano. Il grafico sotto segue la finestra scelta.
      </p>
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

      {/* IL CONFRONTO, subito: le cinque finestre una sotto l'altra. Senza,
          per rispondere a «va meglio o peggio di prima» bisognava cliccare
          cinque tab e tenere i numeri a mente. La media al giorno è la
          colonna che rende confrontabili finestre di lunghezza diversa. */}
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Finestra</th>
              <th className="num">Spesa</th>
              <th className="num" title="Spesa ÷ giorni con dati: l'unico modo di confrontare finestre di lunghezza diversa">
                Al giorno
              </th>
              <th className="num">Ricavi</th>
              <th className="num">Conv.</th>
              <th className="num">Click</th>
              <th className="num">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {confronto.map((c) => (
              <tr key={c.chiave} style={c.chiave === attiva ? { background: "var(--fill)" } : undefined}>
                <td>
                  <a href={`${base}${base.includes("?") ? "&" : "?"}perf=${c.chiave}#andamento`} style={{ color: "inherit", textDecoration: "none" }}>
                    <b>{c.nome}</b>
                  </a>
                  <div className="cella-sub">
                    {c.giorni === 0 ? "nessun dato" : `${c.giorni} giorn${c.giorni === 1 ? "o" : "i"} con dati`}
                  </div>
                </td>
                <td className="num">{c.spesa > 0 ? formattaEuro(c.spesa) : "—"}</td>
                <td className="num">{c.spesaGiorno != null ? formattaEuro(c.spesaGiorno) : "—"}</td>
                <td className="num">{c.ricavi > 0 ? formattaEuro(c.ricavi) : "—"}</td>
                <td className="num">{c.conversioni > 0 ? formattaNumero(c.conversioni) : "—"}</td>
                <td className="num cella-muta">{c.click > 0 ? formattaNumero(c.click) : "—"}</td>
                <td
                  className="num"
                  style={{ fontWeight: 600, color: c.resa == null ? undefined : c.resa >= 3 ? "var(--green)" : c.resa < 1 ? "var(--red)" : undefined }}
                >
                  {c.resa != null ? `${c.resa.toFixed(1)}×` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
