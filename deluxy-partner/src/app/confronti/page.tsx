import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/queries";
import { euro } from "@/lib/format";
import { MESI, nomeMese } from "@/lib/calc";
import { ThSort, ordina } from "@/components/ThSort";

export const dynamic = "force-dynamic";

// Confronto anno su anno (2026 vs 2025) su dati reali importati dal foglio:
// vendite come vendor (incasso lordo) e servizi a fatturazione (netto IVA).
export default async function ConfrontiPage({
  searchParams,
}: {
  searchParams: Promise<{
    tipo?: string; mese?: string; trim?: string; da?: string; a?: string;
    sort?: string; dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const anno = ANNO_CORRENTE;
  const annoPrec = anno - 1;

  const tipo = sp.tipo ?? "anno";
  const meseSel = Math.min(12, Math.max(1, parseInt(sp.mese ?? "") || new Date().getMonth() + 1));
  const trimSel = Math.min(4, Math.max(1, parseInt(sp.trim ?? "") || Math.ceil((new Date().getMonth() + 1) / 3)));
  let da = 1, a = 12;
  if (tipo === "mese") { da = meseSel; a = meseSel; }
  else if (tipo === "trimestre") { da = (trimSel - 1) * 3 + 1; a = trimSel * 3; }
  else if (tipo === "personalizzato") {
    da = Math.min(12, Math.max(1, parseInt(sp.da ?? "") || 1));
    a = Math.min(12, Math.max(1, parseInt(sp.a ?? "") || 12));
    if (da > a) [da, a] = [a, da];
  }
  const etichetta =
    tipo === "mese" ? nomeMese(da) :
    tipo === "trimestre" ? `T${trimSel} (${nomeMese(da)}–${nomeMese(a)})` :
    tipo === "personalizzato" ? `${nomeMese(da)}–${nomeMese(a)}` : "Anno intero";

  const [fatture, vendite, partners] = await Promise.all([
    prisma.fatturaServizio.findMany({
      where: { anno: { in: [anno, annoPrec] }, mese: { gte: da, lte: a } },
      select: { partnerId: true, anno: true, imponibile: true },
    }),
    prisma.venditaVendor.findMany({
      where: { anno: { in: [anno, annoPrec] }, mese: { gte: da, lte: a } },
      select: { partnerId: true, anno: true, incassoLordo: true },
    }),
    prisma.partner.findMany(),
  ]);

  type Riga = {
    partner: (typeof partners)[number];
    vendPrec: number; vendCur: number; servPrec: number; servCur: number;
  };
  const righeMap = new Map<string, Riga>();
  const riga = (id: string) => {
    if (!righeMap.has(id)) {
      const p = partners.find((x) => x.id === id)!;
      righeMap.set(id, { partner: p, vendPrec: 0, vendCur: 0, servPrec: 0, servCur: 0 });
    }
    return righeMap.get(id)!;
  };
  for (const f of fatture) {
    const r = riga(f.partnerId);
    if (f.anno === anno) r.servCur += f.imponibile; else r.servPrec += f.imponibile;
  }
  for (const v of vendite) {
    const r = riga(v.partnerId);
    if (v.anno === anno) r.vendCur += v.incassoLordo; else r.vendPrec += v.incassoLordo;
  }

  let righe = [...righeMap.values()].filter(
    (r) => r.vendPrec || r.vendCur || r.servPrec || r.servCur
  );
  const totPrecR = (r: Riga) => r.vendPrec + r.servPrec;
  const totCurR = (r: Riga) => r.vendCur + r.servCur;
  const deltaR = (r: Riga) => totCurR(r) - totPrecR(r);
  const deltaPctR = (r: Riga) => (totPrecR(r) ? (deltaR(r) / totPrecR(r)) * 100 : null);

  const campi: Record<string, (r: Riga) => string | number | null> = {
    partner: (r) => r.partner.nome,
    vendPrec: (r) => r.vendPrec,
    vendCur: (r) => r.vendCur,
    servPrec: (r) => r.servPrec,
    servCur: (r) => r.servCur,
    totPrec: totPrecR,
    totCur: totCurR,
    delta: deltaR,
    deltaPct: deltaPctR,
  };
  righe = sp.sort && campi[sp.sort]
    ? ordina(righe, campi[sp.sort], sp.dir)
    : ordina(righe, totCurR, "desc");

  const tot = righe.reduce(
    (acc, r) => ({
      vendPrec: acc.vendPrec + r.vendPrec, vendCur: acc.vendCur + r.vendCur,
      servPrec: acc.servPrec + r.servPrec, servCur: acc.servCur + r.servCur,
    }),
    { vendPrec: 0, vendCur: 0, servPrec: 0, servCur: 0 }
  );
  const pct = (cur: number, prec: number) =>
    prec ? `${((cur - prec) / prec * 100).toFixed(1).replace(".", ",")}%` : "—";
  const spQuery = { tipo, mese: String(meseSel), trim: String(trimSel), da: String(da), a: String(a), sort: sp.sort, dir: sp.dir };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Confronti</h1>
          <p className="page-caption">
            {anno} vs {annoPrec} su dati reali (vendite vendor + servizi fatturati netto IVA) — periodo: {etichetta}.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <select name="tipo" defaultValue={tipo}>
            <option value="anno">Anno intero</option>
            <option value="mese">Mese</option>
            <option value="trimestre">Trimestre</option>
            <option value="personalizzato">Periodo personalizzato</option>
          </select>
          <select name="mese" defaultValue={meseSel} title="Usato se il tipo è Mese">
            {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select name="trim" defaultValue={trimSel} title="Usato se il tipo è Trimestre">
            <option value="1">T1 (gen–mar)</option>
            <option value="2">T2 (apr–giu)</option>
            <option value="3">T3 (lug–set)</option>
            <option value="4">T4 (ott–dic)</option>
          </select>
          <select name="da" defaultValue={da} title="Da (periodo personalizzato)">
            {MESI.map((m, i) => <option key={m} value={i + 1}>da {m}</option>)}
          </select>
          <select name="a" defaultValue={a} title="A (periodo personalizzato)">
            {MESI.map((m, i) => <option key={m} value={i + 1}>a {m}</option>)}
          </select>
          <button className="btn secondary small" type="submit">Applica</button>
        </form>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite vendor — {etichetta}</div>
          <div className="kpi-value">{euro(tot.vendCur)}</div>
          <div className="kpi-sub">{annoPrec}: {euro(tot.vendPrec)} · {pct(tot.vendCur, tot.vendPrec)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Servizi fatturati — {etichetta}</div>
          <div className="kpi-value">{euro(tot.servCur)}</div>
          <div className="kpi-sub">{annoPrec}: {euro(tot.servPrec)} · {pct(tot.servCur, tot.servPrec)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Totale — {etichetta}</div>
          <div className="kpi-value">{euro(tot.vendCur + tot.servCur)}</div>
          <div className="kpi-sub">
            {annoPrec}: {euro(tot.vendPrec + tot.servPrec)} · {pct(tot.vendCur + tot.servCur, tot.vendPrec + tot.servPrec)}
          </div>
        </div>
      </div>

      <div className="card tight">
        {righe.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun dato nel periodo</div>
            <div className="empty-text">Nessun movimento {annoPrec} o {anno} nei mesi selezionati.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <ThSort label="Partner" campo="partner" sp={spQuery} path="/confronti" />
                  <ThSort label={`Vendite ${annoPrec}`} campo="vendPrec" sp={spQuery} path="/confronti" num />
                  <ThSort label={`Vendite ${anno}`} campo="vendCur" sp={spQuery} path="/confronti" num />
                  <ThSort label={`Servizi ${annoPrec}`} campo="servPrec" sp={spQuery} path="/confronti" num />
                  <ThSort label={`Servizi ${anno}`} campo="servCur" sp={spQuery} path="/confronti" num />
                  <ThSort label={`Totale ${annoPrec}`} campo="totPrec" sp={spQuery} path="/confronti" num />
                  <ThSort label={`Totale ${anno}`} campo="totCur" sp={spQuery} path="/confronti" num />
                  <ThSort label="Δ €" campo="delta" sp={spQuery} path="/confronti" num />
                  <ThSort label="Δ %" campo="deltaPct" sp={spQuery} path="/confronti" num />
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => {
                  const d = deltaR(r);
                  const dp = deltaPctR(r);
                  return (
                    <tr key={r.partner.id}>
                      <td><Link href={`/partner/${r.partner.id}`} style={{ fontWeight: 500 }}>{r.partner.nome}</Link></td>
                      <td className="num muted">{euro(r.vendPrec)}</td>
                      <td className="num">{euro(r.vendCur)}</td>
                      <td className="num muted">{euro(r.servPrec)}</td>
                      <td className="num">{euro(r.servCur)}</td>
                      <td className="num muted">{euro(totPrecR(r))}</td>
                      <td className="num">{euro(totCurR(r))}</td>
                      <td className={`num ${d > 0.005 ? "pos" : d < -0.005 ? "neg" : ""}`}>{euro(d)}</td>
                      <td className={`num ${d > 0.005 ? "pos" : d < -0.005 ? "neg" : ""}`}>
                        {dp == null ? "—" : `${dp.toFixed(1).replace(".", ",")}%`}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                  <td>Totale</td>
                  <td className="num">{euro(tot.vendPrec)}</td>
                  <td className="num">{euro(tot.vendCur)}</td>
                  <td className="num">{euro(tot.servPrec)}</td>
                  <td className="num">{euro(tot.servCur)}</td>
                  <td className="num">{euro(tot.vendPrec + tot.servPrec)}</td>
                  <td className="num">{euro(tot.vendCur + tot.servCur)}</td>
                  <td className="num">{euro(tot.vendCur + tot.servCur - tot.vendPrec - tot.servPrec)}</td>
                  <td className="num">{pct(tot.vendCur + tot.servCur, tot.vendPrec + tot.servPrec)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        Fonte {annoPrec}: foglio &laquo;Database clienti 2025&raquo; di PARTNER.xlsx (ledger mensile reale).
        Nota: confrontando l&apos;anno intero, il {anno} copre solo i mesi già consuntivati.
      </p>
    </>
  );
}
