import { mer, numeriBrand } from "@/lib/brand-dati";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, formattaEuro } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";
import { risolviPeriodo } from "@/lib/periodo";

// Le porte d'ingresso ai brand, in cima alla home: una tessera per brand con
// i due numeri che contano davvero (quanto si spende, quanto si vende) e il
// MER, che dice se il rapporto regge. Cliccando si entra nella dashboard.
export async function ScelteBrand() {
  const periodo = risolviPeriodo("30g");
  const dati = (
    await Promise.all(BRANDS.map(async (b) => ({ brand: b, n: await numeriBrand(b, periodo.corrente) })))
  ).sort((a, b) => {
    // Prima chi ha numeri: le tessere vuote in fondo, non davanti
    const peso = (x: typeof a) => (x.n.venditeTotali > 0 ? 2 : x.n.spesa > 0 ? 1 : 0);
    return peso(b) - peso(a) || b.n.venditeTotali - a.n.venditeTotali;
  });

  return (
    <section className="scheda">
      <div className="scheda-titolo">Scegli il brand — ultimi 30 giorni</div>
      <div className="griglia-brand">
        {dati.map(({ brand, n }) => {
          const m = mer(n);
          const be = breakEvenRoas(brand);
          const vuoto = n.spesa === 0 && n.venditeTotali === 0;
          return (
            <a key={brand} className="card-brand" href={`/brand/${brand}`}>
              <div className="card-brand-testa">
                <span className="sb-dot" style={{ background: COLORE_BRAND[brand], width: 11, height: 11 }} />
                <b>{ETICHETTA_BRAND[brand]}</b>
              </div>
              {vuoto ? (
                <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 8 }}>
                  Nessun dato negli ultimi 30 giorni: lo script di Google Ads non è ancora
                  installato su questo account, o mancano gli ordini.
                </div>
              ) : (
                <>
                  <div className="card-brand-mer" style={{ color: m != null ? (m >= be ? "var(--green)" : "var(--orange)") : "var(--text-tertiary)" }}>
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
            </a>
          );
        })}
      </div>
    </section>
  );
}
