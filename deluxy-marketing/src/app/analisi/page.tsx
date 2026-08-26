import { Badge } from "@/components/Badge";
import { COLORE_VERDETTO, ETICHETTA_VERDETTO, schedaDi, type VerdettoScheda } from "@/lib/scheda-analisi";
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

  // Le ultime SCHEDE: le analisi già rielaborate, da aprire con un colpo
  // d'occhio — il verdetto è un colore prima che una parola. Stanno sopra la
  // tabella perché sono la risposta alla domanda con cui si apre la pagina:
  // «com'è andata l'ultima lettura?».
  const conScheda = analisi
    .map((a) => ({ a, s: schedaDi(a) }))
    .filter((x): x is { a: (typeof analisi)[number]; s: NonNullable<ReturnType<typeof schedaDi>> } => x.s != null)
    .slice(0, 6);

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

        {conScheda.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {conScheda.map(({ a, s }) => (
              <a
                key={a.id}
                href={`/analisi/${a.id}`}
                className="scheda"
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  borderTop: `3px solid ${COLORE_VERDETTO[s.verdetto]}`,
                  marginBottom: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  {/* L'ordine dice il senso dei colori: il SEMAFORO è il
                      verdetto della lettura, il pallino colorato è il BRAND
                      (i suoi colori di sempre), poi la PIATTAFORMA e il tipo
                      in grigio neutro. */}
                  <Badge testo={ETICHETTA_VERDETTO[s.verdetto]} colore={COLORE_VERDETTO[s.verdetto]} />
                  <Badge testo={ETICHETTA_BRAND[a.brand] ?? a.brand} colore={COLORE_BRAND[a.brand] ?? "var(--text-tertiary)"} />
                  {a.canale && (
                    <span className="tag-neutro">{ETICHETTA_CANALE[a.canale] ?? a.canale}</span>
                  )}
                  <span className="tag-neutro">{ETICHETTA_TIPO_ANALISI[a.tipo] ?? a.tipo}</span>
                  <span className="cella-sub" style={{ marginLeft: "auto" }}>{formattaData(a.dataAnalisi)}</span>
                </div>
                <div className="cella-nome" style={{ whiteSpace: "normal", marginBottom: 4 }}>{a.titolo}</div>
                <div className="cella-sub" style={{ whiteSpace: "normal" }}>{s.titolo}</div>
                <div className="cella-sub" style={{ marginTop: 8 }}>
                  {s.kpi.length} numeri · {s.findings.length} findings
                  {s.findings.some((f) => f.priorita === "P0")
                    ? ` · ${s.findings.filter((f) => f.priorita === "P0").length} P0`
                    : ""}
                  {" · "}{s.campagne.length} campagne
                </div>
              </a>
            ))}
          </div>
        )}

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
                      {an.verdetto ? (
                        <Badge
                          testo={ETICHETTA_VERDETTO[an.verdetto as VerdettoScheda] ?? an.verdetto}
                          colore={COLORE_VERDETTO[an.verdetto as VerdettoScheda] ?? "var(--text-tertiary)"}
                        />
                      ) : an.esito ? (
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
