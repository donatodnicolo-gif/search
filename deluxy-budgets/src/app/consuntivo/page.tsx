import Link from "next/link";
import { caricaAnno, contoEconomicoMensile, costoPersonaleMese } from "@/lib/calc";
import { fetchConsuntivo, fetchSpeseBanca } from "@/lib/finance";
import { caricaCategorie, ricostruisci } from "@/lib/cfo";
import { eur, MESI, pct } from "@/lib/format";
import { normalizzaNome } from "@/lib/scout";
import { abbinaMaison, fetchRicaviD2C } from "@/lib/orders";

export const dynamic = "force-dynamic";

// I periodi confrontano sempre mele con mele — mesi chiusi contro gli stessi
// mesi — TRANNE l'ultimo, «Anno», che è la vista di fine corsa: il consuntivo
// resta quello dei mesi chiusi (YTD) ma budget e anno precedente si mostrano
// **interi**, per rispondere a «a che punto sono rispetto a tutto l'anno».
// Lì le colonne cambiano nome, perché quel confronto non è uno scostamento.
const PERIODI = [
  { key: "ytd", label: "YTD", dal: 1, al: 12, annoIntero: false },
  { key: "t1", label: "T1", dal: 1, al: 3, annoIntero: false },
  { key: "t2", label: "T2", dal: 4, al: 6, annoIntero: false },
  { key: "t3", label: "T3", dal: 7, al: 9, annoIntero: false },
  { key: "t4", label: "T4", dal: 10, al: 12, annoIntero: false },
  { key: "s1", label: "1° sem", dal: 1, al: 6, annoIntero: false },
  { key: "s2", label: "2° sem", dal: 7, al: 12, annoIntero: false },
  { key: "anno", label: "Anno", dal: 1, al: 12, annoIntero: true },
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
  searchParams: Promise<{ periodo?: string; stato?: string; anno?: string }>;
}) {
  const sp = await searchParams;
  const periodo = PERIODI.find((p) => p.key === sp.periodo) ?? PERIODI[0];
  const stato = (STATI.find((s) => s.key === sp.stato)?.key ?? "tutte") as "tutte" | "pagate" | "aperte";
  // Il venduto Shopify si prende **così com'è, IVA inclusa**: è la stessa base
  // su cui è scritto il budget D2C, quindi scorporare l'IVA — come faceva una
  // prima versione — abbassava il consuntivo di un quinto e faceva sembrare
  // l'ecommerce molto più indietro di quanto sia.

  // Anno selezionabile. Il consuntivo arriva **a oggi**: il mese in corso ci
  // sta dentro, parziale. Prima si fermava all'ultimo mese chiuso e a fine
  // luglio il consuntivo non sapeva niente di luglio — una domanda su come sta
  // andando il mese non trovava risposta proprio quando serviva.
  const oggi = new Date();
  const annoInCorso = oggi.getUTCFullYear();
  const meseInCorso = oggi.getUTCMonth() + 1; // 1..12
  const giornoInCorso = oggi.getUTCDate();
  const ANNI = [annoInCorso - 2, annoInCorso - 1, annoInCorso];
  const anno = ANNI.includes(Number(sp.anno)) ? Number(sp.anno) : annoInCorso;

  // Ultimo mese disponibile per l'anno scelto: anni passati = 12, anno in corso
  // = quello attuale (parziale), anni futuri = 0.
  const meseLimite = anno < annoInCorso ? 12 : anno > annoInCorso ? 0 : meseInCorso;
  // Il mese ancora aperto, se cade dentro il periodo scelto: da lì nascono
  // tutti gli avvisi «attenzione, questo pezzo è parziale».
  const giorniDelMese = new Date(Date.UTC(annoInCorso, meseInCorso, 0)).getUTCDate();
  const dal = periodo.dal;
  const al = Math.min(periodo.al, meseLimite);
  const mesiPeriodo: number[] = [];
  for (let m = dal; m <= al; m++) mesiPeriodo.push(m);
  const vuoto = mesiPeriodo.length === 0;
  // C'è un mese aperto dentro questo periodo?
  const parziale = anno === annoInCorso && mesiPeriodo.includes(meseInCorso);

  // **Il termine di paragone.** Di norma è lo stesso periodo del consuntivo
  // (mele con mele): confrontare sei mesi con dodici direbbe che il fatturato
  // si è dimezzato mentre sta crescendo. Nella vista «Anno» invece il paragone
  // è deliberatamente l'anno INTERO — budget annuale e anno precedente pieno —
  // perché lì la domanda è un'altra: «a che punto sono rispetto a tutto
  // l'anno?». Il consuntivo resta YTD in entrambi i casi.
  const annoPrec = anno - 1;
  const rifDal = periodo.annoIntero ? 1 : dal;
  const rifAl = periodo.annoIntero ? 12 : al;
  const mesiRif: number[] = [];
  for (let m = rifDal; m <= rifAl; m++) mesiRif.push(m);

  // Data (esclusiva) a cui fermare l'anno precedente per l'ecommerce. Solo se il
  // mese aperto è dentro il periodo di riferimento: nella vista «Anno» il
  // paragone è l'anno intero e non va tagliato.
  const tagliaPrec =
    parziale && !periodo.annoIntero
      ? new Date(Date.UTC(annoPrec, meseInCorso - 1, giornoInCorso + 1)).toISOString().slice(0, 10)
      : undefined;

  const etichettaMesi = (a: number, b: number) => (a === b ? MESI[a - 1] : `${MESI[a - 1]}–${MESI[b - 1]}`);
  const etichettaPeriodo = vuoto ? "—" : etichettaMesi(dal, al);
  const etichettaRif = periodo.annoIntero ? "anno intero" : etichettaPeriodo;

  const [res, spese, categorie, dati, d2c, resPrec, d2cPrec, spesePrec, datiPrec] = await Promise.all([
    vuoto ? Promise.resolve({ ok: false as const, errore: "", configurato: true }) : fetchConsuntivo({ anno, dal, al, stato }),
    vuoto ? Promise.resolve({ ok: false as const, errore: "", configurato: true }) : fetchSpeseBanca({ anno, dal, al }),
    caricaCategorie(),
    caricaAnno(anno),
    // Il D2C reale non è in Finance: è il venduto dei negozi Shopify, che vive
    // nel registro Orders.
    vuoto ? Promise.resolve({ ok: false as const, errore: "", configurato: true }) : fetchRicaviD2C(anno),
    vuoto ? Promise.resolve({ ok: false as const, errore: "", configurato: true }) : fetchConsuntivo({ anno: annoPrec, dal: rifDal, al: rifAl, stato }),
    // Ecommerce dell'anno prima fermato **allo stesso giorno**, quando il mese
    // corrente è dentro il periodo: 26 giorni di luglio vanno confrontati con 26
    // giorni di luglio. Orders ragiona per date, quindi qui il paragone è esatto.
    vuoto
      ? Promise.resolve({ ok: false as const, errore: "", configurato: true })
      : fetchRicaviD2C(annoPrec, tagliaPrec),
    vuoto ? Promise.resolve({ ok: false as const, errore: "", configurato: true }) : fetchSpeseBanca({ anno: annoPrec, dal: rifDal, al: rifAl }),
    caricaAnno(annoPrec),
  ]);

  // ---- Vendite ecommerce (Orders): per mese, per maison e in totale ----
  // Tutti i brand Shopify sono D2C, anche quelli che non corrispondono a una
  // maison del budget: entrano nel totale e vengono elencati a parte, così il
  // conto torna e nessun venduto sparisce.
  const d2cMese = Array(12).fill(0) as number[];
  const d2cPerMaison = new Map<string, number[]>();
  const d2cSenzaMaison: { brand: string; mesi: number[] }[] = [];
  if (d2c.ok) {
    for (const b of d2c.dati.brand) {
      const mesi = b.mesi;
      for (let i = 0; i < 12; i++) d2cMese[i] += mesi[i] ?? 0;
      const slug = abbinaMaison(b.brand, dati.maisons);
      if (!slug) { d2cSenzaMaison.push({ brand: b.brand, mesi }); continue; }
      const gia = d2cPerMaison.get(slug);
      if (gia) for (let i = 0; i < 12; i++) gia[i] += mesi[i] ?? 0;
      else d2cPerMaison.set(slug, [...mesi]);
    }
  }
  const d2cPeriodo = mesiPeriodo.reduce((s, m) => s + (d2cMese[m - 1] ?? 0), 0);

  // Stesse vendite ecommerce dell'anno prima, sugli stessi mesi e sulla stessa
  // base (totale Shopify, IVA inclusa).
  const d2cPrecMese = Array(12).fill(0) as number[];
  const d2cPrecPerMaison = new Map<string, number[]>();
  if (d2cPrec.ok) {
    for (const b of d2cPrec.dati.brand) {
      const mesi = b.mesi;
      for (let i = 0; i < 12; i++) d2cPrecMese[i] += mesi[i] ?? 0;
      const slug = abbinaMaison(b.brand, dati.maisons);
      if (!slug) continue;
      const gia = d2cPrecPerMaison.get(slug);
      if (gia) for (let i = 0; i < 12; i++) gia[i] += mesi[i] ?? 0;
      else d2cPrecPerMaison.set(slug, [...mesi]);
    }
  }
  const d2cPrecPeriodo = mesiRif.reduce((s, m) => s + (d2cPrecMese[m - 1] ?? 0), 0);
  const d2cMaisonPrec = (slug: string) => {
    const mesi = d2cPrecPerMaison.get(slug);
    return mesi ? mesiRif.reduce((s, m) => s + (mesi[m - 1] ?? 0), 0) : 0;
  };

  // Variazione percentuale. Con una base a zero la percentuale non esiste (non
  // è "+100%", è "da zero"): si restituisce null e la colonna mostra "—".
  const variazione = (ora: number, prima: number | null) =>
    prima === null || prima === 0 ? null : ((ora - prima) / Math.abs(prima)) * 100;

  // Budget dei mesi chiusi: si somma il budget mensile (non si rapporta
  // l'annuale), così la stagionalità non falsa il confronto.
  const bm = contoEconomicoMensile(dati, "RAGGIUNGIBILE");
  const B = (campo: keyof (typeof bm)[number]) => mesiRif.reduce((s, m) => s + bm[m - 1][campo], 0);
  const budgetVoce = (slug: string) =>
    dati.maisons.reduce(
      (s, m) =>
        s + mesiRif.reduce((a, mm) => a + (m.mesi.find((y) => y.month === mm)?.vendite[slug] ?? 0), 0),
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
  // Stesso conto sull'anno prima, con la stessa mappatura: le voci si spostano
  // (nel 2025 non c'erano Food Supplier né Magazzino) ma la regola no.
  const fatturatoPrecPerNome = new Map<string, number>();
  if (resPrec.ok) {
    for (const t of resPrec.dati.tipologie) fatturatoPrecPerNome.set(normalizzaNome(t.tipologia), t.imponibile);
  }
  const confrontabilePrec = resPrec.ok || d2cPrec.ok;

  const consumati = new Set<string>();
  const confronto = dati.tipologie.map((t) => {
    const nomiFinance = t.vociFinance.length ? t.vociFinance : [t.nome];
    let consuntivo = 0;
    let precedente = 0;
    const collegati: string[] = [];
    for (const nome of nomiFinance) {
      const k = normalizzaNome(nome);
      const f = fatturatoPerNome.get(k);
      if (f) { consuntivo += f.imponibile; collegati.push(f.nome); consumati.add(k); }
      precedente += fatturatoPrecPerNome.get(k) ?? 0;
    }
    // Il D2C non si fattura in Finance: il suo consuntivo è il venduto Shopify.
    if (t.slug === SLUG_D2C && d2c.ok) {
      consuntivo += d2cPeriodo;
      collegati.push(`Vendite ecommerce · ${d2c.dati.brand.length} negozi`);
    }
    if (t.slug === SLUG_D2C && d2cPrec.ok) precedente += d2cPrecPeriodo;
    return {
      nome: t.nome,
      slug: t.slug,
      budgetPeriodo: budgetVoce(t.slug),
      consuntivo,
      precedente: confrontabilePrec ? precedente : null,
      collegati,
      mappata: collegati.length > 0,
    };
  });
  const nonMappate = res.ok ? res.dati.tipologie.filter((t) => !consumati.has(normalizzaNome(t.tipologia))) : [];
  const ricaviCons = confronto.reduce((s, c) => s + c.consuntivo, 0);
  const budgetRicavi = confronto.reduce((s, c) => s + c.budgetPeriodo, 0);
  const ricaviPrec = confrontabilePrec ? confronto.reduce((s, c) => s + (c.precedente ?? 0), 0) : null;

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

  // Costi dell'anno prima. **Solo se il dato esiste**: se la banca non ha
  // movimenti per quel periodo il costo non è «zero», è *non misurato* — e uno
  // zero in colonna direbbe che l'anno scorso non si spendeva niente, che è
  // peggio di una casella vuota. Stessa cosa per il personale: senza roster di
  // quell'anno non si calcola, non si finge.
  const bancaPrec = spesePrec.ok && spesePrec.dati.controparti.length > 0;
  // Quanti dei mesi di riferimento hanno davvero movimenti in banca. Non è un
  // dettaglio: il conto del 2025 comincia a luglio, quindi «tutto il 2025» dei
  // costi sono in realtà sei mesi — e un confronto che non lo dice fa sembrare
  // raddoppiate spese che sono solo misurate su metà tempo.
  const mesiBancaPrec = bancaPrec && spesePrec.ok
    ? mesiRif.filter((m) => (spesePrec.dati.totali.perMese[m - 1] ?? 0) > 0)
    : [];
  const bancaPrecParziale = bancaPrec && mesiBancaPrec.length < mesiRif.length;
  const costiPrec = { COGS: 0, ADV: 0, PERSONALE: 0, STRUTTURA: 0 };
  if (bancaPrec && spesePrec.ok) {
    for (const r of ricostruisci(spesePrec.dati.controparti, categorie)) {
      const tp = r.categoria?.tipoPL;
      if (!tp || tp === "ESCLUSA") continue;
      if (tp in costiPrec) costiPrec[tp as keyof typeof costiPrec] += r.uscite;
    }
  }
  const rosterPrec = datiPrec.persone.length > 0;
  const personalePrec = rosterPrec ? mesiRif.reduce((s, m) => s + costoPersonaleMese(datiPrec, m), 0) : null;
  const costoPrec = (tp: keyof typeof costiPrec) => (bancaPrec ? costiPrec[tp] : null);
  // Il margine lordo dell'anno prima si calcola SOLO se il costo del venduto di
  // quell'anno copre tutto il periodo. Con la banca 2025 che parte a luglio,
  // «margine lordo 2025» sarebbe ricavi pieni meno costi di un mese: un numero
  // enorme e falso, che poi si porta dietro un −29% in rosso su una riga sana.
  const margineLordoPrec =
    ricaviPrec !== null && bancaPrec && !bancaPrecParziale ? ricaviPrec - costiPrec.COGS : null;
  const ebitdaPrec =
    margineLordoPrec !== null && personalePrec !== null
      ? margineLordoPrec - costiPrec.ADV - personalePrec - costiPrec.STRUTTURA
      : null;

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

  type RigaPL = {
    label: string;
    nota?: string;
    cons: number;
    budget: number;
    // null = per quella voce l'anno prima non c'è il dato. Diverso da zero.
    prec: number | null;
    // true = l'importo dell'anno prima c'è ma copre solo una parte del periodo:
    // l'importo si mostra, la percentuale no — sarebbe un +2384% che parla di
    // mesi mancanti, non di spesa.
    precParziale?: boolean;
    tipo: "ricavo" | "costo" | "totale";
    dettaglio?: boolean;
  };
  // I ricavi si aprono subito sotto il totale, una riga per voce di budget:
  // «totale ricavi» da solo non dice quanto viene dall'ecommerce e quanto dal
  // fatturato, che è la prima cosa che si vuole sapere guardando questa tabella.
  const righeRicavi: RigaPL[] = confronto.map((c) => ({
    label: c.slug === SLUG_D2C ? "Vendite ecommerce (D2C)" : c.nome,
    nota: c.slug === SLUG_D2C ? "negozi Shopify · registro ordini" : c.collegati.join(" + ") || "nessuna voce collegata",
    cons: c.consuntivo,
    budget: c.budgetPeriodo,
    prec: c.precedente,
    tipo: "ricavo",
    dettaglio: true,
  }));
  const righePL: RigaPL[] = [
    { label: "Totale ricavi", cons: ricaviCons, budget: budgetRicavi, prec: ricaviPrec, tipo: "totale" },
    ...righeRicavi,
    { label: "Costo del venduto", nota: "banca · Fornitori/COGS", cons: costi.COGS, budget: B("cogs"), prec: costoPrec("COGS"), precParziale: bancaPrecParziale, tipo: "costo" },
    { label: "Margine lordo", cons: margineLordoCons, budget: B("margineLordo"), prec: margineLordoPrec, tipo: "totale" },
    { label: "Spesa pubblicitaria (ADV)", nota: "banca · Marketing", cons: costi.ADV, budget: B("adv"), prec: costoPrec("ADV"), precParziale: bancaPrecParziale, tipo: "costo" },
    { label: "Costo del personale", nota: "anagrafica Dipendenti", cons: personaleCons, budget: B("personale"), prec: personalePrec, tipo: "costo" },
    { label: "Costi di struttura", nota: "banca · Struttura", cons: costi.STRUTTURA, budget: B("costiFissi"), prec: costoPrec("STRUTTURA"), precParziale: bancaPrecParziale, tipo: "costo" },
    { label: "EBITDA", cons: ebitdaCons, budget: B("ebitda"), prec: ebitdaPrec, tipo: "totale" },
  ];
  const buono = (r: RigaPL) => (r.tipo === "costo" ? r.cons - r.budget <= 0 : r.cons - r.budget >= 0);
  // Su un costo crescere è male, su un ricavo è bene: il colore segue quello.
  const buonaVar = (r: RigaPL, v: number) => (r.tipo === "costo" ? v <= 0 : v >= 0);

  // Nella vista «Anno» si confronta un consuntivo parziale con riferimenti
  // interi: le colonne devono dire esattamente questo, altrimenti un −60% letto
  // come calo sarebbe solo «siamo a metà anno». Quindi cambiano nome e la
  // percentuale diventa «quanto ne ho già fatto», non una variazione.
  const intestaPrec = periodo.annoIntero
    ? `Tutto il ${annoPrec}`
    : `${etichettaPeriodo} ${annoPrec}`;
  const intestaVar = periodo.annoIntero ? `% del ${annoPrec}` : "Var. anno prec.";
  const intestaBudget = periodo.annoIntero ? "Budget anno" : "Budget periodo";
  const intestaScost = periodo.annoIntero ? "Ancora da fare" : "Scostamento";
  // % di completamento: quota di un riferimento intero già coperta dallo YTD.
  const quota = (ora: number, rif: number | null) =>
    rif === null || rif === 0 ? null : (ora / rif) * 100;
  // Quanto manca al budget annuale. Se è già stato superato NON si azzera la
  // casella: su un ricavo è la notizia migliore della pagina, su un costo la
  // peggiore, e in entrambi i casi va detta.
  const restante = (budget: number, cons: number, tipo: "ricavo" | "costo" | "totale") => {
    const v = budget - cons;
    if (v > 0) return <span className="muted">{eur(v)}</span>;
    return <span className={tipo === "costo" ? "neg" : "pos"}>superato di {eur(-v)}</span>;
  };

  const ricaviM = (m: number) => ricaviMese[m] ?? 0;
  const costoM = (tp: keyof typeof costi, m: number) => costiMese[tp][m - 1] ?? 0;
  const margineM = (m: number) => ricaviM(m) - costoM("COGS", m);
  const ebitdaM = (m: number) => margineM(m) - costoM("ADV", m) - personaleMese(m) - costoM("STRUTTURA", m);
  const righeMens: { label: string; costo?: boolean; forte?: boolean; dettaglio?: boolean; get: (m: number) => number }[] = [
    { label: "Ricavi", get: ricaviM },
    // Quanto di quei ricavi è ecommerce, mese per mese: è la riga che dice se
    // l'andamento dei negozi sta reggendo, e da sola nel totale non si vede.
    ...(d2c.ok ? [{ label: "di cui vendite ecommerce", dettaglio: true, get: (m: number) => d2cMese[m - 1] ?? 0 }] : []),
    { label: "Costo del venduto", costo: true, get: (m) => costoM("COGS", m) },
    { label: "Margine lordo", forte: true, get: margineM },
    { label: "ADV", costo: true, get: (m) => costoM("ADV", m) },
    { label: "Personale", costo: true, get: personaleMese },
    { label: "Struttura", costo: true, get: (m) => costoM("STRUTTURA", m) },
  ];

  const link = (p: { periodo?: string; stato?: string; anno?: number }) =>
    `/consuntivo?periodo=${p.periodo ?? periodo.key}&stato=${p.stato ?? stato}&anno=${p.anno ?? anno}`;
  const ultimoMese = meseLimite >= 1 ? `${MESI[meseLimite - 1]} ${anno}` : "—";
  const meseAperto = `${MESI[meseInCorso - 1]} ${anno}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Consuntivo</h1>
          <p className="page-caption">
            Il conto economico reale, con le stesse voci del P&amp;L a budget. Arriva{" "}
            {parziale ? (
              <>
                <strong>a oggi</strong>: {meseAperto} è dentro il conto ma è <strong>in corso</strong> —{" "}
                {giornoInCorso} giorni su {giorniDelMese}.
              </>
            ) : (
              <>
                fino a <strong>{ultimoMese}</strong>: mesi completi.
              </>
            )}
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
        </div>
      </div>

      {vuoto ? (
        <div className="card empty">
          <div className="empty-icon">◷</div>
          <div className="empty-title">Nessun mese di questo periodo è ancora cominciato</div>
          <div className="empty-text">
            Per il {anno} il consuntivo arriva a {ultimoMese}. Il periodo {periodo.label} è tutto nel futuro:
            scegli un periodo o un anno precedente.
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
              {ricaviPrec !== null && (
                <div className="kpi-sub">
                  {periodo.annoIntero
                    ? (() => {
                        const q = quota(ricaviCons, ricaviPrec);
                        return (
                          <>
                            <span className="muted">{q === null ? "—" : pct(q, 0)}</span> di tutto il {annoPrec}{" "}
                            ({eur(ricaviPrec)})
                          </>
                        );
                      })()
                    : (() => {
                        const v = variazione(ricaviCons, ricaviPrec);
                        return (
                          <>
                            <span className={v === null ? "muted" : v >= 0 ? "pos" : "neg"}>
                              {v === null ? "—" : `${v >= 0 ? "+" : ""}${pct(v, 0)}`}
                            </span>{" "}
                            sullo stesso periodo {annoPrec} ({eur(ricaviPrec)})
                          </>
                        );
                      })()}
                </div>
              )}
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
                    <th className="num">{intestaPrec}</th>
                    <th className="num">{intestaVar}</th>
                    <th className="num">{intestaBudget}</th>
                    <th className="num">{intestaScost}</th>
                    <th className="num">Realizzato</th>
                  </tr>
                </thead>
                <tbody>
                  {righePL.map((r) => {
                    const forte = r.tipo === "totale";
                    const scost = r.cons - r.budget;
                    return (
                      <tr key={r.label} className={r.label === "EBITDA" ? "tot" : undefined}>
                        <td style={{ fontWeight: forte ? 600 : 400, paddingLeft: r.dettaglio ? 26 : undefined }}>
                          {r.dettaglio && <span className="muted" style={{ marginRight: 6 }}>└</span>}
                          {r.label}
                          {r.nota && <div className="muted" style={{ fontSize: 11.5, paddingLeft: r.dettaglio ? 16 : 0 }}>{r.nota}</div>}
                        </td>
                        <td className="num" style={{ fontWeight: forte ? 600 : 400 }}>
                          {r.tipo === "costo" ? `− ${eur(r.cons)}` : eur(r.cons)}
                        </td>
                        <td className="num muted">
                          {r.prec === null ? "—" : r.tipo === "costo" ? `− ${eur(r.prec)}` : eur(r.prec)}
                          {r.prec !== null && r.precParziale && (
                            <div className="muted" style={{ fontSize: 11.5 }}>parziale</div>
                          )}
                        </td>
                        <td className="num">
                          {(() => {
                            // Percentuale muta su una base parziale: direbbe
                            // «spesa raddoppiata» quando mancano solo dei mesi.
                            if (r.precParziale) return <span className="muted">—</span>;
                            // Vista «Anno»: quota di un anno intero già fatta,
                            // non una variazione — un segno "+/−" qui mentirebbe.
                            if (periodo.annoIntero) {
                              const q = quota(r.cons, r.prec);
                              return q === null ? <span className="muted">—</span> : <span className="muted">{pct(q, 0)}</span>;
                            }
                            const v = variazione(r.cons, r.prec);
                            if (v === null) return <span className="muted">—</span>;
                            return (
                              <span className={buonaVar(r, v) ? "pos" : "neg"}>
                                {v >= 0 ? "+" : ""}{pct(v, 0)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="num muted">{r.tipo === "costo" ? `− ${eur(r.budget)}` : eur(r.budget)}</td>
                        {periodo.annoIntero ? (
                          <td className="num">{restante(r.budget, r.cons, r.tipo)}</td>
                        ) : (
                          <td className={`num ${buono(r) ? "pos" : "neg"}`}>{scost >= 0 ? "+" : ""}{eur(scost)}</td>
                        )}
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
                      <td
                        className={r.dettaglio ? "muted" : undefined}
                        style={{ whiteSpace: "nowrap", fontWeight: r.forte ? 600 : 400, paddingLeft: r.dettaglio ? 26 : undefined }}
                      >
                        {r.label}
                      </td>
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
            <Link href="/dipendenti" style={{ color: "var(--blue)" }}>Dipendenti</Link> (payroll, mese per
            mese), non dalla banca. Gli <strong>altri costi</strong> (COGS, ADV, struttura) sono le uscite di
            banca categorizzate nel <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>
            {spese.ok ? ` (${eur(nonCategorizzato)} ancora da categorizzare` : " (spese banca non disponibili"}
            {esclusi > 0 ? `, ${eur(esclusi)} esclusi` : ""}): finché non li classifichi restano sottostimati.{" "}
            {periodo.annoIntero ? (
              <>
                Sei nella vista <strong>Anno</strong>: il consuntivo resta quello dei <strong>mesi chiusi</strong>{" "}
                ({etichettaPeriodo}), mentre <strong>budget e {annoPrec} sono interi</strong> — la domanda è «a che
                punto sono rispetto a tutto l&apos;anno». Per questo qui non si parla di scostamento ma di{" "}
                <strong>quanto manca</strong> e di <strong>quanta parte</strong> del {annoPrec} è già stata fatta. Per
                confrontare mele con mele usa <strong>YTD</strong> o un trimestre.{" "}
              </>
            ) : (
              <>
                Il confronto con il <strong>{annoPrec}</strong> è a <strong>parità di periodo</strong>: gli stessi mesi
                ({etichettaPeriodo}), non l&apos;anno intero.{" "}
              </>
            )}
            {(!bancaPrec || !rosterPrec) && (
              <>
                Dove l&apos;anno prima il dato non c&apos;è la casella resta{" "}
                <strong>vuota invece che a zero</strong> —{" "}
                {[
                  !bancaPrec && `la banca non ha movimenti categorizzati per il periodo ${annoPrec}`,
                  !rosterPrec && `non esiste un organico a budget ${annoPrec}`,
                ]
                  .filter(Boolean)
                  .join(" e ")}
                , quindi {!bancaPrec ? "costi ed EBITDA" : "l'EBITDA"} dell&apos;anno prima non si{" "}
                {!bancaPrec ? "calcolano" : "calcola"}.{" "}
              </>
            )}
            {parziale && (
              <>
                <strong>{MESI[meseInCorso - 1]} è in corso</strong> ({giornoInCorso} giorni su {giorniDelMese}), e non
                tutte le voci si fermano allo stesso punto: le <strong>vendite ecommerce</strong> sono al giorno, e
                anche il {annoPrec} è tagliato allo stesso giorno, quindi lì il confronto è esatto. Il{" "}
                <strong>fatturato di Finance</strong> e le <strong>uscite di banca</strong> si contano a mese
                {periodo.annoIntero ? "" : `, quindi per il ${annoPrec} ${MESI[meseInCorso - 1]} vale intero`}; il{" "}
                <strong>budget</strong> e il <strong>costo del personale</strong> del mese sono interi. Su quelle voci
                il mese in corso risulta quindi più magro di quanto sarà.{" "}
              </>
            )}
            {bancaPrecParziale && (
              <>
                <strong>Attenzione al {annoPrec}</strong>: in banca ci sono movimenti solo in{" "}
                {mesiBancaPrec.length} {mesiBancaPrec.length === 1 ? "mese" : "mesi"} su {mesiRif.length}{" "}
                ({etichettaMesi(mesiBancaPrec[0], mesiBancaPrec[mesiBancaPrec.length - 1])}), quindi i{" "}
                <strong>costi dell&apos;anno prima sono parziali</strong>: l&apos;importo è marcato «parziale» e la
                percentuale non si mostra, perché confronterebbe {mesiRif.length} mesi con{" "}
                {mesiBancaPrec.length}. Per lo stesso motivo il <strong>margine lordo</strong> del {annoPrec} resta
                vuoto: sarebbe ricavi pieni meno costi di{" "}
                {mesiBancaPrec.length === 1 ? "un mese" : `${mesiBancaPrec.length} mesi`}.{" "}
              </>
            )}
            Budget di confronto = somma dei mesi {etichettaRif}. <strong>Le due fonti dei ricavi hanno basi
            diverse</strong>, come il budget: il fatturato di Finance è <strong>imponibile</strong>, le vendite
            ecommerce sono il <strong>totale Shopify IVA inclusa</strong> (non si scorpora). Uscite di cassa IVA
            inclusa: consuntivo gestionale.
          </p>

          <h2 className="section-title">Ricavi reali per voce di budget</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce di budget</th>
                    <th>Da Finance</th>
                    <th className="num">{intestaBudget}</th>
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
                        <th className="num">{intestaPrec}</th>
                        <th className="num">{intestaVar}</th>
                        <th className="num">{periodo.annoIntero ? "Budget anno" : "Budget D2C"}</th>
                        <th className="num">{intestaScost}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dati.maisons
                        .map((m) => {
                          const mesi = d2cPerMaison.get(m.slug) ?? Array(12).fill(0);
                          const cons = mesiPeriodo.reduce((s, mm) => s + (mesi[mm - 1] ?? 0), 0);
                          const budget = mesiRif.reduce(
                            (s, mm) => s + (m.mesi.find((y) => y.month === mm)?.vendite[SLUG_D2C] ?? 0),
                            0
                          );
                          return { slug: m.slug, nome: m.nome, mesi, cons, budget, prec: d2cPrec.ok ? d2cMaisonPrec(m.slug) : null };
                        })
                        // Una maison senza D2C né a budget né a consuntivo non
                        // dice niente: si mostra solo chi ha almeno un numero.
                        .filter((r) => r.cons > 0 || r.budget > 0)
                        .map((r) => (
                          <tr key={r.slug}>
                            <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.nome}</td>
                            {mesiPeriodo.map((m) => (<td className="num" key={m}>{eur(r.mesi[m - 1] ?? 0)}</td>))}
                            <td className="num" style={{ fontWeight: 600 }}>{eur(r.cons)}</td>
                            <td className="num muted">{r.prec === null ? "—" : eur(r.prec)}</td>
                            <td className="num">
                              {(() => {
                                if (periodo.annoIntero) {
                                  const q = quota(r.cons, r.prec);
                                  return q === null ? <span className="muted">—</span> : <span className="muted">{pct(q, 0)}</span>;
                                }
                                const v = variazione(r.cons, r.prec);
                                if (v === null) return <span className="muted">—</span>;
                                return <span className={v >= 0 ? "pos" : "neg"}>{v >= 0 ? "+" : ""}{pct(v, 0)}</span>;
                              })()}
                            </td>
                            <td className="num muted">{eur(r.budget)}</td>
                            {periodo.annoIntero ? (
                              <td className="num">{restante(r.budget, r.cons, "ricavo")}</td>
                            ) : (
                              <td className={`num ${r.cons - r.budget >= 0 ? "pos" : "neg"}`}>
                                {r.cons - r.budget >= 0 ? "+" : ""}{eur(r.cons - r.budget)}
                              </td>
                            )}
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
                            <td className="num muted">—</td>
                            <td className="num muted">—</td>
                          </tr>
                        );
                      })}
                      <tr className="tot">
                        <td>Totale vendite ecommerce</td>
                        {mesiPeriodo.map((m) => (<td className="num" key={m}>{eur(d2cMese[m - 1] ?? 0)}</td>))}
                        <td className="num">{eur(d2cPeriodo)}</td>
                        <td className="num">{d2cPrec.ok ? eur(d2cPrecPeriodo) : "—"}</td>
                        <td className="num">
                          {(() => {
                            const base = d2cPrec.ok ? d2cPrecPeriodo : null;
                            if (periodo.annoIntero) {
                              const q = quota(d2cPeriodo, base);
                              return q === null ? <span className="muted">—</span> : <span className="muted">{pct(q, 0)}</span>;
                            }
                            const v = variazione(d2cPeriodo, base);
                            if (v === null) return <span className="muted">—</span>;
                            return <span className={v >= 0 ? "pos" : "neg"}>{v >= 0 ? "+" : ""}{pct(v, 0)}</span>;
                          })()}
                        </td>
                        <td className="num">{eur(budgetVoce(SLUG_D2C))}</td>
                        {periodo.annoIntero ? (
                          <td className="num">{restante(budgetVoce(SLUG_D2C), d2cPeriodo, "ricavo")}</td>
                        ) : (
                          <td className={`num ${d2cPeriodo - budgetVoce(SLUG_D2C) >= 0 ? "pos" : "neg"}`}>
                            {d2cPeriodo - budgetVoce(SLUG_D2C) >= 0 ? "+" : ""}{eur(d2cPeriodo - budgetVoce(SLUG_D2C))}
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="page-caption" style={{ marginTop: 12 }}>
                Venduto dei negozi Shopify preso da{" "}
                <a href="https://deluxy-orders.vercel.app" style={{ color: "var(--blue)" }}>Orders</a>{" "}
                ({d2c.dati.totali.ordini.toLocaleString("it-IT")} ordini nel {anno}): è il{" "}
                <strong>totale Shopify così com&apos;è, IVA e spedizione incluse</strong> — la stessa base su cui è
                scritto il budget D2C, quindi non si scorpora niente.{" "}
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
