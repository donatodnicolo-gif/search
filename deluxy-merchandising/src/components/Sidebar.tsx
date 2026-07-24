import { prisma } from "@/lib/db";
import { COLORE_STATO_COLLEZIONE, etichettaStagione } from "@/lib/dominio";
import { Icona } from "./Icona";
import { SbSezione } from "./SbSezione";

// Sidebar di navigazione. `attiva` identifica la sezione corrente per
// evidenziare la voce giusta; `collezioneAttiva` evidenzia la collezione aperta.
export async function Sidebar({
  attiva,
  collezioneAttiva,
}: {
  attiva?: "collezioni" | "prodotti" | "sviluppo" | "costi" | "visual" | "shopify";
  collezioneAttiva?: string;
}) {
  const [nCollezioni, nProdotti, nInSviluppo, daPubblicare, collezioni] = await Promise.all([
    prisma.collezione.count(),
    prisma.prodotto.count(),
    prisma.prodotto.count({ where: { fase: { in: ["concept", "prototipo", "approvato"] } } }),
    prisma.prodotto.count({ where: { shopifyStato: { not: "pubblicato" }, fase: { not: "archiviato" } } }),
    prisma.collezione.findMany({
      orderBy: [{ anno: "desc" }, { creataIl: "desc" }],
      include: { _count: { select: { prodotti: true } } },
    }),
  ]);

  const voce = (
    id: NonNullable<typeof attiva>,
    href: string,
    icona: string,
    nome: string,
    count?: number
  ) => (
    <a className={`sb-item${attiva === id ? " attiva" : ""}`} href={href}>
      <span className="sb-icona"><Icona nome={icona} /></span>
      <span className="sb-nome">{nome}</span>
      {count != null && <span className="sb-count">{count}</span>}
    </a>
  );

  return (
    <aside className="sidebar">
      <nav>
        <SbSezione titolo="Merchandising">
          {voce("collezioni", "/", "collezioni", "Collezioni", nCollezioni)}
          {voce("prodotti", "/prodotti", "prodotti", "Prodotti", nProdotti)}
          {voce("sviluppo", "/sviluppo", "sviluppo", "Sviluppo", nInSviluppo)}
          {voce("costi", "/costi", "costi", "Costi & margini")}
          {voce("visual", "/visual", "visual", "Visual merchandising")}
          {voce("shopify", "/shopify", "shopify", "Shopify", daPubblicare || undefined)}
        </SbSezione>

        <SbSezione titolo="Collezioni">
          {collezioni.map((c) => (
            <a
              key={c.id}
              className={`sb-item${collezioneAttiva === c.id ? " attiva" : ""}`}
              href={`/collezioni/${c.id}`}
            >
              <span className="sb-icona">
                <span className="sb-dot" style={{ background: COLORE_STATO_COLLEZIONE[c.stato] }} />
              </span>
              <span className="sb-nome" title={`${c.nome} · ${etichettaStagione(c.stagione)}`}>{c.nome}</span>
              <span className="sb-count">{c._count.prodotti}</span>
            </a>
          ))}
          {collezioni.length === 0 && <div className="vuoto-mini">Nessuna collezione</div>}
        </SbSezione>
      </nav>
    </aside>
  );
}
