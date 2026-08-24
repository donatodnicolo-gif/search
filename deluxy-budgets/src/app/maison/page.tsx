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

  // ---- Mesi chiusi, e il mese in corso ----
  // Il confronto «a che punto siamo» resta sui mesi **chiusi**: mezzo mese di
  // vendite contro un mese intero di budget farebbe sembrare in ritardo un
  // brand che non lo è.
  //
  // Il mese in corso però non è più una casella vuota (21/08/2026): il dato
  // c'è — Orders è al giorno — e nasconderlo era la scelta sbagliata, perché
  // proprio nel mese in corso stanno le sorprese. Si mostra **dichiarando che è
  // parziale**, con i giorni passati accanto: un numero parziale spiegato è
  // utile, un numero parziale muto è una trappola.
  const oggi = new Date();
  const meseInCorso = oggi.getUTCFullYear() === ANNO_CORRENTE ? oggi.getUTCMonth() + 1 : 13;
  const mesiChiusi = Array.from({ length: Math.max(0, meseInCorso - 1) }, (_, i) => i + 1);
  const giornoInCorso = oggi.getUTCDate();
  const giorniDelMese = new Date(Date.UTC(ANNO_CORRENTE, meseInCorso, 0)).getUTCDate();
  const cIsInCorso = meseInCorso <= 12;
  const etichettaParziale = cIsInCorso
    ? `${MESI[meseInCorso - 1]} al ${giornoInCorso}: ${giornoInCorso} giorni su ${giorniDelMese}, il mese non è finito`
    : "";

  // Il consuntivo **per maison** esiste solo per l'ecommerce: il fatturato di
  // Finance è per tipologia di servizio (consegne, eventi, B2B) e non si può
  // ripartire per brand senza inventare una chiave di riparto. Quindi qui si
  // confronta il venduto dei negozi col budget **D2C**, che è scritto sulla
  // stessa base (prezzo pieno, IVA inclusa), e lo si dichiara.
  const vend = mesiChiusi.length > 0 || cIsInCorso ? await caricaVenduto(dati.year, dati.maisons) : null;

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
    // Il budget **del solo D2C**, mese per mese e già scalato dal livello: è la
    // parte che il venduto vero sostituisce dentro «Attuale». Le altre linee
    // restano dov'erano.
    const d2cMesi = perCanale.find((c) => c.tip.slug === "D2C")?.mesi ?? (Array(12).fill(0) as number[]);
    // ⚠️ I mesi **chiusi in cui il budget D2C è zero mentre il negozio vendeva**.
    // Non è un brand fermo: è un budget che non è mai stato scritto, e finché
    // c'è il confronto con il venduto **non vuol dire niente** — su Deluxy.it
    // faceva leggere «realizzato 866%», che sembra un trionfo ed è invece un
    // buco (50.000 € di budget su sette mesi contro 432.941 venduti).
    const mesiSenzaBudget = mesiChiusi.filter(
      (mm) => (m.mesi.find((x) => x.month === mm)?.vendite.D2C ?? 0) === 0 && (vendutoMesi?.[mm - 1] ?? 0) > 0
    );
    return { m, t, mesi, perCanale, budgetD2C, vendutoReale, vendutoMesi, d2cMesi, mesiSenzaBudget };
  });

  const totMesi = Array(12).fill(0) as number[];
  const totD2CMesi = Array(12).fill(0) as number[];
  for (const r of righe) {
    r.mesi.forEach((v, i) => { totMesi[i] += v; });
    r.d2cMesi.forEach((v, i) => { totD2CMesi[i] += v; });
  }
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
  const inCorso = (i: number) => i + 1 === meseInCorso;

  // Il mese in corso dentro «Attuale»: **il maggiore fra quello che ha già
  // venduto e quello che era a budget**. Non è una proiezione — non si moltiplica
  // niente per i giorni che mancano — è un dato di fatto: *il mese non può
  // chiudere sotto quello che è già stato venduto*. Sostituire il budget con il
  // parziale direbbe che l'anno si chiude più in basso ogni volta che si guarda
  // la pagina il 2 del mese; tenere il budget quando il parziale l'ha già
  // superato nasconderebbe il contrario. Misurato il 21/08/2026: Deluxyflowers
  // aveva già venduto 35.093 € contro i 19.000 a budget.
  //
  // ⚠️ E già che si tocca: qui il mese chiuso **sostituiva l'intero budget del
  // mese** con il venduto ecommerce, buttando via Eventi e B2B — mentre la
  // didascalia sotto la tabella prometteva il contrario («Eventi e B2B restano a
  // budget anche dentro Attuale») ed è quello che fa la scheda del singolo
  // brand. Due pagine che rispondono alla stessa domanda in due modi: ora il
  // D2C si sostituisce e le altre linee restano, in tutte e due.
  const meseAttuale = (budgetTot: number, budgetD2C: number, venduto: number | null, i: number) => {
    if (venduto === null) return budgetTot;
    const altreLinee = budgetTot - budgetD2C;
    if (chiuso(i)) return venduto + altreLinee;
    if (inCorso(i)) return Math.max(venduto, budgetD2C) + altreLinee;
    return budgetTot;
  };
  // «Attuale»: i mesi chiusi per quello che è successo davvero, quelli che
  // restano per quello che è a budget. È la riga che risponde a «dove si
  // chiude», ed è la stessa che c'è già dentro la scheda di ogni maison.
  const attuale = (budgetMesi: number[], d2cMesi: number[], vendutoMesi: number[] | null) =>
    budgetMesi.reduce(
      (s, b, i) => s + meseAttuale(b, d2cMesi[i] ?? 0, vendutoMesi ? vendutoMesi[i] ?? 0 : null, i),
      0
    );
  // ---- Lo scostamento dal budget, in percentuale ----
  //
  // Va **sotto il numero**, piccolo e in corsivo: è una lettura del numero, non
  // un secondo numero. Scritto della stessa dimensione competerebbe con quello
  // sopra e la riga diventerebbe illeggibile.
  //
  // ⚠️ **Solo sui mesi chiusi.** Sul mese in corso confronterebbe ventiquattro
  // giorni di vendite con un mese intero di budget, e un brand in perfetta
  // salute sembrerebbe a −40%. È la stessa regola già scritta in cima a questa
  // pagina per il confronto «a che punto siamo».
  //
  // ⚠️ E **niente percentuale se il budget di quel mese è zero**: non è −100% né
  // +∞, è che il budget non c'è (i sei mesi vuoti di Deluxy.it).
  const scostamentoPct = (venduto: number, budget: number) =>
    budget > 0 ? ((venduto - budget) / budget) * 100 : null;

  // ⚠️ **Un mese in cui ANCHE UN SOLO brand vende senza budget non è
  // confrontabile a livello d'azienda.** Il totale del budget resta indietro di
  // tutto quello che manca, e la percentuale esce enorme: sul 24/08/2026 la riga
  // d'azienda segnava **+298%, +468%, +391%** su gennaio, febbraio e marzo —
  // non perché l'azienda avesse fatto cinque volte il budget, ma perché nel
  // denominatore mancava Deluxy.it. È lo stesso «866%» di prima, un piano più
  // in alto e quindi più credibile.
  const meseConfrontabile = (i: number) =>
    !righe.some((r) => r.mesiSenzaBudget.includes(i + 1));

  // Il venduto vero fin qui, mese in corso **compreso**: è il totale della riga
  // blu, e deve sommare le sue caselle.
  const vendutoFinQui = (vendutoMesi: number[] | null) =>
    vendutoMesi
      ? vendutoMesi.reduce((s, v, i) => s + (chiuso(i) || inCorso(i) ? v ?? 0 : 0), 0)
      : 0;

  // ⚠️ Il totale d'azienda si fa **sommando le righe**, non rifacendo il conto
  // sugli aggregati. Con il `max` del mese in corso le due cose divergono: sul
  // 23/08/2026 il totale calcolato sui totali dava 78.200 € mentre le cinque
  // righe sopra ne facevano 95.097 — perché il sorpasso di Deluxyflowers
  // (+16.000 sul suo budget) veniva annullato dal ritardo di Deluxy.it invece
  // di sommarcisi. Un totale che non torna con le sue caselle è il modo più
  // veloce per non fidarsi più di una pagina.
  const totAttualeMesi = Array.from({ length: 12 }, (_, i) =>
    righe.reduce(
      (s, r) => s + meseAttuale(r.mesi[i] ?? 0, r.d2cMesi[i] ?? 0, r.vendutoMesi ? r.vendutoMesi[i] ?? 0 : null, i),
      0
    )
  );
  const totAttualeAnno = totAttualeMesi.reduce((s, v) => s + v, 0);
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
                .join(" · ") || "nessun budget di vendita"}
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
                {/* La colonna del mese in corso si marca **una volta sola**, in
                    testa: dentro ci sono un budget di mese intero e un venduto
                    di mezzo mese, e chi legge deve saperlo prima di confrontarli. */}
                {MESI.map((m, i) => (
                  <th className="num" key={m} title={inCorso(i) ? etichettaParziale : undefined}>
                    {m}
                    {inCorso(i) && (
                      <div className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>
                        in corso
                      </div>
                    )}
                  </th>
                ))}
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
                              {cIsInCorso && (
                                <span className="muted" style={{ marginLeft: 6, fontSize: 11.5 }}>
                                  · {MESI[meseInCorso - 1]} al {giornoInCorso}
                                </span>
                              )}
                            </td>
                            {Array.from({ length: 12 }, (_, i) => (
                              <td
                                className={`num ${chiuso(i) || inCorso(i) ? "" : "muted"}`}
                                key={i}
                                title={inCorso(i) ? etichettaParziale : undefined}
                                style={{
                                  fontSize: 12.5,
                                  color: chiuso(i) || inCorso(i) ? "var(--blue)" : undefined,
                                  // Il mese in corso si vede, ma **non si legge
                                  // come gli altri**: è un mese a metà.
                                  fontStyle: inCorso(i) ? "italic" : undefined,
                                  opacity: inCorso(i) ? 0.75 : undefined,
                                }}
                              >
                                {chiuso(i) || inCorso(i) ? eur(r.vendutoMesi![i] ?? 0) : "—"}
                                {chiuso(i) &&
                                  (() => {
                                    const d = scostamentoPct(r.vendutoMesi![i] ?? 0, r.d2cMesi[i] ?? 0);
                                    if (d === null)
                                      return (
                                        <div className="scost muted" title="Nessun budget D2C scritto per questo mese: non c'è niente da cui scostarsi.">
                                          senza budget
                                        </div>
                                      );
                                    return (
                                      <div className={`scost ${d >= 0 ? "pos" : "neg"}`}>
                                        {d >= 0 ? "+" : "−"}{pct(Math.abs(d), 0)}
                                      </div>
                                    );
                                  })()}
                              </td>
                            ))}
                            <td className="num" style={{ fontSize: 12.5, color: "var(--blue)" }}>
                              {eur(vendutoFinQui(r.vendutoMesi))}
                              {/* Sul totale la percentuale si mostra **solo se il
                                  budget copre tutti i mesi chiusi**: con dei mesi
                                  vuoti in mezzo sarebbe la stessa bugia del
                                  «realizzato 866%». */}
                              {(() => {
                                if (r.mesiSenzaBudget.length > 0)
                                  return <div className="scost muted">budget incompleto</div>;
                                const d = scostamentoPct(r.vendutoReale ?? 0, r.budgetD2C);
                                if (d === null) return null;
                                return (
                                  <div className={`scost ${d >= 0 ? "pos" : "neg"}`}>
                                    {d >= 0 ? "+" : "−"}{pct(Math.abs(d), 0)}
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  {/* Dove si chiude: mesi chiusi per quello che è successo,
                      mesi che restano per quello che è a budget. */}
                  {r.vendutoMesi && (mesiChiusi.length > 0 || cIsInCorso) && (
                    <tr>
                      <td style={{ paddingLeft: 26, fontSize: 12.5 }} className="muted">
                        Attuale — consuntivo + budget
                      </td>
                      {r.mesi.map((v, i) => {
                        const val = meseAttuale(v, r.d2cMesi[i] ?? 0, r.vendutoMesi![i] ?? 0, i);
                        // Nel mese in corso si dice **quale dei due** ha vinto:
                        // un numero che a volte è il venduto e a volte il budget,
                        // senza dirlo, è il modo migliore per non fidarsene.
                        const vinceIlVenduto = inCorso(i) && (r.vendutoMesi![i] ?? 0) > v;
                        return (
                          <td
                            className="num muted"
                            key={i}
                            style={{ fontSize: 12.5 }}
                            title={
                              inCorso(i)
                                ? vinceIlVenduto
                                  ? `${MESI[i]} ha già venduto ${eur(r.vendutoMesi![i] ?? 0)}, sopra i ${eur(v)} a budget: il mese non può chiudere più in basso.`
                                  : `${MESI[i]} è in corso: resta il budget (${eur(v)}), perché i ${eur(r.vendutoMesi![i] ?? 0)} venduti finora sono ${giornoInCorso} giorni su ${giorniDelMese}.`
                                : undefined
                            }
                          >
                            {val === 0 ? "—" : eur(val)}
                          </td>
                        );
                      })}
                      <td className="num" style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {eur(attuale(r.mesi, r.d2cMesi, r.vendutoMesi))}
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
              {qualcunoMisurato && (mesiChiusi.length > 0 || cIsInCorso) && (
                <>
                  <tr>
                    <td style={{ color: "var(--blue)" }}>
                      Venduto reale (solo ecommerce)
                      {cIsInCorso && (
                        <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                          · {MESI[meseInCorso - 1]} al {giornoInCorso}
                        </span>
                      )}
                    </td>
                    {Array.from({ length: 12 }, (_, i) => (
                      <td
                        className={`num ${chiuso(i) || inCorso(i) ? "" : "muted"}`}
                        key={i}
                        title={inCorso(i) ? etichettaParziale : undefined}
                        style={{
                          color: chiuso(i) || inCorso(i) ? "var(--blue)" : undefined,
                          fontStyle: inCorso(i) ? "italic" : undefined,
                          opacity: inCorso(i) ? 0.75 : undefined,
                        }}
                      >
                        {chiuso(i) || inCorso(i) ? eur(totVendutoMesi[i] ?? 0) : "—"}
                        {chiuso(i) &&
                          (() => {
                            if (!meseConfrontabile(i))
                              return <div className="scost muted">budget incompleto</div>;
                            const d = scostamentoPct(totVendutoMesi[i] ?? 0, totD2CMesi[i] ?? 0);
                            if (d === null) return <div className="scost muted">senza budget</div>;
                            return (
                              <div className={`scost ${d >= 0 ? "pos" : "neg"}`}>
                                {d >= 0 ? "+" : "−"}{pct(Math.abs(d), 0)}
                              </div>
                            );
                          })()}
                      </td>
                    ))}
                    <td className="num" style={{ color: "var(--blue)" }}>
                      {eur(vendutoFinQui(totVendutoMesi))}
                      {/* ⚠️ Sul totale d'azienda la percentuale si mostra solo se
                          **nessun brand** ha mesi chiusi senza budget: bastano i
                          sei vuoti di Deluxy.it a renderla una bugia, e sarebbe
                          la bugia più credibile di tutte perché è il numero
                          grande in fondo. */}
                      {(() => {
                        if (righe.some((r) => r.mesiSenzaBudget.length > 0))
                          return <div className="scost muted">budget incompleto</div>;
                        const budget = mesiChiusi.reduce((sm, mm) => sm + (totD2CMesi[mm - 1] ?? 0), 0);
                        const venduto = mesiChiusi.reduce((sm, mm) => sm + (totVendutoMesi[mm - 1] ?? 0), 0);
                        const d = scostamentoPct(venduto, budget);
                        if (d === null) return null;
                        return (
                          <div className={`scost ${d >= 0 ? "pos" : "neg"}`}>
                            {d >= 0 ? "+" : "−"}{pct(Math.abs(d), 0)}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                  <tr className="tot">
                    <td>Attuale — consuntivo + budget</td>
                    {totAttualeMesi.map((v, i) => (
                      <td className="num" key={i}>{eur(v)}</td>
                    ))}
                    <td className="num">{eur(totAttualeAnno)}</td>
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
          IVA e spedizione incluse — quindi il confronto è omogeneo. Sotto ogni importo, in piccolo, lo{" "}
          <strong>scostamento dal budget di quel mese</strong>:{" "}
          <span className="scost pos" style={{ display: "inline" }}>+18%</span> vuol dire che il negozio ha
          venduto il 18% più di quanto era previsto. C&apos;è <strong>solo sui mesi chiusi</strong> — sul mese
          in corso confronterebbe mezzo mese di vendite con un mese intero di budget — e sparisce dove il
          budget di quel mese <strong>non è mai stato scritto</strong>, perché lì non c&apos;è niente da cui
          scostarsi.
          {cIsInCorso && (
            <>
              {" "}
              Da qui c&apos;è anche il <strong>mese in corso</strong>, in corsivo e più chiaro: è{" "}
              <strong>{MESI[meseInCorso - 1]} al {giornoInCorso}</strong>, cioè {giornoInCorso} giorni su{" "}
              {giorniDelMese}, e va letto sapendo che <strong>sopra di lui c&apos;è un budget di mese
              intero</strong>. Il confronto «a che punto siamo» qui sotto resta invece sui soli mesi chiusi,
              perché mezzo mese contro un mese intero farebbe sembrare in ritardo un brand che non lo è.
            </>
          )}{" "}
          La riga <strong>Attuale</strong> mette insieme le due cose — mesi chiusi per quello che è
          successo, mesi che restano per quello che è a budget — ed è la risposta a «dove si chiude».
          {cIsInCorso && (
            <>
              {" "}
              Per il mese in corso prende il <strong>maggiore fra il venduto di adesso e il budget</strong>: non
              è una proiezione (non si moltiplica niente per i giorni che mancano), è un dato di fatto — il mese
              non può chiudere sotto quello che ha già venduto. Passando sopra la casella si legge quale dei due
              ha vinto.
            </>
          )}
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
          {/* ⚠️ L'avviso sta **sopra** la tabella, non in fondo: chi guarda
              legge i numeri prima delle note, e questi numeri senza la nota
              raccontano il contrario di quello che è successo. */}
          {conEcommerce.some((r) => r.mesiSenzaBudget.length > 0) && (
            <div
              className="card"
              style={{ borderColor: "var(--orange)", background: "rgba(201,52,0,0.04)", marginBottom: 12 }}
            >
              <strong>Qui il confronto non si può fare: manca il budget, non le vendite.</strong>{" "}
              <span className="muted">
                {conEcommerce
                  .filter((r) => r.mesiSenzaBudget.length > 0)
                  .map(
                    (r) =>
                      `${r.m.nome} ha ${r.mesiSenzaBudget.length} mesi chiusi senza budget D2C (${r.mesiSenzaBudget
                        .map((mm) => MESI[mm - 1])
                        .join(", ")}) e in quei mesi ha venduto ${eur(
                        r.mesiSenzaBudget.reduce((sm, mm) => sm + (r.vendutoMesi?.[mm - 1] ?? 0), 0)
                      )}`
                  )
                  .join("; ")}
                . Il budget di quei mesi <strong>non è mai stato scritto</strong>, quindi «realizzato» e
                «scostamento» restano vuoti invece di mostrare una percentuale che sembrerebbe un record.
              </span>
            </div>
          )}
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
                        // ⚠️ Il confronto vale solo se il budget copre **tutti**
                        // i mesi chiusi. Con dei mesi vuoti in mezzo la
                        // percentuale non è alta: è **priva di senso**, e
                        // mostrarla comunque fa scambiare un buco per un record.
                        const incompleto = r.mesiSenzaBudget.length > 0;
                        const quota = r.budgetD2C > 0 && !incompleto ? (reale / r.budgetD2C) * 100 : null;
                        return (
                          <tr key={r.m.id}>
                            <td style={{ fontWeight: 500 }}>
                              <Link href={`/maison/${r.m.slug}?livello=${livello}`} style={{ color: "var(--blue)" }}>
                                {r.m.nome}
                              </Link>
                            </td>
                            <td className={`num ${r.budgetD2C === 0 ? "muted" : ""}`}>
                              {r.budgetD2C === 0 ? "nessun budget" : eur(r.budgetD2C)}
                              {incompleto && (
                                <div
                                  style={{ fontSize: 11, fontWeight: 400, color: "var(--orange)" }}
                                  title={`Su ${r.mesiSenzaBudget.length} dei ${mesiChiusi.length} mesi chiusi il budget D2C è a zero, ma il negozio ha venduto. Il budget di quei mesi non è mai stato scritto.`}
                                >
                                  manca {r.mesiSenzaBudget.map((mm) => MESI[mm - 1]).join(", ")}
                                </div>
                              )}
                            </td>
                            <td className="num" style={{ fontWeight: 600 }}>{eur(reale)}</td>
                            <td className={`num ${r.budgetD2C === 0 || incompleto ? "muted" : scarto >= 0 ? "pos" : "neg"}`}>
                              {r.budgetD2C === 0 || incompleto ? "—" : `${scarto >= 0 ? "+" : ""}${eur(scarto)}`}
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
                                <span
                                  className="muted"
                                  style={{ fontSize: 12, color: incompleto ? "var(--orange)" : undefined }}
                                >
                                  {incompleto ? "budget da scrivere" : "non confrontabile"}
                                </span>
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
