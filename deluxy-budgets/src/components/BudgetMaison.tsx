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

export function BudgetMaison({
  maison,
  tipologie,
  mesi,
  molt,
  origini,
  approvate,
  daConsolidare,
}: {
  maison: string;
  tipologie: { slug: string; nome: string }[];
  mesi: { month: number; vendite: Record<string, number>; advPercent: number; advPubblicato: number }[];
  molt: number;
  // chiave `canale|mese` → chi ha proposto quel numero
  origini: Record<string, OrigineCella>;
  approvate: { id: string; autore: string; il: string; voci: string; totale: number }[];
  daConsolidare: { id: string; autore: string; totale: number }[];
}) {
  const valore = (slug: string, i: number) => (mesi[i].vendite[slug] ?? 0) * molt;
  const totaleMese = (i: number) => tipologie.reduce((s, t) => s + valore(t.slug, i), 0);
  const advMese = (i: number) => (totaleMese(i) * mesi[i].advPercent) / 100;
  const totaleAnno = mesi.reduce((s, _, i) => s + totaleMese(i), 0);
  const advAnno = mesi.reduce((s, _, i) => s + advMese(i), 0);
  const senzaBudget = tipologie.filter((t) => mesi.every((m) => (m.vendite[t.slug] ?? 0) === 0));

  return (
    <>
      {approvate.length > 0 && (
        <div className="card" style={{ borderColor: "var(--green)", marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
            Da dove viene questo budget
          </div>
          {approvate.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <span className="badge green"><span className="dot" />approvata</span>
              <strong>{a.autore}</strong>
              <span className="muted" style={{ fontSize: 13 }}>
                {a.voci} · {eur(a.totale)} · consolidata il {a.il}
              </span>
              <Link href={`/proposte/${a.id}`} className="btn secondary small">Apri la proposta</Link>
            </div>
          ))}
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
              {tipologie.map((t) => (
                <tr key={t.slug}>
                  <td style={{ fontWeight: 500 }}>{t.nome}</td>
                  {mesi.map((_, i) => {
                    const v = valore(t.slug, i);
                    const da = origini[`${t.slug}|${i + 1}`];
                    return (
                      <td className={`num ${v ? "" : "muted"}`} key={i}>
                        {/* Il pallino dice «questo numero l'ha proposto
                            qualcuno e qualcuno l'ha approvato». Senza, un budget
                            e l'altro si somigliano, e non si sa più chi ha
                            promesso cosa. */}
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
                  <td className="num" style={{ fontWeight: 600 }}>
                    {eur(mesi.reduce((s, _, i) => s + valore(t.slug, i), 0))}
                  </td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale vendite</td>
                {mesi.map((_, i) => (<td className="num" key={i}>{eur(totaleMese(i))}</td>))}
                <td className="num">{eur(totaleAnno)}</td>
              </tr>
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
