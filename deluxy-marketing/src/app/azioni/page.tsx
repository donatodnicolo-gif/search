import { Badge } from "@/components/Badge";
import { Scadenza } from "@/components/Scadenza";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  CANALI,
  COLORE_BRAND,
  COLORE_PRIORITA,
  COLORE_STATO_AZIONE,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_OWNER,
  ETICHETTA_PRIORITA,
  ETICHETTA_STATO_AZIONE,
  STATI_AZIONE,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Board delle azioni per stato (kanban), filtrabile per canale, brand e owner.
export default async function PaginaAzioni({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; owner?: string; canale?: string; q?: string }>;
}) {
  const { brand, owner, canale, q } = await searchParams;
  const azioni = await prisma.azione.findMany({
    where: {
      ...(brand ? { brand } : {}),
      ...(owner ? { owner } : {}),
      ...(canale ? { canale } : {}),
      ...(q ? { titolo: { contains: q } } : {}),
    },
    orderBy: [{ scadenza: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
    include: { analisi: { select: { titolo: true } }, campagna: { select: { nome: true } } },
  });

  return (
    <div className="layout">
      <Sidebar attiva="azioni" brandAttivo={brand} canaleAttivo={canale} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Azioni{canale ? ` — ${ETICHETTA_CANALE[canale] ?? canale}` : ""}
            </h1>
            <p className="page-sub">
              Le azioni intraprese e da intraprendere, con storia e feedback. Gli stati parlano la
              stessa lingua dei piani su Drive: da fare, in corso, fatta, superata, bloccata.
            </p>
          </div>
          <a className="btn" href="/azioni/nuova">Nuova azione</a>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca un&apos;azione…" defaultValue={q ?? ""} />
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="canale" defaultValue={canale ?? ""}>
            <option value="">Tutti i canali</option>
            {CANALI.map((c) => (
              <option key={c} value={c}>{ETICHETTA_CANALE[c]}</option>
            ))}
          </select>
          <select name="owner" defaultValue={owner ?? ""}>
            <option value="">Tutti gli owner</option>
            <option value="ai">AI</option>
            <option value="utente">Utente</option>
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        <div className="board">
          {STATI_AZIONE.map((stato) => {
            const colonna = azioni.filter((a) => a.stato === stato);
            return (
              <div className="board-colonna" key={stato}>
                <div className="board-testata">
                  <span className="board-titolo" style={{ color: COLORE_STATO_AZIONE[stato] }}>
                    <span className="sb-dot" style={{ background: "currentColor", width: 8, height: 8 }} />
                    <span style={{ color: "var(--text)" }}>{ETICHETTA_STATO_AZIONE[stato]}</span>
                  </span>
                  <span className="board-conta">{colonna.length}</span>
                </div>
                {colonna.map((a) => (
                  <a className="board-card" key={a.id} href={`/azioni/${a.id}`}>
                    <div className="board-card-nome">{a.titolo}</div>
                    <div className="board-card-sub">
                      <Badge testo={ETICHETTA_BRAND[a.brand] ?? a.brand} colore={COLORE_BRAND[a.brand] ?? "var(--text-tertiary)"} />
                      <Badge testo={ETICHETTA_PRIORITA[a.priorita] ?? a.priorita} colore={COLORE_PRIORITA[a.priorita] ?? "var(--text-tertiary)"} />
                      <span>{ETICHETTA_OWNER[a.owner] ?? a.owner}</span>
                      {a.scadenza && (
                        <Scadenza data={a.scadenza} chiusa={stato === "fatta" || stato === "superata"} />
                      )}
                    </div>
                  </a>
                ))}
                {colonna.length === 0 && <div className="vuoto-mini">Nessuna azione</div>}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
