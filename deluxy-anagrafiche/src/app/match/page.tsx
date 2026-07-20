import { RisolviMatch } from "@/components/RisolviMatch";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ETICHETTE_TIPO: Record<string, string> = {
  piva: "P.IVA",
  codice_fiscale: "Cod. fiscale",
  nome_citta: "Nome + città",
  nome: "Nome",
  riferimento: "Riferimento",
  vuota: "Vuota",
};
const ETICHETTE_ESITO: Record<string, { testo: string; classe: string }> = {
  agganciata: { testo: "Agganciata", classe: "ok" },
  candidati: { testo: "Da risolvere", classe: "warn" },
  nessuna: { testo: "Nessun match", classe: "no" },
};

export default async function Match() {
  const [richieste, totali, daRisolvere, agganciate, nessuna, partnerNomi] = await Promise.all([
    prisma.richiestaMatch.findMany({ orderBy: { creatoIl: "desc" }, take: 200 }),
    prisma.richiestaMatch.count(),
    prisma.richiestaMatch.count({ where: { esito: "candidati", risolto: false } }),
    prisma.richiestaMatch.count({ where: { esito: "agganciata" } }),
    prisma.richiestaMatch.count({ where: { esito: "nessuna", risolto: false } }),
    prisma.partner.findMany({ select: { id: true, nome: true } }),
  ]);
  const nomeDi = new Map(partnerNomi.map((p) => [p.id, p.nome]));

  const dataOra = (d: Date) =>
    d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="layout">
      <Sidebar matchAttivo />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Richieste di aggancio</h1>
            <p className="page-sub">
              Le app che non hanno ancora l&apos;id confermato chiedono &laquo;chi è questo partner?&raquo; via{" "}
              <code>GET /api/v1/partners/match</code>. Qui lo storico, e da qui risolvi le associazioni ambigue.
            </p>
          </div>
        </div>

        <div className="sync-riepilogo" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="sync-kpi"><div className="sync-kpi-valore">{totali}</div><div className="sync-kpi-etichetta">Richieste totali</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{agganciate}</div><div className="sync-kpi-etichetta">Agganciate al volo</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{daRisolvere}</div><div className="sync-kpi-etichetta">Da risolvere (candidati)</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{nessuna}</div><div className="sync-kpi-etichetta">Senza match</div></div>
        </div>

        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>App</th>
                <th>Tipo</th>
                <th>Richiesta</th>
                <th>Esito</th>
                <th>Anagrafica</th>
                <th aria-label="Azioni"></th>
              </tr>
            </thead>
            <tbody>
              {richieste.length === 0 && (
                <tr><td colSpan={7} className="cella-muta">Nessuna richiesta di aggancio ancora ricevuta.</td></tr>
              )}
              {richieste.map((r) => {
                const es = ETICHETTE_ESITO[r.esito] ?? { testo: r.esito, classe: "no" };
                const nomePartner = r.partnerId ? nomeDi.get(r.partnerId) : null;
                // La query "nome:X · citta:Y" suggerisce cosa cercare nel popup
                const suggerimento = r.query.match(/nome:([^·]+)/)?.[1]?.trim();
                return (
                  <tr key={r.id}>
                    <td className="cella-muta" style={{ whiteSpace: "nowrap" }}>{dataOra(r.creatoIl)}</td>
                    <td><span className="badge neutro">{r.sistema}</span></td>
                    <td className="cella-muta">{ETICHETTE_TIPO[r.tipo] ?? r.tipo}</td>
                    <td className="cella-muta"><span className="cella-note" title={r.query}>{r.query}</span></td>
                    <td>
                      <span className={`match-esito ${es.classe}`}>{es.testo}</span>
                      {r.confidenza !== "nessuna" && <span className="cella-fonte"> · {r.confidenza}</span>}
                      {r.risolto && r.esito !== "agganciata" && <span className="cella-fonte"> · risolta</span>}
                    </td>
                    <td className="cella-muta">
                      {r.partnerId ? (
                        <a href={`/partner/${r.partnerId}`}>{nomePartner ?? "apri"}</a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {r.partnerId ? (
                        <RisolviMatch richiestaId={r.id} suggerimento={suggerimento} agganciata />
                      ) : !r.risolto ? (
                        <RisolviMatch richiestaId={r.id} suggerimento={suggerimento} />
                      ) : (
                        <span className="cella-fonte">ignorata</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="testo-guida" style={{ marginTop: 14 }}>
          Risolvere un&apos;associazione collega l&apos;anagrafica scelta e — se la richiesta portava l&apos;id dell&apos;app —
          crea il riferimento esterno, così quell&apos;app da lì in poi risolve per id.
        </p>
      </main>
    </div>
  );
}
