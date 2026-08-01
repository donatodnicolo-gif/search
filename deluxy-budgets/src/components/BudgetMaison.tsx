import { Fragment } from "react";
import Link from "next/link";
import { eur, MESI, pct } from "@/lib/format";

// **Il budget di una maison non si digita: si propone e si approva.**
//
// Per qualche ora questa griglia è stata modificabile, ed era la strada
// sbagliata (correzione dell'utente, 31/07/2026): un budget scritto a mano su
// una pagina non ha un autore, non ha una data e non ha un «va bene» di
// nessuno — cioè non si sa più *chi* ha promesso quel numero, che è metà del
// motivo per cui il budget esiste. La strada è quella che c'era già:
// **proposta → approvazione → consolidamento**.
//
// Quello che serviva davvero era **vedere da dove viene ogni casella**. Le
// proposte consolidate dicono esattamente quali (linea, mese) hanno scritto,
// quindi la provenienza si ricostruisce cella per cella: chi l'ha proposta,
// quando è stata approvata. Le caselle senza segno vengono dal file di
// partenza.

export type OrigineCella = { autore: string; propostaId: string; il: string };

const nomeFonte = (key: string, fonti: { key: string; nome: string }[]) =>
  fonti.find((f) => f.key === key)?.nome ?? key;

export function BudgetMaison({
  maison,
  tipologie,
  mesi,
  fonti,
  molt,
  consuntivoD2C,
  origini,
  approvate,
  daConsolidare,
}: {
  maison: string;
  tipologie: { slug: string; nome: string }[];
  mesi: {
    month: number;
    vendite: Record<string, number>;
    perFonte: Record<string, Record<string, number>>;
    advPercent: number;
    advPubblicato: number;
  }[];
  fonti: { key: string; nome: string; aiuto: string }[];
  molt: number;
  // Il venduto ecommerce dei mesi già chiusi (`null` sui mesi non chiusi).
  // È l'unico consuntivo che esiste per una maison.
  consuntivoD2C: (number | null)[];
  // chiave `canale|mese` → chi ha proposto quel numero
  origini: Record<string, OrigineCella>;
  // `inUso` = è l'ultima consolidata **su quella fonte**, cioè quella che si
  // sta leggendo. Le precedenti restano nello storico ma non sono più il
  // budget: fra fonti diverse invece non c'è sostituzione, si sommano.
  approvate: {
    id: string; autore: string; il: string; voci: string; totale: number;
    fonte: string; inUso: boolean; sostituitaDa: string | null;
  }[];
  daConsolidare: { id: string; autore: string; totale: number }[];
}) {
  const valore = (slug: string, i: number) => (mesi[i].vendite[slug] ?? 0) * molt;
  // Dove una proposta ha parlato, il budget iniziale è **sostituito**: le
  // proposte si sommano fra loro ma rimpiazzano quello che veniva dal file.
  const superatoIn = (slug: string, i: number) =>
    Object.keys(mesi[i].perFonte[slug] ?? {}).some((f) => f !== "iniziale");
  const totaleMese = (i: number) => tipologie.reduce((s, t) => s + valore(t.slug, i), 0);
  const advMese = (i: number) => (totaleMese(i) * mesi[i].advPercent) / 100;
  const totaleAnno = mesi.reduce((s, _, i) => s + totaleMese(i), 0);
  const advAnno = mesi.reduce((s, _, i) => s + advMese(i), 0);

  // ---- «Attuale»: com'è andata finora + quello che resta a budget ----
  // A metà anno la domanda non è «quanto avevamo pianificato» ma «dato come è
  // andata, dove si chiude». Nei mesi già chiusi il D2C vale il **venduto
  // vero**; Eventi e B2B restano a budget perché per una maison un loro
  // consuntivo non esiste — ed è dichiarato sotto la tabella, invece di far
  // passare per misurato un numero che è ancora una promessa.
  const conConsuntivo = consuntivoD2C.some((v) => v !== null);
  const attualeMese = (i: number) => {
    if (consuntivoD2C[i] === null) return totaleMese(i);
    const altreLinee = tipologie
      .filter((t) => t.slug !== "D2C")
      .reduce((s, t) => s + valore(t.slug, i), 0);
    return (consuntivoD2C[i] ?? 0) + altreLinee;
  };
  const attualeAnno = mesi.reduce((s, _, i) => s + attualeMese(i), 0);
  const senzaBudget = tipologie.filter((t) => mesi.every((m) => (m.vendite[t.slug] ?? 0) === 0));

  return (
    <>
      {approvate.length > 0 && (
        <div className="card" style={{ borderColor: "var(--green)", marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
            Da dove viene questo budget
          </div>
          {/* **Quale si usa.** Sulla stessa fonte una proposta nuova riscrive
              quella di prima: l'ultima consolidata è il budget, le precedenti
              sono storico. Fra fonti diverse non c'è sostituzione — si
              sommano — e la differenza dev'essere leggibile a colpo d'occhio,
              altrimenti due proposte approvate si somigliano e non si sa quale
              si sta guardando. */}
          {approvate.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6,
                opacity: a.inUso ? 1 : 0.6,
              }}
            >
              {a.inUso ? (
                <span className="badge green"><span className="dot" />in uso</span>
              ) : (
                <span className="badge neutral"><span className="dot" />sostituita</span>
              )}
              <strong>{a.autore}</strong>
              <span className="badge gold"><span className="dot" />{nomeFonte(a.fonte, fonti)}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {a.voci} · {eur(a.totale)} · consolidata il {a.il}
                {a.sostituitaDa && ` · sostituita da ${a.sostituitaDa}`}
              </span>
              <Link href={`/proposte/${a.id}`} className="btn secondary small">Apri la proposta</Link>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            <strong>Come si compone il totale, in tre regole.</strong> Le <strong>proposte si sommano fra
            loro</strong>: pubblicità web e team commerciale sono due pezzi dello stesso budget. Ma insieme
            <strong> sostituiscono il budget iniziale</strong>, quello che veniva dal file di monitoraggio: il
            nuovo rimpiazza il precedente, non ci si aggiunge — dove è stato sostituito lo vedi{" "}
            <span style={{ textDecoration: "line-through", opacity: 0.6 }}>barrato</span>, e quel numero non
            entra nel totale. E su <strong>una stessa fonte</strong> vale l&apos;ultima consolidata: una
            proposta nuova riscrive quella di prima, che resta come storico.
          </p>
        </div>
      )}

      {daConsolidare.length > 0 && (
        <div className="card" style={{ borderColor: "var(--orange)", marginBottom: 12 }}>
          {/* Approvata e consolidata non sono la stessa cosa, e la differenza si
              vede solo qui: finché non è consolidata, il budget pubblicato non
              è cambiato di un euro. */}
          <strong>
            {daConsolidare.length === 1 ? "Una proposta approvata non è ancora entrata" : `${daConsolidare.length} proposte approvate non sono ancora entrate`}
          </strong>{" "}
          in questo budget:{" "}
          {daConsolidare.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/proposte/${d.id}`} style={{ color: "var(--blue)" }}>
                {d.autore} ({eur(d.totale)})
              </Link>
            </span>
          ))}
          . Approvare vuol dire «va bene», consolidare è il gesto che riscrive i numeri qui sotto.
        </div>
      )}

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Linea di business</th>
                {MESI.map((m) => (<th className="num" key={m} style={{ minWidth: 92 }}>{m}</th>))}
                <th className="num">Anno</th>
              </tr>
            </thead>
            <tbody>
              {/* Il totale della linea in grassetto e sotto **i contributi che
                  lo compongono**: la pubblicità web, il team commerciale, il
                  budget iniziale. Il budget di un mese è la loro somma, e
                  vederli separati è l'unico modo per sapere di chi è il numero
                  — e per accorgersi se una squadra non ha ancora proposto. */}
              {tipologie.map((t) => (
                <Fragment key={t.slug}>
                  <tr style={{ fontWeight: 600 }}>
                    <td>{t.nome}</td>
                    {mesi.map((_, i) => {
                      const v = valore(t.slug, i);
                      const da = origini[`${t.slug}|${i + 1}`];
                      return (
                        <td className={`num ${v ? "" : "muted"}`} key={i}>
                          {v ? eur(v) : "—"}
                          {da && (
                            <span
                              title={`Proposta di ${da.autore}, approvata e consolidata il ${da.il}`}
                              style={{ color: "var(--green)", marginLeft: 4, fontSize: 11 }}
                            >
                              ●
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="num">{eur(mesi.reduce((s, _, i) => s + valore(t.slug, i), 0))}</td>
                  </tr>
                  {fonti
                    .filter((f) => mesi.some((m) => (m.perFonte[t.slug]?.[f.key] ?? 0) !== 0))
                    .map((f) => (
                      <tr key={`${t.slug}-${f.key}`}>
                        <td style={{ paddingLeft: 26, fontSize: 12.5 }}>
                          <span className="muted" style={{ marginRight: 6 }}>↳</span>
                          {f.nome}
                        </td>
                        {mesi.map((m, i) => {
                          const v = (m.perFonte[t.slug]?.[f.key] ?? 0) * molt;
                          // Un valore **iniziale sostituito** da una proposta si
                          // mostra barrato invece di sparire: chi guarda deve
                          // capire che è stato rimpiazzato, non perso — e che
                          // quel numero non è dentro il totale.
                          const superato = f.key === "iniziale" && superatoIn(t.slug, i);
                          return (
                            <td
                              className="num muted"
                              key={i}
                              style={{
                                fontSize: 12.5,
                                textDecoration: superato ? "line-through" : undefined,
                                opacity: superato ? 0.55 : undefined,
                              }}
                              title={superato ? "Sostituito da una proposta: non entra nel totale" : undefined}
                            >
                              {v ? eur(v) : "—"}
                            </td>
                          );
                        })}
                        <td className="num muted" style={{ fontSize: 12.5 }}>
                          {eur(
                            mesi.reduce(
                              (s, m, i) =>
                                s + (f.key === "iniziale" && superatoIn(t.slug, i) ? 0 : m.perFonte[t.slug]?.[f.key] ?? 0),
                              0
                            ) * molt
                          )}
                        </td>
                      </tr>
                    ))}
                  {/* **Il consuntivo dei mesi già chiusi, in un colore suo.**
                      Un numero già successo e un numero promesso non devono
                      somigliarsi: sono le due cose che non vanno mai confuse in
                      questa pagina. Esiste solo sotto il D2C perché per una
                      maison l'unico consuntivo è il venduto dei negozi. */}
                  {t.slug === "D2C" && consuntivoD2C.some((v) => v !== null) && (
                    <tr style={{ color: "var(--blue)" }}>
                      <td style={{ paddingLeft: 26, fontSize: 12.5 }}>
                        <span style={{ marginRight: 6 }}>↳</span>
                        Consuntivo · venduto reale
                      </td>
                      {mesi.map((_, i) => (
                        <td className="num" key={i} style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {consuntivoD2C[i] === null ? (
                            <span className="muted" title="Mese non ancora chiuso">—</span>
                          ) : (
                            eur(consuntivoD2C[i] ?? 0)
                          )}
                        </td>
                      ))}
                      <td className="num" style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {eur(consuntivoD2C.reduce((s: number, v) => s + (v ?? 0), 0))}
                      </td>
                    </tr>
                  )}
                  {/* **La riga del D2C non si somma da sola col consuntivo.**
                      Sopra c'è il budget (415.000 sull'anno) e sotto il venduto
                      vero dei mesi chiusi (432.941): due numeri veri che non
                      rispondono alla domanda «dove si chiude». Questa riga la
                      risponde per la singola linea, come quella in fondo la
                      risponde per il totale — e sul D2C serve più che altrove,
                      perché è l'unica linea che un consuntivo ce l'ha. */}
                  {t.slug === "D2C" && conConsuntivo && (
                    <tr style={{ color: "var(--blue)" }}>
                      <td style={{ paddingLeft: 26, fontSize: 12.5, fontWeight: 600 }}>
                        <span style={{ marginRight: 6 }}>↳</span>
                        Attuale — consuntivo + budget
                      </td>
                      {mesi.map((_, i) => (
                        <td className="num" key={i} style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {eur(consuntivoD2C[i] === null ? valore(t.slug, i) : consuntivoD2C[i] ?? 0)}
                        </td>
                      ))}
                      <td className="num" style={{ fontSize: 12.5, fontWeight: 700 }}>
                        {eur(
                          mesi.reduce(
                            (s, _, i) => s + (consuntivoD2C[i] === null ? valore(t.slug, i) : consuntivoD2C[i] ?? 0),
                            0
                          )
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="tot">
                <td>Totale vendite (budget)</td>
                {mesi.map((_, i) => (<td className="num" key={i}>{eur(totaleMese(i))}</td>))}
                <td className="num">{eur(totaleAnno)}</td>
              </tr>
              {/* **Dove si chiude l'anno.** A metà anno la domanda non è «quanto
                  avevamo pianificato» ma «dato come è andata finora, dove
                  arriviamo»: i mesi già chiusi valgono per quello che è
                  successo davvero, quelli che restano per quello che è a
                  budget. Il totale del budget resta sopra, perché servono
                  entrambi — uno dice la promessa, l'altro la rotta. */}
              {conConsuntivo && (
                <tr className="tot" style={{ color: "var(--blue)" }}>
                  <td>Attuale — consuntivo + budget</td>
                  {mesi.map((_, i) => (
                    <td className="num" key={i} style={{ fontWeight: 600 }}>
                      {eur(attualeMese(i))}
                    </td>
                  ))}
                  <td className="num">{eur(attualeAnno)}</td>
                </tr>
              )}
              <tr>
                <td className="muted" style={{ fontSize: 12.5 }}>% ADV sulle vendite</td>
                {mesi.map((m, i) => (
                  <td className="num muted" key={i} style={{ fontSize: 12.5 }}>{pct(m.advPercent)}</td>
                ))}
                <td className="num muted" style={{ fontSize: 12.5 }}>
                  {totaleAnno > 0 ? pct((advAnno / totaleAnno) * 100) : "—"}
                </td>
              </tr>
              {/* La riga per cui la tabella esiste: il budget pubblicitario non
                  si decide, si **ricava** dalle vendite di tutte le linee. */}
              <tr style={{ fontWeight: 600 }}>
                <td>ADV consentito</td>
                {mesi.map((_, i) => (<td className="num" key={i}>{eur(advMese(i))}</td>))}
                <td className="num">{eur(advAnno)}</td>
              </tr>
              {/* Riferimento storico dal monitoraggio: **non** si moltiplica per
                  il livello, perché è quello che era stato pubblicato e non uno
                  scenario. */}
              <tr>
                <td className="muted" style={{ fontSize: 12.5 }}>ADV pubblicato (riferimento)</td>
                {mesi.map((m, i) => (
                  <td className="num muted" key={i} style={{ fontSize: 12.5 }}>
                    {m.advPubblicato ? eur(m.advPubblicato) : "—"}
                  </td>
                ))}
                <td className="num muted" style={{ fontSize: 12.5 }}>
                  {eur(mesi.reduce((s, m) => s + m.advPubblicato, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {consuntivoD2C.some((v) => v !== null) && (
        <p className="page-caption" style={{ marginTop: 12 }}>
          <span style={{ color: "var(--blue)", fontWeight: 600 }}>In blu il consuntivo</span>: quello che è
          <strong> davvero stato venduto</strong> nei mesi già chiusi, non una promessa — sono le due cose che
          in questa pagina non vanno mai confuse. C&apos;è solo sotto il D2C perché per una maison l&apos;unico
          consuntivo è il venduto dei negozi: il fatturato di Finance è per tipologia di servizio (consegne,
          eventi, B2B) e non si può ripartire per brand. È sulla <strong>stessa base</strong> del budget D2C —
          prezzo pieno, IVA e spedizione incluse — quindi il confronto è omogeneo. Il <strong>mese in corso
          resta fuori</strong>: è parziale, e accanto a un budget intero sembrerebbe un crollo.
        </p>
      )}

      {conConsuntivo && (
        <p className="page-caption">
          Le righe <strong style={{ color: "var(--blue)" }}>Attuale</strong> — una sotto il D2C e una in fondo
          alla tabella — rispondono alla domanda di metà anno: <em>dato come è andata finora, dove si
          chiude</em>. I mesi già chiusi valgono per quello che è successo davvero, quelli che restano per
          quello che è a budget. Servono perché <strong>budget e consuntivo non si sommano da soli</strong>:
          sulla riga del D2C c&apos;è la promessa, su quella blu il venduto vero, e nessuna delle due dice dove
          si arriva. In fondo fa{" "}
          <strong>{eur(attualeAnno)}</strong> contro <strong>{eur(totaleAnno)}</strong> di budget,{" "}
          {Math.abs(attualeAnno - totaleAnno) < 1 ? (
            "cioè in linea"
          ) : (
            <span className={attualeAnno >= totaleAnno ? "pos" : "neg"}>
              {attualeAnno >= totaleAnno ? "+" : ""}{eur(attualeAnno - totaleAnno)}
            </span>
          )}
          . ⚠️ Nei mesi chiusi <strong>solo il D2C è misurato</strong>: Eventi e B2B restano a budget, perché per
          una maison un loro consuntivo non esiste. Quella parte della riga è ancora una promessa, non una
          misura.
        </p>
      )}

      <p className="page-caption" style={{ marginTop: 12 }}>
        <span style={{ color: "var(--green)" }}>●</span> = numero arrivato da una <strong>proposta
        approvata</strong> (passaci sopra per sapere di chi e di quando). Le caselle senza pallino vengono dal
        file di partenza, il monitoraggio caricato all&apos;inizio dell&apos;anno.{" "}
        <strong>Qui non si scrive</strong>: un budget digitato su una pagina non ha un autore, non ha una data e
        non ha il «va bene» di nessuno — e allora non si sa più chi ha promesso quel numero. Si cambia da{" "}
        <Link href="/proposte/nuova" style={{ color: "var(--blue)" }}>una proposta</Link>, che si approva e poi si
        consolida.
      </p>

      {senzaBudget.length > 0 && (
        <p className="page-caption">
          <strong>{senzaBudget.map((t) => t.nome).join(" e ")}</strong>{" "}
          {senzaBudget.length === 1 ? "non ha" : "non hanno"} budget su nessun mese — e{" "}
          <strong>una linea senza budget non porta ADV con sé</strong>: quanto si può spendere in pubblicità è una
          percentuale sulle vendite del mese sommate su <em>tutte</em> le linee, quindi finché{" "}
          {senzaBudget.length === 1 ? "resta" : "restano"} a zero l&apos;ADV consentito è più basso del vero. Si
          riempie con una proposta su questa maison, che oggi si scrive linea per linea.
        </p>
      )}
    </>
  );
}
