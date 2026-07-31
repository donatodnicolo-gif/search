import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { MESI } from "@/lib/calc";
import { ANNO_CORRENTE } from "@/lib/queries";
import { categorieDaBudgets, budgetsConfigurato, TIPI_PL } from "@/lib/categorie-spesa";
import { impostaCategoriaSpesa, applicaRegoleCategorie, proponiCategorieAI } from "@/lib/spese-actions";
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
  searchParams: Promise<{ anno?: string; dal?: string; al?: string; cat?: string; solo?: string; errore?: string; applicate?: string; restano?: string; ai?: string; saltate?: string }>;
}) {
  const sp = await searchParams;
  const anno = parseInt(sp.anno ?? "") || ANNO_CORRENTE;
  const dal = Math.min(12, Math.max(1, parseInt(sp.dal ?? "1") || 1));
  const al = Math.min(12, Math.max(dal, parseInt(sp.al ?? "12") || 12));
  const inizio = new Date(Date.UTC(anno, dal - 1, 1));
  const fine = new Date(Date.UTC(anno, al, 1));

  const esitoCat = await categorieDaBudgets();
  const categorie = esitoCat.ok ? esitoCat.categorie : [];

  const uscite = await prisma.transazioneBancaria.findMany({
    where: {
      importo: { lt: 0 },
      data: { gte: inizio, lt: fine },
      stato: { not: "ignorata" },
      ...(sp.solo === "senza" ? { categoriaId: null } : {}),
      ...(sp.solo === "ai" ? { categoriaDa: "ai" } : {}),
      ...(sp.cat ? { categoriaId: sp.cat } : {}),
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

  // ⚠️ **Un'assegnazione fatta a mano qui non arriva al conto economico.**
  // Budgets non legge la categoria salvata sul movimento: ricalcola tutto dalle
  // proprie regole a ogni caricamento. Quindi la tendina qui sotto cambia
  // questa pagina e basta — il bilancio continua a leggere quella controparte
  // come dice la regola. Finché sono poche non è un dramma, ma devono
  // **vedersi**: una divergenza silenziosa fra due app che mostrano lo stesso
  // numero è il modo peggiore di sbagliare.
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
            <strong>Quello che decide il bilancio sono le regole</strong>, non la categoria salvata su questa
            pagina: Budgets non legge quest&apos;ultima, ricalcola tutto dalle proprie regole a ogni caricamento.
            Il bottone qui accanto serve proprio a rifare la fotografia quando in Budgets ne nasce una nuova.
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
        <div className="kpi">
          <div className="kpi-label">Ancora da classificare</div>
          <div className={`kpi-value ${senzaCat > 0 ? "neg" : "pos"}`}>{senzaCat}</div>
          <div className="kpi-sub">movimenti senza categoria</div>
        </div>
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
            {" "}({euro(manualiImporto)}): {manuali.length === 1 ? "sta" : "stanno"} solo qui.
          </strong>{" "}
          Budgets non legge la categoria salvata sul movimento — ricalcola tutto dalle proprie regole — quindi
          nel <strong>conto economico quel denaro resta dov&apos;era</strong>. Per farlo valere anche lì va
          creata la regola in Budgets (CFO, o l&apos;assegnazione rapida dal dettaglio di una voce): lì diventa
          permanente e da lì torna anche qui col bottone «Applica le regole».
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Attenzione a cosa si trasforma in regola: una regola nomina la <em>controparte</em>, quindi vale per
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
