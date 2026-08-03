import { mer, numeriBrand, type NumeriBrand } from "@/lib/brand-dati";
import { COLORE_BRAND, ETICHETTA_BRAND, formattaEuro } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";
import { risultatoAtteso } from "@/lib/risultato";
import type { Periodo } from "@/lib/periodo";

// Le porte d'ingresso ai brand, in cima alla home: una tessera per brand con i
// due numeri che contano (quanto si spende, quanto si vende) e il MER, che dice
// se il rapporto regge.
//
// Il periodo arriva da fuori: è quello scelto in cima alla pagina, lo stesso di
// tutti gli altri numeri. Prima era il mese in corso e basta, e chi cambiava
// periodo si ritrovava con le tessere ferme su un'altra finestra temporale.
//
// Le tessere sono i tre brand veri più il TOTALE. "Cross-brand" non ha una
// tessera: sono le campagne che non appartengono a nessuno dei tre, e in una
// riga di scelte è rumore. La sua spesa però NON sparisce — entra nel totale e
// viene dichiarata sotto le tessere, perché sono soldi usciti davvero. Chi vuole
// guardarle le trova in "Brand › Cross-brand" nel menu.
const BRAND_VERI = ["gifts", "flowers", "cake"];

const VUOTI: NumeriBrand = {
  spesa: 0, ricaviPiattaforma: 0, conversioni: 0, click: 0, impression: 0,
  venditeTotali: 0, ordini: 0, venditeDaCampagne: 0, ordiniDaCampagne: 0,
};

export async function ScelteBrand({ periodo }: { periodo: Periodo }) {

  // Anche "cross" entra nel totale: sono soldi spesi e vendite fatte, e
  // lasciarli fuori farebbe tornare male i conti con la tabella del mese.
  const dati = await Promise.all(
    [...BRAND_VERI, "cross"].map(async (b) => ({ brand: b, n: await numeriBrand(b, periodo) }))
  );

  const totale = dati.reduce<NumeriBrand>(
    (s, { n }) => ({
      spesa: s.spesa + n.spesa,
      ricaviPiattaforma: s.ricaviPiattaforma + n.ricaviPiattaforma,
      conversioni: s.conversioni + n.conversioni,
      click: s.click + n.click,
      impression: s.impression + n.impression,
      venditeTotali: s.venditeTotali + n.venditeTotali,
      ordini: s.ordini + n.ordini,
      venditeDaCampagne: s.venditeDaCampagne + n.venditeDaCampagne,
      ordiniDaCampagne: s.ordiniDaCampagne + n.ordiniDaCampagne,
    }),
    { ...VUOTI }
  );

  const cross = dati.find((d) => d.brand === "cross")?.n ?? { ...VUOTI };
  const tessere = dati
    .filter((d) => BRAND_VERI.includes(d.brand))
    .sort((a, b) => {
      const peso = (x: typeof a) => (x.n.venditeTotali > 0 ? 2 : x.n.spesa > 0 ? 1 : 0);
      return peso(b) - peso(a) || b.n.venditeTotali - a.n.venditeTotali;
    });

  const tessera = (
    chiave: string,
    n: NumeriBrand,
    o: { href?: string; etichetta: string; colore: string; totale?: boolean }
  ) => {
    const m = mer(n);
    // Sul totale il break-even non è uno solo: si usa il più severo dei tre
    // (Gifts) e lo si dichiara, invece di inventare una media.
    const be = o.totale ? breakEvenRoas("gifts") : breakEvenRoas(chiave);
    const vuoto = n.spesa === 0 && n.venditeTotali === 0;
    // Quanto resta: margine di prodotto meno la pubblicita. Il MER dice se il
    // rapporto regge, questo dice quanti soldi ci sono sotto — e sono due
    // domande diverse: un MER alto su vendite piccole lascia briciole.
    const res = risultatoAtteso(n.venditeTotali, n.spesa);

    const dentro = (
      <>
        <div className="card-brand-testa">
          <span className="sb-dot" style={{ background: o.colore, width: 11, height: 11 }} />
          <b>{o.etichetta}</b>
        </div>
        {vuoto ? (
          <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 8 }}>
            Nessun dato in questo periodo: lo script di Google Ads non è ancora installato su
            questo account, mancano gli ordini, oppure la finestra scelta è troppo stretta.
          </div>
        ) : (
          <>
            <div
              className="card-brand-mer"
              style={{ color: m != null ? (m >= be ? "var(--green)" : "var(--orange)") : "var(--text-tertiary)" }}
              title={
                o.totale
                  ? `Vendite ÷ spesa pubblicitaria di tutti i brand. Confrontato col break-even più severo dei tre (${be.toFixed(2)}× di Gifts)`
                  : `Vendite ÷ spesa. Break-even di questo brand: ${be.toFixed(2)}×`
              }
            >
              {m != null ? `${m.toFixed(1)}×` : "—"}
              <i>MER</i>
            </div>
            <div className="card-brand-numeri">
              <span>
                <b>{formattaEuro(n.spesa)}</b>
                <i>spesa ADV</i>
              </span>
              <span>
                <b>{n.ordini > 0 ? formattaEuro(n.venditeTotali) : "—"}</b>
                <i>{n.ordini > 0 ? `vendite · ${n.ordini} ordini` : "nessun ordine"}</i>
              </span>
            </div>
            {/* Il risultato stimato: margine di prodotto meno pubblicità.
                Sta sotto ai due numeri di partenza perché è il loro esito, e
                col conto scritto nel tooltip — un numero che nasce da
                un'assunzione (il 30%) deve dire da dove viene. */}
            <div
              className="card-brand-risultato"
              title={`${formattaEuro(n.venditeTotali)} di vendite × ${Math.round(res.margineUsato * 100)}% = ${formattaEuro(res.margineLordo)} di margine, meno ${formattaEuro(res.spesa)} di pubblicità`}
            >
              <span>Risultato stimato</span>
              <b style={{ color: res.risultato >= 0 ? "var(--green)" : "var(--red)" }}>
                {n.ordini > 0 ? formattaEuro(res.risultato) : "—"}
              </b>
            </div>
          </>
        )}
      </>
    );

    if (!o.href) {
      return (
        <div
          key={chiave}
          className="card-brand"
          style={{ cursor: "default", borderColor: "var(--hairline-strong)", background: "var(--surface-2, rgba(0,0,0,.02))" }}
        >
          {dentro}
        </div>
      );
    }
    return (
      <a key={chiave} className="card-brand" href={o.href}>
        {dentro}
      </a>
    );
  };

  return (
    <section className="scheda">
      <div className="scheda-titolo">Scegli il brand — {periodo.etichetta}</div>
      <div className="griglia-brand">
        {tessere.map(({ brand, n }) =>
          tessera(brand, n, {
            href: `/brand/${brand}`,
            etichetta: ETICHETTA_BRAND[brand] ?? brand,
            colore: COLORE_BRAND[brand] ?? "var(--text-tertiary)",
          })
        )}
        {tessera("totale", totale, { etichetta: "Tutti i brand", colore: "var(--text)", totale: true })}
      </div>

      {totale.venditeTotali > 0 && (
        <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
          <b>Il risultato stimato</b> è {formattaEuro(totale.venditeTotali)} di vendite ×{" "}
          {Math.round(risultatoAtteso(totale.venditeTotali, totale.spesa).margineUsato * 100)}% di
          margine = {formattaEuro(risultatoAtteso(totale.venditeTotali, totale.spesa).margineLordo)},
          meno {formattaEuro(totale.spesa)} di pubblicità.{" "}
          <b>Non è un utile</b>: sotto non ci sono personale, logistica, commissioni di pagamento e
          resi — e il 30% è una percentuale media dichiarata, non il costo reale di quei prodotti.
        </p>
      )}

      {(cross.spesa > 0 || cross.venditeTotali > 0) && (
        <p className="cella-sub" style={{ marginTop: 8, whiteSpace: "normal" }}>
          Nel totale ci sono anche {formattaEuro(cross.spesa)} di spesa
          {cross.venditeTotali > 0 ? ` e ${formattaEuro(cross.venditeTotali)} di vendite` : ""} di
          campagne <b>cross-brand</b>, che non appartengono a nessuno dei tre marchi e quindi non
          hanno una tessera. Si guardano da <a href="/brand/cross">Brand › Cross-brand</a>.
        </p>
      )}
    </section>
  );
}
