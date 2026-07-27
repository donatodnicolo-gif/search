import { mer, numeriBrand, type NumeriBrand } from "@/lib/brand-dati";
import { COLORE_BRAND, ETICHETTA_BRAND, formattaEuro, MESI_IT } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";

// Le porte d'ingresso ai brand, in cima alla home: una tessera per brand con i
// due numeri che contano (quanto si spende, quanto si vende) e il MER, che dice
// se il rapporto regge.
//
// Il periodo è il MESE IN CORSO, non "ultimi 30 giorni": il budget si governa a
// mesi, il piano è mensile, e trenta giorni a cavallo di due mesi non si
// confrontano con nessun obiettivo.
//
// L'ultima tessera è il TOTALE, non "cross-brand". Cross-brand è un brand come
// gli altri — le campagne che non appartengono a nessuno dei tre — e stando in
// fondo faceva credere di essere la somma. La somma, invece, serve davvero.
const BRAND_VERI = ["gifts", "flowers", "cake"];

const VUOTI: NumeriBrand = {
  spesa: 0, ricaviPiattaforma: 0, conversioni: 0, click: 0, impression: 0,
  venditeTotali: 0, ordini: 0, venditeDaCampagne: 0, ordiniDaCampagne: 0,
};

export async function ScelteBrand() {
  const adesso = new Date();
  const inizio = new Date(adesso.getFullYear(), adesso.getMonth(), 1);
  const domani = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + 1);
  const periodo = { da: inizio, a: domani, etichetta: "mese in corso" };

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

  // I tre brand ci sono sempre; "cross" solo se ha davvero qualcosa dentro.
  const tessere = dati
    .filter((d) => BRAND_VERI.includes(d.brand) || d.n.spesa > 0 || d.n.venditeTotali > 0)
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

    const dentro = (
      <>
        <div className="card-brand-testa">
          <span className="sb-dot" style={{ background: o.colore, width: 11, height: 11 }} />
          <b>{o.etichetta}</b>
        </div>
        {vuoto ? (
          <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 8 }}>
            Nessun dato questo mese: lo script di Google Ads non è ancora installato su questo
            account, o mancano gli ordini.
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
      <div className="scheda-titolo">
        Scegli il brand — {MESI_IT[adesso.getMonth()].toLowerCase()} {adesso.getFullYear()}, dal primo
        del mese a oggi
      </div>
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
    </section>
  );
}
