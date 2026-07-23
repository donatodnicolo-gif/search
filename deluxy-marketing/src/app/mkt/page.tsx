import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  ETICHETTA_SCOPE,
  formattaEuro,
  formattaNumero,
  formattaPercento,
  SCOPE_MKT,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Numero di settimana ISO (per allineare 2026 alla stessa settimana del 2025)
function settimanaIso(d: Date): number {
  const data = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const giorno = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - giorno);
  const inizioAnno = new Date(Date.UTC(data.getUTCFullYear(), 0, 1));
  return Math.ceil(((data.getTime() - inizioAnno.getTime()) / 86_400_000 + 1) / 7);
}

function delta(attuale: number | null, precedente: number | null): number | null {
  if (attuale == null || precedente == null || precedente === 0) return null;
  return attuale / precedente - 1;
}

function CellaDelta({ attuale, precedente, formato }: { attuale: number | null; precedente: number | null; formato: (n: number | null) => string }) {
  const d = delta(attuale, precedente);
  return (
    <td className="num">
      {formato(attuale)}
      {d != null && (
        <div className="cella-sub num" style={{ color: d >= 0 ? "var(--green)" : "var(--red)" }}>
          {formattaPercento(d)}
        </div>
      )}
    </td>
  );
}

// MKT settimanale con confronto anno su anno (fogli 2026/2025 + brand).
export default async function PaginaMkt({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; anno?: string }>;
}) {
  const { scope: scopeParam, anno: annoParam } = await searchParams;
  const scope = (SCOPE_MKT as readonly string[]).includes(scopeParam ?? "") ? scopeParam! : "totale";
  const anno = Number(annoParam) || 2026;

  const [attuali, precedenti] = await Promise.all([
    prisma.settimanaMkt.findMany({ where: { scope, anno }, orderBy: { inizio: "desc" } }),
    prisma.settimanaMkt.findMany({ where: { scope, anno: anno - 1 } }),
  ]);
  const prevPerSettimana = new Map(precedenti.map((r) => [settimanaIso(r.inizio), r]));

  const somma = (righe: typeof attuali, campo: "google" | "meta" | "vendite") =>
    righe.reduce((s, r) => s + (r[campo] ?? 0), 0);
  const totGoogle = somma(attuali, "google");
  const totMeta = somma(attuali, "meta");
  const totVendite = somma(attuali, "vendite");
  const totGooglePrev = somma(precedenti, "google");
  const totVenditePrev = somma(precedenti, "vendite");

  return (
    <div className="layout">
      <Sidebar attiva="mkt" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">MKT {anno} vs {anno - 1} — {ETICHETTA_SCOPE[scope]}</h1>
            <p className="page-sub">
              Spesa Google/Meta, vendite e KPI settimana per settimana, con il confronto sulla
              stessa settimana dell&apos;anno precedente. Fonte: fogli {anno}/{anno - 1} e brand del Monitoraggio.
            </p>
          </div>
          <form className="filtri" method="get" style={{ marginBottom: 0 }}>
            <select name="scope" defaultValue={scope}>
              {SCOPE_MKT.map((s) => (
                <option key={s} value={s}>{ETICHETTA_SCOPE[s]}</option>
              ))}
            </select>
            <select name="anno" defaultValue={String(anno)}>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
            <button className="btn small" type="submit">Vai</button>
          </form>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(totGoogle)}</div>
            <div className="kpi-etichetta">
              Google {anno}{totGooglePrev > 0 ? ` · ${formattaPercento(delta(totGoogle, totGooglePrev))} vs ${anno - 1}` : ""}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(totMeta)}</div>
            <div className="kpi-etichetta">Meta {anno}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(totVendite)}</div>
            <div className="kpi-etichetta">
              Vendite {anno}{totVenditePrev > 0 ? ` · ${formattaPercento(delta(totVendite, totVenditePrev))} vs ${anno - 1}` : ""}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">
              {totGoogle + totMeta > 0 && totVendite > 0 ? `${(totVendite / (totGoogle + totMeta)).toFixed(1)}×` : "—"}
            </div>
            <div className="kpi-etichetta">Vendite / spesa MKT</div>
          </div>
        </div>

        {attuali.length === 0 ? (
          <div className="vuoto">Nessuna settimana per {ETICHETTA_SCOPE[scope]} nel {anno}.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Settimana</th>
                  <th className="num">Google</th>
                  <th className="num">Meta</th>
                  <th className="num">Tot MKT</th>
                  <th className="num">Vendite</th>
                  <th className="num">Ordini</th>
                  <th className="num">Medio</th>
                  <th className="num">Costo conv.</th>
                  <th className="num">Nuovi</th>
                  <th>Azioni della settimana</th>
                </tr>
              </thead>
              <tbody>
                {attuali.map((r) => {
                  const w = settimanaIso(r.inizio);
                  const prev = prevPerSettimana.get(w);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="cella-nome">W{w}</div>
                        <div className="cella-sub">
                          dal {r.inizio.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                        </div>
                      </td>
                      <CellaDelta attuale={r.google} precedente={prev?.google ?? null} formato={formattaEuro} />
                      <CellaDelta attuale={r.meta} precedente={prev?.meta ?? null} formato={formattaEuro} />
                      <td className="num cella-muta">{formattaEuro(r.totaleMkt ?? ((r.google ?? 0) + (r.meta ?? 0) || null))}</td>
                      <CellaDelta attuale={r.vendite} precedente={prev?.vendite ?? null} formato={formattaEuro} />
                      <CellaDelta attuale={r.ordini} precedente={prev?.ordini ?? null} formato={formattaNumero} />
                      <td className="num cella-muta">{formattaEuro(r.mediaOrdine)}</td>
                      <td className="num cella-muta">{formattaEuro(r.costoConv)}</td>
                      <td className="num cella-muta">{formattaNumero(r.nuoviClienti)}</td>
                      <td style={{ maxWidth: 260 }}>
                        <span className="cella-sub" style={{ whiteSpace: "normal" }}>{r.note ?? ""}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
