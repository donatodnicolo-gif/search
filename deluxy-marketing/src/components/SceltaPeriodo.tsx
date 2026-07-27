import { PRESET_PERIODO, type PeriodoRisolto } from "@/lib/periodo";

// Il periodo di tutta la pagina, in un posto solo.
//
// Stava in fondo alla home e comandava metà schermata: le tessere dei brand
// sopra rispondevano a un periodo loro, fisso. Due periodi diversi nella stessa
// pagina sono il modo più veloce per leggere due numeri e crederli confrontabili.
// Ora la scelta sta in cima, prima di qualsiasi numero, e vale per tutto.
export function SceltaPeriodo({
  periodo,
  da,
  a,
  azione,
}: {
  periodo: PeriodoRisolto;
  da?: string;
  a?: string;
  azione: string;
}) {
  const giorni = Math.max(
    1,
    Math.round((periodo.corrente.a.getTime() - periodo.corrente.da.getTime()) / 86_400_000)
  );
  const link = (preset: string) => `${azione}?preset=${preset}`;
  const libero = periodo.preset === "libero";

  return (
    <section className="scheda" style={{ paddingBottom: 14 }}>
      <div className="scheda-titolo">Periodo</div>
      <div className="pill-scelta" style={{ marginBottom: 12 }}>
        {PRESET_PERIODO.filter((x) => x.chiave !== "libero").map((x) => (
          <a
            key={x.chiave}
            className={`pill-opt${!libero && periodo.preset === x.chiave ? " attuale" : ""}`}
            href={link(x.chiave)}
          >
            {x.nome}
          </a>
        ))}
        {/* Quando si sceglie a mano non c'è nessuna pillola accesa: senza
            questa, la riga sembra dire «ultimi 7 giorni» mentre guardi febbraio. */}
        {libero && <span className="pill-opt attuale">Personalizzato</span>}
      </div>
      <form className="filtri" method="get" action={azione} style={{ marginBottom: 0 }}>
        <input type="date" name="da" defaultValue={da ?? ""} title="Dal (compreso)" />
        <input type="date" name="a" defaultValue={a ?? ""} title="Al (compreso)" />
        <button className="btn small" type="submit">Vai</button>
        <span className="cella-sub" style={{ alignSelf: "center" }}>
          Stai guardando: <b>{periodo.corrente.etichetta}</b> — {giorni}{" "}
          {giorni === 1 ? "giorno" : "giorni"}, estremi compresi
        </span>
      </form>
    </section>
  );
}
