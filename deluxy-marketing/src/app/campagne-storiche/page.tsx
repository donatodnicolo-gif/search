import { Sidebar } from "@/components/Sidebar";
import { riepilogoCensimento } from "@/lib/censimento-storico";
import {
  COLORE_BRAND,
  daQuanto,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  formattaDataOra,
  formattaEuro,
  formattaNumero,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

// QUANTE CAMPAGNE C'ERANO DAVVERO — il censimento storico.
//
// ⚠️ Questa pagina risponde a UNA domanda: quali e quante campagne sono
// esistite negli ultimi anni, e quanto sono costate. Non è l'elenco delle
// campagne (quello è /campagne, e mostra quelle vive): qui ci sono anche le
// RIMOSSE, che nessun giro quotidiano racconta e che nell'app non esistono.
//
// ⚠️ Senza questa pagina l'esito del censimento vivrebbe solo nella risposta
// JSON dello script — cioè in un posto che nessuno riapre. Un numero che non
// ha una schermata non è misurato: è ricordato.
export default async function PaginaCampagneStoriche({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; canale?: string }>;
}) {
  const sp = await searchParams;
  const anno = sp.anno ? Number(sp.anno) : undefined;
  const r = await riepilogoCensimento({
    anno: Number.isInteger(anno) ? anno : undefined,
    canale: sp.canale,
  });

  // ⚠️ Gli anni della barra si chiedono SENZA il filtro anno addosso. Prima
  // uscivano da `r.perAnno`, che e' gia' filtrato: scegliendo il 2024
  // sparivano tutti gli altri anni dalla barra, e l'unico modo di tornare
  // indietro era «Tutti gli anni». Un filtro che si mangia le proprie
  // alternative e' una porta che si chiude alle spalle.
  const tuttiGliAnni = await riepilogoCensimento({ canale: sp.canale });
  const anniDisponibili = [...new Set(tuttiGliAnni.perAnno.map((a) => a.anno))].sort((a, b) => b - a);
  const filtro = (k: "anno" | "canale", v?: string) => {
    const p = new URLSearchParams();
    if (k === "anno" ? v : sp.anno) p.set("anno", k === "anno" ? v! : sp.anno!);
    if (k === "canale" ? v : sp.canale) p.set("canale", k === "canale" ? v! : sp.canale!);
    const q = p.toString();
    return `/campagne-storiche${q ? `?${q}` : ""}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="campagne-storiche" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Quante campagne c&apos;erano davvero</h1>
            <p className="page-sub">
              Il censimento storico: una riga per campagna per anno, <b>comprese le rimosse</b> —
              quelle che l&apos;app non ha mai visto perché gli script di tutti i giorni guardano
              una finestra corta e saltano ciò che è stato cancellato. Serve a sapere{" "}
              <b>quali e quante</b> campagne sono esistite e quanto sono costate, non a rifare la
              storia di ognuna.
            </p>
          </div>
        </div>

        {r.totaleCampagne === 0 ? (
          <section className="scheda">
            <div className="scheda-titolo">Il censimento non è ancora stato fatto</div>
            <p className="cella-sub" style={{ whiteSpace: "normal" }}>
              Si fa una volta, e non si schedula: il passato non cambia.
            </p>
            <ul style={{ marginTop: 10, lineHeight: 1.7 }}>
              <li>
                <b>Google Ads</b>: incollare{" "}
                <code>scripts/google-ads-censimento-storico.js</code> in ciascuno dei tre account
                (Cake, Gifts, Flowers), mettere <code>CHIAVE_API</code>, provare in{" "}
                <code>ANTEPRIMA</code> e poi eseguire. Le copie pronte le genera{" "}
                <code>node scripts/censimento-storico.mjs --copie</code>.
              </li>
              <li>
                <b>Meta</b>: <code>node scripts/censimento-storico.mjs --meta</code> — lo fa l&apos;app,
                perché il token Meta vive solo lì.
              </li>
            </ul>
          </section>
        ) : (
          <>
            <div className="kpi-riga">
              <div className="kpi">
                <div className="kpi-valore">{r.totaleCampagne}</div>
                <div className="kpi-etichetta">Campagne censite</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore" style={r.mai > 0 ? { color: "var(--gold-strong)" } : undefined}>
                  {r.mai}
                </div>
                <div className="kpi-etichetta">
                  Mai viste dall&apos;app — esistono solo qui
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{formattaEuro(r.spesaTotale)}</div>
                <div className="kpi-etichetta">Spesa di tutto il periodo censito</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore" style={{ fontSize: 18 }}>
                  {r.ultimaCorsa ? daQuanto(r.ultimaCorsa.ricevutoIl).testo : "—"}
                </div>
                <div className="kpi-etichetta">
                  Ultimo censimento
                  {r.ultimaCorsa && <> · {formattaDataOra(r.ultimaCorsa.ricevutoIl)}</>}
                </div>
              </div>
            </div>

            {/* ⚠️ I FILTRI STANNO SOPRA QUELLO CHE FILTRANO. Erano sotto la card
                «Anno per anno» — che pero' risponde a loro — quindi cliccando un
                anno cambiava una tabella fuori dal campo visivo, e sembrava non
                fosse successo niente.
                ⚠️ E i due gruppi (anni e canali) sono separati da una distanza
                vera: con lo stesso gap di 8px si leggevano come una fila unica
                di otto bottoni, e non si capiva che sono due assi indipendenti. */}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className={`btn small ${sp.anno ? "btn-secondario" : ""}`} href={filtro("anno", undefined)}>
                  Tutti gli anni
                </a>
                {anniDisponibili.map((a) => (
                  <a
                    key={a}
                    className={`btn small ${String(a) === sp.anno ? "" : "btn-secondario"}`}
                    href={filtro("anno", String(a))}
                  >
                    {a}
                  </a>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className={`btn small ${sp.canale ? "btn-secondario" : ""}`} href={filtro("canale", undefined)}>
                  Tutti i canali
                </a>
                {["google_ads", "meta_ads"].map((c) => (
                  <a
                    key={c}
                    className={`btn small ${c === sp.canale ? "" : "btn-secondario"}`}
                    href={filtro("canale", c)}
                  >
                    {ETICHETTA_CANALE[c] ?? c}
                  </a>
                ))}
              </div>
            </div>

            <section className="scheda">
              <div className="scheda-titolo">Anno per anno</div>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Anno</th>
                      <th className="num">Campagne</th>
                      <th className="num">Di cui hanno speso</th>
                      <th className="num">Spesa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.perAnno.map((a) => (
                      <tr key={a.anno}>
                        {/* Il link aveva il colore del testo e nessuna
                            sottolineatura, mentre l'hover illuminava tutta la
                            riga: sembrava cliccabile ovunque e funzionava solo
                            sopra quattro cifre. Adesso si vede che e' un link
                            (e la stessa scelta e' comunque nella barra sopra). */}
                        <td className="cella-nome">
                          <a href={filtro("anno", String(a.anno))} style={{ color: "var(--blue)" }}>
                            {a.anno}
                          </a>
                        </td>
                        <td className="num">{a.campagne}</td>
                        {/* ⚠️ «Esisteva» e «ha speso» non sono la stessa cosa:
                            una campagna accesa e mai erogata gonfia il conteggio
                            se le due colonne diventano una. */}
                        <td className="num cella-muta">{a.conSpesa}</td>
                        <td className="num">{formattaEuro(a.spesa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">
                Le campagne, dalla più costosa ({r.voci.length})
              </div>
              <div className="tabella-lunga">
                {/* «tab-ancorata»: otto colonne in 313px di telefono vogliono
                    dire due schermate e mezza di scorrimento, e a meta' strada
                    non si sa piu' di quale campagna sia il numero che si legge.
                    La prima colonna resta ferma. */}
                <table className="tab-ancorata">
                  <thead>
                    <tr>
                      <th>Campagna</th>
                      <th>Brand</th>
                      <th>Canale</th>
                      <th>Periodo</th>
                      <th>Stato</th>
                      <th className="num">Spesa</th>
                      <th className="num">Conv.</th>
                      <th>L&apos;app la conosce?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.voci.map((v) => (
                      <tr key={`${v.canale}|${v.account}|${v.idEsterno}`}>
                        <td className="cella-nome">{v.nome}</td>
                        <td>
                          {v.brand && (
                            <span style={{ color: COLORE_BRAND[v.brand] }}>
                              {ETICHETTA_BRAND[v.brand] ?? v.brand}
                            </span>
                          )}
                        </td>
                        <td className="cella-muta">{ETICHETTA_CANALE[v.canale] ?? v.canale}</td>
                        <td className="cella-muta">
                          {v.dal === v.al ? v.dal : `${v.dal} → ${v.al}`}
                          <div className="cella-sub">{v.anni.join(", ")}</div>
                        </td>
                        <td
                          className="cella-muta"
                          style={v.stato === "REMOVED" ? { color: "var(--red)" } : undefined}
                        >
                          {v.stato === "REMOVED" ? "rimossa" : v.stato === "ENABLED" ? "attiva" : v.stato === "PAUSED" ? "in pausa" : (v.stato ?? "—")}
                        </td>
                        <td className="num">{formattaEuro(v.spesa)}</td>
                        <td className="num cella-muta">{formattaNumero(Math.round(v.conversioni))}</td>
                        <td className="cella-muta">
                          {v.notaAllApp ? (
                            "sì, è in elenco"
                          ) : (
                            <b style={{ color: "var(--gold-strong)" }}>no, solo qui</b>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
                Lo <b>stato</b> è vuoto sulle righe Meta e non è un dato mancante: le insights di
                Meta portano i numeri, non lo stato della campagna — mentre su Google lo stato
                arriva dalla stessa query, ed è lì che si legge «rimossa».{" "}
                «L&apos;app la conosce?» si calcola adesso confrontando l&apos;id di piattaforma con
                le campagne in elenco: non è una colonna salvata, perché un «sì» scritto ieri
                diventa falso oggi senza che nessuno se ne accorga. Le righe sono i totali per
                campagna su tutti gli anni censiti — per il giorno per giorno delle campagne vive
                c&apos;è <a href="/campagne">Campagne</a>.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
