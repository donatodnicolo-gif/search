import { PRESET_PERIODO, TIPI_CONFRONTO, type Periodo, type PeriodoRisolto } from "@/lib/periodo";

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
  confronto,
  tipoConfronto,
  confDa,
  confA,
}: {
  periodo: PeriodoRisolto;
  da?: string;
  a?: string;
  azione: string;
  /**
   * La finestra di confronto scelta, e quale tipo è. Si passano insieme:
   * `confronto: null` con `tipoConfronto: "nessuno"` vuol dire «scelto di non
   * confrontare», ed è diverso da «la pagina non offre il confronto» — che si
   * ottiene non passando `tipoConfronto` affatto.
   */
  confronto?: Periodo | null;
  tipoConfronto?: string;
  confDa?: string;
  confA?: string;
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

  // Il confronto si offre solo se la pagina lo sa usare: una riga di pillole
  // che non cambia niente è peggio di una riga assente.
  const offreConfronto = tipoConfronto != null;
  const linkConf = (tipo: string) => {
    const q = new URLSearchParams(coda);
    if (periodo.preset === "libero" && da && a) {
      q.set("da", da);
      q.set("a", a);
    } else {
      q.set("preset", periodo.preset);
    }
    q.set("conf", tipo);
    q.delete("confDa");
    q.delete("confA");
    return `${azione}?${q.toString()}`;
  };
  const confLibero = tipoConfronto === "libero";
  const isoConf = (x: Date) => iso(x);

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

      {/* ——— CONTRO CHE COSA ———
          Sta nei filtri, accanto al periodo, perché è la stessa decisione:
          quale finestra si guarda e contro quale si legge. Prima il confronto
          non si scegliva — le tessere ne mostravano due fissi e le tabelle
          nessuno — e «220 €» dentro una tabella non diceva se fosse tanto o
          poco. */}
      {offreConfronto && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--hairline)", paddingTop: 12 }}>
          <div className="cella-sub" style={{ marginBottom: 8 }}>
            <b>Confronta con</b> — vale per le tessere e per le colonne Δ delle tabelle
          </div>
          <div className="pill-scelta riga-chips-scorri" style={{ marginBottom: confLibero ? 10 : 0 }}>
            {TIPI_CONFRONTO.map((t) => (
              <a
                key={t.chiave}
                className={`pill-opt${tipoConfronto === t.chiave ? " attuale" : ""}`}
                href={linkConf(t.chiave)}
              >
                {t.nome}
              </a>
            ))}
          </div>
          {confLibero && (
            <form className="filtri" method="get" action={azione} style={{ marginBottom: 0 }}>
              {nascosti.map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              {periodo.preset === "libero" && da && a ? (
                <>
                  <input type="hidden" name="da" value={da} />
                  <input type="hidden" name="a" value={a} />
                </>
              ) : (
                <input type="hidden" name="preset" value={periodo.preset} />
              )}
              <input type="hidden" name="conf" value="libero" />
              <input
                type="date"
                name="confDa"
                defaultValue={confDa ?? (confronto ? isoConf(confronto.da) : undefined)}
                title="Confronta dal (compreso)"
              />
              <input
                type="date"
                name="confA"
                defaultValue={
                  confA ?? (confronto ? isoConf(new Date(confronto.a.getTime() - 86_400_000)) : undefined)
                }
                title="Confronta al (compreso)"
              />
              <button className="btn small" type="submit">Vai</button>
            </form>
          )}
          <div className="cella-sub" style={{ marginTop: 8 }}>
            {confronto ? (
              <>
                Confronto attivo: <b>{confronto.etichetta}</b>
              </>
            ) : (
              // ⚠️ Si dice cosa comporta, non solo che è spento: è la ragione
              // per cui «Nessuno» è una scelta utile e non un ripiego.
              <>Nessun confronto: le tabelle non hanno la colonna Δ e non fanno la seconda lettura.</>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
