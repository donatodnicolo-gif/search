import { andamentoMese, letturaRitmo, type RigaMese } from "@/lib/andamento-mese";
import { COLORE_BRAND, ETICHETTA_BRAND, formattaEuro, formattaNumero } from "@/lib/dominio";
import { risultatoAtteso } from "@/lib/risultato";

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

// Il foglio SALES, ma calcolato: vendite del mese, ritmo, dove si finisce se il
// ritmo resta questo, e se la spesa pubblicitaria sta dentro il budget.
//
// Dodici colonne tutte uguali non si leggono: qui sono divise in due blocchi
// (quello che entra, quello che esce) separati da una linea, con la stessa
// sequenza ripetuta — ad oggi · al giorno · dove si finisce · obiettivo · quanto
// ci siamo. Imparata una volta, vale per entrambi i blocchi.
const BORDO = "2px solid var(--hairline-strong)";

function Barra({ quota, colore }: { quota: number; colore: string }) {
  // La barra si ferma a 100% ma il numero no: serve a leggere "a che punto
  // siamo", non a rappresentare lo sforamento.
  const larghezza = Math.max(2, Math.min(100, quota * 100));
  return (
    <div style={{ height: 4, borderRadius: 2, background: "var(--hairline)", marginTop: 5, overflow: "hidden" }}>
      <div style={{ width: `${larghezza}%`, height: "100%", background: colore, borderRadius: 2 }} />
    </div>
  );
}

export async function AndamentoMese({ anno, mese }: { anno?: number; mese?: number }) {
  const adesso = new Date();
  const a = anno ?? adesso.getFullYear();
  const m = mese ?? adesso.getMonth() + 1;
  const q = await andamentoMese(a, m);

  const colorePiano = (quota: number | null) =>
    quota == null ? "var(--text-tertiary)" : quota >= 1 ? "var(--green)" : quota >= 0.85 ? "var(--gold-strong)" : "var(--red)";
  const coloreBudget = (quota: number | null) =>
    quota == null ? "var(--text-tertiary)" : quota <= 1.05 ? "var(--green)" : quota <= 1.2 ? "var(--orange)" : "var(--red)";

  const riga = (r: RigaMese, totale = false) => {
    const ritmo = letturaRitmo(r);
    const sfondo = totale ? { background: "var(--surface-2, rgba(0,0,0,.025))", fontWeight: 600 } : undefined;
    return (
      <tr key={r.brand} style={sfondo}>
        <td>
          <div className="cella-nome" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {r.brand !== "totale" && (
              <span className="sb-dot" style={{ background: COLORE_BRAND[r.brand] ?? "var(--text-tertiary)" }} />
            )}
            {r.brand === "totale" ? "Tutti i brand" : ETICHETTA_BRAND[r.brand] ?? r.brand}
          </div>
          {r.ordini > 0 && <div className="cella-sub">{formattaNumero(r.ordini)} ordini</div>}
        </td>

        {/* ——— quello che entra ——— */}
        <td className="num">{formattaEuro(r.vendite)}</td>
        <td className="num cella-muta">{r.vendtiteAlGiorno != null ? formattaEuro(r.vendtiteAlGiorno) : "—"}</td>
        <td className="num" style={{ fontWeight: 700 }}>
          {r.stimaVendite != null ? formattaEuro(r.stimaVendite) : "—"}
        </td>
        <td className="num cella-muta">{r.pianoVendite != null ? formattaEuro(r.pianoVendite) : "—"}</td>
        <td className="num" style={{ minWidth: 74 }}>
          <span style={{ color: colorePiano(r.quotaPiano), fontWeight: 700 }}>
            {r.quotaPiano != null ? `${Math.round(r.quotaPiano * 100)}%` : "—"}
          </span>
          {r.quotaPiano != null && <Barra quota={r.quotaPiano} colore={colorePiano(r.quotaPiano)} />}
        </td>

        {/* ——— quello che esce ——— */}
        <td className="num" style={{ borderLeft: BORDO }}>{formattaEuro(r.spesa)}</td>
        <td className="num cella-muta">
          {r.spesaAlGiorno != null ? formattaEuro(r.spesaAlGiorno) : "—"}
          {r.ritmoPrevistoAdv != null && (
            <div className="cella-sub" style={{ color: ritmo?.colore }}>
              su {formattaEuro(r.ritmoPrevistoAdv)}
            </div>
          )}
        </td>
        <td className="num" style={{ fontWeight: 700 }}>
          {r.stimaSpesa != null ? formattaEuro(r.stimaSpesa) : "—"}
        </td>
        <td className="num cella-muta">{r.pianoBudgetAdv != null ? formattaEuro(r.pianoBudgetAdv) : "—"}</td>
        <td className="num" style={{ minWidth: 74 }}>
          <span style={{ color: coloreBudget(r.quotaBudget), fontWeight: 700 }}>
            {r.quotaBudget != null ? `${Math.round(r.quotaBudget * 100)}%` : "—"}
          </span>
          {r.quotaBudget != null && <Barra quota={r.quotaBudget} colore={coloreBudget(r.quotaBudget)} />}
        </td>

        {/* ——— quanto rende ——— */}
        <td className="num" style={{ borderLeft: BORDO, fontWeight: 700 }}>
          {r.ros != null ? `${r.ros.toFixed(1)}×` : "—"}
          {r.rosPiano != null && <div className="cella-sub">obiettivo {r.rosPiano.toFixed(1)}×</div>}
        </td>
        {/* Il ROS dice quante VOLTE torna l'euro speso; questo dice quanti EURO
            restano. Sono due domande diverse, e la seconda è quella che si
            porta in riunione. Si calcola sulle stime di FINE MESE, non sul
            fatto a oggi: questa riga parla del mese, non di stamattina. */}
        <td className="num" style={{ fontWeight: 700 }}>
          {(() => {
            if (r.stimaVendite == null || r.stimaSpesa == null) return "—";
            const res = risultatoAtteso(r.stimaVendite, r.stimaSpesa);
            return (
              <>
                <span style={{ color: res.risultato >= 0 ? "var(--green)" : "var(--red)" }}>
                  {formattaEuro(res.risultato)}
                </span>
                {res.incidenzaAdv != null && (
                  <div className="cella-sub">ADV {Math.round(res.incidenzaAdv * 100)}% del venduto</div>
                )}
              </>
            );
          })()}
        </td>
      </tr>
    );
  };

  const intestazione = (testo: string, spiega: string, extra?: React.CSSProperties) => (
    <th className="num" title={spiega} style={extra}>
      {testo}
    </th>
  );

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
              {/* Prima riga: i due mondi. Senza questa divisione, "stima fine
                  mese" appare due volte e sembra un errore. */}
              <tr>
                <th />
                <th colSpan={5} style={{ textAlign: "center", color: "var(--green)", letterSpacing: ".04em" }}>
                  QUELLO CHE ENTRA — VENDITE
                </th>
                <th colSpan={5} style={{ textAlign: "center", color: "var(--orange)", letterSpacing: ".04em", borderLeft: BORDO }}>
                  QUELLO CHE ESCE — PUBBLICITÀ
                </th>
                <th colSpan={2} style={{ textAlign: "center", borderLeft: BORDO }}>RESA</th>
              </tr>
              <tr>
                <th>Brand</th>
                {intestazione("ad oggi", "Venduto dal primo del mese a ieri, esclusi annullati e rimborsati")}
                {intestazione("al giorno", "Venduto diviso i giorni conclusi del mese")}
                {intestazione("fine mese", "Proiezione: la media giornaliera moltiplicata per i giorni del mese")}
                {intestazione("obiettivo", "Il piano vendite del mese, dal Monitoraggio")}
                {intestazione("a che punto", "Stima di fine mese rispetto all'obiettivo")}
                {intestazione("ad oggi", "Speso in pubblicità dal primo del mese a ieri", { borderLeft: BORDO })}
                {intestazione("al giorno", "Speso diviso i giorni conclusi, con sotto quanto prevedrebbe il budget")}
                {intestazione("fine mese", "Proiezione della spesa se il ritmo resta questo")}
                {intestazione("budget", "Il budget pubblicitario del mese, dal Monitoraggio")}
                {intestazione("a che punto", "Spesa stimata rispetto al budget: sopra il 100% si sfora")}
                {intestazione("ROS", "Venduto diviso speso. Sotto: quanto lo prevede il piano", { borderLeft: BORDO })}
                {intestazione(
                  "risultato stimato",
                  "Quanto resta a fine mese: venduto stimato × 30% di margine, meno la spesa stimata. NON è un utile: sotto non ci sono personale, logistica, commissioni e resi"
                )}
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
        Le due metà si leggono nello stesso modo: <b>ad oggi</b>, <b>al giorno</b>, dove si finisce a{" "}
        <b>fine mese</b>, l&apos;<b>obiettivo</b>, e <b>a che punto</b> siamo. A sinistra i soldi che
        entrano, a destra quelli che escono.
        <br /><br />
        Le medie si calcolano sui <b>giorni conclusi</b>: oggi è a metà — gli ordini arrivano fino a
        mezzanotte e la spesa la manda lo script la sera — e includerlo tirerebbe giù il ritmo. La
        stima di fine mese è una <b>proiezione lineare</b>: non sa niente di San Valentino, del Natale
        o della settimana di Ferragosto, quindi va letta come «se il ritmo resta questo», non come una
        previsione.
      </p>
    </section>
  );
}
