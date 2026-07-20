import Link from "next/link";
import {
  ANNO_CORRENTE, caricaAnno, contoEconomico, contoEconomicoMensile,
  LIVELLI, type Livello, type PL,
} from "@/lib/calc";
import { eur, MESI, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

// Struttura del conto economico: ogni riga sa come si legge (costo o risultato)
// così la tabella resta una sola fonte di verità per tutti e 3 i livelli.
type Riga = {
  label: string;
  valore: (pl: PL) => number;
  tipo?: "costo" | "totale" | "risultato";
  nota?: string;
};

const RIGHE: Riga[] = [
  { label: "Ricavi D2C", valore: (pl) => pl.ricaviD2c },
  { label: "Ricavi Eventi", valore: (pl) => pl.ricaviEventi },
  { label: "Ricavi B2B", valore: (pl) => pl.ricaviB2b },
  { label: "Totale ricavi", valore: (pl) => pl.ricavi, tipo: "totale" },
  { label: "Costo del venduto", valore: (pl) => pl.cogs, tipo: "costo", nota: "% su ricavi da Impostazioni" },
  { label: "Margine lordo", valore: (pl) => pl.margineLordo, tipo: "totale" },
  { label: "Spesa pubblicitaria (ADV)", valore: (pl) => pl.adv, tipo: "costo", nota: "% sulle vendite per maison/mese" },
  { label: "Costo del personale", valore: (pl) => pl.personale, tipo: "costo", nota: "dipendenti, stagisti e consulenti" },
  { label: "Costi di struttura", valore: (pl) => pl.costiFissi, tipo: "costo" },
  { label: "EBITDA", valore: (pl) => pl.ebitda, tipo: "risultato" },
  { label: "Premi al raggiungimento", valore: (pl) => pl.premio, tipo: "costo" },
  { label: "Risultato netto", valore: (pl) => pl.risultatoNetto, tipo: "risultato" },
];

export default async function ContoEconomico({
  searchParams,
}: {
  searchParams: Promise<{ livello?: string }>;
}) {
  const sp = await searchParams;
  const dati = await caricaAnno(ANNO_CORRENTE);
  const livello = (LIVELLI.some((l) => l.key === sp.livello) ? sp.livello : "RAGGIUNGIBILE") as Livello;

  const pls = LIVELLI.map((l) => contoEconomico(dati, l.key));
  const plScelto = pls.find((p) => p.livello === livello)!;
  const mensile = contoEconomicoMensile(dati, livello);
  const mesiInPerdita = mensile.filter((m) => m.ebitda < 0).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">P&amp;L {dati.year}</h1>
          <p className="page-caption">
            Conto economico aziendale: ricavi a budget meno costo del venduto, pubblicità, personale
            e struttura. Confrontato sui 3 livelli di budget.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn secondary" href="/dipendenti">Costo del personale</Link>
          <Link className="btn secondary" href="/impostazioni">Costi e premi</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Ricavi ({LIVELLI.find((l) => l.key === livello)?.label})</div>
          <div className="kpi-value">{eur(plScelto.ricavi)}</div>
          <div className="kpi-sub">×{plScelto.moltiplicatore.toLocaleString("it-IT")} sul pubblicato</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">EBITDA</div>
          <div className={`kpi-value ${plScelto.ebitda >= 0 ? "pos" : "neg"}`}>{eur(plScelto.ebitda)}</div>
          <div className="kpi-sub">{pct(plScelto.ebitdaPct)} sui ricavi</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Costo del personale</div>
          <div className="kpi-value">{eur(plScelto.personale)}</div>
          <div className="kpi-sub">
            {plScelto.ricavi > 0 ? `${pct((plScelto.personale / plScelto.ricavi) * 100)} sui ricavi` : "—"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Mesi in perdita</div>
          <div className={`kpi-value ${mesiInPerdita > 0 ? "neg" : "pos"}`}>{mesiInPerdita} su 12</div>
          <div className="kpi-sub">EBITDA mensile sotto zero</div>
        </div>
      </div>

      <h2 className="section-title">Conto economico sui 3 livelli</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Voce</th>
                {LIVELLI.map((l) => (
                  <th className="num" key={l.key}>{l.label}</th>
                ))}
                <th className="num">% sui ricavi</th>
              </tr>
            </thead>
            <tbody>
              {RIGHE.map((r) => {
                const forte = r.tipo === "totale" || r.tipo === "risultato";
                return (
                  <tr key={r.label} className={r.tipo === "risultato" ? "tot" : undefined}>
                    <td style={{ fontWeight: forte ? 600 : 400 }}>
                      {r.label}
                      {r.nota && <div className="muted" style={{ fontSize: 11.5 }}>{r.nota}</div>}
                    </td>
                    {pls.map((pl) => {
                      const v = r.valore(pl);
                      const cls = r.tipo === "risultato" ? (v >= 0 ? "pos" : "neg") : "";
                      return (
                        <td className={`num ${cls}`} style={{ fontWeight: forte ? 600 : 400 }} key={pl.livello}>
                          {r.tipo === "costo" ? `− ${eur(v)}` : eur(v)}
                        </td>
                      );
                    })}
                    <td className="num muted">
                      {plScelto.ricavi > 0 ? pct((r.valore(plScelto) / plScelto.ricavi) * 100) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="page-head" style={{ marginTop: 28, marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Andamento mensile</h2>
        <div className="seg">
          {LIVELLI.map((l) => (
            <Link key={l.key} href={`/pl?livello=${l.key}`} className={l.key === livello ? "on" : ""}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Voce</th>
                {MESI.map((m) => (
                  <th className="num" key={m}>{m}</th>
                ))}
                <th className="num">Anno</th>
              </tr>
            </thead>
            <tbody>
              {([
                ["Ricavi", (m: (typeof mensile)[number]) => m.ricavi, false],
                ["Costo del venduto", (m: (typeof mensile)[number]) => m.cogs, true],
                ["Margine lordo", (m: (typeof mensile)[number]) => m.margineLordo, false],
                ["ADV", (m: (typeof mensile)[number]) => m.adv, true],
                ["Personale", (m: (typeof mensile)[number]) => m.personale, true],
                ["Struttura", (m: (typeof mensile)[number]) => m.costiFissi, true],
              ] as const).map(([label, get, costo]) => (
                <tr key={label}>
                  <td style={{ whiteSpace: "nowrap" }}>{label}</td>
                  {mensile.map((m) => (
                    <td className="num" key={m.month}>
                      {costo ? `− ${eur(get(m))}` : eur(get(m))}
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>
                    {eur(mensile.reduce((s, m) => s + get(m), 0))}
                  </td>
                </tr>
              ))}
              <tr className="tot">
                <td>EBITDA</td>
                {mensile.map((m) => (
                  <td className={`num ${m.ebitda >= 0 ? "pos" : "neg"}`} key={m.month}>{eur(m.ebitda)}</td>
                ))}
                <td className={`num ${plScelto.ebitda >= 0 ? "pos" : "neg"}`}>
                  {eur(mensile.reduce((s, m) => s + m.ebitda, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Conto economico per maison</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Maison</th>
                <th className="num">Ricavi</th>
                <th className="num">Margine lordo</th>
                <th className="num">ADV</th>
                <th className="num">Personale</th>
                <th className="num">Struttura</th>
                <th className="num">EBITDA</th>
                <th className="num">EBITDA %</th>
              </tr>
            </thead>
            <tbody>
              {dati.maisons.map((m) => {
                const pl = contoEconomico(dati, livello, m.slug);
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/maison/${m.slug}`} style={{ fontWeight: 600 }}>{m.nome}</Link>
                    </td>
                    <td className="num">{eur(pl.ricavi)}</td>
                    <td className="num">{eur(pl.margineLordo)}</td>
                    <td className="num">{eur(pl.adv)}</td>
                    <td className="num">{eur(pl.personale)}</td>
                    <td className="num">{eur(pl.costiFissi)}</td>
                    <td className={`num ${pl.ebitda >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                      {eur(pl.ebitda)}
                    </td>
                    <td className="num muted">{pct(pl.ebitdaPct)}</td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>Totale</td>
                <td className="num">{eur(plScelto.ricavi)}</td>
                <td className="num">{eur(plScelto.margineLordo)}</td>
                <td className="num">{eur(plScelto.adv)}</td>
                <td className="num">{eur(plScelto.personale)}</td>
                <td className="num">{eur(plScelto.costiFissi)}</td>
                <td className={`num ${plScelto.ebitda >= 0 ? "pos" : "neg"}`}>{eur(plScelto.ebitda)}</td>
                <td className="num">{pct(plScelto.ebitdaPct)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="page-caption" style={{ marginTop: 18 }}>
        I costi comuni (struttura, personale non attribuito, premi) sono ripartiti sulle maison in
        proporzione ai ricavi. Personale e struttura non scalano con il livello di budget: sono impegni
        già presi, quindi il maggior fatturato dello scenario sfidante cade quasi interamente a margine.
      </p>
    </>
  );
}
