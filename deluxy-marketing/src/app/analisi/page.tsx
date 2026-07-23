import { Badge } from "@/components/Badge";
import { BottoneSync } from "@/components/BottoneSync";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  CANALI,
  COLORE_BRAND,
  COLORE_ESITO,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_ESITO,
  ETICHETTA_TIPO_ANALISI,
  formattaData,
  TIPI_ANALISI,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function PaginaAnalisi({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; tipo?: string; canale?: string; q?: string }>;
}) {
  const { brand, tipo, canale, q } = await searchParams;
  const analisi = await prisma.analisi.findMany({
    where: {
      ...(brand ? { brand } : {}),
      ...(tipo ? { tipo } : {}),
      ...(canale ? { canale } : {}),
      ...(q ? { OR: [{ titolo: { contains: q } }, { sintesi: { contains: q } }] } : {}),
    },
    orderBy: { dataAnalisi: "desc" },
    include: { _count: { select: { azioni: true } } },
  });

  return (
    <div className="layout">
      <Sidebar attiva="analisi" brandAttivo={brand} canaleAttivo={canale} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Analisi{canale ? ` — ${ETICHETTA_CANALE[canale] ?? canale}` : ""}
            </h1>
            <p className="page-sub">
              Tutto ciò che le analisi hanno detto, nel tempo: audit Google e Meta, performance,
              revisioni di creativi e landing, report settimanali.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <BottoneSync />
            <a className="btn" href="/analisi/nuova">Deposita analisi</a>
          </div>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca nel titolo o nella sintesi…" defaultValue={q ?? ""} />
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="tipo" defaultValue={tipo ?? ""}>
            <option value="">Tutti i tipi</option>
            {TIPI_ANALISI.map((t) => (
              <option key={t} value={t}>{ETICHETTA_TIPO_ANALISI[t]}</option>
            ))}
          </select>
          <select name="canale" defaultValue={canale ?? ""}>
            <option value="">Tutti i canali</option>
            {CANALI.map((c) => (
              <option key={c} value={c}>{ETICHETTA_CANALE[c]}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {analisi.length === 0 ? (
          <div className="vuoto">Nessuna analisi trovata con questi filtri.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Analisi</th>
                  <th>Tipo</th>
                  <th>Brand</th>
                  <th>Esito</th>
                  <th className="num">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {analisi.map((an) => (
                  <tr key={an.id}>
                    <td className="cella-muta">{formattaData(an.dataAnalisi)}</td>
                    <td>
                      <a href={`/analisi/${an.id}`}>
                        <div className="cella-nome">{an.titolo}</div>
                        {an.fileDrive && <div className="cella-sub">{an.fileDrive}</div>}
                      </a>
                    </td>
                    <td className="cella-muta">{ETICHETTA_TIPO_ANALISI[an.tipo] ?? an.tipo}</td>
                    <td>
                      <Badge testo={ETICHETTA_BRAND[an.brand] ?? an.brand} colore={COLORE_BRAND[an.brand] ?? "var(--text-tertiary)"} />
                    </td>
                    <td>
                      {an.esito ? (
                        <Badge testo={ETICHETTA_ESITO[an.esito] ?? an.esito} colore={COLORE_ESITO[an.esito] ?? "var(--text-tertiary)"} />
                      ) : (
                        <span className="cella-muta">—</span>
                      )}
                    </td>
                    <td className="num">{an._count.azioni || "—"}</td>
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
