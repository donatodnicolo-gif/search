import Link from "next/link";
import { notFound } from "next/navigation";
import {
  advConsentitoMese, ANNO_CORRENTE, caricaAnno, contoEconomico, LIVELLI,
  moltiplicatore, totaliMaison, type Livello,
} from "@/lib/calc";
import { eur, MESI, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MaisonDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ livello?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const dati = await caricaAnno(ANNO_CORRENTE);
  const maison = dati.maisons.find((m) => m.slug === slug);
  if (!maison) notFound();

  const livello = (LIVELLI.some((l) => l.key === sp.livello) ? sp.livello : "RAGGIUNGIBILE") as Livello;
  const molt = moltiplicatore(dati, livello);
  const t = totaliMaison(maison);
  const pl = contoEconomico(dati, livello, maison.slug);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{maison.nome}</h1>
          <p className="page-caption">
            Budget {dati.year} per canale. Livello mostrato:{" "}
            {LIVELLI.find((l) => l.key === livello)?.label} (×{molt.toLocaleString("it-IT")}).
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {LIVELLI.map((l) => (
              <Link
                key={l.key}
                href={`/maison/${maison.slug}?livello=${l.key}`}
                className={l.key === livello ? "on" : ""}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite anno ({LIVELLI.find((l) => l.key === livello)?.label})</div>
          <div className="kpi-value">{eur(t.totale * molt)}</div>
          <div className="kpi-sub">pubblicato {eur(t.totale)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">ADV consentito</div>
          <div className="kpi-value">{eur(t.adv * molt)}</div>
          <div className="kpi-sub">{t.totale > 0 ? pct((t.adv / t.totale) * 100) : "—"} delle vendite</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Margine lordo</div>
          <div className="kpi-value">{eur(pl.margineLordo)}</div>
          <div className="kpi-sub">dopo costo del venduto</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Risultato operativo</div>
          <div className={`kpi-value ${pl.risultatoOperativo >= 0 ? "pos" : "neg"}`}>
            {eur(pl.risultatoOperativo)}
          </div>
          <div className="kpi-sub">quota costi fissi inclusa</div>
        </div>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mese</th>
                <th className="num">D2C</th>
                <th className="num">Eventi</th>
                <th className="num">B2B (lead gen)</th>
                <th className="num">Totale</th>
                <th className="num">% ADV</th>
                <th className="num">ADV consentito</th>
                <th className="num">ADV pubblicato</th>
              </tr>
            </thead>
            <tbody>
              {maison.mesi.map((mese) => {
                const tot = mese.d2c + mese.eventi + mese.b2b;
                return (
                  <tr key={mese.month}>
                    <td style={{ fontWeight: 500 }}>{MESI[mese.month - 1]}</td>
                    <td className="num">{eur(mese.d2c * molt)}</td>
                    <td className="num">{eur(mese.eventi * molt)}</td>
                    <td className="num">{eur(mese.b2b * molt)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{eur(tot * molt)}</td>
                    <td className="num muted">{pct(mese.advPercent)}</td>
                    <td className="num">{eur(advConsentitoMese(mese) * molt)}</td>
                    <td className="num muted">{eur(mese.advPubblicato)}</td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>Totale</td>
                <td className="num">{eur(t.d2c * molt)}</td>
                <td className="num">{eur(t.eventi * molt)}</td>
                <td className="num">{eur(t.b2b * molt)}</td>
                <td className="num">{eur(t.totale * molt)}</td>
                <td className="num">{t.totale > 0 ? pct((t.adv / t.totale) * 100) : "—"}</td>
                <td className="num">{eur(t.adv * molt)}</td>
                <td className="num">{eur(t.advPubblicato)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="page-caption" style={{ marginTop: 18 }}>
        Le % ADV per mese si modificano in <Link href="/spese" style={{ color: "var(--blue)" }}>Spese ADV</Link>.
        &quot;ADV pubblicato&quot; è il budget HP del monitoraggio 2026, mostrato come riferimento (non scala con il livello).
      </p>
    </>
  );
}
