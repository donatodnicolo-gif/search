import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { MESI } from "@/lib/calc";
import { ANNO_CORRENTE } from "@/lib/queries";
import { categorieDaBudgets, budgetsConfigurato, contaRegole, TIPI_PL } from "@/lib/categorie-spesa";
import { impostaCategoriaSpesa, applicaRegoleCategorie, riclassificaTutteLeSpese, proponiCategorieAI } from "@/lib/spese-actions";
import { CategoriaSpesa } from "@/components/CategoriaSpesa";
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
  searchParams: Promise<{ anno?: string; dal?: string; al?: string; cat?: string; solo?: string; errore?: string; applicate?: string; restano?: string; riclassificate?: string; svuotate?: string; ai?: string; saltate?: string }>;
}) {
  const sp = await searchParams;
  const anno = parseInt(sp.anno ?? "") || ANNO_CORRENTE;
  const dal = Math.min(12, Math.max(1, parseInt(sp.dal ?? "1") || 1));
  const al = Math.min(12, Math.max(dal, parseInt(sp.al ?? "12") || 12));
  const inizio = new Date(Date.UTC(anno, dal - 1, 1));
  const fine = new Date(Date.UTC(anno, al, 1));

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
        : sp.cat
          ? { categoriaId: sp.cat }
          : {}),
      ...(sp.solo === "ai" ? { categoriaDa: "ai" } : {}),
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
    const r = m.get(k) ?? { nome: k, tipoPL: t.categoriaTipoPL ?? "STRUTTURA", importo: 0, n: 0 };
    r.importo += Math.abs(t.importo);
    r.n++;
    m.set(k, r);
    return m;
  }, new Map<string, { nome: string; tipoPL: string; importo: number; n: number }>()).values()]
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
                  {perTipo.map(([tipo, importo]) => (
                    <tr key={tipo}>
                      <td>
                        <span className={`badge ${TIPI_PL[tipo]?.badge ?? "neutral"}`}>
                          <span className="dot" />{TIPI_PL[tipo]?.label ?? tipo}
                        </span>
                      </td>
                      <td className="num">{euro(importo)}</td>
                      <td className="num">{totaleCat > 0.005 ? pct1((importo / totaleCat) * 100) : "—"}</td>
                    </tr>
                  ))}
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
                    return (
                      <tr key={c.nome}>
                        <td style={{ fontWeight: 500 }}>
                          {c.nome}
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
        <form className="filters" method="get">
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
          <select name="solo" defaultValue={sp.solo ?? ""}>
            <option value="">Tutte le uscite</option>
            <option value="senza">Solo senza categoria</option>
            <option value="ai">Solo assegnate dall&apos;AI (da rivedere)</option>
          </select>
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

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
                  <tr key={t.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{dataIt(t.data)}</td>
                    <td style={{ maxWidth: 380 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{t.controparte ?? "—"}</div>
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
                  </tr>
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
