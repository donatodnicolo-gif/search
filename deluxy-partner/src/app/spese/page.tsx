import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { MESI } from "@/lib/calc";
import { ANNO_CORRENTE } from "@/lib/queries";
import { categorieDaBudgets, budgetsConfigurato, contaRegole, TIPI_PL } from "@/lib/categorie-spesa";
import { impostaCategoriaSpesa, applicaRegoleCategorie, riclassificaTutteLeSpese, proponiCategorieAI } from "@/lib/spese-actions";
import { CategoriaSpesa } from "@/components/CategoriaSpesa";
import { RigaLink } from "@/components/RigaLink";
import { ZonaFiltri } from "@/components/ZonaFiltri";
import { BottoneAI } from "@/components/BottoneAI";

export const dynamic = "force-dynamic";
// «Applica le regole» tocca migliaia di movimenti: col limite di default la
// funzione verrebbe interrotta a metà lavoro.
export const maxDuration = 60;

// SPESE PER CATEGORIA. Le uscite di banca sono già qui (importate in
// /transazioni); quello che mancava è *dove finiscono nel bilancio*. Le
// categorie non si inventano in questa app: si leggono da **deluxy-budgets**,
// che è quella che il bilancio lo fa. Qui si assegna e basta.

export default async function SpesePage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; dal?: string; al?: string; q?: string; cat?: string; tipo?: string; solo?: string; errore?: string; applicate?: string; restano?: string; riclassificate?: string; svuotate?: string; ai?: string; saltate?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  const anno = parseInt(sp.anno ?? "") || ANNO_CORRENTE;
  const dal = Math.min(12, Math.max(1, parseInt(sp.dal ?? "1") || 1));
  const al = Math.min(12, Math.max(dal, parseInt(sp.al ?? "12") || 12));
  const inizio = new Date(Date.UTC(anno, dal - 1, 1));
  const fine = new Date(Date.UTC(anno, al, 1));
  // Voce di P&L su cui è aperto il dettaglio. Si accetta solo un valore noto:
  // un `tipo` inventato nell'indirizzo darebbe una lista vuota che sembra
  // «nessuna spesa» invece di «filtro senza senso».
  const tipo = sp.tipo && TIPI_PL[sp.tipo] ? sp.tipo : undefined;

  // Indirizzo della stessa pagina con un filtro in più o in meno: il periodo
  // scelto non si perde mai per strada.
  const conFiltro = (cambi: Record<string, string | null>) => {
    const p = new URLSearchParams({ anno: String(anno), dal: String(dal), al: String(al) });
    if (q) p.set("q", q);
    if (sp.cat) p.set("cat", sp.cat);
    if (tipo) p.set("tipo", tipo);
    if (sp.solo) p.set("solo", sp.solo);
    for (const [k, v] of Object.entries(cambi)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/spese?${p.toString()}`;
  };

  // Le REGOLE si chiedono anche per la pagina, non solo al momento di
  // applicarle: «Finance ha le regole di Budgets?» è una domanda a cui si deve
  // poter rispondere guardando, non fidandosi. Se la chiamata con le regole non
  // riesce si ripiega sul solo elenco, che è quello che serve alle tendine.
  const esitoConRegole = await categorieDaBudgets(true);
  const esitoCat = esitoConRegole.ok ? esitoConRegole : await categorieDaBudgets();
  const categorie = esitoCat.ok ? esitoCat.categorie : [];
  const regoleImportate = esitoConRegole.ok ? contaRegole(esitoConRegole.categorie) : null;

  const uscite = await prisma.transazioneBancaria.findMany({
    where: {
      importo: { lt: 0 },
      data: { gte: inizio, lt: fine },
      stato: { not: "ignorata" },
      // «Senza categoria» e «una categoria precisa» sono due filtri sulla stessa
      // colonna: insieme si annullano e la pagina esce vuota (succedeva usando la
      // tendina con una categoria già scelta, perché il form la rimanda). Se si
      // chiedono le non classificate, il filtro per categoria non si applica.
      ...(sp.solo === "senza"
        ? { categoriaId: null }
        : {
            ...(sp.cat ? { categoriaId: sp.cat } : {}),
            ...(tipo ? { categoriaTipoPL: tipo } : {}),
          }),
      ...(sp.solo === "ai" ? { categoriaDa: "ai" } : {}),
      // La ricerca (Libro v1.9 §8-bis): come l'operatore riconosce l'uscita —
      // la controparte o la causale. Filtra solo l'ELENCO: totali e copertura
      // restano calcolati su tutto il periodo.
      ...(q
        ? {
            OR: [
              { controparte: { contains: q, mode: "insensitive" as const } },
              { descrizione: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ data: "desc" }],
    take: 400,
    select: {
      id: true, data: true, importo: true, descrizione: true, controparte: true,
      categoriaId: true, categoriaNome: true, categoriaTipoPL: true, categoriaDa: true, categoriaNota: true,
    },
  });

  // I totali si calcolano su TUTTO il periodo, non sulle 400 righe mostrate:
  // una percentuale di copertura fatta sul troncamento sarebbe una bugia.
  const tutte = await prisma.transazioneBancaria.findMany({
    where: { importo: { lt: 0 }, data: { gte: inizio, lt: fine }, stato: { not: "ignorata" } },
    select: { importo: true, categoriaId: true, categoriaNome: true, categoriaTipoPL: true, categoriaDa: true },
  });
  const totale = tutte.reduce((a, t) => a + Math.abs(t.importo), 0);
  const conCat = tutte.filter((t) => t.categoriaId);
  const totaleCat = conCat.reduce((a, t) => a + Math.abs(t.importo), 0);
  const pctCopertura = totale > 0.005 ? (totaleCat / totale) * 100 : 0;
  const senzaCat = tutte.length - conCat.length;

  // Le assegnazioni fatte a mano: **arrivano al conto economico** (dal
  // 31/07/2026 Budgets legge questa classificazione invece di ricalcolarla) e
  // sono le uniche che «Riclassifica tutto» non tocca. Restano contate a parte
  // per questo: sono le righe che nessuna regola rifarà, quindi se sono
  // sbagliate lo restano finché non le si guarda una per una.
  const manuali = tutte.filter((t) => t.categoriaDa === "manuale");
  const manualiImporto = manuali.reduce((a, t) => a + Math.abs(t.importo), 0);

  const perCategoria = [...conCat.reduce((m, t) => {
    const k = t.categoriaNome ?? "—";
    const r = m.get(k) ?? { nome: k, id: t.categoriaId, tipoPL: t.categoriaTipoPL ?? "STRUTTURA", importo: 0, n: 0 };
    r.importo += Math.abs(t.importo);
    r.n++;
    m.set(k, r);
    return m;
  }, new Map<string, { nome: string; id: string | null; tipoPL: string; importo: number; n: number }>()).values()]
    // in ordine alfabetico: si cerca una categoria per nome, non per quanto pesa
    .sort((a, b) => a.nome.localeCompare(b.nome, "it", { sensitivity: "base" }));

  const perTipo = [...conCat.reduce((m, t) => {
    const k = t.categoriaTipoPL ?? "STRUTTURA";
    m.set(k, (m.get(k) ?? 0) + Math.abs(t.importo));
    return m;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);

  const pct1 = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Spese per categoria</h1>
          <p className="page-caption">
            Le uscite di banca classificate con le <strong>categorie di costo di Budgets</strong>, quelle con cui
            si costruisce il conto economico. L&apos;elenco delle categorie si gestisce lì: qui si assegna.
            <br />
            <strong>Il conto economico legge quello che c&apos;è scritto qui</strong>: dal 31/07/2026 Budgets non
            ricalcola più la categoria per conto suo, prende questa. Quindi una spesa messa nella voce sbagliata su
            questa pagina è nel posto sbagliato anche in bilancio — e una corretta qui è corretta ovunque.
            I bottoni qui accanto riportano le regole di Budgets su queste righe: il primo riempie solo le caselle
            vuote, il secondo <strong>riclassifica anche quelle già assegnate</strong>, che è quello che serve
            quando una regola viene corretta.
            <br />
            {regoleImportate === null ? (
              <span style={{ color: "var(--red)" }}>
                <strong>Le regole non sono arrivate da Budgets.</strong> Le tendine funzionano lo stesso, ma
                applicare o riclassificare adesso non farebbe niente: i due bottoni si fermano da soli invece di
                svuotare tutto.
              </span>
            ) : (
              <>
                Adesso da Budgets sono arrivate <strong>{regoleImportate.toLocaleString("it-IT")} regole</strong> su{" "}
                {categorie.length} categorie. Non si salvano qui: si rileggono a ogni passata, così una regola
                scritta in Budgets un minuto fa è già quella che vale.
              </>
            )}
          </p>
        </div>
        <div className="page-actions">
          {categorie.length > 0 && (
            <form action={applicaRegoleCategorie}>
              <button className="btn secondary" type="submit" title="Categorizza in automatico le uscite ancora senza categoria, usando le regole definite in Budgets. Non tocca quelle già assegnate a mano.">
                ⇄ Applica le regole di Budgets
              </button>
            </form>
          )}
          {/* Riclassificare è un'altra cosa dall'assegnare: le regole cambiano,
              e finché si riempivano solo le caselle vuote quello che era già
              stato assegnato restava com'era per sempre — anche quando la
              regola che l'aveva deciso veniva corretta. */}
          {categorie.length > 0 && (
            <form action={riclassificaTutteLeSpese}>
              <button
                className="btn secondary"
                type="submit"
                title="Riapplica le regole di Budgets a TUTTE le uscite, anche a quelle già categorizzate: serve quando una regola viene corretta o aggiunta. Non tocca le assegnazioni fatte a mano."
              >
                ↻ Riclassifica tutto
              </button>
            </form>
          )}
          {categorie.length > 0 && (
            <form action={proponiCategorieAI}>
              <BottoneAI />
            </form>
          )}
        </div>
      </div>

      {!budgetsConfigurato() ? (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: "3px solid var(--orange)" }}>
          <strong style={{ fontSize: 14 }}>Categorie non collegate</strong>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 6, marginBottom: 0, lineHeight: 1.6 }}>
            Manca <code>BUDGETS_API_KEY</code>. Le categorie di costo vivono in <strong>Deluxy Budgets</strong> (è
            l&apos;app che fa il bilancio) e da qui si leggono via API: senza la chiave questa pagina non ha un
            elenco da cui scegliere. La chiave si imposta in Budgets → Configurazione → Chiavi, poi va messa qui
            su Vercel insieme a <code>BUDGETS_URL</code>.
          </p>
        </div>
      ) : !esitoCat.ok ? (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: "3px solid var(--red)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{esitoCat.errore}</span>
        </div>
      ) : null}

      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--red)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{sp.errore}</span>
        </div>
      )}
      {sp.ai != null && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge purple"><span className="dot" />{sp.ai} spese categorizzate dall&apos;AI</span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
            {Number(sp.saltate) > 0 && (
              <>{sp.saltate} controparti lasciate stare: l&apos;AI non era sicura, e una spesa nella voce sbagliata
              del bilancio è peggio di una spesa non categorizzata. </>
            )}
            {Number(sp.restano) > 0 && <>Restano {sp.restano} controparti oltre il tetto di questa passata: rilancia. </>}
            <strong>Sono proposte</strong>: filtra «Solo assegnate dall&apos;AI» qui sotto e ricontrollale — accanto a
            ognuna c&apos;è il motivo.
          </p>
        </div>
      )}
      {sp.applicate != null && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />{sp.applicate} spese categorizzate dalle regole</span>
          {Number(sp.restano) > 0 && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
              {sp.restano} uscite restano senza categoria: nessuna regola di Budgets le riconosce. Assegnale a mano
              qui sotto, oppure aggiungi la regola in Budgets e rilancia.
            </p>
          )}
        </div>
      )}
      {sp.riclassificate != null && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green">
            <span className="dot" />
            {sp.riclassificate} spese hanno cambiato categoria
          </span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>
            Riapplicate le regole a tutte le uscite, comprese quelle già categorizzate. Le assegnazioni fatte a
            mano non sono state toccate.
            {Number(sp.svuotate) > 0 && (
              <> {sp.svuotate} sono rimaste senza categoria: la regola che le teneva lì non esiste più.</>
            )}
          </p>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Uscite del periodo</div>
          <div className="kpi-value neg">{euro(totale)}</div>
          <div className="kpi-sub">{tutte.length} movimenti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Categorizzato</div>
          <div className="kpi-value" style={{ color: pctCopertura >= 90 ? "var(--green)" : pctCopertura >= 50 ? "var(--gold-strong)" : "var(--red)" }}>
            {pct1(pctCopertura)}
          </div>
          <div className="kpi-sub">{euro(totaleCat)} su {euro(totale)}</div>
        </div>
        {/* Il numero da classificare è il punto da cui si comincia a lavorare:
            cliccarlo filtra l'elenco, senza passare dalla tendina. Il periodo
            scelto resta quello. */}
        <Link
          href={`/spese?anno=${anno}&dal=${dal}&al=${al}${sp.solo === "senza" ? "" : "&solo=senza"}`}
          className="kpi"
          style={{ textDecoration: "none", color: "inherit", cursor: "pointer", outline: sp.solo === "senza" ? "2px solid var(--red)" : undefined }}
          title={sp.solo === "senza" ? "Torna a tutte le uscite" : "Mostra solo le uscite senza categoria"}
        >
          <div className="kpi-label">Ancora da classificare</div>
          <div className={`kpi-value ${senzaCat > 0 ? "neg" : "pos"}`}>{senzaCat}</div>
          <div className="kpi-sub" style={{ color: "var(--blue)" }}>
            {sp.solo === "senza" ? "◂ mostra tutte le uscite" : "movimenti senza categoria — clicca per vederli"}
          </div>
        </Link>
      </div>

      {perTipo.length > 0 && (
        <>
          <h2 className="section-title">Dove finisce nel conto economico</h2>
          <div className="card tight" style={{ marginBottom: 16 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Voce di P&amp;L</th><th className="num">Uscite</th><th className="num">Quota</th></tr>
                </thead>
                <tbody>
                  {/* Ogni voce si apre: il clic filtra l'elenco dei movimenti
                      qui sotto su quella voce di P&L, senza perdere il periodo.
                      Ricliccando la voce già aperta si torna a tutte. */}
                  {perTipo.map(([voce, importo]) => {
                    const attiva = tipo === voce;
                    return (
                      <tr key={voce} style={attiva ? { background: "var(--fill)" } : undefined}>
                        <td>
                          <Link
                            href={conFiltro({ tipo: attiva ? null : voce, solo: null })}
                            title={attiva ? "Torna a tutte le uscite" : `Vedi i movimenti di «${TIPI_PL[voce]?.label ?? voce}»`}
                          >
                            <span className={`badge ${TIPI_PL[voce]?.badge ?? "neutral"}`}>
                              <span className="dot" />{TIPI_PL[voce]?.label ?? voce}
                            </span>
                          </Link>
                          {attiva && (
                            <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>
                              ◂ elenco filtrato qui sotto
                            </span>
                          )}
                        </td>
                        <td className="num">{euro(importo)}</td>
                        <td className="num">{totaleCat > 0.005 ? pct1((importo / totaleCat) * 100) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 12, padding: "10px 20px", margin: 0 }}>
              «Fuori dal conto economico» sono banca, tasse e la <strong>quota dei partner</strong>: non vuol dire
              spese da ignorare. La quota in particolare <strong>non è un costo</strong> — sull&apos;ecommerce Deluxy
              fa l&apos;intermediario, il partner che esegue documenta la vendita, e nei ricavi c&apos;è già solo la
              parte che resta a noi. Contarla anche fra i costi toglierebbe due volte lo stesso denaro.
            </p>
          </div>
        </>
      )}

      {manuali.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 16, borderColor: "var(--gold)" }}>
          <strong>
            {manuali.length} {manuali.length === 1 ? "movimento assegnato" : "movimenti assegnati"} a mano
            {" "}({euro(manualiImporto)}): nessuna regola {manuali.length === 1 ? "la" : "le"} rifarà.
          </strong>{" "}
          Valgono anche in bilancio — il conto economico legge questa pagina — ed è proprio per questo che
          «Riclassifica tutto» <strong>non le tocca</strong>: una persona che decide batte una regola. Il rovescio
          è che se una di queste è sbagliata resta sbagliata finché non la si guarda: nessuna passata automatica
          ci ripasserà sopra.
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Per farla valere anche sui movimenti futuri di quella controparte serve la regola in Budgets. Ma
            attenzione a cosa si trasforma in regola: una regola nomina la <em>controparte</em>, quindi vale per
            tutti i suoi movimenti. Su un circuito di pagamento — PayPal, SumUp, Satispay — sarebbe sbagliata:
            dice <em>come</em> hai pagato, non <em>cosa</em> hai comprato.
          </div>
        </div>
      )}

      {perCategoria.length > 0 && (
        <>
          <h2 className="section-title">Per categoria</h2>
          <div className="card tight" style={{ marginBottom: 16 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Categoria</th><th>Voce di P&amp;L</th><th>In bilancio</th><th className="num">Movimenti</th><th className="num">Uscite</th></tr>
                </thead>
                <tbody>
                  {perCategoria.map((c) => {
                    // La scheda della categoria come la tiene Budgets: cosa ci va
                    // dentro, dove finisce in bilancio, e soprattutto se è una
                    // **partita di giro**. Il nome da solo fa indovinare, e qui
                    // davanti ai movimenti è dove si assegna a mano.
                    const b = categorie.find((x) => x.nome === c.nome);
                    const idCat = b?.id ?? c.id ?? null;
                    const attiva = !!idCat && sp.cat === idCat;
                    return (
                      <tr key={c.nome} style={attiva ? { background: "var(--fill)" } : undefined}>
                        <td style={{ fontWeight: 500 }}>
                          {idCat ? (
                            <Link
                              href={conFiltro({ cat: attiva ? null : idCat, solo: null })}
                              title={attiva ? "Torna a tutte le uscite" : `Vedi i ${c.n} movimenti di «${c.nome}»`}
                            >
                              {c.nome}
                            </Link>
                          ) : (
                            c.nome
                          )}
                          {attiva && (
                            <span className="muted" style={{ fontSize: 11.5, marginLeft: 8, fontWeight: 400 }}>
                              ◂ elenco filtrato qui sotto
                            </span>
                          )}
                          {b?.quotaPartner && (
                            <span className="badge gold" style={{ marginLeft: 8 }}>
                              <span className="dot" />partita di giro
                            </span>
                          )}
                          {b?.descrizione && (
                            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 400, marginTop: 2, maxWidth: 460 }}>
                              {b.descrizione}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{TIPI_PL[c.tipoPL]?.label ?? c.tipoPL}</td>
                        <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                          {b?.voceCE ?? (
                            <span title="Nessuno l'ha ancora decisa in Budgets: vale quella dedotta dalla voce di P&L">dedotta</span>
                          )}
                        </td>
                        <td className="num">{c.n}</td>
                        <td className="num">{euro(c.importo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        {/* Le scorciatoie di periodo (Libro v1.9 §8-bis): qui il periodo vive
            GIÀ in anno+dal/al — le chips scrivono gli stessi tre parametri
            (una fonte sola), sulla DATA del movimento bancario. «Mese scorso»
            a gennaio scavalla sull'anno prima; il trimestre invece si stringe
            al perimetro dell'anno (tre parametri non possono scavallare).
            Sono FUORI dal form: il submit riscrive anno/dal/al dai campi. */}
        {(() => {
          const oggiChip = new Date();
          const mC = oggiChip.getMonth() + 1;
          const annoC = oggiChip.getFullYear();
          const chips = [
            { l: "Mese in corso", a: annoC, d: mC, f: mC },
            mC === 1
              ? { l: "Mese scorso", a: annoC - 1, d: 12, f: 12 }
              : { l: "Mese scorso", a: annoC, d: mC - 1, f: mC - 1 },
            { l: "Trimestre", a: annoC, d: Math.max(1, mC - 2), f: mC },
            { l: "Anno", a: annoC, d: 1, f: 12 },
          ];
          const linkChip = (c: (typeof chips)[number]) => {
            const p = new URLSearchParams({ anno: String(c.a), dal: String(c.d), al: String(c.f) });
            if (q) p.set("q", q);
            if (sp.cat) p.set("cat", sp.cat);
            if (tipo) p.set("tipo", tipo);
            if (sp.solo) p.set("solo", sp.solo);
            return `/spese?${p.toString()}`;
          };
          return (
            <div className="filters riga-chips-scorri" style={{ marginBottom: 10 }}>
              {chips.map((c) => (
                <Link
                  key={c.l}
                  href={linkChip(c)}
                  className={`chip-link${anno === c.a && dal === c.d && al === c.f ? " attiva" : ""}`}
                >
                  {c.l}
                </Link>
              ))}
            </div>
          );
        })()}
        <form className="filters" method="get">
          {/* La ricerca (Libro v1.9 §8-bis): la controparte o la causale. */}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Cerca per controparte o causale…"
          />
          {/* I campi vivono dietro «Filtri (N)» sotto la soglia mobile (Libro
              v1.2 §8): N conta solo i filtri fuori dal loro default. */}
          <ZonaFiltri
            attivi={
              (anno !== ANNO_CORRENTE ? 1 : 0) +
              (dal !== 1 || al !== 12 ? 1 : 0) +
              [sp.cat, tipo, sp.solo].filter(Boolean).length
            }
          >
          <input type="number" name="anno" defaultValue={anno} style={{ width: 90 }} aria-label="Anno" />
          <select name="dal" defaultValue={dal} aria-label="Dal mese">
            {MESI.map((m, i) => <option key={m} value={i + 1}>da {m}</option>)}
          </select>
          <select name="al" defaultValue={al} aria-label="Al mese">
            {MESI.map((m, i) => <option key={m} value={i + 1}>a {m}</option>)}
          </select>
          <select name="cat" defaultValue={sp.cat ?? ""}>
            <option value="">Tutte le categorie</option>
            {[...categorie]
              .sort((a, b) => a.nome.localeCompare(b.nome, "it", { sensitivity: "base" }))
              .map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select name="tipo" defaultValue={tipo ?? ""} aria-label="Voce di conto economico">
            <option value="">Tutte le voci di P&amp;L</option>
            {Object.entries(TIPI_PL).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select name="solo" defaultValue={sp.solo ?? ""}>
            <option value="">Tutte le uscite</option>
            <option value="senza">Solo senza categoria</option>
            <option value="ai">Solo assegnate dall&apos;AI (da rivedere)</option>
          </select>
          </ZonaFiltri>
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      {/* Quando l'elenco è filtrato lo si dice DOVE si guarda: un totale in
          cima calcolato su tutto il periodo, sopra una lista che mostra una
          fetta sola, altrimenti si legge come se i due numeri parlassero della
          stessa cosa. */}
      {(sp.cat || tipo || sp.solo || q) && uscite.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 12, borderLeft: "3px solid var(--blue)", fontSize: 13 }}>
          Elenco filtrato:{" "}
          <strong>
            {sp.solo === "senza"
              ? "solo le uscite senza categoria"
              : sp.solo === "ai"
                ? "solo le uscite assegnate dall'AI"
                : [
                    sp.cat ? `categoria «${categorie.find((c) => c.id === sp.cat)?.nome ?? sp.cat}»` : null,
                    tipo ? `voce di P&L «${TIPI_PL[tipo]?.label ?? tipo}»` : null,
                    q ? `ricerca «${q}»` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
          </strong>{" "}
          — {uscite.length} {uscite.length === 1 ? "movimento" : "movimenti"} su {tutte.length} del periodo.{" "}
          <Link href={conFiltro({ cat: null, tipo: null, solo: null, q: null })} style={{ fontWeight: 600 }}>
            Mostra tutte →
          </Link>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            I totali e le tabelle qui sopra restano calcolati su <strong>tutto</strong> il periodo, non sul filtro.
          </div>
        </div>
      )}

      <div className="card tight">
        {uscite.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessuna uscita</div>
            <div className="empty-text">
              Cambia i filtri, oppure importa i movimenti in <Link href="/transazioni" style={{ color: "var(--blue)" }}>Import transazioni</Link>.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th><th>Movimento</th><th className="num">Importo</th><th>Categoria</th><th>Assegnata da</th>
                </tr>
              </thead>
              <tbody>
                {uscite.map((t) => (
                  // «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la
                  // riga apre la scheda del movimento; la tendina della
                  // categoria resta sua.
                  <RigaLink key={t.id} href={`/spese/${t.id}`} className="riga-link">
                    <td style={{ whiteSpace: "nowrap" }}>{dataIt(t.data)}</td>
                    {/* La causale qui è troncata per forza: il movimento intero
                        — causale completa, IBAN, file di provenienza, storia
                        della controparte — sta nella sua scheda. */}
                    <td style={{ maxWidth: 380 }}>
                      <Link href={`/spese/${t.id}`} style={{ fontWeight: 500, fontSize: 13 }} title="Apri il movimento">
                        {t.controparte ?? t.descrizione.slice(0, 40) ?? "—"}
                      </Link>
                      <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.descrizione}
                      </div>
                    </td>
                    <td className="num neg">{euro(Math.abs(t.importo))}</td>
                    <td>
                      {categorie.length > 0 ? (
                        <CategoriaSpesa
                          valore={t.categoriaId ?? ""}
                          categorie={categorie}
                          azione={impostaCategoriaSpesa.bind(null, t.id)}
                        />
                      ) : (
                        <span className="muted" style={{ fontSize: 12.5 }}>{t.categoriaNome ?? "—"}</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {t.categoriaDa === "manuale" ? (
                        <span className="badge green"><span className="dot" />a mano</span>
                      ) : t.categoriaDa === "regola" ? (
                        <span className="badge neutral"><span className="dot" />regola</span>
                      ) : t.categoriaDa === "ai" ? (
                        <>
                          <span className="badge purple" title={t.categoriaNota ?? undefined}><span className="dot" />AI</span>
                          {t.categoriaNota && (
                            <div className="muted" style={{ fontSize: 11, marginTop: 3, maxWidth: 200 }}>{t.categoriaNota}</div>
                          )}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </RigaLink>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {uscite.length === 400 && (
          <p className="muted" style={{ fontSize: 12, padding: "10px 20px", margin: 0 }}>
            Mostrate le 400 uscite più recenti del periodo. I totali qui sopra sono calcolati su tutte.
          </p>
        )}
      </div>
    </>
  );
}
