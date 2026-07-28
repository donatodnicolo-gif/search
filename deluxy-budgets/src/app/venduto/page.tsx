import Link from "next/link";
import { caricaAnno } from "@/lib/calc";
import { eur, MESI, pct } from "@/lib/format";
import { caricaVenduto, fatturatoDaVenduto, sommaMesi } from "@/lib/venduto";
import { misuraQuota } from "@/lib/quota";
import { PERIODI, quota, risolviPeriodo, variazione } from "@/lib/periodo";
import { proietta } from "@/lib/previsione";

export const dynamic = "force-dynamic";

// Slug della tipologia di budget che copre il venduto diretto al consumatore.
const SLUG_D2C = "D2C";

export default async function VendutoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; anno?: string }>;
}) {
  const sp = await searchParams;
  const p = risolviPeriodo(sp);

  // Le maison servono per abbinare i negozi, quindi si caricano prima; le due
  // chiamate a Orders (anno e anno prima) partono poi insieme.
  const dati = await caricaAnno(p.anno);
  const [vend, vendPrec, vendPrecPieno] = await Promise.all([
    p.vuoto ? Promise.resolve(null) : caricaVenduto(p.anno, dati.maisons),
    p.vuoto ? Promise.resolve(null) : caricaVenduto(p.annoPrec, dati.maisons, p.tagliaPrec),
    // L'anno prima **intero**, non tagliato: serve come base dei mesi che
    // mancano nella previsione. Se `tagliaPrec` non c'è, è la stessa chiamata e
    // la si riusa invece di rifarla.
    p.vuoto || !p.tagliaPrec
      ? Promise.resolve(null)
      : caricaVenduto(p.annoPrec, dati.maisons),
  ]);

  // La quota che resta a Deluxy si misura sui pagamenti ai partner dell'anno
  // guardato, non si decide a tavolino.
  const quotaDeluxy = await misuraQuota(p.anno, p.mesiPeriodo, vend?.mese ?? []);
  const totale = vend ? sommaMesi(vend.mese, p.mesiPeriodo) : 0;
  const totalePrec = vendPrec?.ok ? sommaMesi(vendPrec.mese, p.mesiRif) : null;

  const budgetMaison = (slug: string) =>
    dati.maisons
      .filter((m) => m.slug === slug)
      .reduce((s, m) => s + p.mesiRif.reduce((a, mm) => a + (m.mesi.find((y) => y.month === mm)?.vendite[SLUG_D2C] ?? 0), 0), 0);
  const budgetTotale = dati.maisons.reduce((s, m) => s + budgetMaison(m.slug), 0);

  const link = (x: { periodo?: string; anno?: number }) =>
    `/venduto?periodo=${x.periodo ?? p.periodo.key}&anno=${x.anno ?? p.anno}`;

  const intestaPrec = p.periodo.annoIntero ? `Tutto il ${p.annoPrec}` : `${p.etichettaPeriodo} ${p.annoPrec}`;
  const intestaVar = p.periodo.annoIntero ? `% del ${p.annoPrec}` : "Var. anno prec.";
  const cellaConfronto = (ora: number, prima: number | null) => {
    if (p.periodo.annoIntero) {
      const q = quota(ora, prima);
      return q === null ? <span className="muted">—</span> : <span className="muted">{pct(q, 0)}</span>;
    }
    const v = variazione(ora, prima);
    if (v === null) return <span className="muted">—</span>;
    return <span className={v >= 0 ? "pos" : "neg"}>{v >= 0 ? "+" : ""}{pct(v, 0)}</span>;
  };

  // Previsione: ha senso solo su un periodo che parte da gennaio e arriva a
  // oggi (YTD o «Anno»). Su un trimestre passato non c'è niente da prevedere.
  const daInizioAnno = p.dal === 1 && p.anno === p.annoInCorso && p.al === p.meseLimite;
  const basePiena = vendPrecPieno?.ok ? vendPrecPieno : vendPrec;
  const previsione =
    daInizioAnno && vend?.ok && basePiena?.ok
      ? proietta(vend.mese, basePiena.mese, p.mesiPeriodo, totalePrec ?? 0)
      : null;
  const budgetAnno = dati.maisons.reduce(
    (s, m) => s + m.mesi.reduce((a, y) => a + (y.vendite[SLUG_D2C] ?? 0), 0),
    0
  );

  const righe = dati.maisons
    .map((m) => ({
      slug: m.slug,
      nome: m.nome,
      mesi: vend?.perMaison.get(m.slug) ?? (Array(12).fill(0) as number[]),
      cons: sommaMesi(vend?.perMaison.get(m.slug), p.mesiPeriodo),
      prec: vendPrec?.ok ? sommaMesi(vendPrec.perMaison.get(m.slug), p.mesiRif) : null,
      budget: budgetMaison(m.slug),
    }))
    .filter((r) => r.cons > 0 || r.budget > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Venduto</h1>
          <p className="page-caption">
            Quanto è passato dalla cassa dei negozi Shopify: il <strong>prezzo pieno pagato dal cliente</strong>, IVA e
            spedizione incluse. Non è il fatturato di Deluxy — da qui vanno tolte le detrazioni dei partner che
            eseguono l&apos;ordine. Il fatturato sta in{" "}
            <Link href="/consuntivo" style={{ color: "var(--blue)" }}>Fatturato reale</Link>.
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {p.ANNI.map((y) => (
              <Link key={y} href={link({ anno: y })} className={y === p.anno ? "on" : ""}>{y}</Link>
            ))}
          </div>
          <div className="seg">
            {PERIODI.map((x) => (
              <Link key={x.key} href={link({ periodo: x.key })} className={x.key === p.periodo.key ? "on" : ""}>
                {x.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {p.vuoto ? (
        <div className="card empty">
          <div className="empty-icon">◷</div>
          <div className="empty-title">Nessun mese di questo periodo è ancora cominciato</div>
          <div className="empty-text">
            Per il {p.anno} il venduto arriva a {p.ultimoMese}. Scegli un periodo o un anno precedente.
          </div>
        </div>
      ) : !vend?.ok ? (
        <div className="card empty">
          <div className="empty-icon">↯</div>
          <div className="empty-title">{vend?.configurato ? "Orders non disponibile" : "Collega l'app Orders"}</div>
          <div className="empty-text">{vend?.errore}</div>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Venduto — {p.etichettaPeriodo} {p.anno}</div>
              <div className="kpi-value">{eur(totale)}</div>
              <div className="kpi-sub">
                {vend.ordini.toLocaleString("it-IT")} ordini · {vend.negozi} negozi · IVA inclusa
              </div>
              {totalePrec !== null && (
                <div className="kpi-sub">
                  {cellaConfronto(totale, totalePrec)}{" "}
                  {p.periodo.annoIntero ? `di tutto il ${p.annoPrec}` : `sullo stesso periodo ${p.annoPrec}`} (
                  {eur(totalePrec)})
                </div>
              )}
            </div>
            <div className="kpi">
              <div className="kpi-label">Ricavo Deluxy (quota di intermediazione)</div>
              <div className="kpi-value">{eur(fatturatoDaVenduto(totale, quotaDeluxy))}</div>
              <div className="kpi-sub">
                <strong>{quotaDeluxy.percentuale}%</strong> del venduto, {quotaDeluxy.misurata ? "misurato" : "stimato"} — il resto è dei partner
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Budget D2C — {p.etichettaRif}</div>
              <div className="kpi-value">{eur(budgetTotale)}</div>
              <div className="kpi-sub">
                {budgetTotale > 0 ? `${pct((totale / budgetTotale) * 100, 0)} realizzato` : "—"}
              </div>
            </div>
          </div>

          <h2 className="section-title">Venduto per maison</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Maison</th>
                    {p.mesiPeriodo.map((m) => (<th className="num" key={m}>{MESI[m - 1]}</th>))}
                    <th className="num">Venduto</th>
                    <th className="num">{intestaPrec}</th>
                    <th className="num">{intestaVar}</th>
                    <th className="num">Budget D2C</th>
                    <th className="num">Realizzato</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => (
                    <tr key={r.slug}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.nome}</td>
                      {p.mesiPeriodo.map((m) => (<td className="num" key={m}>{eur(r.mesi[m - 1] ?? 0)}</td>))}
                      <td className="num" style={{ fontWeight: 600 }}>{eur(r.cons)}</td>
                      <td className="num muted">{r.prec === null ? "—" : eur(r.prec)}</td>
                      <td className="num">{cellaConfronto(r.cons, r.prec)}</td>
                      <td className="num muted">{eur(r.budget)}</td>
                      <td className="num muted">{r.budget > 0 ? pct((r.cons / r.budget) * 100, 0) : "—"}</td>
                    </tr>
                  ))}
                  {vend.senzaMaison.map((b) => {
                    const cons = sommaMesi(b.mesi, p.mesiPeriodo);
                    return (
                      <tr key={b.brand}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {b.brand}
                          <div className="muted" style={{ fontSize: 11.5 }}>negozio senza maison</div>
                        </td>
                        {p.mesiPeriodo.map((m) => (<td className="num" key={m}>{eur(b.mesi[m - 1] ?? 0)}</td>))}
                        <td className="num" style={{ fontWeight: 600 }}>{eur(cons)}</td>
                        <td className="num muted">—</td>
                        <td className="num muted">—</td>
                        <td className="num muted">—</td>
                        <td className="num muted">—</td>
                      </tr>
                    );
                  })}
                  <tr className="tot">
                    <td>Totale venduto</td>
                    {p.mesiPeriodo.map((m) => (<td className="num" key={m}>{eur(vend.mese[m - 1] ?? 0)}</td>))}
                    <td className="num">{eur(totale)}</td>
                    <td className="num">{totalePrec === null ? "—" : eur(totalePrec)}</td>
                    <td className="num">{cellaConfronto(totale, totalePrec)}</td>
                    <td className="num">{eur(budgetTotale)}</td>
                    <td className="num">{budgetTotale > 0 ? pct((totale / budgetTotale) * 100, 0) : "—"}</td>
                  </tr>
                  <tr>
                    <td className="muted" style={{ whiteSpace: "nowrap", paddingLeft: 26 }}>
                      di cui fatturato Deluxy ({quotaDeluxy.misurata ? "misurata" : "stima"} {quotaDeluxy.percentuale}%)
                    </td>
                    {p.mesiPeriodo.map((m) => (
                      <td className="num muted" key={m}>{eur(fatturatoDaVenduto(vend.mese[m - 1] ?? 0, quotaDeluxy))}</td>
                    ))}
                    <td className="num muted">{eur(fatturatoDaVenduto(totale, quotaDeluxy))}</td>
                    <td className="num muted">{totalePrec === null ? "—" : eur(fatturatoDaVenduto(totalePrec, quotaDeluxy))}</td>
                    <td className="num muted">—</td>
                    <td className="num muted">—</td>
                    <td className="num muted">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p className="page-caption" style={{ marginTop: 12 }}>
            Dal registro ordini{" "}
            <a href="https://deluxy-orders.vercel.app" style={{ color: "var(--blue)" }}>Orders</a>{" "}
            ({vend.ordini.toLocaleString("it-IT")} ordini nel {p.anno}): totale Shopify così com&apos;è, IVA e
            spedizione incluse — la stessa base su cui è scritto il budget D2C.{" "}
            {p.parziale && (
              <>
                <strong>{MESI[p.meseInCorso - 1]} è in corso</strong> ({p.giornoInCorso} giorni su {p.giorniDelMese});
                anche il {p.annoPrec} è tagliato allo stesso giorno, quindi il confronto è esatto.{" "}
              </>
            )}
            {vend.esclusi && vend.esclusi.annullati.ordini > 0 && (
              <>Esclusi {vend.esclusi.annullati.ordini} ordini annullati ({eur(vend.esclusi.annullati.lordo)}). </>
            )}
            {vend.esclusi && vend.esclusi.rimborsati.ordini > 0 && (
              <>Esclusi {vend.esclusi.rimborsati.ordini} rimborsati/stornati ({eur(vend.esclusi.rimborsati.lordo)}). </>
            )}
            {vend.esclusi && vend.esclusi.parzialmenteRimborsati.ordini > 0 && (
              <>
                {vend.esclusi.parzialmenteRimborsati.ordini} ordini rimborsati <em>in parte</em> sono contati per
                intero ({eur(vend.esclusi.parzialmenteRimborsati.lordo)}): Shopify non registra quanto è stato reso,
                quindi il dato si dichiara invece di stimarlo.
              </>
            )}
          </p>

          {previsione && (
            <>
              <h2 className="section-title">Dove si chiude, se il ritmo resta questo</h2>
              {!previsione.ok ? (
                <div className="card">
                  <p className="page-caption" style={{ margin: 0 }}>{previsione.motivo}</p>
                </div>
              ) : (
                <>
                  <div className="kpi-grid">
                    <div className="kpi">
                      <div className="kpi-label">Venduto previsto {p.anno}</div>
                      <div className="kpi-value">{eur(previsione.totale)}</div>
                      <div className="kpi-sub">
                        {eur(previsione.fatto)} fatti + {eur(previsione.restante)} da{" "}
                        {previsione.mesiRestanti.length} mesi
                      </div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Ritmo applicato</div>
                      <div className={`kpi-value ${previsione.crescitaPct >= 0 ? "pos" : "neg"}`}>
                        {previsione.crescitaPct >= 0 ? "+" : ""}{pct(previsione.crescitaPct, 0)}
                      </div>
                      <div className="kpi-sub">crescita misurata sui mesi fatti, sul {p.annoPrec}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Budget D2C {p.anno} (anno intero)</div>
                      <div className="kpi-value">{eur(budgetAnno)}</div>
                      <div className="kpi-sub">
                        {budgetAnno > 0 ? (
                          <>
                            previsione al <strong>{pct((previsione.totale / budgetAnno) * 100, 0)}</strong> del budget
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="card tight">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Mese che manca</th>
                            {previsione.mesiRestanti.map((r) => (
                              <th className="num" key={r.mese}>{MESI[r.mese - 1]}</th>
                            ))}
                            <th className="num">Totale</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="muted" style={{ whiteSpace: "nowrap" }}>Stesso mese {p.annoPrec}</td>
                            {previsione.mesiRestanti.map((r) => (
                              <td className="num muted" key={r.mese}>{eur(r.annoPrec)}</td>
                            ))}
                            <td className="num muted">
                              {eur(previsione.mesiRestanti.reduce((s, r) => s + r.annoPrec, 0))}
                            </td>
                          </tr>
                          <tr className="tot">
                            <td>Previsto</td>
                            {previsione.mesiRestanti.map((r) => (
                              <td className="num" key={r.mese}>{eur(r.stima)}</td>
                            ))}
                            <td className="num">{eur(previsione.restante)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="page-caption" style={{ marginTop: 12 }}>
                    Il conto è: <strong>quanto stiamo crescendo</strong> sui mesi già fatti ({pct(previsione.crescitaPct, 0)}{" "}
                    sul {p.annoPrec}), applicato ai mesi che mancano <strong>così com&apos;erano il {p.annoPrec}</strong>.
                    La stagionalità la mette l&apos;anno scorso, che l&apos;ha già vissuta: una media dei mesi fatti
                    direbbe che dicembre vale come agosto, e qui dicembre vale il doppio.
                    {previsione.mesiBase < previsione.mesiRestanti.length && (
                      <>
                        {" "}<strong>Attenzione</strong>: dei {previsione.mesiRestanti.length} mesi che mancano, solo{" "}
                        {previsione.mesiBase} hanno dati nel {p.annoPrec} — sugli altri la base è zero e la previsione
                        li conta zero, quindi è prudente per difetto.
                      </>
                    )}{" "}
                    Non è un obiettivo e non tiene conto di campagne, aperture o listini nuovi: dice solo dove si va
                    con lo slancio di adesso.
                  </p>
                </>
              )}
            </>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Da venduto a fatturato</h3>
            <p className="page-caption" style={{ margin: 0 }}>
              Sull&apos;ecommerce Deluxy fa l&apos;<strong>intermediario</strong>: il cliente paga il prezzo pieno,
              ma la vendita al consumatore la documenta il partner che esegue l&apos;ordine, e il denaro che gli si
              gira è una <strong>partita di giro</strong>, non un costo. Il ricavo di Deluxy è la quota che resta —{" "}
              <strong>{quotaDeluxy.percentuale}%</strong> — e {quotaDeluxy.spiegazione}.
            </p>
            {!quotaDeluxy.misurata && (
              <p className="page-caption" style={{ marginBottom: 0 }}>
                Perché sia misurata servono due cose: le categorie dei partner marcate{" "}
                <strong>«quota partner»</strong> nel{" "}
                <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>, e una banca che copra gli stessi
                mesi del venduto. Finché ne manca una vale la stima — e questa riga lo dice, invece di far passare
                un numero deciso a tavolino per una misura.
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
