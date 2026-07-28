import { Badge } from "@/components/Badge";
import { ripristinaLegameShopify, salvaLegameShopify } from "@/lib/azioni";
import { breakEvenRoas } from "@/lib/guardrail";
import { formattaData, formattaEuro, formattaNumero } from "@/lib/dominio";
import {
  CATEGORIE_ORDINE,
  ETICHETTA_CATEGORIA_ORDINE,
  ETICHETTA_LINGUA,
  ETICHETTA_NEGOZIO,
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
        </>
      )}

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
          {" "}La lingua non è scritta sull&apos;ordine, quindi <b>non filtra</b> le vendite: si tiene per
          sapere di che campagna si parla, e sotto si vedono i paesi da cui arrivano gli ordini.
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
        <form className="modulo" action={salvaLegameShopify.bind(null, campagna.id)} style={{ marginTop: 14, gridTemplateColumns: "1fr 1fr 1fr" }}>
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
            <label>Lingua</label>
            <select name="lingua" defaultValue={v.legame.lingua ?? ""}>
              <option value="">— non indicata —</option>
              {LINGUE_CAMPAGNA.map((l) => (
                <option key={l} value={l}>
                  {ETICHETTA_LINGUA[l]}
                </option>
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
