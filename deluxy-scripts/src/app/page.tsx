import { prisma } from "@/lib/db";
import { CANALI, CATEGORIE } from "@/lib/variabili";

export const dynamic = "force-dynamic";

function data(d: Date): string {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function nomeCanale(v: string): string {
  return CANALI.find((c) => c.valore === v)?.nome ?? v;
}

function nomeCategoria(v: string): string {
  return CATEGORIE.find((c) => c.valore === v)?.nome ?? v;
}

export default async function ElencoScript({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; app?: string; canale?: string; categoria?: string; stato?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const stato = sp.stato ?? "attivi";

  const [app, script] = await Promise.all([
    prisma.appCollegata.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.script.findMany({
      where: {
        ...(stato === "attivi" ? { attivo: true } : stato === "archiviati" ? { attivo: false } : {}),
        ...(sp.canale ? { canale: sp.canale } : {}),
        ...(sp.categoria ? { categoria: sp.categoria } : {}),
        ...(sp.app ? { abilitazioni: { some: { attiva: true, app: { chiave: sp.app } } } } : {}),
        ...(q
          ? {
              OR: [
                { nome: { contains: q, mode: "insensitive" as const } },
                { descrizione: { contains: q, mode: "insensitive" as const } },
                { oggetto: { contains: q, mode: "insensitive" as const } },
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
          <h1 className="page-title">Testi pronti</h1>
          <p className="page-sub">
            Le parole dell&apos;azienda in un posto solo: offerte, inviti, presentazioni, risposte. Si scrivono una
            volta, si richiamano in email e WhatsApp con i dati del cliente già dentro.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn btn-secondario" href="/script/nuovo">Nuovo testo</a>
          <a className="btn" href="/script/ai">Chiedi all&apos;AI</a>
        </div>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{script.length}</div>
          <div className="kpi-etichetta">Testi {stato === "tutti" ? "in archivio" : stato}</div>
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
        <input type="search" name="q" defaultValue={q} placeholder="Cerca nel titolo, nell'oggetto o nel testo…" />
        <select name="categoria" defaultValue={sp.categoria ?? ""}>
          <option value="">Tutte le categorie</option>
          {CATEGORIE.map((c) => (
            <option key={c.valore} value={c.valore}>{c.nome}</option>
          ))}
        </select>
        <select name="canale" defaultValue={sp.canale ?? ""}>
          <option value="">Tutti i canali</option>
          {CANALI.map((c) => (
            <option key={c.valore} value={c.valore}>{c.nome}</option>
          ))}
        </select>
        <select name="app" defaultValue={sp.app ?? ""}>
          <option value="">Tutte le app</option>
          {app.map((a) => (
            <option key={a.id} value={a.chiave}>{a.nome}</option>
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
          Nessun testo qui dentro.{" "}
          <a href="/script/ai" style={{ color: "var(--blue)", fontWeight: 500 }}>Fattene scrivere uno dall&apos;AI</a>{" "}
          oppure <a href="/script/nuovo" style={{ color: "var(--blue)", fontWeight: 500 }}>scrivilo a mano</a>.
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Testo</th>
                <th>Categoria</th>
                <th>Canale</th>
                <th className="num">Variabili</th>
                <th>Usato da</th>
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
                  <td className="cella-muta">{nomeCategoria(s.categoria)}</td>
                  <td className="cella-muta">{nomeCanale(s.canale)}</td>
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
