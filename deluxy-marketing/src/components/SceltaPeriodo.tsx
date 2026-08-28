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
  altriFiltri,
}: {
  periodo: PeriodoRisolto;
  da?: string;
  a?: string;
  azione: string;
  /**
   * Gli ALTRI parametri con cui si sta guardando la pagina (canale, brand,
   * stato, ricerca…), come query string senza `preset`/`da`/`a`.
   *
   * ⚠️ Senza questi, cambiare periodo riportava all'elenco COMPLETO: da
   * «Campagne — Meta Ads» si finiva su tutte e tre le piattaforme, e il salto
   * sembrava un guasto della pagina invece che del link. Il periodo è una
   * lente: cambiarla non deve cambiare anche cosa si sta guardando.
   */
  altriFiltri?: string;
}) {
  const giorni = Math.max(
    1,
    Math.round((periodo.corrente.a.getTime() - periodo.corrente.da.getTime()) / 86_400_000)
  );
  const coda = (altriFiltri ?? "").replace(/^[?&]+/, "");
  const link = (preset: string) => `${azione}?preset=${preset}${coda ? `&${coda}` : ""}`;
  // Il modulo delle date manda solo `da` e `a`: gli altri filtri devono
  // viaggiare come campi nascosti, o «Vai» li perde esattamente come li
  // perdevano le pillole.
  const nascosti = [...new URLSearchParams(coda).entries()].filter(
    ([k]) => k !== "preset" && k !== "da" && k !== "a"
  );
  const libero = periodo.preset === "libero";

  // ⚠️ Le caselle mostrano SEMPRE le date che si stanno guardando, anche quando
  // il periodo arriva da una pillola. Prima restavano vuote («gg/mm/aaaa»):
  // «Ultimi 30 giorni» non diceva da quando a quando, e per saperlo bisognava
  // contarli sul calendario. Peggio, chi voleva spostare solo la fine doveva
  // riscrivere anche l'inizio — l'altra casella era vuota e il modulo la
  // mandava vuota.
  //
  // `periodo.corrente.a` è ESCLUSIVO (le query usano `lt`), ma la casella deve
  // mostrare l'ultimo giorno COMPRESO: si toglie un giorno, o «ultimi 7»
  // sembrerebbe finire domani.
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daMostrare = da ?? iso(periodo.corrente.da);
  const aMostrare = a ?? iso(new Date(periodo.corrente.a.getTime() - 86_400_000));

  return (
    <section className="scheda" style={{ paddingBottom: 14 }}>
      <div className="scheda-titolo">Periodo</div>
      {/* Su mobile la riga di pillole scorre in orizzontale (Libro v1.3 §8.9). */}
      <div className="pill-scelta riga-chips-scorri" style={{ marginBottom: 12 }}>
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
        {nascosti.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="date" name="da" defaultValue={daMostrare} title="Dal (compreso)" />
        <input type="date" name="a" defaultValue={aMostrare} title="Al (compreso)" />
        <button className="btn small" type="submit">Vai</button>
        <span className="cella-sub" style={{ alignSelf: "center" }}>
          Stai guardando: <b>{periodo.corrente.etichetta}</b> — {giorni}{" "}
          {giorni === 1 ? "giorno" : "giorni"}, estremi compresi
        </span>
      </form>
    </section>
  );
}
