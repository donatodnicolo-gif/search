import { prisma } from "@/lib/db";
import { IconaCategoria } from "./IconaCategoria";

// Sidebar di navigazione per tipologia. "Visione globale" mostra tutto;
// ogni tipologia filtra l'elenco. I conteggi considerano solo le anagrafiche
// attive; le archiviate vivono nella sezione dedicata in fondo.
export async function Sidebar({
  categoriaAttiva,
  archivioAttivo = false,
}: {
  categoriaAttiva?: string | null;
  archivioAttivo?: boolean;
}) {
  const [categorie, archiviate] = await Promise.all([
    prisma.partner.groupBy({
      by: ["categoria"],
      where: { attivo: true },
      _count: { _all: true },
      orderBy: [{ _count: { categoria: "desc" } }, { categoria: "asc" }],
    }),
    prisma.partner.count({ where: { attivo: false } }),
  ]);
  const totale = categorie.reduce((somma, c) => somma + c._count._all, 0);

  return (
    <aside className="sidebar">
      <nav>
        <div className="sb-label">Registro</div>
        <a className={`sb-item${!categoriaAttiva && !archivioAttivo ? " attiva" : ""}`} href="/">
          <span className="sb-icona"><IconaCategoria categoria="GLOBALE" /></span>
          <span className="sb-nome">Visione globale</span>
          <span className="sb-count">{totale}</span>
        </a>

        <div className="sb-label">Tipologie</div>
        {categorie.map((c) => (
          <a
            key={c.categoria}
            className={`sb-item${categoriaAttiva === c.categoria && !archivioAttivo ? " attiva" : ""}`}
            href={`/?categoria=${encodeURIComponent(c.categoria)}`}
          >
            <span className="sb-icona"><IconaCategoria categoria={c.categoria} /></span>
            <span className="sb-nome">{etichetta(c.categoria)}</span>
            <span className="sb-count">{c._count._all}</span>
          </a>
        ))}

        <div className="sb-label">Archivio</div>
        <a className={`sb-item${archivioAttivo ? " attiva" : ""}`} href="/?archiviati=1">
          <span className="sb-icona"><IconaCategoria categoria="ARCHIVIO" /></span>
          <span className="sb-nome">Archiviati</span>
          <span className="sb-count">{archiviate}</span>
        </a>
      </nav>
    </aside>
  );
}

// "CHEF PRIVATO" → "Chef privato"
export function etichetta(categoria: string): string {
  const minuscolo = categoria.toLowerCase();
  return minuscolo.charAt(0).toUpperCase() + minuscolo.slice(1);
}
