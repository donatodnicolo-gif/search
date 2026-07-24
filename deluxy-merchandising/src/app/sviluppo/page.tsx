import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { COLORE_FASE, ETICHETTA_FASE, etichettaCategoria, FASI_PIPELINE } from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function SviluppoPage() {
  const prodotti = await prisma.prodotto.findMany({
    where: { fase: { not: "archiviato" } },
    orderBy: [{ priorita: "desc" }, { creatoIl: "desc" }],
    include: { collezione: { select: { nome: true } } },
  });

  const perFase = new Map<string, typeof prodotti>();
  for (const f of FASI_PIPELINE) perFase.set(f, []);
  for (const p of prodotti) perFase.get(p.fase)?.push(p);

  return (
    <div className="layout">
      <Sidebar attiva="sviluppo" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Sviluppo prodotto</h1>
            <p className="page-sub">La pipeline di sviluppo (PLM): dal concept alla vendita. Apri un prodotto per farlo avanzare di fase.</p>
          </div>
          <a className="btn" href="/prodotti/nuovo">Nuovo prodotto</a>
        </div>

        <div className="board">
          {FASI_PIPELINE.map((f) => {
            const lista = perFase.get(f) ?? [];
            return (
              <div className="board-colonna" key={f}>
                <div className="board-testata">
                  <span className="board-titolo">
                    <span className="sb-dot" style={{ background: COLORE_FASE[f] }} />
                    {ETICHETTA_FASE[f]}
                  </span>
                  <span className="board-conta">{lista.length}</span>
                </div>
                {lista.map((p) => (
                  <a key={p.id} href={`/prodotti/${p.id}?tab=sviluppo`} className="board-card">
                    <div className="board-card-nome">{p.nome}</div>
                    <div className="board-card-sub">
                      <span>{p.codice}</span>
                      <span>·</span>
                      <span>{etichettaCategoria(p.categoria)}</span>
                    </div>
                    {p.collezione && <div className="board-card-sub"><span>{p.collezione.nome}</span></div>}
                  </a>
                ))}
                {lista.length === 0 && <div className="vuoto-mini">—</div>}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
