import Link from "next/link";
import { caricaAnno, contoEconomicoMensile, costoPersonaleMese } from "@/lib/calc";
import { fetchConsuntivo, fetchSpeseBanca } from "@/lib/finance";
import { caricaCategorie, ricostruisci } from "@/lib/cfo";
import { eur, MESI, pct } from "@/lib/format";
import { normalizzaNome } from "@/lib/scout";
import { abbinaMaison, ALIQUOTE, fetchRicaviD2C, imponibile } from "@/lib/orders";

export const dynamic = "force-dynamic";

const PERIODI = [
  { key: "anno", label: "Anno", dal: 1, al: 12 },
  { key: "t1", label: "T1", dal: 1, al: 3 },
  { key: "t2", label: "T2", dal: 4, al: 6 },
  { key: "t3", label: "T3", dal: 7, al: 9 },
  { key: "t4", label: "T4", dal: 10, al: 12 },
  { key: "s1", label: "1° sem", dal: 1, al: 6 },
  { key: "s2", label: "2° sem", dal: 7, al: 12 },
];
const STATI = [
  { key: "tutte", label: "Tutte" },
  { key: "pagate", label: "Solo saldate" },
  { key: "aperte", label: "Solo aperte" },
] as const;

// Slug della tipologia che rappresenta il venduto diretto al consumatore. È lo
// slug canonico creato con il budget (vedi schema Prisma, BudgetEntry.canale):
// è la voce che NON passa da Finance e va riempita con il venduto di Orders.
const SLUG_D2C = "D2C";

export default async function ConsuntivoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; stato?: string; anno?: string; iva?: string }>;
}) {
  const sp = await searchParams;
  const periodo = PERIODI.find((p) => p.key === sp.periodo) ?? PERIODI[0];
  const stato = (STATI.find((s) => s.key === sp.stato)?.key ?? "tutte") as "tutte" | "pagate" | "aperte";
  // Il venduto Shopify è IVA inclusa, il budget è imponibile: l'aliquota con cui
  // scorporarlo si sceglie qui e resta visibile, invece di essere nascosta in
  // una costante che nessuno ritrova.
  const aliquota = ALIQUOTE.find((a) => a.key === sp.iva) ?? ALIQUOTE[0];

  // Anno selezionabile. Il consuntivo si ferma all'ultimo mese CHIUSO: il mese
  // in corso è incompleto, quindi lo si esclude.
  const oggi = new Date();
  const annoInCorso = oggi.getUTCFullYear();
  const meseInCorso = oggi.getUTCMonth() + 1; // 1..12
  const ANNI = [annoInCorso - 2, annoInCorso - 1, annoInCorso];
  const anno = ANNI.includes(Number(sp.anno)) ? Number(sp.anno) : annoInCorso;

  // Ultimo mese disponibile per l'anno scelto: anni passati = 12, anno in corso
  // = mese precedente a quello attuale, anni futuri = 0 (niente chiuso).
  const meseLimite = anno < annoInCorso ? 12 : anno > annoInCorso ? 0 : meseInCorso - 1;
  const dal = periodo.dal;
  const al = Math.min(periodo.al, meseLimite);
  const mesiPeriodo: number[] = [];
  for (let m = dal; m <= al; m++) mesiPeriodo.push(m);
  const vuoto = mesiPeriodo.length === 0;

  const [res, spese, categorie, dati, d2c] = await Promise.all([
    vuoto ? Promise.resolve({ ok: false as const, errore: "", configurato: true }) : fetchConsuntivo({ anno, dal, al, stato }),
    vuoto ? Promise.resolve({ ok: false as const, errore: "", configurato: true }) : fetchSpeseBanca({ anno, dal, al }),
    caricaCategorie(),
    caricaAnno(anno),
    // Il D2C reale non è in Finance: è il venduto dei negozi Shopify, che vive
    // nel registro Orders.
    vuoto ? Promise.resolve({ ok: false as const, errore: "", configurato: true }) : fetchRicaviD2C(anno),
  ]);

  // ---- D2C reale (Orders): mesi in imponibile, per maison e in totale ----
  // Tutti i brand Shopify sono D2C, anche quelli che non corrispondono a una
  // maison del budget: entrano nel totale e vengono elencati a parte, così il
  // conto torna e nessun venduto sparisce.
  const d2cMese = Array(12).fill(0) as number[];
  const d2cPerMaison = new Map<string, number[]>();
  const d2cSenzaMaison: { brand: string; mesi: number[] }[] = [];
  if (d2c.ok) {
    for (const b of d2c.dati.brand) {
      const mesi = b.mesi.map((v) => imponibile(v, aliquota.pct));
      for (let i = 0; i < 12; i++) d2cMese[i] += mesi[i] ?? 0;
      const slug = abbinaMaison(b.brand, dati.maisons);
      if (!slug) { d2cSenzaMaison.push({ brand: b.brand, mesi }); continue; }
      const gia = d2cPerMaison.get(slug);
      if (gia) for (let i = 0; i < 12; i++) gia[i] += mesi[i] ?? 0;
      else d2cPerMaison.set(slug, [...mesi]);
    }
  }
  const d2cPeriodo = mesiPeriodo.reduce((s, m) => s + (d2cMese[m - 1] ?? 0), 0);

  // Budget dei mesi chiusi: si somma il budget mensile (non si rapporta
  // l'annuale), così la stagionalità non falsa il confronto.
  const bm = contoEconomicoMensile(dati, "RAGGIUNGIBILE");
  const B = (campo: keyof (typeof bm)[number]) => mesiPeriodo.reduce((s, m) => s + bm[m - 1][campo], 0);
  const budgetVoce = (slug: string) =>
    dati.maisons.reduce(
      (s, m) =>
        s + mesiPeriodo.reduce((a, mm) => a + (m.mesi.find((y) => y.month === mm)?.vendite[slug] ?? 0), 0),
      0
    );

  // Nomi Finance mappati a una voce di budget.
  const nomiMappati = new Set<string>();
  for (const t of dati.tipologie) {
    for (const n of t.vociFinance.length ? t.vociFinance : [t.nome]) nomiMappati.add(normalizzaNome(n));
  }

  // ---- Ricavi reali per voce di budget (aggregato dei mesi chiusi) ----
  const fatturatoPerNome = new Map<string, { nome: string; imponibile: number; fatture: number }>();
  if (res.ok) {
    for (const t of res.dati.tipologie) {
      fatturatoPerNome.set(normalizzaNome(t.tipologia), { nome: t.tipologia, imponibile: t.imponibile, fatture: t.fatture });
    }
  }
  const consumati = new Set<string>();
  const confronto = dati.tipologie.map((t) => {
    const nomiFinance = t.vociFinance.length ? t.vociFinance : [t.nome];
    let consuntivo = 0;
    const collegati: string[] = [];
    for (const nome of nomiFinance) {
      const k = normalizzaNome(nome);
      const f = fatturatoPerNome.get(k);
      if (f) { consuntivo += f.imponibile; collegati.push(f.nome); consumati.add(k); }
    }
    // Il D2C non si fattura in Finance: il suo consuntivo è il venduto Shopify.
    if (t.slug === SLUG_D2C && d2c.ok) {
      consuntivo += d2cPeriodo;
      collegati.push(`Vendite ecommerce · ${d2c.dati.brand.length} negozi`);
    }
    return { nome: t.nome, slug: t.slug, budgetPeriodo: budgetVoce(t.slug), consuntivo, collegati, mappata: collegati.length > 0 };
  });
  const nonMappate = res.ok ? res.dati.tipologie.filter((t) => !consumati.has(normalizzaNome(t.tipologia))) : [];
  const ricaviCons = confronto.reduce((s, c) => s + c.consuntivo, 0);
  const budgetRicavi = confronto.reduce((s, c) => s + c.budgetPeriodo, 0);

  // ---- Costi reali per voce di P&L, con ripartizione per mese (dalla banca) ----
  const costi = { COGS: 0, ADV: 0, PERSONALE: 0, STRUTTURA: 0 };
  const costiMese: Record<string, number[]> = {
    COGS: Array(12).fill(0), ADV: Array(12).fill(0), PERSONALE: Array(12).fill(0), STRUTTURA: Array(12).fill(0),
  };
  let nonCategorizzato = 0;
  let esclusi = 0;
  if (spese.ok) {
    for (const r of ricostruisci(spese.dati.controparti, categorie)) {
      const tp = r.categoria?.tipoPL;
      if (!tp) { nonCategorizzato += r.uscite; continue; }
      if (tp === "ESCLUSA") { esclusi += r.uscite; continue; }
      if (tp in costi) {
        costi[tp as keyof typeof costi] += r.uscite;
        for (let i = 0; i < 12; i++) costiMese[tp][i] += r.perMese[i] ?? 0;
      }
    }
  }

  // ---- Ricavi per mese: una chiamata Finance per ogni mese chiuso ----
  const ricaviMese: Record<number, number> = {};
  if (res.ok && !vuoto) {
    const perMese = await Promise.all(mesiPeriodo.map((m) => fetchConsuntivo({ anno, mese: m, stato })));
    mesiPeriodo.forEach((m, idx) => {
      const r = perMese[idx];
      ricaviMese[m] = r.ok
        ? r.dati.tipologie.filter((t) => nomiMappati.has(normalizzaNome(t.tipologia))).reduce((s, t) => s + t.imponibile, 0)
        : 0;
      // Al fatturato Finance del mese si somma il D2C dello stesso mese: sono
      // ricavi dello stesso conto economico, da fonti diverse.
      ricaviMese[m] += d2cMese[m - 1] ?? 0;
    });
  }

  // Costo del personale: dall'anagrafica Dipendenti (payroll, deterministico),
  // non dalla categorizzazione bancaria — così non resta a zero finché i
  // bonifici non sono classificati e non si conta due volte.
  const personaleMese = (m: number) => costoPersonaleMese(dati, m);
  const personaleCons = mesiPeriodo.reduce((s, m) => s + personaleMese(m), 0);

  const margineLordoCons = ricaviCons - costi.COGS;
  const ebitdaCons = margineLordoCons - costi.ADV - personaleCons - costi.STRUTTURA;

  type RigaPL = { label: string; nota?: string; cons: number; budget: number; tipo: "ricavo" | "costo" | "totale" };
  const righePL: RigaPL[] = [
    { label: "Totale ricavi", cons: ricaviCons, budget: budgetRicavi, tipo: "totale" },
    { label: "Costo del venduto", nota: "banca · Fornitori/COGS", cons: costi.COGS, budget: B("cogs"), tipo: "costo" },
    { label: "Margine lordo", cons: margineLordoCons, budget: B("margineLordo"), tipo: "totale" },
    { label: "Spesa pubblicitaria (ADV)", nota: "banca · Marketing", cons: costi.ADV, budget: B("adv"), tipo: "costo" },
    { label: "Costo del personale", nota: "anagrafica Dipendenti", cons: personaleCons, budget: B("personale"), tipo: "costo" },
    { label: "Costi di struttura", nota: "banca · Struttura", cons: costi.STRUTTURA, budget: B("costiFissi"), tipo: "costo" },
    { label: "EBITDA", cons: ebitdaCons, budget: B("ebitda"), tipo: "totale" },
  ];
  const buono = (r: RigaPL) => (r.tipo === "costo" ? r.cons - r.budget <= 0 : r.cons - r.budget >= 0);

  const ricaviM = (m: number) => ricaviMese[m] ?? 0;
  const costoM = (tp: keyof typeof costi, m: number) => costiMese[tp][m - 1] ?? 0;
  const margineM = (m: number) => ricaviM(m) - costoM("COGS", m);
  const ebitdaM = (m: number) => margineM(m) - costoM("ADV", m) - personaleMese(m) - costoM("STRUTTURA", m);
  const righeMens: { label: string; costo?: boolean; forte?: boolean; get: (m: number) => number }[] = [
    { label: "Ricavi", get: ricaviM },
    { label: "Costo del venduto", costo: true, get: (m) => costoM("COGS", m) },
    { label: "Margine lordo", forte: true, get: margineM },
    { label: "ADV", costo: true, get: (m) => costoM("ADV", m) },
    { label: "Personale", costo: true, get: personaleMese },
    { label: "Struttura", costo: true, get: (m) => costoM("STRUTTURA", m) },
  ];

  const link = (p: { periodo?: string; stato?: string; anno?: number; iva?: string }) =>
    `/consuntivo?periodo=${p.periodo ?? periodo.key}&stato=${p.stato ?? stato}&anno=${p.anno ?? anno}&iva=${p.iva ?? aliquota.key}`;
  const ultimoChiuso = meseLimite >= 1 ? `${MESI[meseLimite - 1]} ${anno}` : "—";

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Consuntivo</h1>
          <p className="page-caption">
            Il conto economico reale, con le stesse voci del P&amp;L a budget. Si ferma all&apos;ultimo mese
            chiuso{anno === annoInCorso && meseLimite >= 1 ? ` (${ultimoChiuso})` : ""}: il mese in corso è escluso perché incompleto.
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {ANNI.map((y) => (
              <Link key={y} href={link({ anno: y })} className={y === anno ? "on" : ""}>{y}</Link>
            ))}
          </div>
          <div className="seg">
            {PERIODI.map((p) => (
              <Link key={p.key} href={link({ periodo: p.key })} className={p.key === periodo.key ? "on" : ""}>{p.label}</Link>
            ))}
          </div>
          <div className="seg">
            {STATI.map((s) => (
              <Link key={s.key} href={link({ stato: s.key })} className={s.key === stato ? "on" : ""}>{s.label}</Link>
            ))}
          </div>
          <div className="seg">
            {ALIQUOTE.map((a) => (
              <Link key={a.key} href={link({ iva: a.key })} className={a.key === aliquota.key ? "on" : ""}>{a.label}</Link>
            ))}
          </div>
        </div>
      </div>

      {vuoto ? (
        <div className="card empty">
          <div className="empty-icon">◷</div>
          <div className="empty-title">Nessun mese chiuso in questo periodo</div>
          <div className="empty-text">
            Per il {anno} l&apos;ultimo mese chiuso è {ultimoChiuso}. Il periodo {periodo.label} non contiene mesi
            già conclusi: scegli un periodo o un anno precedente.
          </div>
        </div>
      ) : !res.ok ? (
        <div className="card empty">
          <div className="empty-icon">↯</div>
          <div className="empty-title">{res.configurato ? "Finance non disponibile" : "Collega l'app Finance"}</div>
          <div className="empty-text">{res.errore}</div>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Ricavi reali — {res.dati.periodo.etichetta}</div>
              <div className="kpi-value">{eur(ricaviCons)}</div>
              <div className="kpi-sub">
                imponibile · {res.dati.totali.fatture} fatture Finance
                {d2c.ok ? ` + ${eur(d2cPeriodo)} di vendite ecommerce` : ""}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">EBITDA consuntivo</div>
              <div className={`kpi-value ${ebitdaCons >= 0 ? "pos" : "neg"}`}>{eur(ebitdaCons)}</div>
              <div className="kpi-sub">{ricaviCons > 0 ? pct((ebitdaCons / ricaviCons) * 100) : "—"} sui ricavi</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Costi consuntivo (totale)</div>
              <div className="kpi-value">{eur(costi.COGS + costi.ADV + personaleCons + costi.STRUTTURA)}</div>
              <div className="kpi-sub">
                personale {eur(personaleCons)} da roster ·{" "}
                {spese.ok ? `${eur(nonCategorizzato)} banca da categorizzare` : "spese banca n/d"}
              </div>
            </div>
          </div>

          <h2 className="section-title">Conto economico — consuntivo vs budget</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce</th>
                    <th className="num">Consuntivo</th>
                    <th className="num">Budget periodo</th>
                    <th className="num">Scostamento</th>
                    <th className="num">Realizzato</th>
                  </tr>
                </thead>
                <tbody>
                  {righePL.map((r) => {
                    const forte = r.tipo === "totale";
                    const scost = r.cons - r.budget;
                    return (
                      <tr key={r.label} className={r.label === "EBITDA" ? "tot" : undefined}>
                        <td style={{ fontWeight: forte ? 600 : 400 }}>
                          {r.label}
                          {r.nota && <div className="muted" style={{ fontSize: 11.5 }}>{r.nota}</div>}
                        </td>
                        <td className="num" style={{ fontWeight: forte ? 600 : 400 }}>
                          {r.tipo === "costo" ? `− ${eur(r.cons)}` : eur(r.cons)}
                        </td>
                        <td className="num muted">{r.tipo === "costo" ? `− ${eur(r.budget)}` : eur(r.budget)}</td>
                        <td className={`num ${buono(r) ? "pos" : "neg"}`}>{scost >= 0 ? "+" : ""}{eur(scost)}</td>
                        <td className="num muted">{r.budget > 0 ? pct((r.cons / r.budget) * 100, 0) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <h2 className="section-title">Split mensile ({periodo.label} {anno})</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce</th>
                    {mesiPeriodo.map((m) => (<th className="num" key={m}>{MESI[m - 1]}</th>))}
                    <th className="num">Periodo</th>
                  </tr>
                </thead>
                <tbody>
                  {righeMens.map((r) => (
                    <tr key={r.label}>
                      <td style={{ whiteSpace: "nowrap", fontWeight: r.forte ? 600 : 400 }}>{r.label}</td>
                      {mesiPeriodo.map((m) => (
                        <td className="num" key={m}>{r.costo ? `− ${eur(r.get(m))}` : eur(r.get(m))}</td>
                      ))}
                      <td className="num" style={{ fontWeight: 600 }}>
                        {r.costo ? `− ${eur(mesiPeriodo.reduce((s, m) => s + r.get(m), 0))}` : eur(mesiPeriodo.reduce((s, m) => s + r.get(m), 0))}
                      </td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td>EBITDA</td>
                    {mesiPeriodo.map((m) => (
                      <td className={`num ${ebitdaM(m) >= 0 ? "pos" : "neg"}`} key={m}>{eur(ebitdaM(m))}</td>
                    ))}
                    <td className={`num ${ebitdaCons >= 0 ? "pos" : "neg"}`}>{eur(mesiPeriodo.reduce((s, m) => s + ebitdaM(m), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p className="page-caption" style={{ marginTop: 14 }}>
            Ricavi = imponibile fatturato in Finance mappato alle voci di budget in{" "}
            <Link href="/margini" style={{ color: "var(--blue)" }}>Margini</Link>, <strong>più le vendite
            ecommerce</strong> prese dal registro ordini (Orders): quelle dei negozi Shopify non passano da Finance,
            quindi senza Orders la voce con il budget più alto dell&apos;anno resterebbe a zero. Il <strong>costo del
            personale</strong> viene dall&apos;anagrafica{" "}
            <Link href="/dipendenti" style={{ color: "var(--blue)" }}>Dipendenti</Link> (payroll, per i mesi
            chiusi), non dalla banca. Gli <strong>altri costi</strong> (COGS, ADV, struttura) sono le uscite di
            banca categorizzate nel <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>
            {spese.ok ? ` (${eur(nonCategorizzato)} ancora da categorizzare` : " (spese banca non disponibili"}
            {esclusi > 0 ? `, ${eur(esclusi)} esclusi` : ""}): finché non li classifichi restano sottostimati.
            Budget di confronto = somma dei soli mesi chiusi. Ricavi al netto IVA, uscite di cassa IVA inclusa:
            consuntivo gestionale.
          </p>

          <h2 className="section-title">Ricavi reali per voce di budget</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce di budget</th>
                    <th>Da Finance</th>
                    <th className="num">Budget periodo</th>
                    <th className="num">Consuntivo</th>
                    <th className="num">Scostamento</th>
                  </tr>
                </thead>
                <tbody>
                  {confronto.map((c) => (
                    <tr key={c.slug}>
                      <td style={{ fontWeight: 600 }}>{c.nome}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {c.collegati.length ? c.collegati.join(" + ") : <span className="muted">nessuna voce collegata</span>}
                      </td>
                      <td className="num">{eur(c.budgetPeriodo)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {c.mappata ? eur(c.consuntivo) : <span className="muted">—</span>}
                      </td>
                      <td className={`num ${!c.mappata ? "" : c.consuntivo - c.budgetPeriodo >= 0 ? "pos" : "neg"}`}>
                        {c.mappata ? `${c.consuntivo - c.budgetPeriodo >= 0 ? "+" : ""}${eur(c.consuntivo - c.budgetPeriodo)}` : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td>Totale ricavi</td>
                    <td />
                    <td className="num">{eur(budgetRicavi)}</td>
                    <td className="num">{eur(ricaviCons)}</td>
                    <td className={`num ${ricaviCons - budgetRicavi >= 0 ? "pos" : "neg"}`}>
                      {ricaviCons - budgetRicavi >= 0 ? "+" : ""}{eur(ricaviCons - budgetRicavi)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {nonMappate.length > 0 && (
            <p className="page-caption" style={{ marginTop: 12 }}>
              {nonMappate.length} tipologie fatturate in Finance non sono collegate a una voce di budget
              (per {eur(nonMappate.reduce((s, t) => s + t.imponibile, 0))}). Associale in{" "}
              <Link href="/margini" style={{ color: "var(--blue)" }}>Margini</Link>, campo &quot;Voci in Finance&quot;.
            </p>
          )}

          <h2 className="section-title">Vendite ecommerce per maison — dai negozi Shopify</h2>
          {!d2c.ok ? (
            <div className="card empty">
              <div className="empty-icon">↯</div>
              <div className="empty-title">{d2c.configurato ? "Orders non disponibile" : "Collega l'app Orders"}</div>
              <div className="empty-text">{d2c.errore}</div>
            </div>
          ) : (
            <>
              <div className="card tight">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Maison</th>
                        {mesiPeriodo.map((m) => (<th className="num" key={m}>{MESI[m - 1]}</th>))}
                        <th className="num">Consuntivo</th>
                        <th className="num">Budget D2C</th>
                        <th className="num">Scostamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dati.maisons
                        .map((m) => {
                          const mesi = d2cPerMaison.get(m.slug) ?? Array(12).fill(0);
                          const cons = mesiPeriodo.reduce((s, mm) => s + (mesi[mm - 1] ?? 0), 0);
                          const budget = mesiPeriodo.reduce(
                            (s, mm) => s + (m.mesi.find((y) => y.month === mm)?.vendite[SLUG_D2C] ?? 0),
                            0
                          );
                          return { slug: m.slug, nome: m.nome, mesi, cons, budget };
                        })
                        // Una maison senza D2C né a budget né a consuntivo non
                        // dice niente: si mostra solo chi ha almeno un numero.
                        .filter((r) => r.cons > 0 || r.budget > 0)
                        .map((r) => (
                          <tr key={r.slug}>
                            <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.nome}</td>
                            {mesiPeriodo.map((m) => (<td className="num" key={m}>{eur(r.mesi[m - 1] ?? 0)}</td>))}
                            <td className="num" style={{ fontWeight: 600 }}>{eur(r.cons)}</td>
                            <td className="num muted">{eur(r.budget)}</td>
                            <td className={`num ${r.cons - r.budget >= 0 ? "pos" : "neg"}`}>
                              {r.cons - r.budget >= 0 ? "+" : ""}{eur(r.cons - r.budget)}
                            </td>
                          </tr>
                        ))}
                      {d2cSenzaMaison.map((b) => {
                        const cons = mesiPeriodo.reduce((s, m) => s + (b.mesi[m - 1] ?? 0), 0);
                        return (
                          <tr key={b.brand}>
                            <td style={{ whiteSpace: "nowrap" }}>
                              {b.brand}
                              <div className="muted" style={{ fontSize: 11.5 }}>negozio senza maison</div>
                            </td>
                            {mesiPeriodo.map((m) => (<td className="num" key={m}>{eur(b.mesi[m - 1] ?? 0)}</td>))}
                            <td className="num" style={{ fontWeight: 600 }}>{eur(cons)}</td>
                            <td className="num muted">—</td>
                            <td className="num muted">—</td>
                          </tr>
                        );
                      })}
                      <tr className="tot">
                        <td>Totale vendite ecommerce</td>
                        {mesiPeriodo.map((m) => (<td className="num" key={m}>{eur(d2cMese[m - 1] ?? 0)}</td>))}
                        <td className="num">{eur(d2cPeriodo)}</td>
                        <td className="num">{eur(budgetVoce(SLUG_D2C))}</td>
                        <td className={`num ${d2cPeriodo - budgetVoce(SLUG_D2C) >= 0 ? "pos" : "neg"}`}>
                          {d2cPeriodo - budgetVoce(SLUG_D2C) >= 0 ? "+" : ""}{eur(d2cPeriodo - budgetVoce(SLUG_D2C))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="page-caption" style={{ marginTop: 12 }}>
                Venduto dei negozi Shopify preso da{" "}
                <a href="https://deluxy-orders.vercel.app" style={{ color: "var(--blue)" }}>Orders</a>{" "}
                ({d2c.dati.totali.ordini.toLocaleString("it-IT")} ordini nel {anno}), scorporato con{" "}
                <strong>{aliquota.pct > 0 ? `IVA ${aliquota.pct}%` : "nessuno scorporo (lordo)"}</strong>: il totale
                Shopify è IVA e spedizione incluse, il budget è imponibile. L&apos;aliquota si cambia qui sopra e non
                viene dedotta dagli ordini, perché Shopify non la salva sull&apos;ordine.{" "}
                {d2c.dati.esclusi.annullati.ordini > 0 && (
                  <>Esclusi {d2c.dati.esclusi.annullati.ordini} ordini annullati ({eur(d2c.dati.esclusi.annullati.lordo)} lordi). </>
                )}
                {d2c.dati.esclusi.rimborsati.ordini > 0 && (
                  <>Esclusi {d2c.dati.esclusi.rimborsati.ordini} rimborsati/stornati ({eur(d2c.dati.esclusi.rimborsati.lordo)} lordi). </>
                )}
                {d2c.dati.esclusi.parzialmenteRimborsati.ordini > 0 && (
                  <>
                    {d2c.dati.esclusi.parzialmenteRimborsati.ordini} ordini rimborsati <em>in parte</em> sono contati
                    per intero ({eur(d2c.dati.esclusi.parzialmenteRimborsati.lordo)} lordi): Shopify non registra
                    quanto è stato reso, quindi il dato si dichiara invece di stimarlo.
                  </>
                )}
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
