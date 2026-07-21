import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/calc";
import { eur, MESI, num } from "@/lib/format";
import { fetchLineeScout, normalizzaNome, type LineaScout } from "@/lib/scout";

export const dynamic = "force-dynamic";

export default async function Commerciale() {
  // Scout è il master dell'elenco linee; i target di budget stanno in Budgets e
  // si agganciano per nome. Le due letture in parallelo.
  const [scout, lineeBudget] = await Promise.all([
    fetchLineeScout(),
    prisma.lineaCommerciale.findMany({
      orderBy: { ordine: "asc" },
      include: { targets: { where: { year: ANNO_CORRENTE } } },
    }),
  ]);

  // Indice dei target di budget per nome normalizzato.
  const budgetPerNome = new Map<string, (typeof lineeBudget)[number]>();
  for (const l of lineeBudget) budgetPerNome.set(normalizzaNome(l.nome), l);

  const granTotale = lineeBudget.reduce((s, l) => s + l.targets.reduce((a, t) => a + t.valore, 0), 0);
  const granClienti = lineeBudget.reduce((s, l) => s + l.targets.reduce((a, t) => a + t.clienti, 0), 0);

  const budgetDi = (nome: string) => budgetPerNome.get(normalizzaNome(nome));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Team commerciale</h1>
          <p className="page-caption">
            Le linee di vendita sono gestite in <strong>Scout</strong> (master); qui si vede il budget{" "}
            {ANNO_CORRENTE} agganciato a ciascuna linea per nome.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn primary" href="/proposte/nuova">Invia proposta budget</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Valore anno — budget linee</div>
          <div className="kpi-value">{eur(granTotale)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Nuovi clienti / attivazioni</div>
          <div className="kpi-value">{num(granClienti)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Linee (master: Scout)</div>
          <div className="kpi-value">{scout.ok ? scout.linee.length : lineeBudget.length}</div>
          <div className="kpi-sub">{scout.ok ? "da deluxy-scout" : "fallback locale"}</div>
        </div>
      </div>

      {scout.ok ? (
        <LineeDaScout linee={scout.linee} budgetDi={budgetDi} />
      ) : (
        <FallbackLocale
          motivo={scout.errore}
          configurato={scout.configurato}
          linee={lineeBudget}
          granTotale={granTotale}
        />
      )}
    </>
  );
}

// ---- Scout master: elenco linee (con sottolinee) + budget agganciato ----
function LineeDaScout({
  linee,
  budgetDi,
}: {
  linee: LineaScout[];
  budgetDi: (nome: string) => { targets: { valore: number; clienti: number }[] } | undefined;
}) {
  const somma = (t: { valore: number; clienti: number }[], campo: "valore" | "clienti") =>
    t.reduce((s, x) => s + x[campo], 0);
  const riga = (nome: string, sotto: boolean, attiva: boolean, pitch: string | null, icona: string | null) => {
    const b = budgetDi(nome);
    return (
      <tr key={(sotto ? "· " : "") + nome}>
        <td style={{ paddingLeft: sotto ? 34 : undefined, fontWeight: sotto ? 400 : 600, whiteSpace: "nowrap" }}>
          {sotto && <span className="muted" style={{ marginRight: 6 }}>└</span>}
          {nome}
          {pitch && <div className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>{pitch}</div>}
        </td>
        <td>
          {attiva ? (
            <span className="badge green"><span className="dot" />Attiva</span>
          ) : (
            <span className="badge neutral"><span className="dot" />Standby</span>
          )}
        </td>
        <td className="num">{b ? eur(somma(b.targets, "valore")) : <span className="muted">—</span>}</td>
        <td className="num">{b ? num(somma(b.targets, "clienti")) : <span className="muted">—</span>}</td>
      </tr>
    );
  };

  return (
    <>
      <h2 className="section-title">Linee di vendita — master Scout</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Linea</th>
                <th>Stato</th>
                <th className="num">Budget €/anno</th>
                <th className="num">Nuovi clienti</th>
              </tr>
            </thead>
            <tbody>
              {linee.map((l) => (
                <>
                  {riga(l.nome, false, l.attiva, l.pitch, l.icona)}
                  {l.sottolinee.map((s) => riga(s.nome, true, s.attiva, s.pitch, s.icona))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="page-caption" style={{ marginTop: 18 }}>
        Le linee (e sottolinee) arrivano da Scout, che ne è il master. Il budget si aggancia per nome:
        dove la linea di Scout non combacia con una linea a budget, la colonna resta “—”. Per allineare,
        usa in Scout gli stessi nomi delle linee a budget (o viceversa).
      </p>
    </>
  );
}

// ---- Fallback: Scout non disponibile → linee e target locali (come prima) ----
function FallbackLocale({
  motivo,
  configurato,
  linee,
  granTotale,
}: {
  motivo: string;
  configurato: boolean;
  linee: {
    id: string;
    nome: string;
    targets: { month: number; valore: number; clienti: number }[];
  }[];
  granTotale: number;
}) {
  const valore = (l: (typeof linee)[number], month: number) =>
    l.targets.find((t) => t.month === month)?.valore ?? 0;
  const clienti = (l: (typeof linee)[number], month: number) =>
    l.targets.find((t) => t.month === month)?.clienti ?? 0;
  const totValore = (l: (typeof linee)[number]) => l.targets.reduce((s, t) => s + t.valore, 0);
  const totClienti = (l: (typeof linee)[number]) => l.targets.reduce((s, t) => s + t.clienti, 0);

  return (
    <>
      <div className="card" style={{ borderColor: "var(--orange)", background: "rgba(201,52,0,0.04)" }}>
        <strong>Linee da Scout non disponibili.</strong>{" "}
        <span className="muted">
          {motivo}
          {!configurato && " Imposta LINEE_API_KEY nel Hub (o in locale)."} Mostro intanto le linee a budget locali.
        </span>
      </div>

      <h2 className="section-title">Valore per linea (€ / mese)</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Linea</th>
                {MESI.map((m) => (<th className="num" key={m}>{m}</th>))}
                <th className="num">Anno</th>
              </tr>
            </thead>
            <tbody>
              {linee.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{l.nome}</td>
                  {MESI.map((_, i) => (
                    <td className="num" key={i}>{valore(l, i + 1) ? eur(valore(l, i + 1)) : <span className="muted">—</span>}</td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>{eur(totValore(l))}</td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale</td>
                {MESI.map((_, i) => (
                  <td className="num" key={i}>{eur(linee.reduce((s, l) => s + valore(l, i + 1), 0))}</td>
                ))}
                <td className="num">{eur(granTotale)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Nuovi clienti per linea (numero / mese)</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Linea</th>
                {MESI.map((m) => (<th className="num" key={m}>{m}</th>))}
                <th className="num">Anno</th>
              </tr>
            </thead>
            <tbody>
              {linee.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{l.nome}</td>
                  {MESI.map((_, i) => (
                    <td className="num" key={i}>{clienti(l, i + 1) ? num(clienti(l, i + 1)) : <span className="muted">—</span>}</td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>{num(totClienti(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
