import type { Prisma } from "@prisma/client";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PER_PAGINA = 60;

const ETICHETTA_FONTE: Record<string, string> = {
  hubspot: "HubSpot",
  ui: "Registro",
  platform: "app.deluxy.it",
};

type Ricerca = { q?: string; fonte?: string; pagina?: string };

export default async function Contatti({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const filtri = await searchParams;
  const pagina = Math.max(1, Number(filtri.pagina) || 1);

  const where: Prisma.ContattoWhereInput = { partner: { attivo: true } };
  if (filtri.q) {
    const q = filtri.q;
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { ruolo: { contains: q, mode: "insensitive" } },
      { telefono: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { partner: { is: { nome: { contains: q, mode: "insensitive" }, attivo: true } } },
    ];
  }
  if (filtri.fonte === "hubspot") where.fonte = "hubspot";
  else if (filtri.fonte === "excel") where.fonte = null;

  const [totale, contatti, totContatti, conTel, conEmail, daHubspot] = await Promise.all([
    prisma.contatto.count({ where }),
    prisma.contatto.findMany({
      where,
      include: { partner: { select: { id: true, nome: true, categoria: true, citta: true } } },
      orderBy: [{ nome: "asc" }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.contatto.count({ where: { partner: { attivo: true } } }),
    prisma.contatto.count({ where: { partner: { attivo: true }, telefono: { not: null } } }),
    prisma.contatto.count({ where: { partner: { attivo: true }, email: { not: null } } }),
    prisma.contatto.count({ where: { partner: { attivo: true }, fonte: "hubspot" } }),
  ]);

  const pagineTotali = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const linkPagina = (n: number) => {
    const p = new URLSearchParams();
    if (filtri.q) p.set("q", filtri.q);
    if (filtri.fonte) p.set("fonte", filtri.fonte);
    if (n > 1) p.set("pagina", String(n));
    const qs = p.toString();
    return qs ? `/contatti?${qs}` : "/contatti";
  };

  return (
    <div className="layout">
      <Sidebar contattiAttiva />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Contatti</h1>
            <p className="page-sub">
              {totContatti} persone di riferimento su tutte le anagrafiche · Excel + HubSpot
            </p>
          </div>
        </div>

        <div className="sync-riepilogo" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="sync-kpi"><div className="sync-kpi-valore">{totContatti}</div><div className="sync-kpi-etichetta">Contatti totali</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{conTel}</div><div className="sync-kpi-etichetta">Con telefono</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{conEmail}</div><div className="sync-kpi-etichetta">Con email</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{daHubspot}</div><div className="sync-kpi-etichetta">Da HubSpot</div></div>
        </div>

        <form className="filtri" method="get" action="/contatti">
          <input
            type="search"
            name="q"
            placeholder="Cerca per nome, ruolo, telefono, email o anagrafica…"
            defaultValue={filtri.q ?? ""}
          />
          <select name="fonte" defaultValue={filtri.fonte ?? ""}>
            <option value="">Tutte le fonti</option>
            <option value="excel">Tracker Excel</option>
            <option value="hubspot">HubSpot</option>
          </select>
          <button className="btn" type="submit">Filtra</button>
        </form>

        {contatti.length === 0 ? (
          <div className="vuoto">Nessun contatto con questi filtri.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Ruolo</th>
                  <th>Telefono</th>
                  <th>Email</th>
                  <th>Anagrafica</th>
                  <th>Fonte</th>
                </tr>
              </thead>
              <tbody>
                {contatti.map((c) => (
                  <tr key={c.id}>
                    <td><div className="cella-nome">{c.nome ?? "—"}</div></td>
                    <td className="cella-muta">{c.ruolo ?? "—"}</td>
                    <td className="cella-muta">{c.telefono ?? "—"}</td>
                    <td className="cella-muta">{c.email ?? "—"}</td>
                    <td>
                      <a href={`/partner/${c.partner.id}`}>
                        <div className="cella-nome">{c.partner.nome}</div>
                        <div className="cella-sub">{[c.partner.categoria, c.partner.citta].filter(Boolean).join(" · ")}</div>
                      </a>
                    </td>
                    <td className="cella-muta">{ETICHETTA_FONTE[c.fonte ?? "excel"] ?? "Excel"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="paginazione">
          <span>Pagina {pagina} di {pagineTotali} · {totale} contatti</span>
          <nav>
            {pagina > 1 && <a className="btn btn-secondario" href={linkPagina(pagina - 1)}>← Precedente</a>}
            {pagina < pagineTotali && <a className="btn btn-secondario" href={linkPagina(pagina + 1)}>Successiva →</a>}
          </nav>
        </div>
      </main>
    </div>
  );
}
