import { andamentoMese, letturaRitmo, type RigaMese } from "@/lib/andamento-mese";
import { COLORE_BRAND, ETICHETTA_BRAND, formattaEuro, formattaNumero } from "@/lib/dominio";

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

// Il foglio SALES, ma calcolato: vendite del mese, ritmo, dove si finisce se il
// ritmo resta questo, e se la spesa pubblicitaria sta dentro il budget.
export async function AndamentoMese({ anno, mese }: { anno?: number; mese?: number }) {
  const adesso = new Date();
  const a = anno ?? adesso.getFullYear();
  const m = mese ?? adesso.getMonth() + 1;
  const q = await andamentoMese(a, m);

  const colorePiano = (quota: number | null) =>
    quota == null ? undefined : quota >= 1 ? "var(--green)" : quota >= 0.85 ? "var(--gold-strong)" : "var(--red)";
  const coloreBudget = (quota: number | null) =>
    quota == null ? undefined : quota <= 1.05 ? "var(--green)" : quota <= 1.2 ? "var(--orange)" : "var(--red)";

  const riga = (r: RigaMese, grassetto = false) => {
    const ritmo = letturaRitmo(r);
    return (
      <tr key={r.brand} style={grassetto ? { fontWeight: 600, background: "rgba(0,0,0,.02)" } : undefined}>
        <td>
          <div className="cella-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {r.brand !== "totale" && (
              <span className="sb-dot" style={{ background: COLORE_BRAND[r.brand] ?? "var(--text-tertiary)" }} />
            )}
            {r.brand === "totale" ? "Tutti i brand" : ETICHETTA_BRAND[r.brand] ?? r.brand}
          </div>
          {r.ordini > 0 && <div className="cella-sub">{formattaNumero(r.ordini)} ordini</div>}
        </td>
        <td className="num">{formattaEuro(r.vendite)}</td>
        <td className="num cella-muta">{r.vendtiteAlGiorno != null ? formattaEuro(r.vendtiteAlGiorno) : "—"}</td>
        <td className="num" style={{ fontWeight: 700 }}>
          {r.stimaVendite != null ? formattaEuro(r.stimaVendite) : "—"}
        </td>
        <td className="num cella-muta">{r.pianoVendite != null ? formattaEuro(r.pianoVendite) : "—"}</td>
        <td className="num" style={{ color: colorePiano(r.quotaPiano), fontWeight: 600 }}>
          {r.quotaPiano != null ? `${Math.round(r.quotaPiano * 100)}%` : "—"}
        </td>
        <td className="num">{formattaEuro(r.spesa)}</td>
        <td className="num cella-muta">
          {r.spesaAlGiorno != null ? formattaEuro(r.spesaAlGiorno) : "—"}
          {r.ritmoPrevistoAdv != null && (
            <div className="cella-sub">su {formattaEuro(r.ritmoPrevistoAdv)} previsti</div>
          )}
        </td>
        <td className="num" style={{ fontWeight: 700 }}>
          {r.stimaSpesa != null ? formattaEuro(r.stimaSpesa) : "—"}
        </td>
        <td className="num cella-muta">{r.pianoBudgetAdv != null ? formattaEuro(r.pianoBudgetAdv) : "—"}</td>
        <td className="num" style={{ color: coloreBudget(r.quotaBudget), fontWeight: 600 }}>
          {r.quotaBudget != null ? `${Math.round(r.quotaBudget * 100)}%` : "—"}
          {ritmo && <div className="cella-sub" style={{ color: ritmo.colore, whiteSpace: "normal" }}>{ritmo.testo}</div>}
        </td>
        <td className="num" style={{ fontWeight: 600 }}>
          {r.ros != null ? `${r.ros.toFixed(1)}×` : "—"}
          {r.rosPiano != null && <div className="cella-sub">piano {r.rosPiano.toFixed(1)}×</div>}
        </td>
      </tr>
    );
  };

  return (
    <section className="scheda">
      <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        Vendite e budget di {MESI[m - 1]} {a}
        <span className="tag-neutro">
          {q.oggiIncluso
            ? `${q.giorniConclusi} giorni conclusi su ${q.giorniMese}`
            : `mese chiuso, ${q.giorniMese} giorni`}
        </span>
      </div>

      {q.giorniConclusi === 0 ? (
        <div className="vuoto-mini">
          Il mese è appena cominciato: non c&apos;è ancora un giorno concluso su cui misurare un ritmo.
          Le stime compaiono da domani.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Brand</th>
                <th className="num">Venduto</th>
                <th className="num">al giorno</th>
                <th className="num">Stima fine mese</th>
                <th className="num">Piano</th>
                <th className="num">% piano</th>
                <th className="num">Speso ADV</th>
                <th className="num">al giorno</th>
                <th className="num">Stima fine mese</th>
                <th className="num">Budget</th>
                <th className="num">% budget</th>
                <th className="num">ROS</th>
              </tr>
            </thead>
            <tbody>
              {q.righe.map((r) => riga(r))}
              {riga(q.totale, true)}
            </tbody>
          </table>
        </div>
      )}

      {q.buchi && (
        <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)", marginTop: 12 }}>
          <span className="nota-icona" style={{ color: "var(--red)" }}>⚠</span>
          <span>
            <b>L&apos;archivio ha buchi</b>: {q.buchi.campagne} campagne hanno dati su meno giorni delle
            altre, per un totale di {q.buchi.giorniMancanti} giornate mancanti. La spesa qui sopra è
            <b> più bassa del vero</b> e il budget sembra rispettato più di quanto sia. Si riempie con
            un giro dello script a <code>GIORNI_INDIETRO = 30</code>.
          </span>
        </div>
      )}

      {q.canaliMuti.length > 0 && (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)", marginTop: 12 }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>◈</span>
          <span>
            <b>La spesa è parziale</b>: {q.canaliMuti.map((c) => (c === "meta_ads" ? "Meta" : "Google")).join(" e ")}{" "}
            non sta mandando dati. Il budget sembra più rispettato di quanto sia, e il ROS più alto.
          </span>
        </div>
      )}

      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        Le medie si calcolano sui <b>giorni conclusi</b>: oggi è a metà — gli ordini arrivano fino a
        mezzanotte e la spesa la manda lo script la sera — e includerlo tirerebbe giù il ritmo.
        La stima di fine mese è una <b>proiezione lineare</b> del ritmo attuale: non sa niente di San
        Valentino, del Natale o della settimana di Ferragosto, quindi va letta come «se il ritmo
        resta questo», non come una previsione.
      </p>
    </section>
  );
}
