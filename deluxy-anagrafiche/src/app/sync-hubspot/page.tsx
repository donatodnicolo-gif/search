import { Riconcilia } from "@/components/Riconcilia";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { chiaveNome, hubspotConfigurato, scaricaAziendeHubspot, type AziendaHubspot } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

// Confronto tra il registro e le companies di HubSpot, con match per nome
// normalizzato. Sola lettura da entrambe le parti: serve a vedere chi manca dove.
export default async function SyncHubspot() {
  const configurato = hubspotConfigurato();

  let errore: string | null = null;
  let aziende: AziendaHubspot[] = [];
  const partner = await prisma.partner.findMany({
    where: { attivo: true },
    select: { id: true, nome: true, citta: true, categoria: true, stato: true, hubspotId: true },
    orderBy: { nome: "asc" },
  });

  if (configurato) {
    try {
      aziende = await scaricaAziendeHubspot();
    } catch (e) {
      errore = e instanceof Error ? e.message : String(e);
    }
  }

  // Match: prima le riconciliazioni manuali (hubspotId), poi il nome normalizzato
  const perChiaveHubspot = new Map(aziende.map((a) => [chiaveNome(a.nome), a]));
  const perChiaveRegistro = new Map(partner.map((p) => [chiaveNome(p.nome), p]));
  const idCollegati = new Set(partner.map((p) => p.hubspotId).filter(Boolean));

  const agganciata = (p: (typeof partner)[number]) =>
    Boolean(p.hubspotId) || perChiaveHubspot.has(chiaveNome(p.nome));
  const inEntrambi = partner.filter(agganciata);
  const soloRegistro = partner.filter((p) => !agganciata(p));
  const soloHubspot = aziende.filter(
    (a) => !idCollegati.has(a.id) && !perChiaveRegistro.has(chiaveNome(a.nome)),
  );

  return (
    <div className="layout">
      <Sidebar hubspotAttivo />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Sync HubSpot</h1>
            <p className="page-sub">
              Confronto in sola lettura tra il registro e le companies del CRM HubSpot (match per nome).
            </p>
          </div>
        </div>

        {!configurato && (
          <section className="scheda">
            <h2 className="scheda-titolo">Da configurare</h2>
            <p className="testo-guida">
              Per attivare il confronto serve un token di <strong>Private App HubSpot</strong> con
              permesso <code>crm.objects.companies.read</code>:
            </p>
            <ol className="testo-guida elenco-guida">
              <li>Su HubSpot: Impostazioni → Integrazioni → Private Apps → crea l&apos;app e copia il token.</li>
              <li>In locale: aggiungi <code>HUBSPOT_ACCESS_TOKEN=&quot;pat-eu1-…&quot;</code> nel <code>.env</code> di deluxy-anagrafiche.</li>
              <li>In produzione: <code>npx vercel env add HUBSPOT_ACCESS_TOKEN production</code> e rideploy.</li>
            </ol>
            <p className="testo-guida">
              Questa pagina è in sola lettura: non scrive nulla su HubSpot.
            </p>
          </section>
        )}

        {errore && (
          <div className="avviso-errore">Errore dal CRM HubSpot: {errore}</div>
        )}

        {configurato && !errore && (
          <>
            <div className="sync-riepilogo">
              <div className="sync-kpi">
                <div className="sync-kpi-valore">{inEntrambi.length}</div>
                <div className="sync-kpi-etichetta">In entrambi</div>
              </div>
              <div className="sync-kpi">
                <div className="sync-kpi-valore">{soloHubspot.length}</div>
                <div className="sync-kpi-etichetta">Solo su HubSpot</div>
              </div>
              <div className="sync-kpi">
                <div className="sync-kpi-valore">{soloRegistro.length}</div>
                <div className="sync-kpi-etichetta">Solo nel registro</div>
              </div>
              <div className="sync-kpi">
                <div className="sync-kpi-valore">{aziende.length}</div>
                <div className="sync-kpi-etichetta">Companies HubSpot lette</div>
              </div>
            </div>

            <h2 className="sezione-titolo">
              Solo su HubSpot <span>{soloHubspot.length} companies non presenti nel registro</span>
            </h2>
            <div className="tabella-wrap" style={{ marginBottom: 22 }}>
              <table>
                <thead>
                  <tr><th>Nome</th><th>Città</th><th>Telefono</th><th>Dominio</th><th aria-label="Riconcilia"></th></tr>
                </thead>
                <tbody>
                  {soloHubspot.slice(0, 100).map((a) => (
                    <tr key={a.id}>
                      <td><div className="cella-nome">{a.nome}</div></td>
                      <td className="cella-muta">{a.citta ?? "—"}</td>
                      <td className="cella-muta">{a.telefono ?? "—"}</td>
                      <td className="cella-muta">{a.dominio ?? "—"}</td>
                      <td><Riconcilia cerca="partner" hubspotId={a.id} nomeRiga={a.nome} /></td>
                    </tr>
                  ))}
                  {soloHubspot.length === 0 && (
                    <tr><td colSpan={5} className="cella-muta">Niente: tutte le companies di HubSpot sono nel registro.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {soloHubspot.length > 100 && (
              <p className="testo-guida" style={{ marginTop: -14, marginBottom: 22 }}>
                Mostrate le prime 100 di {soloHubspot.length}.
              </p>
            )}

            <h2 className="sezione-titolo">
              Solo nel registro <span>{soloRegistro.length} anagrafiche non presenti su HubSpot</span>
            </h2>
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr><th>Nome</th><th>Categoria</th><th>Città</th><th>Stato</th><th aria-label="Riconcilia"></th></tr>
                </thead>
                <tbody>
                  {soloRegistro.slice(0, 100).map((p) => (
                    <tr key={p.id}>
                      <td><a href={`/partner/${p.id}`}><div className="cella-nome">{p.nome}</div></a></td>
                      <td className="cella-muta">{p.categoria}</td>
                      <td className="cella-muta">{p.citta ?? "—"}</td>
                      <td className="cella-muta">{p.stato}</td>
                      <td><Riconcilia cerca="hubspot" partnerId={p.id} nomeRiga={p.nome} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {soloRegistro.length > 100 && (
              <p className="testo-guida" style={{ marginTop: 8 }}>
                Mostrate le prime 100 di {soloRegistro.length}.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
