import Link from "next/link";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { STATI_ORDINE, CATEGORIE_PAG, GESTIONI, BRAND_ORDINI_PARTNER, valutaQuota } from "@/lib/ordini";
import { quotaFornitore } from "@/lib/ordini-config";
import {
  sincronizzaOrdini,
  riconciliaPerNumero,
  cercaMovimentiIncasso,
  riconciliaDaModale,
  segnaOrdineIncassato,
  ignoraOrdine,
  riapriOrdine,
  impostaGestioneOrdine,
} from "@/lib/ordini-actions";
import { RiconciliaModale } from "@/components/RiconciliaModale";
import { ZonaFiltri } from "@/components/ZonaFiltri";
import { BottoneAggiornaOrdini } from "@/components/BottoneAggiornaOrdini";
import { GestioneOrdine } from "@/components/GestioneOrdine";
import { ordersConfigurato } from "@/lib/ordini-registro";

export const dynamic = "force-dynamic";

export default async function OrdiniPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; nuovi?: string; agg?: string; errori?: string; negozio?: string; stato?: string; cat?: string; periodo?: string; auto?: string; diff?: string; amb?: string; costi?: string; fuori?: string; impl?: string }>;
}) {
  const sp = await searchParams;

  // Periodo per KPI ed elenco (giorni; 0 = tutto lo storico). Default 90.
  const giorniPeriodo = sp.periodo != null ? parseInt(sp.periodo) : 90;
  const dalPeriodo = Number.isFinite(giorniPeriodo) && giorniPeriodo > 0 ? new Date(Date.now() - giorniPeriodo * 86400000) : null;
  const wherePeriodo = dalPeriodo ? { data: { gte: dalPeriodo } } : {};
  const whereNegozio = sp.negozio ? { negozioId: sp.negozio } : {};

  const [negozi, ordiniRaw, ordiniPeriodo] = await Promise.all([
    prisma.negozioShopify.findMany({ orderBy: { brand: "asc" } }),
    prisma.ordineShopify.findMany({
      where: {
        ...whereNegozio,
        ...wherePeriodo,
        ...(sp.stato ? { statoRicon: sp.stato } : {}),
        ...(sp.cat ? { categoriaPagamento: sp.cat } : {}),
      },
      orderBy: [{ data: "desc" }],
      take: 400,
    }),
    // TUTTI gli ordini del periodo (per la % di incasso: non limitata ai 400 mostrati)
    prisma.ordineShopify.findMany({
      where: { ...whereNegozio, ...wherePeriodo },
      select: { totale: true, statoRicon: true, categoriaPagamento: true, pagatoFornitore: true },
    }),
  ]);
  const quota = await quotaFornitore();

  // % di incasso — "incassato" = pagato su Shopify: carte PAID (incassato_gateway)
  // subito + bonifici abbinati a un movimento (riconciliato). Gli ordini ignorati
  // sono esclusi dalla base. Match dei bonifici su Qonto/file già importati.
  const INCASSATI = new Set(["riconciliato", "incassato_gateway"]);
  const attivi = ordiniPeriodo.filter((o) => o.statoRicon !== "ignorato");
  const somma = (arr: typeof attivi) => arr.reduce((a, o) => a + o.totale, 0);
  const baseTot = somma(attivi);
  const incassatoTot = somma(attivi.filter((o) => INCASSATI.has(o.statoRicon)));
  const daIncassareTot = baseTot - incassatoTot;
  const pctIncasso = baseTot > 0.005 ? (incassatoTot / baseTot) * 100 : 0;
  const ignoratiN = ordiniPeriodo.length - attivi.length;
  const perCategoria = (["carta", "bonifico", "contrassegno", "altro"] as const).map((cat) => {
    const righe = attivi.filter((o) => o.categoriaPagamento === cat);
    const b = somma(righe);
    const inc = somma(righe.filter((o) => INCASSATI.has(o.statoRicon)));
    return { cat, base: b, incassato: inc, pct: b > 0.005 ? (inc / b) * 100 : 0, n: righe.length };
  }).filter((r) => r.n > 0);
  const pct1 = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

  // Quanto abbiamo PAGATO ai fornitori sugli ordini del periodo, e il margine.
  const conCosto = attivi.filter((o) => o.pagatoFornitore != null);
  const totPagatoFornitori = conCosto.reduce((a, o) => a + (o.pagatoFornitore ?? 0), 0);
  const baseConCosto = conCosto.reduce((a, o) => a + o.totale, 0);
  const margineConCosto = baseConCosto - totPagatoFornitori;
  const pctMargine = baseConCosto > 0.005 ? (margineConCosto / baseConCosto) * 100 : 0;
  const senzaCostoN = attivi.length - conCosto.length;

  // KPI
  const daRic = ordiniRaw.filter((o) => o.statoRicon === "da_riconciliare");
  const bonificoDaRic = daRic.filter((o) => o.categoriaPagamento === "bonifico");
  const gateway = ordiniRaw.filter((o) => o.statoRicon === "incassato_gateway");
  const totOrdini = ordiniRaw.reduce((a, o) => a + o.totale, 0);

  const nomeNegozio = (id: string) => negozi.find((n) => n.id === id)?.brand ?? "—";
  // un negozio è "scaricabile" se ha un token statico O il Client ID/Secret (conia da sé)
  const ultimaSync = negozi
    .map((n) => n.ultimaSync)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  // La sync automatica gira alle 5:30: se l'ultima è più vecchia di 36 ore
  // qualcosa non ha funzionato (chiave, registro giù, cron) e il numero in
  // pagina è vecchio senza dirlo. Meglio scriverlo che lasciarlo indovinare.
  const registroConfigurato = ordersConfigurato();
  const oreDaSync = ultimaSync ? (Date.now() - ultimaSync.getTime()) / 3600000 : null;
  const syncFerma = oreDaSync != null && oreDaSync > 36;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-caption">
            Ordini dal registro centralizzato <strong>Deluxy Orders</strong>, riconciliati con gli incassi: i{" "}
            <strong>bonifici</strong> abbinati ai movimenti Qonto/Vivid, gli ordini a <strong>carta</strong> incassati via gateway.
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <form action={sincronizzaOrdini.bind(null, 90)} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <BottoneAggiornaOrdini attivo={registroConfigurato} />
              <span style={{ fontSize: 12, color: syncFerma ? "var(--orange)" : "var(--text-tertiary)" }}>
                {!registroConfigurato
                  ? "⚠ Registro non configurato (manca ORDERS_API_KEY)"
                  : ultimaSync
                    ? `Ultima: ${dataIt(ultimaSync)}${syncFerma ? ` · ⚠ ferma da ${Math.floor(oreDaSync! / 24)} giorni` : " · sync automatica ogni notte"}`
                    : "Sincronizzazione automatica ogni notte alle 5:30"}
              </span>
            </form>
          {ordiniRaw.length > 0 && (
            <form action={riconciliaPerNumero}>
              <button className="btn secondary" type="submit" title="Abbina in automatico per numero d'ordine in causale: gli accrediti riconciliano l'incasso, gli addebiti impostano il costo pagato al fornitore. Solo match univoci.">
                ⇄ Abbina per numero
              </button>
            </form>
          )}
        </div>
      </div>

      {sp.auto != null && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green" style={{ marginRight: 8 }}>
            <span className="dot" />{sp.auto} incassi riconciliati
          </span>
          <span className="badge purple">
            <span className="dot" />{sp.costi ?? "0"} costi fornitore impostati
          </span>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
            {Number(sp.diff) > 0 && <>{sp.diff} incassi col numero ma importo diverso dal totale: da confermare a mano. </>}
            {Number(sp.fuori) > 0 && <>{sp.fuori} costi <strong>fuori dalla quota attesa</strong> ({quota}%): controllali. </>}
            {Number(sp.impl) > 0 && <>{sp.impl} costi con importo implausibile (&gt;90% o &lt;5% del valore) non scritti. </>}
            {Number(sp.amb) > 0 && <>{sp.amb} ambigui (stesso numero su più ordini/movimenti).</>}
          </p>
        </div>
      )}

      {sp.sync != null && (() => {
        const ko = sp.sync === "ko";
        // «0 nuovi, 0 aggiornati» senza errori vuol dire che era già tutto a
        // posto: scritto così, altrimenti sembra che il bottone non abbia fatto
        // niente ed è il momento in cui si sospetta un guasto che non c'è.
        const nulla = !ko && Number(sp.nuovi) === 0 && Number(sp.agg) === 0;
        return (
          <div
            className="card"
            style={{ padding: 14, marginBottom: 16, borderLeft: `3px solid ${ko ? "var(--red)" : "var(--green)"}` }}
          >
            {ko ? (
              <span className="badge red"><span className="dot" />Aggiornamento non riuscito — nessun ordine scaricato</span>
            ) : nulla ? (
              <span className="badge green"><span className="dot" />Aggiornamento eseguito — erano già tutti allineati</span>
            ) : (
              <span className="badge green"><span className="dot" />Aggiornamento eseguito — {sp.nuovi} nuovi, {sp.agg} aggiornati</span>
            )}
            {sp.errori && (
              <p style={{ fontSize: 13, color: "var(--red)", marginTop: 8 }}>{sp.errori}</p>
            )}
            {ko && (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Gli ordini in elenco sono quelli dell&apos;ultimo aggiornamento riuscito
                {ultimaSync ? ` (${dataIt(ultimaSync)})` : ""}: nessun dato è andato perso.
                Se il messaggio parla di chiave o di header, controlla <code>ORDERS_API_KEY</code> su Vercel.
              </p>
            )}
          </div>
        );
      })()}

      <h2 className="section-title" style={{ marginTop: 0 }}>
        Incasso {dalPeriodo ? `(ultimi ${giorniPeriodo} giorni)` : "(tutto lo storico)"}
        {sp.negozio && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}> · {nomeNegozio(sp.negozio)}</span>}
      </h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="kpi-label">% incassato</div>
            <div className="kpi-value" style={{ color: pctIncasso >= 90 ? "var(--green)" : pctIncasso >= 60 ? "var(--gold-strong)" : "var(--red)" }}>
              {pct1(pctIncasso)}
            </div>
            <div className="kpi-sub">{euro(incassatoTot)} su {euro(baseTot)}</div>
          </div>
          {/* barra incassato / da incassare */}
          <div style={{ flex: "1 1 260px", minWidth: 200 }}>
            <div style={{ height: 14, borderRadius: 7, overflow: "hidden", display: "flex", background: "var(--fill)" }}>
              <div style={{ width: `${Math.min(100, pctIncasso)}%`, background: "var(--green)" }} title={`Incassato ${euro(incassatoTot)}`} />
              <div style={{ flex: 1, background: "rgba(201,52,0,0.35)" }} title={`Da incassare ${euro(daIncassareTot)}`} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
              <span style={{ color: "var(--green)" }}>● Incassato {euro(incassatoTot)}</span>
              <span style={{ color: "var(--orange)" }}>Da incassare {euro(daIncassareTot)} ●</span>
            </div>
          </div>
        </div>

        {perCategoria.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr><th>Per pagamento</th><th className="num">Incassato</th><th className="num">Totale</th><th className="num">% incasso</th></tr>
              </thead>
              <tbody>
                {perCategoria.map((r) => (
                  <tr key={r.cat}>
                    <td>{CATEGORIE_PAG[r.cat] ?? r.cat} <span className="muted">· {r.n}</span></td>
                    <td className="num">{euro(r.incassato)}</td>
                    <td className="num">{euro(r.base)}</td>
                    <td className="num" style={{ fontWeight: 600, color: r.pct >= 90 ? "var(--green)" : r.pct >= 60 ? "var(--gold-strong)" : "var(--red)" }}>{pct1(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          «Incassato» = carte pagate su Shopify + bonifici abbinati a un movimento (Qonto/file importato).
          {ignoratiN > 0 && ` ${ignoratiN} ordini ignorati esclusi dal calcolo.`}
        </p>
      </div>

      {/* Quanto abbiamo PAGATO ai fornitori (uscite) e il margine sugli ordini con costo */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Pagato ai fornitori</h2>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {conCosto.length} ordini con costo registrato{senzaCostoN > 0 ? ` · ${senzaCostoN} ancora senza` : ""}
          </span>
        </div>
        <div className="kpi-grid" style={{ marginTop: 12 }}>
          <div className="kpi">
            <div className="kpi-label">Pagato ai fornitori</div>
            <div className="kpi-value neg">{euro(totPagatoFornitori)}</div>
            <div className="kpi-sub">su {euro(baseConCosto)} di ordini con costo</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Margine (incasso − costo)</div>
            <div className={`kpi-value ${margineConCosto >= 0 ? "pos" : "neg"}`}>{euro(margineConCosto)}</div>
            <div className="kpi-sub" style={{ fontWeight: 600, color: pctMargine >= 30 ? "var(--green)" : pctMargine >= 15 ? "var(--gold-strong)" : "var(--red)" }}>
              margine {pct1(pctMargine)}
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Il costo si registra sulla scheda del singolo ordine (clic sul n° ordine), abbinando il movimento in
          uscita Qonto/file. Il margine è calcolato solo sugli ordini a cui hai già assegnato un costo.
        </p>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Ordini (periodo)</div>
          <div className="kpi-value">{ordiniRaw.length}</div>
          <div className="kpi-sub">{euro(totOrdini)} totale</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bonifici da riconciliare</div>
          <div className={`kpi-value ${bonificoDaRic.length ? "neg" : "pos"}`}>{bonificoDaRic.length}</div>
          <div className="kpi-sub">{euro(bonificoDaRic.reduce((a, o) => a + o.totale, 0))} da abbinare ai movimenti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Incassati via gateway</div>
          <div className="kpi-value">{gateway.length}</div>
          <div className="kpi-sub">{euro(gateway.reduce((a, o) => a + o.totale, 0))} (payout carta)</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          {/* I select vivono dietro «Filtri (N)» sotto la soglia mobile (Libro
              v1.2 §8): il periodo conta solo fuori dal default (90 giorni). */}
          <ZonaFiltri
            attivi={
              (giorniPeriodo !== 90 ? 1 : 0) +
              [sp.negozio, sp.cat, sp.stato].filter(Boolean).length
            }
          >
          <select name="periodo" defaultValue={String(giorniPeriodo)} aria-label="Periodo">
            <option value="30">Ultimi 30 giorni</option>
            <option value="90">Ultimi 90 giorni</option>
            <option value="180">Ultimi 180 giorni</option>
            <option value="365">Ultimo anno</option>
            <option value="0">Tutto lo storico</option>
          </select>
          <select name="negozio" defaultValue={sp.negozio ?? ""}>
            <option value="">Tutti i negozi</option>
            {negozi.map((n) => <option key={n.id} value={n.id}>{n.brand}</option>)}
          </select>
          <select name="cat" defaultValue={sp.cat ?? ""}>
            <option value="">Tutti i pagamenti</option>
            {Object.entries(CATEGORIE_PAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="stato" defaultValue={sp.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {Object.entries(STATI_ORDINE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          </ZonaFiltri>
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        {ordiniRaw.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun ordine</div>
            <div className="empty-text">
              Premi «Aggiorna ordini» o cambia i filtri.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordine</th><th>Negozio</th><th>Data</th><th>Cliente</th>
                  <th>Pagamento</th><th className="num">Totale</th>
                  <th className="num">Pagato al fornitore</th><th className="num">Margine</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ordiniRaw.map((o) => {
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500 }}>
                        <Link href={`/ordini/${o.id}`} style={{ color: "var(--blue)" }} title="Vedi la transazione corrispondente">
                          {o.nome}
                        </Link>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{nomeNegozio(o.negozioId)}</td>
                      <td>{dataIt(o.data)}</td>
                      <td style={{ fontSize: 12.5 }}>{o.clienteNome ?? o.clienteEmail ?? "—"}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {CATEGORIE_PAG[o.categoriaPagamento]}
                        {o.financialStatus ? <div style={{ color: "var(--text-tertiary)" }}>{o.financialStatus}</div> : null}
                      </td>
                      <td className="num">{euro(o.totale)}</td>
                      <td className="num">
                        {o.pagatoFornitore != null ? (
                          (() => {
                            const v = valutaQuota(o.totale, o.pagatoFornitore, quota);
                            const col = v.stato === "buono" ? "var(--green)" : "var(--red)";
                            return (
                              <>
                                {euro(o.pagatoFornitore)}
                                <div style={{ fontSize: 11, color: col, fontWeight: 600 }}
                                  title={v.stato === "buono" ? `Sotto il ${quota}%: buon margine` : `Sopra il ${quota}%: margine basso`}>
                                  {v.pct.toFixed(0)}%{v.stato === "buono" ? " ✓" : " ⚠"}
                                </div>
                              </>
                            );
                          })()
                        ) : (
                          <Link href={`/ordini/${o.id}`} className="badge neutral" title={`Registra quanto hai pagato al fornitore (atteso ~${quota}%)`}>
                            + costo
                          </Link>
                        )}
                      </td>
                      <td className={`num ${o.pagatoFornitore != null ? (o.totale - o.pagatoFornitore >= 0 ? "pos" : "neg") : ""}`}>
                        {o.pagatoFornitore != null ? euro(o.totale - o.pagatoFornitore) : "—"}
                      </td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        {/* Ordini del sito partner: si dichiara COME si incassa,
                            e la riconciliazione bancaria compare solo se ha
                            senso cercare un movimento (pagamento esterno). */}
                        {o.brand === BRAND_ORDINI_PARTNER && (
                          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                            <GestioneOrdine valore={o.gestione} azione={impostaGestioneOrdine.bind(null, o.id)} />
                          </div>
                        )}
                        {!(GESTIONI[o.gestione] ?? GESTIONI.riconciliazione).riconciliabile ? (
                          // Niente azioni: non c'è un movimento da cercare. Se
                          // l'incasso è però già avvenuto sul gateway lo si
                          // dice, altrimenti sembrerebbe un ordine non pagato.
                          o.statoRicon === "da_riconciliare" ? (
                            <span className="muted" style={{ fontSize: 12 }}>Rientra nel conto del partner</span>
                          ) : (
                            <span className={`badge ${STATI_ORDINE[o.statoRicon]?.badge ?? "neutral"}`}>
                              <span className="dot" />{STATI_ORDINE[o.statoRicon]?.label ?? o.statoRicon}
                            </span>
                          )
                        ) : o.statoRicon === "da_riconciliare" ? (
                          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <RiconciliaModale
                              ordineId={o.id}
                              ordineNome={o.nome}
                              totale={o.totale}
                              clienteNome={o.clienteNome ?? o.clienteEmail ?? null}
                              cerca={cercaMovimentiIncasso}
                              riconcilia={riconciliaDaModale}
                            />
                            <form action={segnaOrdineIncassato.bind(null, o.id)} style={{ display: "inline" }}>
                              <button className="btn small secondary" type="submit" title="Segna incassato senza abbinare un movimento">Incassato</button>
                            </form>
                            <form action={ignoraOrdine.bind(null, o.id)} style={{ display: "inline" }}>
                              <button className="btn small secondary" type="submit">Ignora</button>
                            </form>
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {/* anche gli ordini già incassati/carta possono aprire il popup
                                per abbinare (o correggere) un movimento bancario */}
                            <RiconciliaModale
                              ordineId={o.id}
                              ordineNome={o.nome}
                              totale={o.totale}
                              clienteNome={o.clienteNome ?? o.clienteEmail ?? null}
                              cerca={cercaMovimentiIncasso}
                              riconcilia={riconciliaDaModale}
                            />
                            <form action={riapriOrdine.bind(null, o.id)} style={{ display: "inline" }}>
                              <button className="btn small secondary" type="submit">Riapri</button>
                            </form>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
