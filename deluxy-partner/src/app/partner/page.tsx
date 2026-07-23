import Link from "next/link";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro, pctIt } from "@/lib/format";
import { ThSort, ordina } from "@/components/ThSort";
import { BadgeCredito } from "@/components/BadgeCredito";
import { schedeTutti, schedaVuota, GRAVITA } from "@/lib/stato-credito";

export const dynamic = "force-dynamic";

function badgeStato(clienteAnno: string | null) {
  if (clienteAnno === "Nuovo") return <span className="badge blue"><span className="dot" />Nuovo</span>;
  if (clienteAnno === "Dismesso") return <span className="badge red"><span className="dot" />Dismesso</span>;
  if (clienteAnno) return <span className="badge green"><span className="dot" />P.P.</span>;
  return <span className="badge neutral"><span className="dot" />—</span>;
}

// variazione % rispetto allo stesso periodo dell'anno prima, in piccolo sotto il valore
function DeltaAnno({ cur, prev }: { cur: number; prev: number }) {
  if (prev < 0.005) {
    return <span className="delta-anno neutro">{cur >= 0.005 ? "nuovo" : "—"}</span>;
  }
  const dp = ((cur - prev) / prev) * 100;
  const cls = dp >= 0 ? "pos" : "neg";
  return (
    <span className={`delta-anno ${cls}`} title={`Stesso periodo ${ANNO_CORRENTE - 1}: ${euro(prev)}`}>
      {dp >= 0 ? "+" : ""}{dp.toFixed(1).replace(".", ",")}%
    </span>
  );
}

export default async function PartnerList({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; citta?: string; categoria?: string; stato?: string;
    credito?: string; sort?: string; dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const [tutti, prec, schede] = await Promise.all([
    riepilogoTutti(ANNO_CORRENTE),
    riepilogoTutti(ANNO_CORRENTE - 1),
    schedeTutti(),
  ]);
  const vuota = schedaVuota();
  const credito = (id: string) => schede.get(id) ?? vuota;

  // confronto a parità di periodo: fino all'ultimo mese con movimenti nel 2026
  const meseMax = Math.max(
    1,
    ...tutti.flatMap((t) =>
      t.mesi.filter((m) => m.riepilogo.vendite || m.riepilogo.serviziNetto).map((m) => m.mese)
    )
  );
  const precPeriodo = new Map(
    prec.map((t) => [
      t.partner.id,
      {
        vendite: t.mesi.slice(0, meseMax).reduce((a, m) => a + m.riepilogo.vendite, 0),
        servizi: t.mesi.slice(0, meseMax).reduce((a, m) => a + m.riepilogo.serviziNetto, 0),
      },
    ])
  );

  const citta = [...new Set(tutti.map((t) => t.partner.citta).filter(Boolean))].sort() as string[];
  const categorie = [...new Set(tutti.map((t) => t.partner.categoria?.trim()).filter(Boolean))].sort() as string[];

  let filtered = tutti.filter((t) => {
    const p = t.partner;
    if (sp.q && !p.nome.toLowerCase().includes(sp.q.toLowerCase())) return false;
    if (sp.citta && p.citta !== sp.citta) return false;
    if (sp.categoria && p.categoria?.trim() !== sp.categoria) return false;
    if (sp.stato === "attivi" && p.clienteAnno === "Dismesso") return false;
    if (sp.stato === "dismessi" && p.clienteAnno !== "Dismesso") return false;
    if (sp.credito === "arischio" && GRAVITA[credito(p.id).stato] < GRAVITA.ritardo) return false;
    if (sp.credito && sp.credito !== "arischio" && credito(p.id).stato !== sp.credito) return false;
    return true;
  });

  type T = (typeof tutti)[number];
  const campi: Record<string, (t: T) => string | number | null> = {
    nome: (t) => t.partner.nome,
    categoria: (t) => t.partner.categoria,
    citta: (t) => t.partner.citta,
    servizi: (t) => t.partner.servizi,
    stato: (t) => t.partner.clienteAnno,
    credito: (t) => GRAVITA[credito(t.partner.id).stato],
    scaduto: (t) => credito(t.partner.id).scaduto,
    fee: (t) => t.partner.feePercent,
    vendite: (t) => t.rolling.vendite,
    servizio: (t) => t.rolling.fatture,
    residuo: (t) => t.rolling.residuo,
  };
  if (sp.sort && campi[sp.sort]) filtered = ordina(filtered, campi[sp.sort], sp.dir);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Partner</h1>
          <p className="page-caption">
            Il database partner {ANNO_CORRENTE}: anagrafica, condizioni e rolling annuale.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/partner/nuovo" className="btn primary">+ Nuovo partner</Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <input type="text" name="q" placeholder="Cerca partner…" defaultValue={sp.q ?? ""} />
          <select name="citta" defaultValue={sp.citta ?? ""}>
            <option value="">Tutte le città</option>
            {citta.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select name="categoria" defaultValue={sp.categoria ?? ""}>
            <option value="">Tutte le categorie</option>
            {categorie.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select name="stato" defaultValue={sp.stato ?? ""}>
            <option value="">Tutti</option>
            <option value="attivi">Attivi</option>
            <option value="dismessi">Dismessi</option>
          </select>
          <select name="credito" defaultValue={sp.credito ?? ""} aria-label="Stato finanziario">
            <option value="">Credito: tutti</option>
            <option value="arischio">Solo a rischio (ritardo e oltre)</option>
            <option value="regolare">Regolari</option>
            <option value="monitorare">Da monitorare</option>
            <option value="ritardo">In ritardo</option>
            <option value="grave">Scaduto grave</option>
            <option value="insoluto">Insoluti</option>
            <option value="nessuna">Senza esposizione</option>
          </select>
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <ThSort label="Partner" campo="nome" sp={sp} path="/partner" />
                <ThSort label="Categoria" campo="categoria" sp={sp} path="/partner" />
                <ThSort label="Città" campo="citta" sp={sp} path="/partner" />
                <ThSort label="Servizio" campo="servizi" sp={sp} path="/partner" />
                <ThSort label="Stato" campo="stato" sp={sp} path="/partner" />
                <ThSort label="Credito" campo="credito" sp={sp} path="/partner" />
                <ThSort label="Scaduto" campo="scaduto" sp={sp} path="/partner" num />
                <ThSort label="Fee" campo="fee" sp={sp} path="/partner" num />
                <ThSort label="Vendite YTD" campo="vendite" sp={sp} path="/partner" num />
                <ThSort label="Servizi YTD" campo="servizio" sp={sp} path="/partner" num />
                <ThSort label="Residuo" campo="residuo" sp={sp} path="/partner" num />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.partner.id}>
                  <td><Link href={`/partner/${t.partner.id}`} style={{ fontWeight: 500 }}>{t.partner.nome}</Link></td>
                  <td>{t.partner.categoria ?? "—"}</td>
                  <td>{t.partner.citta ?? "—"}</td>
                  <td className="muted">{t.partner.servizi ?? "—"}</td>
                  <td>{badgeStato(t.partner.clienteAnno)}</td>
                  <td><BadgeCredito s={credito(t.partner.id)} /></td>
                  <td className={`num ${credito(t.partner.id).scaduto >= 0.01 ? "neg" : ""}`}>
                    {credito(t.partner.id).scaduto >= 0.01 ? euro(credito(t.partner.id).scaduto) : "—"}
                  </td>
                  <td className="num">{pctIt(t.partner.feePercent)}</td>
                  <td className="num">
                    {euro(t.rolling.vendite)}
                    <DeltaAnno cur={t.rolling.vendite} prev={precPeriodo.get(t.partner.id)?.vendite ?? 0} />
                  </td>
                  <td className="num">
                    {euro(t.rolling.fatture)}
                    <DeltaAnno cur={t.rolling.fatture} prev={precPeriodo.get(t.partner.id)?.servizi ?? 0} />
                  </td>
                  <td className={`num ${Math.abs(t.rolling.residuo) < 0.01 ? "" : t.rolling.residuo > 0 ? "pos" : "neg"}`}>
                    {euro(t.rolling.residuo)}
                  </td>
                </tr>
              ))}
              {(() => {
                const somma = (fn: (t: T) => number) => filtered.reduce((a, t) => a + fn(t), 0);
                const totVendite = somma((t) => t.rolling.vendite);
                const totServizi = somma((t) => t.rolling.fatture);
                const totResiduo = somma((t) => t.rolling.residuo);
                const totVenditePrec = somma((t) => precPeriodo.get(t.partner.id)?.vendite ?? 0);
                const totServiziPrec = somma((t) => precPeriodo.get(t.partner.id)?.servizi ?? 0);
                return (
                  <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                    <td>Totale ({filtered.length} partner)</td>
                    <td colSpan={5}></td>
                    <td className="num neg">
                      {euro(somma((t) => credito(t.partner.id).scaduto))}
                    </td>
                    <td></td>
                    <td className="num">
                      {euro(totVendite)}
                      <DeltaAnno cur={totVendite} prev={totVenditePrec} />
                    </td>
                    <td className="num">
                      {euro(totServizi)}
                      <DeltaAnno cur={totServizi} prev={totServiziPrec} />
                    </td>
                    <td className={`num ${Math.abs(totResiduo) < 0.01 ? "" : totResiduo > 0 ? "pos" : "neg"}`}>
                      {euro(totResiduo)}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
