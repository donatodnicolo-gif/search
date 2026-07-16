import Link from "next/link";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro, pctIt } from "@/lib/format";
import { ThSort, ordina } from "@/components/ThSort";

export const dynamic = "force-dynamic";

function badgeStato(clienteAnno: string | null) {
  if (clienteAnno === "Nuovo") return <span className="badge blue"><span className="dot" />Nuovo</span>;
  if (clienteAnno === "Dismesso") return <span className="badge red"><span className="dot" />Dismesso</span>;
  if (clienteAnno) return <span className="badge green"><span className="dot" />P.P.</span>;
  return <span className="badge neutral"><span className="dot" />—</span>;
}

export default async function PartnerList({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; citta?: string; categoria?: string; stato?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const tutti = await riepilogoTutti(ANNO_CORRENTE);

  const citta = [...new Set(tutti.map((t) => t.partner.citta).filter(Boolean))].sort() as string[];
  const categorie = [...new Set(tutti.map((t) => t.partner.categoria?.trim()).filter(Boolean))].sort() as string[];

  let filtered = tutti.filter((t) => {
    const p = t.partner;
    if (sp.q && !p.nome.toLowerCase().includes(sp.q.toLowerCase())) return false;
    if (sp.citta && p.citta !== sp.citta) return false;
    if (sp.categoria && p.categoria?.trim() !== sp.categoria) return false;
    if (sp.stato === "attivi" && p.clienteAnno === "Dismesso") return false;
    if (sp.stato === "dismessi" && p.clienteAnno !== "Dismesso") return false;
    return true;
  });

  type T = (typeof tutti)[number];
  const campi: Record<string, (t: T) => string | number | null> = {
    nome: (t) => t.partner.nome,
    categoria: (t) => t.partner.categoria,
    citta: (t) => t.partner.citta,
    servizi: (t) => t.partner.servizi,
    stato: (t) => t.partner.clienteAnno,
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
                  <td className="num">{pctIt(t.partner.feePercent)}</td>
                  <td className="num">{euro(t.rolling.vendite)}</td>
                  <td className="num">{euro(t.rolling.fatture)}</td>
                  <td className={`num ${Math.abs(t.rolling.residuo) < 0.01 ? "" : t.rolling.residuo > 0 ? "pos" : "neg"}`}>
                    {euro(t.rolling.residuo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
