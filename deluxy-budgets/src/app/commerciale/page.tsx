import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE, leggiVociFinance } from "@/lib/calc";
import { fetchConsuntivoMensile } from "@/lib/finance";
import { eur, num } from "@/lib/format";
import { fetchLineeScout, normalizzaNome, type LineaScout } from "@/lib/scout";
import { primoMeseAperto } from "@/lib/periodo";
import { LineeEditor, type LineaBudget } from "@/components/LineeEditor";

export const dynamic = "force-dynamic";

export default async function Commerciale() {
  // Scout è il master dell'elenco linee; i target di budget stanno in Budgets e
  // si agganciano per nome. Le due letture in parallelo.
  const aperto = primoMeseAperto(ANNO_CORRENTE);
  const [scout, lineeBudget, consuntivo] = await Promise.all([
    fetchLineeScout(),
    prisma.lineaCommerciale.findMany({
      orderBy: { ordine: "asc" },
      include: { targets: { where: { year: ANNO_CORRENTE } } },
    }),
    // Il **fatturato vero** di Finance, mese per mese: sui mesi già passati il
    // budget non è più la domanda, la domanda è quanto è stato fatto.
    fetchConsuntivoMensile({ anno: ANNO_CORRENTE, dal: 1, al: 12 }),
  ]);

  // Il consuntivo di Finance indicizzato per nome normalizzato.
  const consPerNome = new Map<string, number[]>();
  if (consuntivo.ok)
    for (const t of consuntivo.tipologie) consPerNome.set(normalizzaNome(t.tipologia), t.mesi ?? []);

  // Indice dei target di budget per nome normalizzato.
  const budgetPerNome = new Map<string, (typeof lineeBudget)[number]>();
  for (const l of lineeBudget) budgetPerNome.set(normalizzaNome(l.nome), l);

  const granTotale = lineeBudget.reduce((s, l) => s + l.targets.reduce((a, t) => a + t.valore, 0), 0);
  const granClienti = lineeBudget.reduce((s, l) => s + l.targets.reduce((a, t) => a + t.clienti, 0), 0);

  const budgetDi = (nome: string) => budgetPerNome.get(normalizzaNome(nome));

  // Il consuntivo di una linea: la **somma** delle voci di Finance collegate.
  // Senza collegamento si ripiega sul nome identico — che è la stessa regola
  // delle tipologie — e se non c'è nemmeno quello si torna `null`.
  const consuntivoDi = (voci: string[], nome: string): number[] | null => {
    if (!consuntivo.ok) return null;
    const nomi = voci.length > 0 ? voci : [nome];
    const trovate = nomi.map((n) => consPerNome.get(normalizzaNome(n))).filter(Boolean) as number[][];
    if (trovate.length === 0) return null;
    return Array.from({ length: 12 }, (_, i) => trovate.reduce((s, m) => s + (m[i] ?? 0), 0));
  };

  // ---- Le linee da compilare, e il loro stato in Scout ----
  //
  // L'elenco delle **righe di budget** è quello che si scrive: sono loro ad
  // avere i dodici mesi. Scout resta il master dell'**elenco delle linee**, e
  // serve qui a due cose: dire quali righe hanno ancora una linea viva (una
  // riga senza corrispondenza non è un errore, può essere una linea chiusa, ma
  // va detto) e quali linee di Scout un budget non ce l'hanno affatto.
  const scoutPiatte = scout.ok
    ? scout.linee.flatMap((l) => [l, ...l.sottolinee]).map((l) => ({ nome: l.nome, attiva: l.attiva }))
    : [];
  const scoutPerNome = new Map(scoutPiatte.map((l) => [normalizzaNome(l.nome), l]));

  const daCompilare: LineaBudget[] = lineeBudget.map((l) => {
    const inScout = scoutPerNome.get(normalizzaNome(l.nome));
    return {
      id: l.id,
      nome: l.nome,
      inScout: scout.ok ? Boolean(inScout) : true,
      attiva: inScout ? inScout.attiva : null,
      // ⚠️ **Tutti e dodici i mesi, sempre.** A database una linea ha una riga
      // solo per i mesi già valorizzati: senza questo riempimento un mese mai
      // scritto non avrebbe la sua casella, ed è esattamente il mese che si sta
      // cercando di compilare.
      mesi: Array.from({ length: 12 }, (_, i) => {
        const t = l.targets.find((x) => x.month === i + 1);
        return { month: i + 1, valore: t?.valore ?? 0, clienti: t?.clienti ?? 0 };
      }),
      vociFinance: leggiVociFinance(l.vociFinance),
      marginePct: l.marginePct,
      // Il consuntivo mese per mese, **o `null`**. Un `null` non è uno zero: se
      // la linea non è collegata a nessuna voce di Finance non sappiamo quanto
      // ha fatturato, e scrivere «0 €» sarebbe dire che non ha venduto niente.
      consuntivo: consuntivoDi(leggiVociFinance(l.vociFinance), l.nome),
    };
  });

  const nomiABudget = new Set(lineeBudget.map((l) => normalizzaNome(l.nome)));
  const lineeScoutSenzaBudget = scoutPiatte
    .filter((l) => !nomiABudget.has(normalizzaNome(l.nome)))
    .map((l) => l.nome);

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

      {!scout.ok && (
        <div className="card" style={{ borderColor: "var(--orange)", background: "rgba(201,52,0,0.04)" }}>
          <strong>Linee da Scout non disponibili.</strong>{" "}
          <span className="muted">
            {scout.errore}
            {!scout.configurato && " Imposta LINEE_API_KEY nel Hub (o in locale)."} Il budget qui sotto si
            scrive lo stesso: vive in Budgets, non in Scout. Quello che manca è solo il confronto con
            l&apos;elenco delle linee vive.
          </span>
        </div>
      )}

      {/* Il budget **si scrive**, e sta prima dell'elenco di sola lettura: è la
          cosa per cui si apre questa pagina. Prima il dettaglio mensile
          compariva solo quando Scout NON rispondeva — cioè proprio quando la
          pagina era in avaria — ed era comunque in sola lettura. */}
      <LineeEditor
        year={ANNO_CORRENTE}
        linee={daCompilare}
        primoMeseAperto={aperto}
        lineeScoutSenzaBudget={lineeScoutSenzaBudget}
        vociFinanceNote={consuntivo.ok ? consuntivo.tipologie.map((t) => t.tipologia) : []}
        consuntivoOk={consuntivo.ok}
      />

      {scout.ok && <LineeDaScout linee={scout.linee} budgetDi={budgetDi} />}
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
