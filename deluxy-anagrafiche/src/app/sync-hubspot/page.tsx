import { Riconcilia } from "@/components/Riconcilia";
import { Sidebar } from "@/components/Sidebar";
import { importaDaHubspot } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { chiaveNome, hubspotConfigurato, scaricaAziendeHubspot, type AziendaHubspot } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

type Ricerca = { q?: string; hsOrd?: string; hsDir?: string; regOrd?: string; regDir?: string };

// Normalizzazione per la ricerca: minuscole, senza accenti né punteggiatura,
// così "100% capri" trova "100% CAPRI" e "caffe" trova "Caffè".
const normalizza = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

// Filtro "a parole" in memoria: ogni parola deve comparire in almeno un campo
const filtra = <T,>(lista: T[], q: string | undefined, campi: (r: T) => (string | null)[]) => {
  if (!q?.trim()) return lista;
  const parole = normalizza(q).split(/\s+/).filter(Boolean);
  return lista.filter((r) => {
    const testo = normalizza(campi(r).filter(Boolean).join(" | "));
    return parole.every((p) => testo.includes(p));
  });
};

// Ordinamento per campo stringa, valori mancanti in fondo
const ordinaPer = <T,>(lista: T[], dir: "asc" | "desc", valore: (r: T) => string | null) =>
  [...lista].sort((a, b) => {
    const va = valore(a);
    const vb = valore(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return dir === "asc" ? va.localeCompare(vb, "it") : vb.localeCompare(va, "it");
  });

// Confronto tra il registro e le companies di HubSpot, con match per nome
// normalizzato. Sola lettura da entrambe le parti: serve a vedere chi manca dove.
export default async function SyncHubspot({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const filtri = await searchParams;
  const configurato = hubspotConfigurato();

  let errore: string | null = null;
  let aziende: AziendaHubspot[] = [];
  const partner = await prisma.partner.findMany({
    where: { attivo: true },
    select: {
      id: true,
      nome: true,
      ragioneSociale: true,
      citta: true,
      provincia: true,
      regione: true,
      indirizzo: true,
      categoria: true,
      stato: true,
      telefono: true,
      email: true,
      account: true,
      note: true,
      hubspotId: true,
      contatti: { select: { ruolo: true, nome: true, telefono: true, email: true } },
    },
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
  const tuttiSoloRegistro = partner.filter((p) => !agganciata(p));
  const tuttiSoloHubspot = aziende.filter(
    (a) => !idCollegati.has(a.id) && !perChiaveRegistro.has(chiaveNome(a.nome)),
  );

  // Ricerca condivisa e ordinamenti indipendenti per le due tabelle
  const COLONNE_HS = {
    nome: "Nome",
    citta: "Città",
    telefono: "Telefono",
    dominio: "Dominio",
    ultimoContatto: "Ultimo contatto",
  } as const;
  const COLONNE_REG = { nome: "Nome", categoria: "Categoria", citta: "Città", stato: "Stato" } as const;
  type CampoHs = keyof typeof COLONNE_HS;
  type CampoReg = keyof typeof COLONNE_REG;

  const hsOrd: CampoHs = filtri.hsOrd && filtri.hsOrd in COLONNE_HS ? (filtri.hsOrd as CampoHs) : "nome";
  const hsDir: "asc" | "desc" = filtri.hsDir === "desc" ? "desc" : "asc";
  const regOrd: CampoReg = filtri.regOrd && filtri.regOrd in COLONNE_REG ? (filtri.regOrd as CampoReg) : "nome";
  const regDir: "asc" | "desc" = filtri.regDir === "desc" ? "desc" : "asc";

  // Tutti i campi entrano nella ricerca, referenti compresi
  const campiRegistro = (p: (typeof partner)[number]) => [
    p.nome,
    p.ragioneSociale,
    p.categoria,
    p.citta,
    p.provincia,
    p.regione,
    p.indirizzo,
    p.stato,
    p.telefono,
    p.email,
    p.account,
    p.note,
    ...p.contatti.flatMap((c) => [c.ruolo, c.nome, c.telefono, c.email]),
  ];
  const campiHubspot = (a: AziendaHubspot) => [a.nome, a.citta, a.telefono, a.dominio];

  const soloHubspot = ordinaPer(
    filtra(tuttiSoloHubspot, filtri.q, campiHubspot),
    hsDir,
    (a) => a[hsOrd],
  );
  const soloRegistro = ordinaPer(
    filtra(tuttiSoloRegistro, filtri.q, campiRegistro),
    regDir,
    (p) => p[regOrd],
  );

  // Cercando, si mostrano anche i match "in entrambi" (altrimenti chi è già
  // agganciato sembra introvabile: es. "100% capri" che sta nelle due basi)
  const aziendePerId = new Map(aziende.map((a) => [a.id, a]));
  const aziendaDi = (p: (typeof partner)[number]) =>
    (p.hubspotId ? aziendePerId.get(p.hubspotId) : undefined) ?? perChiaveHubspot.get(chiaveNome(p.nome));
  const inEntrambiTrovati = filtri.q?.trim()
    ? filtra(inEntrambi, filtri.q, (p) => [...campiRegistro(p), ...(aziendaDi(p) ? campiHubspot(aziendaDi(p)!) : [])])
    : [];

  // Link di ordinamento che conserva ricerca e ordinamento dell'altra tabella
  const linkOrdina = (tabella: "hs" | "reg", campo: string) => {
    const p = new URLSearchParams();
    if (filtri.q) p.set("q", filtri.q);
    const [ord, dir, altroOrd, altroDir] =
      tabella === "hs" ? [hsOrd, hsDir, regOrd, regDir] : [regOrd, regDir, hsOrd, hsDir];
    if (campo !== "nome") p.set(`${tabella}Ord`, campo);
    if (campo === ord && dir === "asc") p.set(`${tabella}Dir`, "desc");
    const altro = tabella === "hs" ? "reg" : "hs";
    if (altroOrd !== "nome") p.set(`${altro}Ord`, altroOrd);
    if (altroDir !== "asc") p.set(`${altro}Dir`, altroDir);
    const qs = p.toString();
    return qs ? `/sync-hubspot?${qs}` : "/sync-hubspot";
  };

  const Colonna = ({ tabella, campo, etichetta }: { tabella: "hs" | "reg"; campo: string; etichetta: string }) => {
    const [ord, dir] = tabella === "hs" ? [hsOrd, hsDir] : [regOrd, regDir];
    return (
      <th>
        <a className="th-ordina" href={linkOrdina(tabella, campo)}>
          {etichetta}
          <span className="th-freccia">{ord === campo ? (dir === "asc" ? "↑" : "↓") : ""}</span>
        </a>
      </th>
    );
  };

  const conteggio = (filtrati: number, totali: number, cosa: string) =>
    filtri.q?.trim()
      ? `${filtrati} di ${totali} ${cosa} per «${filtri.q.trim()}»`
      : `${totali} ${cosa}`;

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
                <div className="sync-kpi-valore">{tuttiSoloHubspot.length}</div>
                <div className="sync-kpi-etichetta">Solo su HubSpot</div>
              </div>
              <div className="sync-kpi">
                <div className="sync-kpi-valore">{tuttiSoloRegistro.length}</div>
                <div className="sync-kpi-etichetta">Solo nel registro</div>
              </div>
              <div className="sync-kpi">
                <div className="sync-kpi-valore">{aziende.length}</div>
                <div className="sync-kpi-etichetta">Companies HubSpot lette</div>
              </div>
            </div>

            <form className="filtri" method="get" action="/sync-hubspot">
              {hsOrd !== "nome" && <input type="hidden" name="hsOrd" value={hsOrd} />}
              {hsDir !== "asc" && <input type="hidden" name="hsDir" value={hsDir} />}
              {regOrd !== "nome" && <input type="hidden" name="regOrd" value={regOrd} />}
              {regDir !== "asc" && <input type="hidden" name="regDir" value={regDir} />}
              <input
                type="search"
                name="q"
                placeholder="Cerca nelle due liste: nome, città, telefono, dominio…"
                defaultValue={filtri.q ?? ""}
              />
              <button className="btn" type="submit">Cerca</button>
            </form>

            {filtri.q?.trim() && (
              <>
                <h2 className="sezione-titolo">
                  In entrambi <span>{inEntrambiTrovati.length} corrispondenze già agganciate per «{filtri.q.trim()}»</span>
                </h2>
                <div className="tabella-wrap" style={{ marginBottom: 22 }}>
                  <table>
                    <thead>
                      <tr><th>Anagrafica</th><th>Categoria</th><th>Città</th><th>Stato</th><th>Company HubSpot</th></tr>
                    </thead>
                    <tbody>
                      {inEntrambiTrovati.slice(0, 50).map((p) => {
                        const a = aziendaDi(p);
                        return (
                          <tr key={p.id}>
                            <td><a href={`/partner/${p.id}`}><div className="cella-nome">{p.nome}</div></a></td>
                            <td className="cella-muta">{p.categoria}</td>
                            <td className="cella-muta">{p.citta ?? "—"}</td>
                            <td className="cella-muta">{p.stato}</td>
                            <td className="cella-muta">
                              {a ? [a.nome, a.dominio ?? a.citta].filter(Boolean).join(" · ") : "—"}
                              {p.hubspotId && <span className="cella-fonte"> · riconciliata ⇄</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {inEntrambiTrovati.length === 0 && (
                        <tr><td colSpan={5} className="cella-muta">Nessuna corrispondenza agganciata per «{filtri.q.trim()}».</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <h2 className="sezione-titolo">
              Solo su HubSpot <span>{conteggio(soloHubspot.length, tuttiSoloHubspot.length, "companies non presenti nel registro")}</span>
            </h2>
            <div className="tabella-wrap" style={{ marginBottom: 22 }}>
              <table>
                <thead>
                  <tr>
                    {Object.entries(COLONNE_HS).map(([campo, etichetta]) => (
                      <Colonna key={campo} tabella="hs" campo={campo} etichetta={etichetta} />
                    ))}
                    <th aria-label="Azioni"></th>
                  </tr>
                </thead>
                <tbody>
                  {soloHubspot.slice(0, 100).map((a) => (
                    <tr key={a.id}>
                      <td><div className="cella-nome">{a.nome}</div></td>
                      <td className="cella-muta">{a.citta ?? "—"}</td>
                      <td className="cella-muta">{a.telefono ?? "—"}</td>
                      <td className="cella-muta">{a.dominio ?? "—"}</td>
                      <td className="cella-muta">
                        {a.ultimoContatto
                          ? new Date(a.ultimoContatto).toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 2 }}>
                          <form action={importaDaHubspot.bind(null, a)}>
                            <button
                              type="submit"
                              className="btn-archivia btn-importa"
                              title="Importa nel registro come prospect (categoria DA CLASSIFICARE)"
                            >
                              ＋
                            </button>
                          </form>
                          <Riconcilia cerca="partner" hubspotId={a.id} nomeRiga={a.nome} />
                        </span>
                      </td>
                    </tr>
                  ))}
                  {soloHubspot.length === 0 && (
                    <tr>
                      <td colSpan={6} className="cella-muta">
                        {filtri.q?.trim()
                          ? `Nessuna company trovata per «${filtri.q.trim()}».`
                          : "Niente: tutte le companies di HubSpot sono nel registro."}
                      </td>
                    </tr>
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
              Solo nel registro <span>{conteggio(soloRegistro.length, tuttiSoloRegistro.length, "anagrafiche non presenti su HubSpot")}</span>
            </h2>
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    {Object.entries(COLONNE_REG).map(([campo, etichetta]) => (
                      <Colonna key={campo} tabella="reg" campo={campo} etichetta={etichetta} />
                    ))}
                    <th aria-label="Riconcilia"></th>
                  </tr>
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
