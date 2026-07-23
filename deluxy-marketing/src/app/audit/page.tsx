import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  COLORE_ESITO,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_ESITO,
  ETICHETTA_TIPO_ANALISI,
  formattaData,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Tipi di analisi che valgono come audit (verifiche periodiche con semaforo).
const TIPI_AUDIT = ["audit_google", "audit_meta", "revisione_creativi", "revisione_landing"];

export default async function PaginaAudit({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; tipo?: string; canale?: string }>;
}) {
  const { brand, tipo, canale } = await searchParams;
  const audit = await prisma.analisi.findMany({
    where: {
      tipo: tipo ? tipo : { in: TIPI_AUDIT },
      ...(brand ? { brand } : {}),
      ...(canale ? { canale } : {}),
    },
    orderBy: { dataAnalisi: "desc" },
    include: { _count: { select: { azioni: true } } },
  });

  // Semaforo corrente: l'ULTIMO audit per combinazione brand × tipo.
  const correnti = new Map<string, (typeof audit)[number]>();
  for (const a of audit) {
    const chiave = `${a.brand}|${a.tipo}`;
    if (!correnti.has(chiave)) correnti.set(chiave, a);
  }

  return (
    <div className="layout">
      <Sidebar attiva="audit" brandAttivo={brand} canaleAttivo={canale} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Audit{canale ? ` — ${ETICHETTA_CANALE[canale] ?? canale}` : ""}
            </h1>
            <p className="page-sub">
              Le verifiche periodiche con il loro semaforo: audit Google e Meta, revisioni di
              creativi e landing. In alto lo stato corrente (l&apos;ultimo audit per brand e tipo),
              sotto tutta la storia.
            </p>
          </div>
          <a className="btn" href="/analisi/nuova">Deposita audit</a>
        </div>

        {correnti.size === 0 ? (
          <div className="vuoto">Nessun audit depositato: il semaforo per brand comparirà qui.</div>
        ) : (
          <div className="griglia-semaforo">
            {[...correnti.values()].map((a) => (
              <a className="card-semaforo" key={a.id} href={`/analisi/${a.id}`}>
                <span
                  className="semaforo-barra"
                  style={{ background: a.esito ? COLORE_ESITO[a.esito] ?? "var(--text-tertiary)" : "var(--fill-active)" }}
                />
                <div className="semaforo-corpo">
                  <div className="semaforo-testata">
                    <span className="semaforo-brand" style={{ color: COLORE_BRAND[a.brand] ?? "var(--text-tertiary)" }}>
                      <span className="sb-dot" style={{ background: "currentColor", width: 7, height: 7 }} />
                      {ETICHETTA_BRAND[a.brand] ?? a.brand}
                    </span>
                    <span className="cella-muta">{formattaData(a.dataAnalisi)}</span>
                  </div>
                  <div className="semaforo-tipo">{ETICHETTA_TIPO_ANALISI[a.tipo] ?? a.tipo}</div>
                  {a.esito && (
                    <div className="semaforo-esito" style={{ color: COLORE_ESITO[a.esito] ?? "var(--text-tertiary)" }}>
                      {ETICHETTA_ESITO[a.esito] ?? a.esito}
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}

        <form className="filtri" method="get">
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="tipo" defaultValue={tipo ?? ""}>
            <option value="">Tutti i tipi di audit</option>
            {TIPI_AUDIT.map((t) => (
              <option key={t} value={t}>{ETICHETTA_TIPO_ANALISI[t]}</option>
            ))}
          </select>
          <select name="canale" defaultValue={canale ?? ""}>
            <option value="">Tutti i canali</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="sito">Sito / landing</option>
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {audit.length === 0 ? (
          <div className="vuoto">Nessun audit con questi filtri.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Audit</th>
                  <th>Tipo</th>
                  <th>Brand</th>
                  <th>Canale</th>
                  <th>Esito</th>
                  <th className="num">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="cella-muta">{formattaData(a.dataAnalisi)}</td>
                    <td>
                      <a href={`/analisi/${a.id}`}>
                        <div className="cella-nome">{a.titolo}</div>
                        {a.fileDrive && <div className="cella-sub">{a.fileDrive}</div>}
                      </a>
                    </td>
                    <td className="cella-muta">{ETICHETTA_TIPO_ANALISI[a.tipo] ?? a.tipo}</td>
                    <td>
                      <Badge testo={ETICHETTA_BRAND[a.brand] ?? a.brand} colore={COLORE_BRAND[a.brand] ?? "var(--text-tertiary)"} />
                    </td>
                    <td className="cella-muta">{a.canale ? ETICHETTA_CANALE[a.canale] ?? a.canale : "—"}</td>
                    <td>
                      {a.esito ? (
                        <Badge testo={ETICHETTA_ESITO[a.esito] ?? a.esito} colore={COLORE_ESITO[a.esito] ?? "var(--text-tertiary)"} />
                      ) : (
                        <span className="cella-muta">—</span>
                      )}
                    </td>
                    <td className="num">{a._count.azioni || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
