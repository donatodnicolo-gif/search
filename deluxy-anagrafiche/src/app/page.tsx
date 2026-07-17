import type { Prisma } from "@prisma/client";
import { BadgeStato } from "@/components/BadgeStato";
import { etichetta, Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { ETICHETTE_STATO, STATI } from "@/lib/stati";

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;

type Ricerca = { q?: string; categoria?: string; citta?: string; stato?: string; pagina?: string };

export default async function Elenco({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const filtri = await searchParams;
  const pagina = Math.max(1, Number(filtri.pagina) || 1);

  const where: Prisma.PartnerWhereInput = { attivo: true };
  if (filtri.q) {
    where.OR = [
      { nome: { contains: filtri.q } },
      { ragioneSociale: { contains: filtri.q } },
      { email: { contains: filtri.q } },
      { citta: { contains: filtri.q } },
    ];
  }
  if (filtri.categoria) where.categoria = filtri.categoria;
  if (filtri.citta) where.citta = filtri.citta;
  if (filtri.stato) where.stato = filtri.stato;

  const [totale, partner, citta] = await Promise.all([
    prisma.partner.count({ where }),
    prisma.partner.findMany({
      where,
      include: { contatti: true },
      orderBy: { nome: "asc" },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.partner.groupBy({
      by: ["citta"],
      // Le città proposte seguono la tipologia selezionata nella sidebar
      where: { attivo: true, citta: { not: null }, ...(filtri.categoria ? { categoria: filtri.categoria } : {}) },
      orderBy: { citta: "asc" },
    }),
  ]);

  const pagineTotali = Math.max(1, Math.ceil(totale / PER_PAGINA));

  const linkPagina = (n: number) => {
    const p = new URLSearchParams();
    if (filtri.q) p.set("q", filtri.q);
    if (filtri.categoria) p.set("categoria", filtri.categoria);
    if (filtri.citta) p.set("citta", filtri.citta);
    if (filtri.stato) p.set("stato", filtri.stato);
    if (n > 1) p.set("pagina", String(n));
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="layout">
      <Sidebar categoriaAttiva={filtri.categoria ?? null} />
      <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {filtri.categoria ? etichetta(filtri.categoria) : "Visione globale"}
          </h1>
          <p className="page-sub">
            {totale} anagrafiche · fonte di verità per tutte le app Deluxy
          </p>
        </div>
      </div>

      <form className="filtri" method="get" action="/">
        {filtri.categoria && <input type="hidden" name="categoria" value={filtri.categoria} />}
        <input
          type="search"
          name="q"
          placeholder="Cerca per nome, ragione sociale, email o città…"
          defaultValue={filtri.q ?? ""}
        />
        <select name="citta" defaultValue={filtri.citta ?? ""}>
          <option value="">Tutte le città</option>
          {citta.map((c) => (
            <option key={c.citta} value={c.citta ?? ""}>{c.citta}</option>
          ))}
        </select>
        <select name="stato" defaultValue={filtri.stato ?? ""}>
          <option value="">Tutti gli stati</option>
          {STATI.map((s) => (
            <option key={s} value={s}>{ETICHETTE_STATO[s]}</option>
          ))}
        </select>
        <button className="btn" type="submit">Filtra</button>
      </form>

      {partner.length === 0 ? (
        <div className="vuoto">Nessuna anagrafica trovata con questi filtri.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Città</th>
                <th>Stato</th>
                <th>Account</th>
                <th>Contatti</th>
              </tr>
            </thead>
            <tbody>
              {partner.map((p) => {
                const riferimento = p.contatti.find((c) => c.nome) ?? p.contatti[0];
                return (
                  <tr key={p.id}>
                    <td>
                      <a href={`/partner/${p.id}`}>
                        <div className="cella-nome">{p.nome}</div>
                        {p.indirizzo && <div className="cella-sub">{p.indirizzo}</div>}
                      </a>
                    </td>
                    <td className="cella-muta">{p.categoria}</td>
                    <td className="cella-muta">{p.citta ?? "—"}</td>
                    <td><BadgeStato stato={p.stato} /></td>
                    <td className="cella-muta">{p.account ?? "—"}</td>
                    <td className="cella-muta">
                      {riferimento
                        ? [riferimento.nome ?? riferimento.ruolo, riferimento.telefono ?? riferimento.email]
                            .filter(Boolean)
                            .join(" · ")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="paginazione">
        <span>Pagina {pagina} di {pagineTotali}</span>
        <nav>
          {pagina > 1 && <a className="btn btn-secondario" href={linkPagina(pagina - 1)}>← Precedente</a>}
          {pagina < pagineTotali && <a className="btn btn-secondario" href={linkPagina(pagina + 1)}>Successiva →</a>}
        </nav>
      </div>
      </main>
    </div>
  );
}
