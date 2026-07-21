import type { Prisma } from "@prisma/client";
import { Sidebar } from "@/components/Sidebar";
import { SpostaContatto } from "@/components/SpostaContatto";
import { prisma } from "@/lib/db";
import { linkContattoHubspot } from "@/lib/hubspot-link";

export const dynamic = "force-dynamic";

const PER_PAGINA = 40;

type Ricerca = { q?: string; pagina?: string };

// Riconciliazione dei referenti: i contatti finiti sotto un'anagrafica
// «DA CLASSIFICARE» (contenitore "senza azienda" o holding create dal sync
// HubSpot) vanno riassegnati all'insegna giusta. Qui si smistano uno a uno.
export default async function Riconciliazione({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const filtri = await searchParams;
  const pagina = Math.max(1, Number(filtri.pagina) || 1);

  const where: Prisma.ContattoWhereInput = {
    archiviato: false,
    partner: { attivo: true, categoria: "DA CLASSIFICARE" },
  };
  if (filtri.q) {
    const q = filtri.q;
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { ruolo: { contains: q, mode: "insensitive" } },
      { partner: { is: { nome: { contains: q, mode: "insensitive" }, attivo: true } } },
    ];
  }

  const [totale, contatti] = await Promise.all([
    prisma.contatto.count({ where }),
    prisma.contatto.findMany({
      where,
      include: { partner: { select: { id: true, nome: true, citta: true } } },
      orderBy: [{ partner: { nome: "asc" } }, { nome: "asc" }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
  ]);

  const pagineTotali = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const linkPagina = (n: number) => {
    const p = new URLSearchParams();
    if (filtri.q) p.set("q", filtri.q);
    if (n > 1) p.set("pagina", String(n));
    const qs = p.toString();
    return qs ? `/riconciliazione?${qs}` : "/riconciliazione";
  };

  return (
    <div className="layout">
      <Sidebar riconciliazioneAttiva />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Riconciliazione</h1>
            <p className="page-sub">
              {totale} referenti sotto anagrafiche «DA CLASSIFICARE» (contenitore senza azienda + gruppi
              creati dal sync) — riassegnali all&apos;insegna giusta
            </p>
          </div>
        </div>

        <form className="filtri" method="get" action="/riconciliazione">
          <input
            type="search"
            name="q"
            placeholder="Cerca per nome, email, ruolo o anagrafica attuale…"
            defaultValue={filtri.q ?? ""}
          />
          <button className="btn" type="submit">Filtra</button>
        </form>

        {contatti.length === 0 ? (
          <div className="vuoto">Nessun referente da riconciliare{filtri.q ? " con questi filtri" : ""}. 🎉</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Referente</th>
                  <th>Ruolo</th>
                  <th>Contatti</th>
                  <th>Anagrafica attuale</th>
                  <th aria-label="Azione"></th>
                </tr>
              </thead>
              <tbody>
                {contatti.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.hubspotId ? (
                        <a href={linkContattoHubspot(c.hubspotId)} target="_blank" rel="noreferrer" title="Apri in HubSpot">
                          <div className="cella-nome">{c.nome ?? "—"} ↗</div>
                        </a>
                      ) : (
                        <div className="cella-nome">{c.nome ?? "—"}</div>
                      )}
                    </td>
                    <td className="cella-muta">{c.ruolo ?? "—"}</td>
                    <td className="cella-muta">
                      {[c.email, c.telefono].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td>
                      <a href={`/partner/${c.partner.id}`}>
                        <div className="cella-nome">{c.partner.nome}</div>
                        {c.partner.citta && <div className="cella-sub">{c.partner.citta}</div>}
                      </a>
                    </td>
                    <td>
                      <SpostaContatto contattoId={c.id} nomeContatto={c.nome ?? "referente"} partnerAttualeId={c.partner.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="paginazione">
          <span>Pagina {pagina} di {pagineTotali} · {totale} referenti</span>
          <nav>
            {pagina > 1 && <a className="btn btn-secondario" href={linkPagina(pagina - 1)}>← Precedente</a>}
            {pagina < pagineTotali && <a className="btn btn-secondario" href={linkPagina(pagina + 1)}>Successiva →</a>}
          </nav>
        </div>
      </main>
    </div>
  );
}
