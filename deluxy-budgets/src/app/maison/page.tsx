import { Fragment } from "react";
import Link from "next/link";
import {
  ANNO_CORRENTE, caricaAnno, LIVELLI, moltiplicatore, totaliMaison, venditeMese, type Livello,
} from "@/lib/calc";
import { caricaVenduto, sommaMesi } from "@/lib/venduto";
import { eur, MESI, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MaisonIndex({
  searchParams,
}: {
  searchParams: Promise<{ livello?: string }>;
}) {
  const sp = await searchParams;
  const dati = await caricaAnno(ANNO_CORRENTE);
  const livello = (LIVELLI.some((l) => l.key === sp.livello) ? sp.livello : "RAGGIUNGIBILE") as Livello;
  const molt = moltiplicatore(dati, livello);

  // ---- Avanzamento: solo i mesi CHIUSI ----
  // Il mese in corso resta fuori da questo confronto: mezzo mese di vendite
  // contro un mese intero di budget farebbe sembrare in ritardo un brand che
  // non lo è. Il mese in corso si guarda in /venduto, che è al giorno.
  const oggi = new Date();
  const meseInCorso = oggi.getUTCFullYear() === ANNO_CORRENTE ? oggi.getUTCMonth() + 1 : 13;
  const mesiChiusi = Array.from({ length: Math.max(0, meseInCorso - 1) }, (_, i) => i + 1);

  // Il consuntivo **per maison** esiste solo per l'ecommerce: il fatturato di
  // Finance è per tipologia di servizio (consegne, eventi, B2B) e non si può
  // ripartire per brand senza inventare una chiave di riparto. Quindi qui si
  // confronta il venduto dei negozi col budget **D2C**, che è scritto sulla
  // stessa base (prezzo pieno, IVA inclusa), e lo si dichiara.
  const vend = mesiChiusi.length > 0 ? await caricaVenduto(dati.year, dati.maisons) : null;

  const righe = dati.maisons.map((m) => {
    const t = totaliMaison(m);
    const mesi = m.mesi.map((x) => venditeMese(x) * molt);
    const perCanale = dati.tipologie.map((tip) => ({
      tip,
      mesi: m.mesi.map((x) => (x.vendite[tip.slug] ?? 0) * molt),
      totale: (t.perServizio[tip.slug] ?? 0) * molt,
    }));
    const budgetD2C = sommaMesi(
      m.mesi.map((x) => x.vendite.D2C ?? 0),
      mesiChiusi
    );
    const vendutoReale = vend?.ok ? sommaMesi(vend.perMaison.get(m.slug), mesiChiusi) : null;
    // Il venduto vero, **mese per mese**, per la riga blu sotto il D2C. `null`
    // dove il brand un negozio non ce l'ha: una riga di zeri sembrerebbe un
    // crollo, e Business ed Experience non vendono online.
    const vendutoMesi = vend?.ok ? vend.perMaison.get(m.slug) ?? null : null;
    return { m, t, mesi, perCanale, budgetD2C, vendutoReale, vendutoMesi };
  });

  const totMesi = Array(12).fill(0) as number[];
  for (const r of righe) r.mesi.forEach((v, i) => { totMesi[i] += v; });
  const totAnno = totMesi.reduce((s, v) => s + v, 0);

  // Il venduto vero d'azienda, mese per mese: la riga sotto il totale. Somma
  // solo i brand che un negozio ce l'hanno — gli altri non sono a zero, non
  // sono misurati, ed è la stessa distinzione che fa la riga per brand.
  const totVendutoMesi = Array(12).fill(0) as number[];
  let qualcunoMisurato = false;
  for (const r of righe) {
    if (!r.vendutoMesi) continue;
    qualcunoMisurato = true;
    r.vendutoMesi.forEach((v, i) => { totVendutoMesi[i] += v; });
  }
  // Un mese si mostra solo se è **chiuso**: il mese in corso è mezzo mese di
  // vendite contro un mese intero di budget, e affiancarli farebbe sembrare in
  // ritardo un brand che non lo è. Vale per la riga del brand e per il totale.
  const chiuso = (i: number) => mesiChiusi.includes(i + 1);
  // «Attuale»: i mesi chiusi per quello che è successo davvero, quelli che
  // restano per quello che è a budget. È la riga che risponde a «dove si
  // chiude», ed è la stessa che c'è già dentro la scheda di ogni maison.
  const attuale = (budgetMesi: number[], vendutoMesi: number[] | null) =>
    budgetMesi.reduce((s, b, i) => s + (chiuso(i) && vendutoMesi ? vendutoMesi[i] ?? 0 : b), 0);
  const conEcommerce = righe.filter((r) => r.vendutoReale !== null && (r.vendutoReale > 0 || r.budgetD2C > 0));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Maison</h1>
          <p className="page-caption">
            Budget {dati.year} per brand: quanto vale ogni mese, come si divide fra i canali, e — dove esiste un
            consuntivo per brand — a che punto è. Livello mostrato:{" "}
            {LIVELLI.find((l) => l.key === livello)?.label} (×{molt.toLocaleString("it-IT")}).
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {LIVELLI.map((l) => (
              <Link key={l.key} href={`/maison?livello=${l.key}`} className={l.key === livello ? "on" : ""}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        {righe.map((r) => (
          <Link className="kpi" key={r.m.id} href={`/maison/${r.m.slug}?livello=${livello}`}>
            <div className="kpi-label">{r.m.nome}</div>
            <div className="kpi-value">{eur(r.t.totale * molt)}</div>
            <div className="kpi-sub">
              {dati.tipologie
                .filter((tip) => (r.t.perServizio[tip.slug] ?? 0) > 0)
                .map((tip) => `${tip.nome} ${pct(((r.t.perServizio[tip.slug] ?? 0) / r.t.totale) * 100, 0)}`)
                .join(" · ") || "nessun ricavo a budget"}
            </div>
          </Link>
        ))}
      </div>

      {/* Split mensile per brand e per canale nella STESSA tabella: il totale
          del brand in grassetto, sotto le sue righe per canale. Separarle in due
          tabelle vorrebbe dire scorrere avanti e indietro per rispondere a
          «questo mese chi lo fa e con cosa», che è la domanda vera. */}
      <h2 className="section-title">Mese per mese, brand per brand</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 190 }}>Brand · canale</th>
                {MESI.map((m) => (<th className="num" key={m}>{m}</th>))}
                <th className="num">Anno</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <Fragment key={r.m.id}>
                  <tr style={{ fontWeight: 600 }}>
                    <td>
                      <Link href={`/maison/${r.m.slug}?livello=${livello}`} style={{ color: "var(--blue)" }}>
                        {r.m.nome}
                      </Link>
                    </td>
                    {r.mesi.map((v, i) => (
                      <td className={`num ${v === 0 ? "muted" : ""}`} key={i}>{v === 0 ? "—" : eur(v)}</td>
                    ))}
                    <td className="num">{eur(r.t.totale * molt)}</td>
                  </tr>
                  {r.perCanale
                    .filter((c) => c.totale > 0)
                    .map((c) => (
                      <Fragment key={`${r.m.id}-${c.tip.slug}`}>
                        <tr>
                          <td style={{ paddingLeft: 26, fontSize: 12.5 }}>
                            <span className="muted" style={{ marginRight: 6 }}>↳</span>
                            {c.tip.nome}
                          </td>
                          {c.mesi.map((v, i) => (
                            <td className={`num ${v === 0 ? "muted" : ""}`} key={i} style={{ fontSize: 12.5 }}>
                              {v === 0 ? "—" : eur(v)}
                            </td>
                          ))}
                          <td className="num muted" style={{ fontSize: 12.5 }}>{eur(c.totale)}</td>
                        </tr>
                        {/* **Il consuntivo dei mesi passati**, sotto la riga a
                            cui appartiene. Sta solo sotto il D2C perché per una
                            maison l'unico consuntivo che esiste è il venduto dei
                            negozi: il fatturato di Finance è per tipologia di
                            servizio e ripartirlo per brand vorrebbe dire
                            inventare una chiave di riparto. In blu, perché un
                            numero già successo e uno promesso non devono
                            somigliarsi. */}
                        {c.tip.slug === "D2C" && r.vendutoMesi && (
                          <tr>
                            <td style={{ paddingLeft: 26, fontSize: 12.5, color: "var(--blue)" }}>
                              <span className="muted" style={{ marginRight: 6 }}>↳</span>
                              venduto reale
                            </td>
                            {Array.from({ length: 12 }, (_, i) => (
                              <td
                                className={`num ${chiuso(i) ? "" : "muted"}`}
                                key={i}
                                style={{ fontSize: 12.5, color: chiuso(i) ? "var(--blue)" : undefined }}
                              >
                                {chiuso(i) ? eur(r.vendutoMesi![i] ?? 0) : "—"}
                              </td>
                            ))}
                            <td className="num" style={{ fontSize: 12.5, color: "var(--blue)" }}>
                              {eur(r.vendutoReale ?? 0)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  {/* Dove si chiude: mesi chiusi per quello che è successo,
                      mesi che restano per quello che è a budget. */}
                  {r.vendutoMesi && mesiChiusi.length > 0 && (
                    <tr>
                      <td style={{ paddingLeft: 26, fontSize: 12.5 }} className="muted">
                        Attuale — consuntivo + budget
                      </td>
                      {r.mesi.map((v, i) => (
                        <td className="num muted" key={i} style={{ fontSize: 12.5 }}>
                          {chiuso(i) ? eur(r.vendutoMesi![i] ?? 0) : v === 0 ? "—" : eur(v)}
                        </td>
                      ))}
                      <td className="num" style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {eur(attuale(r.mesi, r.vendutoMesi))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="tot">
                <td>Totale azienda</td>
                {totMesi.map((v, i) => (<td className="num" key={i}>{eur(v)}</td>))}
                <td className="num">{eur(totAnno)}</td>
              </tr>
              {qualcunoMisurato && mesiChiusi.length > 0 && (
                <>
                  <tr>
                    <td style={{ color: "var(--blue)" }}>Venduto reale (solo ecommerce)</td>
                    {Array.from({ length: 12 }, (_, i) => (
                      <td
                        className={`num ${chiuso(i) ? "" : "muted"}`}
                        key={i}
                        style={{ color: chiuso(i) ? "var(--blue)" : undefined }}
                      >
                        {chiuso(i) ? eur(totVendutoMesi[i] ?? 0) : "—"}
                      </td>
                    ))}
                    <td className="num" style={{ color: "var(--blue)" }}>
                      {eur(mesiChiusi.reduce((s, m) => s + (totVendutoMesi[m - 1] ?? 0), 0))}
                    </td>
                  </tr>
                  <tr className="tot">
                    <td>Attuale — consuntivo + budget</td>
                    {totMesi.map((v, i) => (
                      <td className="num" key={i}>{chiuso(i) ? eur(totVendutoMesi[i] ?? 0) : eur(v)}</td>
                    ))}
                    <td className="num">{eur(attuale(totMesi, totVendutoMesi))}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="page-caption" style={{ marginTop: 12 }}>
        Un mese a <strong>—</strong> è un mese <strong>senza budget</strong> su quel canale, non un mese a zero
        vendite. Oggi Deluxy.it non ha budget su nessun canale da gennaio a giugno, mentre gli altri due negozi
        ce l&apos;hanno su tutti e dodici i mesi: è un dato che viene dal foglio di origine e vale la pena
        guardarlo prima di leggere gli scostamenti.
      </p>
      {mesiChiusi.length > 0 && (
        <p className="page-caption" style={{ marginTop: 8 }}>
          Le righe in <strong style={{ color: "var(--blue)" }}>blu</strong> sono <strong>quello che è già
          successo</strong>: il venduto vero dei negozi nei <strong>mesi chiusi</strong> ({MESI[0]}–
          {MESI[mesiChiusi.length - 1]}), sulla stessa base del budget D2C — prezzo pieno pagato dal cliente,
          IVA e spedizione incluse — quindi il confronto è omogeneo. Il <strong>mese in corso resta fuori</strong>:
          mezzo mese di vendite contro un mese intero di budget farebbe sembrare in ritardo un brand che non lo è
          (per quello c&apos;è <Link href="/venduto" style={{ color: "var(--blue)" }}>Venduto</Link>, che è al
          giorno). La riga <strong>Attuale</strong> mette insieme le due cose — mesi chiusi per quello che è
          successo, mesi che restano per quello che è a budget — ed è la risposta a «dove si chiude».
          <br />
          ⚠️ Due limiti, scritti invece che nascosti: nei mesi chiusi <strong>solo il D2C è misurato</strong>{" "}
          (Eventi e B2B restano a budget anche dentro «Attuale», perché per un brand un loro consuntivo non
          esiste — il fatturato di Finance è per tipologia di servizio e non si ripartisce per maison); e i brand
          <strong> senza negozio</strong> (Business, Experience) non hanno nessuna riga blu, perché una riga di
          zeri sembrerebbe un crollo invece di un dato che non c&apos;è.
        </p>
      )}

      {mesiChiusi.length > 0 && (
        <>
          <h2 className="section-title">
            A che punto siamo — {MESI[0]}–{MESI[mesiChiusi.length - 1]} {dati.year}
          </h2>
          {vend?.ok ? (
            <>
              <div className="card tight">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Brand</th>
                        <th className="num">Budget D2C dei mesi chiusi</th>
                        <th className="num">Venduto ecommerce reale</th>
                        <th className="num">Scostamento</th>
                        <th className="num">Realizzato</th>
                        <th>Avanzamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conEcommerce.map((r) => {
                        const reale = r.vendutoReale ?? 0;
                        const scarto = reale - r.budgetD2C;
                        const quota = r.budgetD2C > 0 ? (reale / r.budgetD2C) * 100 : null;
                        return (
                          <tr key={r.m.id}>
                            <td style={{ fontWeight: 500 }}>
                              <Link href={`/maison/${r.m.slug}?livello=${livello}`} style={{ color: "var(--blue)" }}>
                                {r.m.nome}
                              </Link>
                            </td>
                            <td className={`num ${r.budgetD2C === 0 ? "muted" : ""}`}>
                              {r.budgetD2C === 0 ? "nessun budget" : eur(r.budgetD2C)}
                            </td>
                            <td className="num" style={{ fontWeight: 600 }}>{eur(reale)}</td>
                            <td className={`num ${r.budgetD2C === 0 ? "muted" : scarto >= 0 ? "pos" : "neg"}`}>
                              {r.budgetD2C === 0 ? "—" : `${scarto >= 0 ? "+" : ""}${eur(scarto)}`}
                            </td>
                            {/* Senza budget non si calcola una percentuale:
                                dividere per zero darebbe «infinito», e mostrarlo
                                come 0% direbbe che il brand è fermo mentre sta
                                vendendo. */}
                            <td className="num" style={{ fontWeight: 600 }}>
                              {quota === null ? <span className="muted">—</span> : pct(quota, 0)}
                            </td>
                            <td style={{ minWidth: 140 }}>
                              {quota === null ? (
                                <span className="muted" style={{ fontSize: 12 }}>non confrontabile</span>
                              ) : (
                                <div style={{ background: "var(--hairline, rgba(0,0,0,.08))", borderRadius: 999, height: 8, overflow: "hidden" }}>
                                  <div
                                    style={{
                                      width: `${Math.min(100, quota)}%`,
                                      height: "100%",
                                      background: quota >= 100 ? "var(--green)" : quota >= 80 ? "var(--gold)" : "var(--red)",
                                    }}
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="page-caption" style={{ marginTop: 12 }}>
                <strong>Questo confronto è solo l&apos;ecommerce</strong>, e non per scelta: il consuntivo per
                brand esiste soltanto per i negozi Shopify (registro ordini). Il fatturato di Finance è per{" "}
                <strong>tipologia di servizio</strong> — consegne, eventi, B2B — e non si può ripartire per maison
                senza inventarsi una chiave di riparto, quindi <strong>eventi e B2B di ogni brand qui non ci
                sono</strong>. Le due colonne sono però sulla stessa base: prezzo pieno pagato dal cliente, IVA e
                spedizione incluse, come è scritto il budget D2C. Il mese in corso resta fuori — mezzo mese di
                vendite contro un mese intero di budget farebbe sembrare in ritardo chi non lo è; per quello c&apos;è{" "}
                <Link href="/venduto" style={{ color: "var(--blue)" }}>Venduto</Link>, che arriva a oggi.
              </p>
              <p className="page-caption">
                Le maison senza negozio — Business B2B ed Experience — non compaiono in questa tabella: per loro
                non esiste nessun consuntivo per brand, e una riga a zero sembrerebbe un crollo invece di un dato
                che non c&apos;è.
              </p>
            </>
          ) : (
            <div className="card" style={{ borderColor: "var(--orange)" }}>
              <strong>Venduto ecommerce non disponibile.</strong>{" "}
              {vend?.errore || "Il registro ordini non ha risposto."} L&apos;avanzamento per brand si calcola solo
              da lì.
            </div>
          )}
        </>
      )}
    </>
  );
}
