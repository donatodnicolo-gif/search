import { prisma } from "@/lib/db";
import { LINGUAGGI } from "@/lib/variabili";

export const dynamic = "force-dynamic";

function data(d: Date): string {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function ElencoScript({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; app?: string; linguaggio?: string; stato?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const stato = sp.stato ?? "attivi";

  const [app, script] = await Promise.all([
    prisma.appCollegata.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.script.findMany({
      where: {
        ...(stato === "attivi" ? { attivo: true } : stato === "archiviati" ? { attivo: false } : {}),
        ...(sp.linguaggio ? { linguaggio: sp.linguaggio } : {}),
        ...(sp.app ? { abilitazioni: { some: { attiva: true, app: { chiave: sp.app } } } } : {}),
        ...(q
          ? {
              OR: [
                { nome: { contains: q, mode: "insensitive" as const } },
                { descrizione: { contains: q, mode: "insensitive" as const } },
                { corpo: { contains: q, mode: "insensitive" as const } },
                { tag: { has: q } },
              ],
            }
          : {}),
      },
      include: {
        variabili: { select: { id: true } },
        abilitazioni: { where: { attiva: true }, include: { app: true } },
      },
      orderBy: { aggiornatoIl: "desc" },
    }),
  ]);

  const abilitazioniAttive = script.reduce((n, s) => n + s.abilitazioni.length, 0);
  const variabili = script.reduce((n, s) => n + s.variabili.length, 0);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Script</h1>
          <p className="page-sub">
            L&apos;archivio unico degli script Deluxy: ognuno ha le sue variabili e si accende o si spegne
            per singola app.
          </p>
        </div>
        <a className="btn" href="/script/nuovo">Nuovo script</a>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{script.length}</div>
          <div className="kpi-etichetta">Script {stato === "tutti" ? "in archivio" : stato}</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{variabili}</div>
          <div className="kpi-etichetta">Variabili dichiarate</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{abilitazioniAttive}</div>
          <div className="kpi-etichetta">Abilitazioni attive</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{app.filter((a) => a.attiva).length}</div>
          <div className="kpi-etichetta">App collegate</div>
        </div>
      </div>

      <form className="filtri" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="Cerca nel nome, nella descrizione o nel codice…" />
        <select name="app" defaultValue={sp.app ?? ""}>
          <option value="">Tutte le app</option>
          {app.map((a) => (
            <option key={a.id} value={a.chiave}>{a.nome}</option>
          ))}
        </select>
        <select name="linguaggio" defaultValue={sp.linguaggio ?? ""}>
          <option value="">Tutti i linguaggi</option>
          {LINGUAGGI.map((l) => (
            <option key={l.valore} value={l.valore}>{l.nome}</option>
          ))}
        </select>
        <select name="stato" defaultValue={stato}>
          <option value="attivi">Solo attivi</option>
          <option value="archiviati">Solo archiviati</option>
          <option value="tutti">Tutti</option>
        </select>
        <button className="btn btn-secondario" type="submit">Filtra</button>
      </form>

      {script.length === 0 ? (
        <div className="vuoto">
          Nessuno script qui dentro.{" "}
          <a href="/script/nuovo" style={{ color: "var(--blue)", fontWeight: 500 }}>Aggiungine uno</a>.
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Script</th>
                <th>Linguaggio</th>
                <th className="num">Variabili</th>
                <th>Abilitato per</th>
                <th>Aggiornato</th>
              </tr>
            </thead>
            <tbody>
              {script.map((s) => (
                <tr key={s.id}>
                  <td>
                    <a href={`/script/${s.slug}`} className="cella-nome">{s.nome}</a>
                    {!s.attivo && <span className="badge spento" style={{ marginLeft: 8 }}>archiviato</span>}
                    {s.descrizione && <div className="cella-sub">{s.descrizione}</div>}
                    {s.tag.length > 0 && (
                      <div className="etichette" style={{ marginTop: 6 }}>
                        {s.tag.map((t) => (
                          <span key={t} className="tag">{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="cella-muta">
                    {LINGUAGGI.find((l) => l.valore === s.linguaggio)?.nome ?? s.linguaggio}
                  </td>
                  <td className="cella-num">{s.variabili.length}</td>
                  <td>
                    {s.abilitazioni.length === 0 ? (
                      <span className="tag-vuoto">nessuna app</span>
                    ) : (
                      <div className="etichette">
                        {s.abilitazioni.map((ab) => (
                          <span key={ab.id} className="tag">
                            <span className="sb-dot" style={{ width: 6, height: 6, background: ab.app.colore }} />
                            {ab.app.nome}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="cella-muta">{data(s.aggiornatoIl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
