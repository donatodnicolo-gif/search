import { FormFiltri } from "@/components/FormFiltri";
import { Sidebar } from "@/components/Sidebar";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { euro } from "@/lib/dominio";
import { calcolaGriglia, scarto, type Cella } from "@/lib/griglia";
import { RAGGRUPPAMENTI, type ChiaveRaggruppamento } from "@/lib/gruppi";

export const dynamic = "force-dynamic";

// La griglia: due lenti incrociate in un rettangolo.
//
// La domanda a cui risponde non è «quanto vende questo fornitore» — a quella
// risponde già /fornitori — ma «**dove** il numero di referenze e il venduto non
// vanno d'accordo». Per questo ogni casella mostra le due quote insieme e il
// loro scarto: da lì si vede l'assortimento fermo (tanti SKU, poco venduto) e i
// buchi da riempire (pochi SKU, tanto venduto).

// Le lenti incrociabili: quelle a una dimensione sola. «Fornitore e categoria»
// non entra, perché sarebbe già una griglia dentro una griglia.
const LENTI = RAGGRUPPAMENTI.filter((r) => r.chiave !== "fornitore-tipo");

const MISURE = [
  { chiave: "confronto", nome: "SKU e venduto a confronto" },
  { chiave: "sku", nome: "Numero di SKU" },
  { chiave: "venduto", nome: "Venduto (€)" },
  { chiave: "pezzi", nome: "Pezzi venduti" },
] as const;

// Fino a questo numero di righe la griglia resta leggibile; oltre, si dice
// quante ne restano fuori invece di tagliare in silenzio.
const MAX_RIGHE = 25;
const MAX_COLONNE = 14;

export default async function GrigliePage({
  searchParams,
}: {
  searchParams: Promise<{ righe?: string; colonne?: string; misura?: string; percentuali?: string }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();

  const vale = (v: string | undefined, def: ChiaveRaggruppamento): ChiaveRaggruppamento =>
    LENTI.some((l) => l.chiave === v) ? (v as ChiaveRaggruppamento) : def;
  const perRighe = vale(sp.righe, "tipo");
  const perColonne = vale(sp.colonne, "fascia");
  const misura = MISURE.some((m) => m.chiave === sp.misura) ? sp.misura! : "confronto";
  // Le percentuali si leggono su tre basi diverse e non sono la stessa cosa:
  // sul totale («quanto pesa questa casella»), sulla riga («come si distribuisce
  // questo fornitore fra le fasce»), sulla colonna («chi occupa questa fascia»).
  const base = sp.percentuali === "riga" || sp.percentuali === "colonna" ? sp.percentuali : "totale";

  const where = { ...filtroProdotti(brand) } as Record<string, unknown>;
  const g = await calcolaGriglia({ where, brand, righe: perRighe, colonne: perColonne });

  const righeMostrate = g.righe.slice(0, MAX_RIGHE);
  const colonneMostrate = g.colonne.slice(0, MAX_COLONNE);
  const righeFuori = g.righe.length - righeMostrate.length;
  const colonneFuori = g.colonne.length - colonneMostrate.length;

  const cella = (r: string, c: string): Cella | undefined => g.celle.get(`${r}||${c}`);
  const quota = (parte: number, tutto: number) => (tutto > 0 ? (parte / tutto) * 100 : null);
  const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

  // Il denominatore delle percentuali secondo la base scelta.
  const denominatore = (rk: string, ck: string): Cella =>
    base === "riga" ? g.perRiga.get(rk) ?? g.totale : base === "colonna" ? g.perColonna.get(ck) ?? g.totale : g.totale;

  const linkProdotti = (rf: Record<string, string>, cf: Record<string, string>) => {
    const q = new URLSearchParams({ ...rf, ...cf });
    return `/anagrafica?${q.toString()}`;
  };

  // Il colore della casella: verde se rende più di quanto occupa, ambra se il
  // contrario. Solo nella vista a confronto — altrove sarebbe una decorazione.
  const sfondo = (s: number | null) => {
    if (s === null || misura !== "confronto") return undefined;
    const forza = Math.min(1, Math.abs(s) / 8);
    return s >= 0 ? `rgba(36, 138, 61, ${0.05 + forza * 0.22})` : `rgba(184, 150, 62, ${0.05 + forza * 0.22})`;
  };

  const contenuto = (c: Cella | undefined, rk: string, ck: string) => {
    if (!c || (c.sku === 0 && c.esclusi === 0)) return <span className="cella-muta">—</span>;
    const d = denominatore(rk, ck);
    if (misura === "sku")
      return (
        <>
          <strong>{c.sku}</strong>
          <div className="cella-sub">{pct(quota(c.sku, d.sku))}</div>
        </>
      );
    if (misura === "venduto")
      return (
        <>
          <strong>{c.ricavo > 0 ? euro(c.ricavo) : "—"}</strong>
          <div className="cella-sub">{pct(quota(c.ricavo, d.ricavo))}</div>
        </>
      );
    if (misura === "pezzi")
      return (
        <>
          <strong>{c.quantita || "—"}</strong>
          <div className="cella-sub">{pct(quota(c.quantita, d.quantita))}</div>
        </>
      );
    // Confronto: le due quote una sopra l'altra, e lo scarto in punti.
    const qSku = quota(c.sku, d.sku);
    const qVen = quota(c.ricavo, d.ricavo);
    const s = qSku !== null && qVen !== null ? qVen - qSku : null;
    return (
      <>
        <div>
          <strong>{c.sku}</strong> SKU · {pct(qSku)}
        </div>
        <div className="cella-sub">
          {c.ricavo > 0 ? euro(c.ricavo) : "—"} · {pct(qVen)}
        </div>
        {s !== null && Math.abs(s) >= 0.1 && (
          <div className="cella-sub" style={{ fontWeight: 600 }}>
            {s > 0 ? "+" : ""}
            {s.toFixed(1)} pt
          </div>
        )}
      </>
    );
  };

  return (
    <div className="layout">
      <Sidebar attiva="griglie" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Griglie{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Due lenti incrociate. Ogni casella dice <strong>quanti SKU</strong> ci stanno dentro e{" "}
              <strong>quanto vendono</strong>, con le quote: è dallo scarto fra le due che si vede
              l&apos;assortimento fermo (tanti prodotti, poco venduto) e i buchi da riempire (pochi prodotti,
              tanto venduto).
            </p>
          </div>
        </div>

        <FormFiltri>
          <select name="righe" defaultValue={perRighe} aria-label="Righe">
            {LENTI.map((l) => (
              <option key={l.chiave} value={l.chiave}>
                Righe: {l.nome.toLowerCase()}
              </option>
            ))}
          </select>
          <select name="colonne" defaultValue={perColonne} aria-label="Colonne">
            {LENTI.map((l) => (
              <option key={l.chiave} value={l.chiave}>
                Colonne: {l.nome.toLowerCase()}
              </option>
            ))}
          </select>
          <select name="misura" defaultValue={misura} aria-label="Cosa mostro">
            {MISURE.map((m) => (
              <option key={m.chiave} value={m.chiave}>
                {m.nome}
              </option>
            ))}
          </select>
          <select name="percentuali" defaultValue={base} aria-label="Percentuali su">
            <option value="totale">% sul totale</option>
            <option value="riga">% sulla riga</option>
            <option value="colonna">% sulla colonna</option>
          </select>
        </FormFiltri>

        {perRighe === perColonne ? (
          <div className="avviso avviso-attenzione">
            Righe e colonne sono la stessa lente: incrociata con sé stessa dà una diagonale, che non dice niente.
            Scegline due diverse.
          </div>
        ) : null}

        <p className="page-sub" style={{ margin: "0 0 12px" }}>
          {g.totale.sku} SKU nelle analisi · {euro(g.totale.ricavo)} venduti a 90 giorni ·{" "}
          {g.righe.length} righe × {g.colonne.length} colonne
          {righeFuori > 0 || colonneFuori > 0 ? (
            <>
              {" · "}
              <strong>
                fuori dalla griglia: {righeFuori > 0 ? `${righeFuori} righe` : ""}
                {righeFuori > 0 && colonneFuori > 0 ? " e " : ""}
                {colonneFuori > 0 ? `${colonneFuori} colonne` : ""}
              </strong>{" "}
              (le meno vendute) — i totali qui sopra le contano comunque
            </>
          ) : null}
        </p>

        <div className="tabella-wrap">
          <table className="griglia">
            <thead>
              <tr>
                <th>{LENTI.find((l) => l.chiave === perRighe)?.nome}</th>
                {colonneMostrate.map((c) => (
                  <th key={c.chiave} className="num">
                    {c.etichetta}
                    {c.sotto && <div className="cella-sub">{c.sotto}</div>}
                  </th>
                ))}
                <th className="num">Totale riga</th>
              </tr>
            </thead>
            <tbody>
              {righeMostrate.map((r) => {
                const tot = g.perRiga.get(r.chiave);
                return (
                  <tr key={r.chiave}>
                    <td>
                      <span className="cella-nome">{r.etichetta}</span>
                      {r.sotto && <div className="cella-sub">{r.sotto}</div>}
                    </td>
                    {colonneMostrate.map((c) => {
                      const cel = cella(r.chiave, c.chiave);
                      const s = cel ? scarto(cel, g.totale) : null;
                      return (
                        <td key={c.chiave} className="num" style={{ background: sfondo(s) }}>
                          {cel && (cel.sku > 0 || cel.esclusi > 0) ? (
                            <a className="cella-griglia" href={linkProdotti(r.filtro, c.filtro)}>
                              {contenuto(cel, r.chiave, c.chiave)}
                            </a>
                          ) : (
                            contenuto(cel, r.chiave, c.chiave)
                          )}
                        </td>
                      );
                    })}
                    <td className="num">
                      <strong>{tot?.sku ?? 0}</strong> SKU
                      <div className="cella-sub">{euro(tot?.ricavo ?? 0)}</div>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <span className="cella-nome">Totale colonna</span>
                </td>
                {colonneMostrate.map((c) => {
                  const tot = g.perColonna.get(c.chiave);
                  return (
                    <td key={c.chiave} className="num">
                      <strong>{tot?.sku ?? 0}</strong> SKU
                      <div className="cella-sub">{euro(tot?.ricavo ?? 0)}</div>
                    </td>
                  );
                })}
                <td className="num">
                  <strong>{g.totale.sku}</strong> SKU
                  <div className="cella-sub">{euro(g.totale.ricavo)}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="page-sub" style={{ marginTop: 12 }}>
          Nella vista a confronto il <strong>verde</strong> è una casella che rende più di quanto occupa, l&apos;
          <strong>ambra</strong> il contrario; «pt» sono i punti percentuali di scarto fra quota di venduto e
          quota di SKU. Ogni casella si apre in anagrafica coi suoi prodotti. Come nel resto dell&apos;app, il
          venduto conta solo i prodotti dentro le analisi.
        </p>
      </main>
    </div>
  );
}
