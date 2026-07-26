import Link from "next/link";
import { prisma } from "@/lib/db";
import { dispositivo, VIE } from "@/lib/accessi";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// Registro degli accessi: chi è entrato nell'app, quando, come e da dove.
// Gemello del registro modifiche (`/impostazioni/logs`), che invece dice cosa
// è stato cambiato. Sola lettura: da qui non si cambia niente.

const PER_PAGINA = 60;

function quando(d: Date): string {
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function AccessiPage({
  searchParams,
}: {
  searchParams: Promise<{ utente?: string; via?: string; esito?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const utente = (sp.utente ?? "").trim();
  const via = (sp.via ?? "").trim();
  const esito = (sp.esito ?? "").trim();
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1") || 1);

  const where: Prisma.AccessoAppWhereInput = {
    ...(utente ? { utente } : {}),
    ...(via ? { via } : {}),
    ...(esito ? { esito } : {}),
  };

  const da30 = new Date(Date.now() - 30 * 86400000);

  const [voci, totale, perUtente, ultimi30, falliti30, nomi, ultimaAzione] = await Promise.all([
    prisma.accessoApp.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.accessoApp.count({ where }),
    // Riepilogo per persona: quanti ingressi e qual è stato l'ultimo.
    prisma.accessoApp.groupBy({
      by: ["utente"],
      where: { esito: "ok" },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.accessoApp.count({ where: { esito: "ok", createdAt: { gte: da30 } } }),
    prisma.accessoApp.count({ where: { esito: "fallito", createdAt: { gte: da30 } } }),
    prisma.accessoApp.findMany({ distinct: ["utente"], select: { utente: true }, orderBy: { utente: "asc" } }),
    // L'ultima cosa fatta da ciascuno: sta nel registro modifiche, che è già
    // popolato. Insieme all'ultimo ingresso dice se una persona è attiva.
    prisma.registroModifica.groupBy({ by: ["utente"], _max: { createdAt: true } }),
  ]);

  const azionePer = new Map(ultimaAzione.map((r) => [r.utente, r._max.createdAt]));
  const persone = perUtente
    .map((r) => ({
      utente: r.utente,
      accessi: r._count._all,
      ultimo: r._max.createdAt,
      ultimaAzione: azionePer.get(r.utente) ?? null,
    }))
    .sort((a, b) => (b.ultimo?.getTime() ?? 0) - (a.ultimo?.getTime() ?? 0));

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const link = (p: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ utente, via, esito, ...p })) if (v) u.set(k, String(v));
    const s = u.toString();
    return `/impostazioni/accessi${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/impostazioni" className="btn secondary small" style={{ marginBottom: 10 }}>← Impostazioni</Link>
          <h1 className="page-title">Chi ha avuto accesso</h1>
          <p className="page-caption">
            Ogni ingresso nell&apos;app: chi, quando, come e da quale indirizzo. I tentativi con password
            sbagliata sono inclusi.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/impostazioni/logs" className="btn secondary">Registro modifiche →</Link>
        </div>
      </div>

      {/* Il limite va detto subito: leggendo questa pagina senza saperlo si
          crede che «Accesso a password» sia una persona sola. */}
      <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--orange)" }}>
        <strong style={{ fontSize: 14 }}>L&apos;app si apre con una password di team</strong>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, marginBottom: 0 }}>
          Chi entra digitando la password <strong>non ha un nome</strong>: compare come «Accesso a password»,
          e più persone che usano la stessa password sono indistinguibili — si distinguono solo per indirizzo e
          dispositivo, qui in tabella. Il nome vero c&apos;è per chi entra dal <strong>portale Hub</strong>, che
          porta con sé l&apos;identità. Per avere un nome su ogni riga servono account personali (o almeno una
          password diversa a testa).
        </p>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Ingressi (ultimi 30 giorni)</div>
          <div className="kpi-value">{ultimi30}</div>
          <div className="kpi-sub">login riusciti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Chi è entrato</div>
          <div className="kpi-value">{persone.length}</div>
          <div className="kpi-sub">nomi/profili distinti, da sempre</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Tentativi falliti (30 giorni)</div>
          <div className={`kpi-value ${falliti30 > 0 ? "neg" : "pos"}`}>{falliti30}</div>
          <div className="kpi-sub">password sbagliata</div>
        </div>
      </div>

      <h2 className="section-title">Riepilogo per persona</h2>
      <div className="card tight" style={{ marginBottom: 16 }}>
        {persone.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun accesso registrato</div>
            <div className="empty-text">
              Il registro parte da adesso: gli ingressi fatti prima non erano annotati da nessuna parte.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chi</th>
                  <th className="num">Ingressi</th>
                  <th>Ultimo ingresso</th>
                  <th>Ultima modifica fatta</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {persone.map((p) => (
                  <tr key={p.utente}>
                    <td style={{ fontWeight: 500 }}>{p.utente}</td>
                    <td className="num">{p.accessi}</td>
                    <td>{p.ultimo ? quando(p.ultimo) : "—"}</td>
                    <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                      {p.ultimaAzione ? quando(p.ultimaAzione) : "nessuna"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="btn small secondary" href={link({ utente: p.utente, pagina: undefined })}>
                        Vedi ingressi
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="section-title">Ingressi, uno per uno</h2>
      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <select name="utente" defaultValue={utente}>
            <option value="">Chiunque</option>
            {nomi.map((n) => <option key={n.utente} value={n.utente}>{n.utente}</option>)}
          </select>
          <select name="via" defaultValue={via}>
            <option value="">Da qualsiasi ingresso</option>
            {Object.entries(VIE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select name="esito" defaultValue={esito}>
            <option value="">Riusciti e falliti</option>
            <option value="ok">Solo riusciti</option>
            <option value="fallito">Solo falliti</option>
          </select>
          <button className="btn secondary small" type="submit">Filtra</button>
          {(utente || via || esito) && (
            <Link className="btn secondary small" href="/impostazioni/accessi">Azzera</Link>
          )}
        </form>
      </div>

      <div className="card tight">
        {voci.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun ingresso</div>
            <div className="empty-text">Cambia i filtri, o aspetta il prossimo accesso.</div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Chi</th>
                    <th>Come</th>
                    <th>Ruolo</th>
                    <th>Da dove</th>
                    <th>Dispositivo</th>
                  </tr>
                </thead>
                <tbody>
                  {voci.map((v) => (
                    <tr key={v.id} style={v.esito === "fallito" ? { background: "rgba(215,0,21,0.04)" } : undefined}>
                      <td style={{ whiteSpace: "nowrap" }}>{quando(v.createdAt)}</td>
                      <td style={{ fontWeight: 500 }}>
                        {v.utente}
                        {v.esito === "fallito" && (
                          <span className="badge red" style={{ marginLeft: 8 }}><span className="dot" />password sbagliata</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${VIE[v.via]?.badge ?? "neutral"}`}>
                          <span className="dot" />{VIE[v.via]?.label ?? v.via}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {v.ruolo === "admin" ? "Accesso pieno" : v.ruolo === "sola_lettura" ? "Sola lettura" : "—"}
                      </td>
                      <td style={{ fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{v.ip ?? "—"}</td>
                      <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{dispositivo(v.agente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagine > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--hairline)" }}>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {totale} ingressi · pagina {pagina} di {pagine}
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  {pagina > 1 && <Link className="btn small secondary" href={link({ pagina: pagina - 1 })}>← Precedenti</Link>}
                  {pagina < pagine && <Link className="btn small secondary" href={link({ pagina: pagina + 1 })}>Successivi →</Link>}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
