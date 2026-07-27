import { Sidebar } from "@/components/Sidebar";
import { BRANDS, ETICHETTA_BRAND, formattaEuro, formattaNumero } from "@/lib/dominio";
import { PRESET_PERIODO, risolviPeriodo } from "@/lib/periodo";
import { quadroTracciamento } from "@/lib/tracciamento";

export const dynamic = "force-dynamic";

const COLORE_ESITO: Record<string, string> = {
  ok: "var(--green)",
  sovrastima: "var(--orange)",
  sottostima: "var(--blue)",
  muto: "var(--red)",
  "senza-dati": "var(--text-tertiary)",
};

const ETICHETTA_ESITO: Record<string, string> = {
  ok: "Coerente",
  sovrastima: "La piattaforma si prende troppo",
  sottostima: "La piattaforma si prende poco",
  muto: "Tracciamento probabilmente rotto",
  "senza-dati": "Dati insufficienti",
};

// Il ritorno vero contro quello dichiarato. Non per stabilire chi ha ragione —
// misurano cose diverse — ma per accorgersi quando smettono di somigliarsi.
export default async function Tracciamento({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; da?: string; a?: string; brand?: string }>;
}) {
  const p = await searchParams;
  const periodo = risolviPeriodo(p.preset ?? "30g", p.da, p.a);
  const brand = p.brand && (BRANDS as readonly string[]).includes(p.brand) ? p.brand : undefined;
  const q = await quadroTracciamento(periodo.corrente.da, periodo.corrente.a, brand);

  const link = (cambi: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    const preset = cambi.preset ?? (p.preset ?? "30g");
    const b = "brand" in cambi ? cambi.brand : brand;
    if (preset && preset !== "libero") s.set("preset", preset);
    if (p.da && !cambi.preset) s.set("da", p.da);
    if (p.a && !cambi.preset) s.set("a", p.a);
    if (b) s.set("brand", b);
    return `/tracciamento?${s.toString()}`;
  };

  const spesaTotale = q.canali.reduce((s, c) => s + c.spesa, 0);
  const dichiarato = q.canali.reduce((s, c) => s + c.valoreDichiarato, 0);
  const attribuito = q.canali.reduce((s, c) => s + c.valoreAttribuito, 0);
  const quotaNota = q.ordiniTotali > 0 ? 1 - q.senzaProvenienza / q.ordiniTotali : null;

  return (
    <div className="layout">
      <Sidebar attiva="tracciamento" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Ritorno e tracciamento</h1>
            <p className="page-sub">
              Gli ordini davvero incassati (Shopify, via il registro Orders) contro le conversioni
              che Google e Meta si attribuiscono. Non si tratta di stabilire chi ha ragione: misurano
              cose diverse. Ma quando i due numeri smettono di somigliarsi, quasi sempre è il
              tracciamento che si è rotto — e ce ne si accorge qui, non a fine mese.
            </p>
          </div>
        </div>

        <section className="scheda" style={{ paddingBottom: 14 }}>
          <div className="pill-scelta" style={{ marginBottom: 12 }}>
            {PRESET_PERIODO.filter((x) => x.chiave !== "libero").map((x) => (
              <a key={x.chiave} className={`pill-opt${periodo.preset === x.chiave ? " attuale" : ""}`} href={link({ preset: x.chiave })}>
                {x.nome}
              </a>
            ))}
          </div>
          <div className="pill-scelta">
            <a className={`pill-opt${!brand ? " attuale" : ""}`} href={link({ brand: undefined })}>Tutti i brand</a>
            {BRANDS.map((b) => (
              <a key={b} className={`pill-opt${brand === b ? " attuale" : ""}`} href={link({ brand: b })}>
                {ETICHETTA_BRAND[b]}
              </a>
            ))}
          </div>
        </section>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(q.valoreTotale)}</div>
            <div className="kpi-etichetta">Incassato davvero ({formattaNumero(q.ordiniTotali)} ordini)</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(attribuito)}</div>
            <div className="kpi-etichetta">Di cui Shopify attribuisce alla pubblicità</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(dichiarato)}</div>
            <div className="kpi-etichetta">Quanto se ne attribuiscono le piattaforme</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(spesaTotale)}</div>
            <div className="kpi-etichetta">Spesa pubblicitaria del periodo</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={quotaNota != null && quotaNota < 0.6 ? { color: "var(--orange)" } : undefined}>
              {quotaNota != null ? `${Math.round(quotaNota * 100)}%` : "—"}
            </div>
            <div className="kpi-etichetta">
              Ordini di cui si conosce la provenienza
              {q.senzaProvenienza > 0 ? ` · ${formattaNumero(q.senzaProvenienza)} senza` : ""}
            </div>
          </div>
        </div>

        {q.canali.length === 0 ? (
          <section className="scheda">
            <div className="vuoto">
              Nessuna spesa pubblicitaria né ordine attribuito alla pubblicità in questo periodo.
            </div>
          </section>
        ) : (
          q.canali.map((c) => (
            <section className="scheda" key={c.canale}>
              <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {c.nome}
                <span className="tag-salute" style={{ color: COLORE_ESITO[c.lettura.esito] }}>
                  <span className="dot" />
                  {ETICHETTA_ESITO[c.lettura.esito]}
                </span>
              </div>

              <div style={{ overflowX: "auto", marginBottom: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Chi conta</th>
                      <th className="num">Ordini / conversioni</th>
                      <th className="num">Valore</th>
                      <th className="num">Ritorno sulla spesa</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <div className="cella-nome">Shopify — ordini incassati</div>
                        <div className="cella-sub">attribuzione al primo contatto del percorso</div>
                      </td>
                      <td className="num">{formattaNumero(c.ordiniAttribuiti)}</td>
                      <td className="num">{formattaEuro(c.valoreAttribuito)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {c.roasReale != null ? `${c.roasReale.toFixed(2)}×` : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <div className="cella-nome">{c.nome} — conversioni dichiarate</div>
                        <div className="cella-sub">finestre di attribuzione, view-through, più dispositivi</div>
                      </td>
                      <td className="num">{formattaNumero(Math.round(c.conversioniDichiarate))}</td>
                      <td className="num">{formattaEuro(c.valoreDichiarato)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {c.roasDichiarato != null ? `${c.roasDichiarato.toFixed(2)}×` : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="cella-muta">Distanza fra le due</td>
                      <td className="num cella-muta">
                        {c.rapportoOrdini != null ? `${c.rapportoOrdini.toFixed(2)}×` : "—"}
                      </td>
                      <td className="num cella-muta">
                        {c.rapportoValore != null ? `${c.rapportoValore.toFixed(2)}×` : "—"}
                      </td>
                      <td className="num cella-muta">spesa {formattaEuro(c.spesa)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                className="nota-info"
                style={
                  c.lettura.esito === "muto"
                    ? { borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }
                    : c.lettura.esito === "sovrastima"
                      ? { borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }
                      : undefined
                }
              >
                <span className="nota-icona" style={{ color: COLORE_ESITO[c.lettura.esito] }}>◈</span>
                <span>{c.lettura.testo}</span>
              </div>
            </section>
          ))
        )}

        {q.altriCanali.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Da dove arriva il resto</div>
            <p className="cella-sub" style={{ marginBottom: 12 }}>
              Gli ordini che Shopify non attribuisce alla pubblicità. Servono a leggere i numeri
              sopra con la giusta misura: la pubblicità non è l&apos;unico modo in cui arriva un ordine,
              e un ritorno basso non è automaticamente un tracciamento rotto.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Provenienza</th>
                    <th className="num">Ordini</th>
                    <th className="num">Valore</th>
                    <th className="num">Quota del venduto</th>
                  </tr>
                </thead>
                <tbody>
                  {q.altriCanali.map((a) => (
                    <tr key={a.canale}>
                      <td className="cella-nome">{a.canale}</td>
                      <td className="num">{formattaNumero(a.ordini)}</td>
                      <td className="num">{formattaEuro(a.valore)}</td>
                      <td className="num cella-muta">
                        {q.valoreTotale > 0 ? `${Math.round((a.valore / q.valoreTotale) * 100)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="scheda">
          <div className="scheda-titolo">Come si legge questa pagina</div>
          <p className="cella-sub" style={{ whiteSpace: "normal" }}>
            Le due righe di ogni canale <b>non misurano la stessa cosa</b>, e va bene così. Shopify
            guarda l&apos;ordine incassato e lo attribuisce al <b>primo contatto</b> del percorso; Google e
            Meta contano le conversioni che rientrano nelle <b>loro</b> finestre, comprese le
            visualizzazioni senza clic e i passaggi da un dispositivo all&apos;altro. Un po&apos; di distanza
            è fisiologica.
            <br /><br />
            Quello che conta è <b>quando la distanza cambia</b>. Se una piattaforma smette di
            dichiarare conversioni mentre gli ordini continuano ad arrivare, il tag non registra più.
            Se dichiara molto più di quanto le venga riconosciuto, sta ottimizzando su un segnale
            gonfiato — e le decisioni prese su quel segnale saranno gonfiate a loro volta.
            <br /><br />
            <b>Il ritorno da usare per decidere è quello della riga Shopify</b>: è l&apos;unico fatto di
            soldi davvero entrati.
          </p>
        </section>
      </main>
    </div>
  );
}
