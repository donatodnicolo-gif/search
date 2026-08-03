import { Badge } from "@/components/Badge";
import { ripristinaLegameShopify, salvaLegameShopify } from "@/lib/azioni";
import { breakEvenRoas } from "@/lib/guardrail";
import { formattaData, formattaEuro, formattaNumero } from "@/lib/dominio";
import {
  CATEGORIE_ORDINE,
  ETICHETTA_CATEGORIA_ORDINE,
  ETICHETTA_LINGUA,
  ETICHETTA_NEGOZIO,
  kpiStimati,
  kpiVendite,
  LINGUE_CAMPAGNA,
  NEGOZI_ORDINE,
  venditeDiCampagna,
  type BloccoVendite,
} from "@/lib/vendite-campagna";

// Quanto ha venduto Shopify mentre questa campagna spendeva.
//
// La pagina tiene separate due cose che è comodo confondere e sbagliato
// confondere: gli ordini che portano scritto l'UTM della campagna (attribuzione
// vera, sopra, con i KPI) e il venduto del prodotto di cui la campagna parla
// (contesto, sotto, senza KPI). È scritto in pagina perché chi legge un numero
// a distanza di mesi non si ricorda quale delle due sta guardando.
export async function VenditeCampagna({
  campagna,
}: {
  campagna: { id: string; nome: string; brand: string; idEsterno: string | null };
}) {
  const v = await venditeDiCampagna(campagna);
  const kpi = kpiVendite(v.spesa, v.attribuite);
  // I KPI stimati si appoggiano al contesto quando c'è, altrimenti agli ordini
  // attribuiti: serve una base per scontrino medio e quota di clienti nuovi.
  const base = v.contesto ?? (v.attribuite.ordini > 0 ? v.attribuite : null);
  const stima = kpiStimati(v.spesa, v.conversioniDichiarate, base);
  const be = breakEvenRoas(campagna.brand);

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Vendite su Shopify · ultimi {v.giorni} giorni ({formattaData(v.da)} → {formattaData(v.a)})
      </div>

      {/* ——— 1. Attribuzione vera: l'ordine porta scritto l'UTM ——— */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <Badge testo="Attribuzione" colore="var(--green)" />
        <span className="cella-sub" style={{ whiteSpace: "normal" }}>
          ordini che portano scritto l&apos;UTM di questa campagna: lo dice Shopify, non lo deduce l&apos;app.
        </span>
      </div>

      {v.attribuite.ordini === 0 ? (
        <div className="vuoto-mini">
          Nessun ordine del periodo porta l&apos;UTM di questa campagna.
          {v.utmSimili.length > 0 && (
            <>
              {" "}Ci sono però <b>{v.utmSimili.reduce((s, u) => s + u.ordini, 0)} ordini</b> con un UTM che
              somiglia al nome ({v.utmSimili.map((u) => `«${u.valore}» ×${u.ordini}`).join(", ")}): nomi
              precedenti o campagne poi divise in ENG/ITA. <b>Non vengono attribuiti</b>: non si può dire a
              quale delle campagne di oggi appartengano.
            </>
          )}
          {v.utmSimili.length === 0 && (
            <> Senza UTM non c&apos;è attribuzione: i KPI qui sotto resterebbero inventati, e non si mostrano.</>
          )}
        </div>
      ) : (
        <>
          <TabellaBlocco blocco={v.attribuite} />

          <div className="kpi-riga" style={{ marginTop: 14, marginBottom: 0 }}>
            <div className="kpi">
              <div
                className="kpi-valore"
                style={kpi.ros != null ? { color: kpi.ros >= be ? "var(--green)" : "var(--red)" } : undefined}
              >
                {kpi.ros != null ? `${kpi.ros.toFixed(2)}×` : "—"}
              </div>
              <div className="kpi-etichetta">
                ROS reale: venduto Shopify ÷ spesa ({formattaEuro(v.spesa)}). Break-even {campagna.brand}:{" "}
                {be.toFixed(2)}×
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-valore">{kpi.costoCliente != null ? formattaEuro(kpi.costoCliente) : "—"}</div>
              <div className="kpi-etichetta">
                Costo di acquisizione: spesa ÷ {formattaNumero(v.attribuite.clientiNuovi)} clienti nuovi
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-valore">
                {kpi.costoConversione != null ? formattaEuro(kpi.costoConversione) : "—"}
              </div>
              <div className="kpi-etichetta">
                Costo per conversione: spesa ÷ {formattaNumero(v.attribuite.ordini)} ordini
              </div>
            </div>
          </div>

          <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
            Questo ROS non è quello che dichiara Google: lì l&apos;incasso è quello che la piattaforma si
            attribuisce, qui è quello che è entrato in cassa da ordini con l&apos;UTM. Quando i due numeri si
            allontanano molto, il problema è il tracciamento — non la campagna.
            {v.utmSimili.length > 0 && (
              <>
                {" "}Restano fuori {v.utmSimili.reduce((s, u) => s + u.ordini, 0)} ordini con UTM simile ma
                diverso ({v.utmSimili.map((u) => `«${u.valore}»`).join(", ")}): nomi vecchi, non attribuibili.
              </>
            )}
          </p>

          {/* Dove sono ANDATI gli ordini attribuiti: su una campagna che punta
              a una citta e la verifica piu diretta che esista — se "Fiori
              Milano" consegna a Torino, il targeting non sta tenendo. */}
          {v.attribuite.citta.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="cella-sub" style={{ marginBottom: 7 }}>
                <b>Dove sono state consegnate</b> — città di consegna degli ordini attribuiti,
                non residenza di chi ha comprato:
              </div>
              <div className="pill-scelta">
                {v.attribuite.citta.map((c) => (
                  <span className="pill-opt attuale" key={c.citta} title={`${formattaEuro(c.vendite)} da ${c.citta}`}>
                    {c.citta}
                    <b style={{ marginLeft: 2 }}>{c.ordini}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ——— 1-bis. I costi STIMATI: ci sono anche senza UTM ——— */}
      <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 20, paddingTop: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <Badge testo="Stima" colore="var(--blue)" />
          <span className="cella-sub" style={{ whiteSpace: "normal" }}>
            quanto costa, secondo le <b>conversioni dichiarate dalla piattaforma</b> ({formattaNumero(v.conversioniDichiarate)} nel
            periodo) e lo scontrino medio di questi clienti. Non è una misura: è la stima più
            ottimistica.
          </span>
        </div>

        {v.conversioniDichiarate === 0 ? (
          <div className="vuoto-mini">
            La piattaforma non dichiara conversioni nel periodo: senza quelle non c&apos;è nemmeno una
            stima da fare. Se la campagna sta spendendo ({formattaEuro(v.spesa)}), è il primo problema
            da guardare.
          </div>
        ) : (
          <>
            <div className="kpi-riga" style={{ marginBottom: 0 }}>
              <div className="kpi">
                <div className="kpi-valore">
                  {stima.costoConversione != null ? formattaEuro(stima.costoConversione) : "—"}
                </div>
                <div className="kpi-etichetta">
                  Costo per conversione stimato: {formattaEuro(v.spesa)} ÷{" "}
                  {formattaNumero(v.conversioniDichiarate)} conversioni dichiarate
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">
                  {stima.costoCliente != null ? formattaEuro(stima.costoCliente) : "—"}
                </div>
                <div className="kpi-etichetta">
                  {stima.quotaNuovi != null
                    ? `Costo di acquisizione stimato: il ${Math.round(stima.quotaNuovi * 100)}% di questi clienti è nuovo`
                    : "Costo di acquisizione stimato: manca la quota di clienti nuovi su cui appoggiarlo"}
                </div>
              </div>
              <div className="kpi">
                <div
                  className="kpi-valore"
                  style={stima.ros != null ? { color: stima.ros >= be ? "var(--green)" : "var(--red)" } : undefined}
                >
                  {stima.ros != null ? `${stima.ros.toFixed(2)}×` : "—"}
                </div>
                <div className="kpi-etichetta">
                  {stima.scontrinoMedio != null
                    ? `ROS stimato di cassa: scontrino medio ${formattaEuro(stima.scontrinoMedio)} × conversioni ÷ spesa. Break-even ${be.toFixed(2)}×`
                    : "ROS stimato: manca uno scontrino medio su cui appoggiarlo"}
                </div>
              </div>
            </div>

            <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
              Le conversioni dichiarate sono <b>più</b> degli ordini veri: Google e Meta contano anche
              le view-through e finestre lunghe. Quindi questi costi sono il <b>pavimento</b>, non il
              numero vero — quello vero è più alto. Lo scontrino medio e la quota di clienti nuovi
              arrivano dal blocco di contesto qui sotto, cioè dai clienti di questo prodotto, non da
              questa campagna. Quando l&apos;UTM c&apos;è, valgono i numeri misurati qui sopra e questa
              stima serve solo a vedere di quanto la piattaforma si stia raccontando meglio.
            </p>
          </>
        )}
      </div>

      {/* ——— 2. Contesto dedotto dal nome: NON è attribuzione ——— */}
      <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 20, paddingTop: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <Badge testo="Contesto — non è attribuzione" colore="var(--orange)" />
          <span className="cella-sub" style={{ whiteSpace: "normal" }}>
            dedotto dal <b>nome</b> della campagna. Dice cosa vendeva il negozio mentre la campagna girava:
            <b> non</b> dice che quelle vendite arrivino da qui. Nessun KPI ci si appoggia.
          </span>
        </div>

        <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
          Legame {v.origineLegame === "manuale" ? <b>scelto a mano</b> : "dedotto"}:{" "}
          {v.legame.categoria ? (
            <b>{ETICHETTA_CATEGORIA_ORDINE[v.legame.categoria] ?? v.legame.categoria}</b>
          ) : (
            <b>nessun prodotto</b>
          )}
          {v.legame.lingua && <> · {ETICHETTA_LINGUA[v.legame.lingua]}</>}
          {v.legame.negozio && <> · {ETICHETTA_NEGOZIO[v.legame.negozio] ?? v.legame.negozio}</>}
          {v.legame.motivo && v.origineLegame !== "manuale" && <> — {v.legame.motivo}</>}.
          {v.filtroClienti ? (
            <>
              {" "}La lingua <b>taglia i clienti</b>: qui sotto ci sono solo gli ordini di{" "}
              <b>{v.filtroClienti}</b> — una campagna che parla a chi non è italiano non ha niente a
              che vedere col venduto italiano dello stesso prodotto.
              {v.senzaPaese > 0 && (
                <>
                  {" "}
                  {v.senzaPaese} ordini del prodotto <b>non hanno il paese</b> e restano fuori: non si
                  possono assegnare né agli italiani né agli stranieri.
                </>
              )}
            </>
          ) : v.linguaIgnorata ? (
            <>
              {" "}<b>La lingua qui non riesce a tagliare</b>: {v.linguaIgnorata}.
            </>
          ) : (
            <>
              {" "}Senza lingua nel nome non si taglia per clientela: ci sono tutti gli ordini del
              prodotto, italiani e stranieri insieme.
            </>
          )}
          {v.cittaFiltrata && (
            <>
              {" "}<b>Solo {v.cittaFiltrata}</b>: il nome della campagna nomina quella città, e gli
              ordini consegnati altrove non sono il suo mercato. Il confronto usa la città
              <b> dedotta</b> da Orders, non quella scritta al checkout — «Rome» e «Roma» sono lo
              stesso posto.
            </>
          )}
          {v.cittaIgnorata && (
            <>
              {" "}<b>La città qui non riesce a tagliare</b>: {v.cittaIgnorata}.
            </>
          )}
        </p>

        {v.contesto == null ? (
          <div className="vuoto-mini">
            Il nome della campagna non nomina un prodotto (succede a Brand Protection e alle generiche):
            senza prodotto non c&apos;è contesto da mostrare, e tirarlo a indovinare vorrebbe dire attribuire
            al brand tutto il venduto del negozio. Se il prodotto lo sai tu, sceglilo qui sotto.
          </div>
        ) : (
          <>
            <TabellaBlocco blocco={v.contesto} />
            {v.contesto.paesi.length > 0 && (
              <p className="cella-sub" style={{ marginTop: 10 }}>
                Da dove: {v.contesto.paesi.map((p) => `${p.paese} (${p.ordini})`).join(" · ")}
              </p>
            )}
          </>
        )}

        {/* Correzione a mano: da qui in poi la deduzione non tocca più niente. */}
        <form className="modulo" action={salvaLegameShopify.bind(null, campagna.id)} style={{ marginTop: 14, gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <div className="campo-modulo">
            <label>Prodotto</label>
            <select name="categoria" defaultValue={v.legame.categoria ?? ""}>
              <option value="">— nessuno —</option>
              {CATEGORIE_ORDINE.map((c) => (
                <option key={c} value={c}>
                  {ETICHETTA_CATEGORIA_ORDINE[c] ?? c}
                </option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Clienti (lingua della campagna)</label>
            <select name="lingua" defaultValue={v.legame.lingua ?? ""}>
              <option value="">— tutti, italiani e stranieri —</option>
              {LINGUE_CAMPAGNA.map((l) => (
                <option key={l} value={l}>
                  {ETICHETTA_LINGUA[l]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Città di consegna</label>
            <select name="citta" defaultValue={v.legame.citta ?? ""}>
              <option value="">— tutte le città —</option>
              {v.cittaViste.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Negozio</label>
            <select name="negozio" defaultValue={v.legame.negozio ?? ""}>
              <option value="">— tutti i negozi del brand —</option>
              {NEGOZI_ORDINE.map((n) => (
                <option key={n} value={n}>
                  {ETICHETTA_NEGOZIO[n]}
                </option>
              ))}
            </select>
          </div>
          <div className="azioni-modulo" style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn small" type="submit">
              Correggi il legame
            </button>
            {v.origineLegame === "manuale" && (
              <button
                className="btn small btn-secondario"
                type="submit"
                formAction={ripristinaLegameShopify.bind(null, campagna.id)}
                title="Cancella la scelta manuale e torna a dedurre dal nome"
              >
                Torna alla deduzione
              </button>
            )}
            <span className="cella-sub" style={{ whiteSpace: "normal" }}>
              La scelta a mano vince: nessun giro successivo la sovrascrive, nemmeno se la campagna
              cambia nome.
            </span>
          </div>
        </form>
      </div>
    </section>
  );
}

function TabellaBlocco({ blocco }: { blocco: BloccoVendite }) {
  const clientiNoti = blocco.clientiNuovi + blocco.clientiRitorno;
  const quotaNuovi = clientiNoti > 0 ? blocco.clientiNuovi / clientiNoti : null;
  const valoreRighe = blocco.perCategoria.reduce((s, c) => s + c.valore, 0);

  return (
    <>
      <div className="kpi-riga" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <div className="kpi-valore">{formattaEuro(blocco.vendite)}</div>
          <div className="kpi-etichetta">Venduto (totale degli ordini)</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{formattaNumero(blocco.ordini)}</div>
          <div className="kpi-etichetta">Ordini</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">
            {blocco.scontrinoMedio != null ? formattaEuro(blocco.scontrinoMedio) : "—"}
          </div>
          <div className="kpi-etichetta">Scontrino medio</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">
            {formattaNumero(blocco.clientiNuovi)} / {formattaNumero(blocco.clientiRitorno)}
          </div>
          <div className="kpi-etichetta">
            Clienti nuovi / di ritorno
            {quotaNuovi != null && ` — ${Math.round(quotaNuovi * 100)}% nuovi`}
            {blocco.senzaEmail > 0 && ` · ${blocco.senzaEmail} ordini senza email, non classificabili`}
          </div>
        </div>
      </div>

      {blocco.perCategoria.length === 0 ? (
        <div className="vuoto-mini">Nessuna riga di prodotto in questi ordini.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num">Valore righe</th>
                <th className="num">Quota</th>
                <th className="num">Pezzi</th>
                <th className="num">Righe d&apos;ordine</th>
              </tr>
            </thead>
            <tbody>
              {blocco.perCategoria.map((c) => (
                <tr key={c.categoria}>
                  <td className="cella-nome">{ETICHETTA_CATEGORIA_ORDINE[c.categoria] ?? c.categoria}</td>
                  <td className="num">{formattaEuro(c.valore)}</td>
                  <td className="num">
                    {valoreRighe > 0 ? `${Math.round((c.valore / valoreRighe) * 100)}%` : "—"}
                  </td>
                  <td className="num">{formattaNumero(c.pezzi)}</td>
                  <td className="num">{formattaNumero(c.ordini)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="cella-sub" style={{ marginTop: 8, whiteSpace: "normal" }}>
        Il valore delle righe non fa il totale degli ordini: spedizione, sconti e voci di servizio stanno
        nel totale e non in una categoria di prodotto. «Cliente nuovo» vuol dire prima volta che quella
        email compare nel registro ordini di questo negozio, non prima volta in assoluto.
      </p>
    </>
  );
}
