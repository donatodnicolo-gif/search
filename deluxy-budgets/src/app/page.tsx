import Link from "next/link";
import { ANNO_CORRENTE, caricaAnno, contoEconomico, LIVELLI, totaliMaison } from "@/lib/calc";
import { eur, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const dati = await caricaAnno(ANNO_CORRENTE);
  const pls = LIVELLI.map((l) => contoEconomico(dati, l.key));

  const righe: { label: string; get: (pl: (typeof pls)[number]) => string; cls?: (pl: (typeof pls)[number]) => string }[] = [
    { label: "Ricavi", get: (pl) => eur(pl.ricavi) },
    { label: "Costo del venduto", get: (pl) => `− ${eur(pl.cogs)}` },
    { label: "Margine lordo", get: (pl) => eur(pl.margineLordo) },
    { label: "Spesa ADV", get: (pl) => `− ${eur(pl.adv)}` },
    { label: "Costo del personale", get: (pl) => `− ${eur(pl.personale)}` },
    { label: "Costi di struttura", get: (pl) => `− ${eur(pl.costiFissi)}` },
    {
      label: "EBITDA",
      get: (pl) => eur(pl.ebitda),
      cls: (pl) => (pl.ebitda >= 0 ? "pos" : "neg"),
    },
    { label: "Premi al raggiungimento", get: (pl) => `− ${eur(pl.premio)}` },
    {
      label: "Risultato netto",
      get: (pl) => eur(pl.risultatoNetto),
      cls: (pl) => (pl.risultatoNetto >= 0 ? "pos" : "neg"),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Budget {dati.year}</h1>
          <p className="page-caption">
            P&amp;L aziendale sui 3 livelli di budget: raggiungibile (pubblicato), sfidante e irraggiungibile.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn secondary" href="/pl">P&amp;L completo</Link>
          <Link className="btn secondary" href="/impostazioni">Scenari e costi</Link>
          <Link className="btn primary" href="/proposte/nuova">Invia proposta budget</Link>
        </div>
      </div>

      <div className="kpi-grid">
        {LIVELLI.map((l, i) => (
          <div className="kpi" key={l.key}>
            <div className="kpi-label">
              <span className={`badge ${l.badge}`}><span className="dot" />{l.label}</span>
            </div>
            <div className="kpi-value">{eur(pls[i].ricavi)}</div>
            <div className="kpi-sub">
              ×{pls[i].moltiplicatore.toLocaleString("it-IT")} · EBITDA {eur(pls[i].ebitda)}
              {pls[i].premio > 0 ? ` · premio ${eur(pls[i].premio)}` : " · premio da impostare"}
            </div>
          </div>
        ))}
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Conto economico {dati.year}</th>
                {LIVELLI.map((l) => (
                  <th className="num" key={l.key}>{l.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {pls.map((pl) => (
                    <td className={`num ${r.cls ? r.cls(pl) : ""}`} key={pl.livello}>{r.get(pl)}</td>
                  ))}
                </tr>
              ))}
              <tr className="tot">
                <td>Marginalità (EBITDA %)</td>
                {pls.map((pl) => (
                  <td className="num" key={pl.livello}>{pct(pl.ebitdaPct)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Maison — budget pubblicato (raggiungibile)</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Maison</th>
                <th className="num">D2C</th>
                <th className="num">Eventi</th>
                <th className="num">B2B</th>
                <th className="num">Totale vendite</th>
                <th className="num">ADV consentito</th>
                <th className="num">Sfidante</th>
                <th className="num">Irraggiungibile</th>
              </tr>
            </thead>
            <tbody>
              {dati.maisons.map((m) => {
                const t = totaliMaison(m);
                const sfid = t.totale * (dati.scenari.find((s) => s.livello === "SFIDANTE")?.moltiplicatore ?? 1.15);
                const irr = t.totale * (dati.scenari.find((s) => s.livello === "IRRAGGIUNGIBILE")?.moltiplicatore ?? 1.35);
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/maison/${m.slug}`} style={{ fontWeight: 600 }}>{m.nome}</Link>
                    </td>
                    <td className="num">{eur(t.d2c)}</td>
                    <td className="num">{eur(t.eventi)}</td>
                    <td className="num">{eur(t.b2b)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{eur(t.totale)}</td>
                    <td className="num">{eur(t.adv)}</td>
                    <td className="num muted">{eur(sfid)}</td>
                    <td className="num muted">{eur(irr)}</td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>Totale</td>
                {(["d2c", "eventi", "b2b", "totale", "adv"] as const).map((k) => (
                  <td className="num" key={k}>
                    {eur(dati.maisons.reduce((s, m) => s + totaliMaison(m)[k], 0))}
                  </td>
                ))}
                <td className="num" />
                <td className="num" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="page-caption" style={{ marginTop: 18 }}>
        Fonte: budget pubblicati 2026 (Monitoraggio 2026 · budget pubblicati.xlsx). ADV consentito = vendite × % impostata in{" "}
        <Link href="/spese" style={{ color: "var(--blue)" }}>Spese ADV</Link>. Il risultato usa il costo del
        venduto configurato in <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni</Link>.
      </p>
    </>
  );
}
