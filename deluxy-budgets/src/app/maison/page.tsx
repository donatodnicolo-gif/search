import Link from "next/link";
import { ANNO_CORRENTE, caricaAnno, totaliMaison } from "@/lib/calc";
import { eur, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MaisonIndex() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Maison</h1>
          <p className="page-caption">
            Budget {dati.year} per brand, con la vista D2C · Eventi · B2B (lead generation).
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        {dati.maisons.map((m) => {
          const t = totaliMaison(m);
          return (
            <Link className="kpi" key={m.id} href={`/maison/${m.slug}`}>
              <div className="kpi-label">{m.nome}</div>
              <div className="kpi-value">{eur(t.totale)}</div>
              <div className="kpi-sub">
                D2C {t.totale > 0 ? pct((t.d2c / t.totale) * 100, 0) : "—"} · Eventi{" "}
                {t.totale > 0 ? pct((t.eventi / t.totale) * 100, 0) : "—"} · B2B{" "}
                {t.totale > 0 ? pct((t.b2b / t.totale) * 100, 0) : "—"}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
