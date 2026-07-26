import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { ETICHETTA_BRAND, ETICHETTA_CANALE, formattaDataOra } from "@/lib/dominio";
import { PRESET_PERIODO, risolviPeriodo } from "@/lib/periodo";

export const dynamic = "force-dynamic";

// "Cosa sto ricevendo, da chi, e da quando": ogni consegna verso l'app è
// registrata con la chiave che l'ha portata, l'account di piattaforma, il
// tipo di dati e il periodo coperto. Serve a fidarsi dei numeri: se un
// account smette di mandare, qui si vede subito.

const ETICHETTA_TIPO: Record<string, string> = {
  metriche: "Metriche di campagna",
  copy: "Keyword e annunci",
  asset: "Sitelink, callout e immagini",
  approvazioni: "Stati di approvazione",
  operazioni: "Operazioni eseguite",
  ordini: "Ordini",
};

// Gli account veri, per dare un nome ai numeri (dai Definitivi 00. START QUI)
const NOME_ACCOUNT: Record<string, string> = {
  "248-656-1148": "Gifts · deluxy.it",
  "2486561148": "Gifts · deluxy.it",
  "825-518-1560": "Flowers · deluxyflowers.com",
  "8255181560": "Flowers · deluxyflowers.com",
  "846-090-5423": "Cake · cake design",
  "8460905423": "Cake · cake design",
};

function nomeAccount(a: string | null): string {
  if (!a) return "non dichiarato";
  return NOME_ACCOUNT[a] ?? NOME_ACCOUNT[a.replace(/-/g, "")] ?? a;
}

function quandoRelativo(d: Date): { testo: string; colore: string } {
  const ore = (Date.now() - d.getTime()) / 3_600_000;
  if (ore < 1) return { testo: `${Math.round(ore * 60)} minuti fa`, colore: "var(--green)" };
  if (ore < 36) return { testo: `${Math.round(ore)} ore fa`, colore: "var(--green)" };
  const giorni = Math.round(ore / 24);
  if (giorni <= 3) return { testo: `${giorni} giorni fa`, colore: "var(--orange)" };
  return { testo: `${giorni} giorni fa`, colore: "var(--red)" };
}

export default async function Ricezione({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; da?: string; a?: string; fonte?: string; account?: string }>;
}) {
  const p = await searchParams;
  const periodo = risolviPeriodo(p.preset ?? "30g", p.da, p.a);

  const consegne = await prisma.ricezioneDati.findMany({
    where: {
      ricevutoIl: { gte: periodo.corrente.da, lt: periodo.corrente.a },
      ...(p.fonte ? { fonte: p.fonte } : {}),
      ...(p.account ? { account: p.account } : {}),
    },
    orderBy: { ricevutoIl: "desc" },
    take: 300,
  });

  // Chi sta mandando: una riga per (fonte, account, tipo) con l'ultima volta
  const sorgenti = new Map<
    string,
    { fonte: string; account: string | null; tipo: string; chiave: string | null; consegne: number; righe: number; ultima: Date; dal: Date | null; al: Date | null }
  >();
  for (const c of consegne) {
    const k = `${c.fonte}|${c.account ?? ""}|${c.tipo}`;
    const s = sorgenti.get(k);
    if (!s) {
      sorgenti.set(k, {
        fonte: c.fonte, account: c.account, tipo: c.tipo, chiave: c.chiave,
        consegne: 1, righe: c.righe, ultima: c.ricevutoIl, dal: c.dal, al: c.al,
      });
    } else {
      s.consegne++;
      s.righe += c.righe;
      if (c.ricevutoIl > s.ultima) s.ultima = c.ricevutoIl;
      if (c.dal && (!s.dal || c.dal < s.dal)) s.dal = c.dal;
      if (c.al && (!s.al || c.al > s.al)) s.al = c.al;
    }
  }
  const elenco = [...sorgenti.values()].sort((a, b) => b.ultima.getTime() - a.ultima.getTime());

  // Chi NON sta mandando: gli account censiti senza consegne nel periodo
  const accountCensiti = await prisma.accountAdv.findMany({
    where: { attivo: true },
    select: { idEsterno: true, nome: true, piattaforma: true, brand: true },
  });
  const conConsegne = new Set(consegne.map((c) => (c.account ?? "").replace(/-/g, "")));
  const muti = accountCensiti.filter(
    (a) => a.piattaforma === "google_ads" && a.idEsterno && !conConsegne.has(a.idEsterno.replace(/-/g, ""))
  );

  // Che dati ci sono a magazzino, indipendentemente dalle consegne
  const [metriche, copy, campagneConId, ordini] = await Promise.all([
    prisma.metricaCampagna.aggregate({ _count: { _all: true }, _min: { data: true }, _max: { data: true } }),
    prisma.copyAnnuncio.count({ where: { idEsterno: { not: null } } }),
    prisma.campagna.count({ where: { idEsterno: { not: null } } }),
    prisma.ordine.count(),
  ]);

  const linkPreset = (chiave: string) => {
    const q = new URLSearchParams();
    if (chiave !== "libero") q.set("preset", chiave);
    if (p.fonte) q.set("fonte", p.fonte);
    if (p.account) q.set("account", p.account);
    return `/ricezione?${q.toString()}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="ricezione" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Dati in arrivo</h1>
            <p className="page-sub">
              Cosa sta arrivando nell&apos;app, da quale account e con quale chiave. Se un account
              smette di mandare, qui si vede prima che i numeri diventino bugiardi.
            </p>
          </div>
        </div>

        {/* Periodo */}
        <section className="scheda" style={{ paddingBottom: 14 }}>
          <div className="pill-scelta" style={{ marginBottom: 12 }}>
            {PRESET_PERIODO.filter((x) => x.chiave !== "libero").map((x) => (
              <a key={x.chiave} className={`pill-opt${periodo.preset === x.chiave ? " attuale" : ""}`} href={linkPreset(x.chiave)}>
                {x.nome}
              </a>
            ))}
          </div>
          <form className="filtri" method="get" action="/ricezione" style={{ marginBottom: 0 }}>
            <input type="date" name="da" defaultValue={p.da ?? ""} title="Dal" />
            <input type="date" name="a" defaultValue={p.a ?? ""} title="Al (compreso)" />
            <select name="fonte" defaultValue={p.fonte ?? ""}>
              <option value="">Tutte le fonti</option>
              {Object.entries(ETICHETTA_CANALE).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button className="btn small" type="submit">Applica</button>
          </form>
        </section>

        {/* Cosa c'è a magazzino */}
        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{metriche._count._all.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">
              Giorni-campagna in archivio
              {metriche._min.data && metriche._max.data && (
                <> · dal {metriche._min.data.toLocaleDateString("it-IT")} al {metriche._max.data.toLocaleDateString("it-IT")}</>
              )}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{campagneConId}</div>
            <div className="kpi-etichetta">Campagne agganciate alla piattaforma</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{copy}</div>
            <div className="kpi-etichetta">Keyword e annunci con id di piattaforma</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{ordini.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Ordini Shopify</div>
          </div>
        </div>

        {/* Account muti */}
        {muti.length > 0 && (
          <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
            <span>
              <b>Nessun dato nel periodo da {muti.length} account censiti</b>:{" "}
              {muti.map((a) => a.nome + " (" + a.idEsterno + ")").join(" · ")}. Se lo script è stato
              installato lì, controlla il log in Google Ads; altrimenti va ancora installato.
            </span>
          </div>
        )}

        {/* Chi sta mandando */}
        <section className="scheda">
          <div className="scheda-titolo">Chi sta mandando ({elenco.length})</div>
          {elenco.length === 0 ? (
            <div className="vuoto">
              Nessuna consegna nel periodo {periodo.corrente.etichetta}. Le consegne si registrano
              da quando è attivo il registro: le corse precedenti non compaiono qui, ma i loro dati
              sono in archivio (vedi i totali sopra).
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Dati</th>
                    <th>Chiave</th>
                    <th>Consegne</th>
                    <th>Righe</th>
                    <th>Periodo coperto</th>
                    <th>Ultima</th>
                  </tr>
                </thead>
                <tbody>
                  {elenco.map((s, i) => {
                    const q = quandoRelativo(s.ultima);
                    return (
                      <tr key={i}>
                        <td>
                          <div className="cella-nome">{nomeAccount(s.account)}</div>
                          <div className="cella-sub">{ETICHETTA_CANALE[s.fonte] ?? s.fonte}</div>
                        </td>
                        <td className="cella-muta">{ETICHETTA_TIPO[s.tipo] ?? s.tipo}</td>
                        <td className="cella-muta">{s.chiave ?? "—"}</td>
                        <td>{s.consegne}</td>
                        <td>{s.righe.toLocaleString("it-IT")}</td>
                        <td className="cella-muta">
                          {s.dal && s.al
                            ? `${s.dal.toLocaleDateString("it-IT")} – ${s.al.toLocaleDateString("it-IT")}`
                            : "—"}
                        </td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: q.colore }}>{q.testo}</span>
                          <div className="cella-sub">{formattaDataOra(s.ultima)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Consegne una per una */}
        {consegne.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Le consegne, una per una ({consegne.length})</div>
            <div style={{ overflowX: "auto", maxHeight: 460 }}>
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Account</th>
                    <th>Dati</th>
                    <th>Righe</th>
                    <th>Campagne</th>
                    <th>Periodo</th>
                    <th>Esito</th>
                  </tr>
                </thead>
                <tbody>
                  {consegne.map((c) => (
                    <tr key={c.id}>
                      <td className="cella-muta">{formattaDataOra(c.ricevutoIl)}</td>
                      <td className="cella-muta">{nomeAccount(c.account)}</td>
                      <td className="cella-muta">{ETICHETTA_TIPO[c.tipo] ?? c.tipo}</td>
                      <td>{c.righe.toLocaleString("it-IT")}</td>
                      <td className="cella-muta">{c.campagne || "—"}</td>
                      <td className="cella-muta">
                        {c.dal && c.al ? `${c.dal.toLocaleDateString("it-IT")} – ${c.al.toLocaleDateString("it-IT")}` : "—"}
                      </td>
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 600, color: c.esito === "ok" ? "var(--green)" : "var(--orange)" }}>
                          {c.esito === "ok" ? "ok" : c.esito}
                          {c.scartate > 0 ? ` · ${c.scartate} scartate` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            Le consegne sono <b>idempotenti</b>: rimandare gli stessi giorni aggiorna i valori
            invece di duplicarli — serve perché le conversioni maturano nei giorni successivi.
            Per questo lo stesso account può comparire più volte sullo stesso periodo.
          </span>
        </div>
      </main>
    </div>
  );
}
