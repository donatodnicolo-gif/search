import Link from "next/link";
import { prisma } from "@/lib/db";
import { CATEGORIE, type Categoria } from "@/lib/registro";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// Registro modifiche (audit log): tutte le azioni fatte nell'app, con chi le ha
// fatte e quando. Ricerca a testo libero + filtri per categoria e operatore, con
// paginazione. Sola lettura: da qui non si cambia niente.

const PER_PAGINA = 60;

function quando(d: Date): string {
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const COLORE_CATEGORIA: Record<string, string> = {
  partner: "blue", fatture: "gold", vendite: "green", pagamenti: "purple",
  saldi: "neutral", transazioni: "blue", proforma: "gold", ordini: "green",
  tasks: "neutral", impostazioni: "orange", anagrafiche: "blue",
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; utente?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const categoria = (sp.categoria ?? "").trim();
  const utente = (sp.utente ?? "").trim();
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1") || 1);

  const where: Prisma.RegistroModificaWhereInput = {
    ...(categoria ? { categoria } : {}),
    ...(utente ? { utente } : {}),
    ...(q
      ? {
          OR: [
            { azione: { contains: q, mode: "insensitive" } },
            { partner: { contains: q, mode: "insensitive" } },
            { dettaglio: { contains: q, mode: "insensitive" } },
            { utente: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [voci, totale, operatori] = await Promise.all([
    prisma.registroModifica.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.registroModifica.count({ where }),
    // elenco operatori distinti, per il filtro a tendina
    prisma.registroModifica.findMany({ distinct: ["utente"], select: { utente: true }, orderBy: { utente: "asc" } }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const link = (p: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const base = { q, categoria, utente, ...p };
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, String(v));
    const s = u.toString();
    return `/impostazioni/logs${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Registro modifiche</h1>
          <p className="page-caption">
            Tutte le modifiche fatte nell&apos;app: chi, cosa e quando. {totale.toLocaleString("it-IT")} voci registrate.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/impostazioni" className="btn secondary">← Impostazioni</Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cerca azione, partner, operatore…"
            style={{ minWidth: 260, flex: "1 1 260px" }}
          />
          <select name="categoria" defaultValue={categoria} aria-label="Categoria">
            <option value="">Tutte le aree</option>
            {CATEGORIE.map((c) => <option key={c.valore} value={c.valore}>{c.etichetta}</option>)}
          </select>
          <select name="utente" defaultValue={utente} aria-label="Operatore">
            <option value="">Tutti gli operatori</option>
            {operatori.map((o) => <option key={o.utente} value={o.utente}>{o.utente}</option>)}
          </select>
          <button className="btn secondary small" type="submit">Filtra</button>
          {(q || categoria || utente) && (
            <Link className="btn secondary small" href="/impostazioni/logs">Azzera</Link>
          )}
        </form>
      </div>

      <div className="card tight">
        {voci.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessuna modifica</div>
            <div className="empty-text">
              {q || categoria || utente ? "Nessuna voce corrisponde ai filtri." : "Non è ancora stata registrata nessuna modifica."}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>Data e ora</th>
                  <th>Operatore</th>
                  <th>Area</th>
                  <th>Azione</th>
                  <th>Partner</th>
                </tr>
              </thead>
              <tbody>
                {voci.map((v) => (
                  <tr key={v.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{quando(v.createdAt)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {v.utente}
                      {v.ruolo === "sola_lettura" && <span className="muted" style={{ fontSize: 11 }}> · lettura</span>}
                    </td>
                    <td>
                      <span className={`badge ${COLORE_CATEGORIA[v.categoria] ?? "neutral"}`}>
                        {CATEGORIE.find((c) => c.valore === (v.categoria as Categoria))?.etichetta ?? v.categoria}
                      </span>
                    </td>
                    <td>
                      {v.entita === "partner" && v.entitaId ? (
                        <Link href={`/partner/${v.entitaId}`}>{v.azione}</Link>
                      ) : (
                        v.azione
                      )}
                      {v.dettaglio && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{v.dettaglio}</div>
                      )}
                    </td>
                    <td className="muted">{v.partner ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagine > 1 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginTop: 16 }}>
          {pagina > 1 && <Link className="btn secondary small" href={link({ pagina: pagina - 1 })}>← Precedenti</Link>}
          <span className="muted" style={{ fontSize: 13 }}>Pagina {pagina} di {pagine}</span>
          {pagina < pagine && <Link className="btn secondary small" href={link({ pagina: pagina + 1 })}>Successive →</Link>}
        </div>
      )}
    </>
  );
}
