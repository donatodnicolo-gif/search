import { prisma } from "@/lib/db";
import { IconaCategoria } from "./IconaCategoria";

// Sidebar di navigazione per tipologia. "Visione globale" mostra tutto;
// ogni tipologia filtra l'elenco. I conteggi considerano solo le anagrafiche attive.
export async function Sidebar({ categoriaAttiva }: { categoriaAttiva?: string | null }) {
  const categorie = await prisma.partner.groupBy({
    by: ["categoria"],
    where: { attivo: true },
    _count: { _all: true },
    orderBy: [{ _count: { categoria: "desc" } }, { categoria: "asc" }],
  });
  const totale = categorie.reduce((somma, c) => somma + c._count._all, 0);

  return (
    <aside className="sidebar">
      <nav>
        <div className="sb-label">Registro</div>
        <a className={`sb-item${!categoriaAttiva ? " attiva" : ""}`} href="/">
          <span className="sb-icona"><IconaCategoria categoria="GLOBALE" /></span>
          <span className="sb-nome">Visione globale</span>
          <span className="sb-count">{totale}</span>
        </a>

        <div className="sb-label">Tipologie</div>
        {categorie.map((c) => (
          <a
            key={c.categoria}
            className={`sb-item${categoriaAttiva === c.categoria ? " attiva" : ""}`}
            href={`/?categoria=${encodeURIComponent(c.categoria)}`}
          >
            <span className="sb-icona"><IconaCategoria categoria={c.categoria} /></span>
            <span className="sb-nome">{etichetta(c.categoria)}</span>
            <span className="sb-count">{c._count._all}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

// "CHEF PRIVATO" → "Chef privato"
export function etichetta(categoria: string): string {
  const minuscolo = categoria.toLowerCase();
  return minuscolo.charAt(0).toUpperCase() + minuscolo.slice(1);
}
