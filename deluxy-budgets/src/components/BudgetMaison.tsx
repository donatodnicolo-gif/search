"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoEuro } from "@/components/CampoEuro";
import { eur, MESI, pct } from "@/lib/format";

// **Il budget di una maison si scrive qui.**
//
// Prima si poteva solo importare dal file Excel o ereditare da una proposta
// consolidata: mancava un canale a un brand e l'unico modo di aggiungerlo era
// inventarsi una proposta. E siccome **l'ADV consentito è una percentuale sulle
// vendite del mese**, un canale senza budget non è un canale a zero — è un
// canale che non porta con sé i soldi per farlo.
//
// Due scelte visibili in pagina:
//  - si scrive **solo il livello pubblicato**. Sfidante e irraggiungibile non
//    sono dati, sono il pubblicato per un moltiplicatore: lasciarli scrivere
//    vorrebbe dire salvare uno scenario credendo di salvare un budget;
//  - si salva **quando si esce dalla casella**, non a ogni tasto: scrivere
//    «55000» sono cinque salvataggi, e i primi quattro sono numeri che nessuno
//    ha mai voluto scrivere.

type Tipologia = { slug: string; nome: string };
type Mese = { month: number; vendite: Record<string, number>; advPercent: number; advPubblicato: number };

export function BudgetMaison({
  anno,
  maison,
  tipologie,
  mesi,
  molt,
  modificabile,
}: {
  anno: number;
  maison: string;
  tipologie: Tipologia[];
  mesi: Mese[];
  molt: number;
  modificabile: boolean;
}) {
  const router = useRouter();
  const iniziale = () => {
    const v: Record<string, number[]> = {};
    for (const t of tipologie) v[t.slug] = mesi.map((m) => m.vendite[t.slug] ?? 0);
    return v;
  };
  const [valori, setValori] = useState<Record<string, number[]>>(iniziale);
  const salvato = useRef<Record<string, number[]>>(iniziale());
  const [inCorso, setInCorso] = useState(0);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(canale: string, i: number) {
    const nuovo = valori[canale]?.[i] ?? 0;
    if (salvato.current[canale]?.[i] === nuovo) return;
    setInCorso((n) => n + 1);
    setErrore(null);
    const res = await fetch("/api/budget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anno, maison, month: mesi[i].month, canale, vendite: nuovo }),
    });
    setInCorso((n) => n - 1);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Salvataggio non riuscito.");
      return;
    }
    salvato.current[canale][i] = nuovo;
    // Il totale dell'anno, l'ADV consentito e il P&L nascono da questo numero:
    // si rilegge la pagina invece di tenere due verità in giro.
    router.refresh();
  }

  const totaleMese = (i: number) => tipologie.reduce((s, t) => s + (valori[t.slug]?.[i] ?? 0), 0);
  const advMese = (i: number) => (totaleMese(i) * mesi[i].advPercent) / 100;
  const totaleAnno = mesi.reduce((s, _, i) => s + totaleMese(i), 0);
  const advAnno = mesi.reduce((s, _, i) => s + advMese(i), 0);
  const senzaBudget = tipologie.filter((t) => (valori[t.slug] ?? []).every((v) => v === 0));

  return (
    <>
      {errore && <div className="avviso-errore" style={{ marginBottom: 12 }}>{errore}</div>}

      {!modificabile && (
        <p className="page-caption" style={{ marginTop: 0 }}>
          Questi importi sono il <strong>pubblicato moltiplicato per {molt.toLocaleString("it-IT")}</strong>: sono
          uno scenario, non un budget, e per questo non si scrivono. Per modificarli passa al livello{" "}
          <strong>Raggiungibile</strong>, che è il budget vero.
        </p>
      )}

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Canale</th>
                {MESI.map((m) => (<th className="num" key={m} style={{ minWidth: 96 }}>{m}</th>))}
                <th className="num">Anno</th>
              </tr>
            </thead>
            <tbody>
              {tipologie.map((t) => (
                <tr key={t.slug}>
                  <td style={{ fontWeight: 500 }}>{t.nome}</td>
                  {mesi.map((_, i) => (
                    <td className="num" key={i}>
                      {modificabile ? (
                        <CampoEuro
                          valore={valori[t.slug]?.[i] ?? 0}
                          onChange={(v) =>
                            setValori((p) => ({ ...p, [t.slug]: p[t.slug].map((x, j) => (j === i ? v : x)) }))
                          }
                          onBlur={() => salva(t.slug, i)}
                          style={{ width: 92, padding: "4px 6px", textAlign: "right", fontSize: 12.5 }}
                        />
                      ) : (
                        <span className={valori[t.slug]?.[i] ? "" : "muted"}>
                          {valori[t.slug]?.[i] ? eur((valori[t.slug][i] ?? 0) * molt) : "—"}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>
                    {eur((valori[t.slug] ?? []).reduce((s, v) => s + v, 0) * molt)}
                  </td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale vendite</td>
                {mesi.map((_, i) => (<td className="num" key={i}>{eur(totaleMese(i) * molt)}</td>))}
                <td className="num">{eur(totaleAnno * molt)}</td>
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
                  si decide, si **ricava** dalle vendite. Cambiando una casella
                  qui sopra questa si muove da sola. */}
              <tr style={{ fontWeight: 600 }}>
                <td>ADV consentito</td>
                {mesi.map((_, i) => (<td className="num" key={i}>{eur(advMese(i) * molt)}</td>))}
                <td className="num">{eur(advAnno * molt)}</td>
              </tr>
              {/* Il riferimento storico dal monitoraggio. **Non** si moltiplica
                  per il livello: è quello che era stato pubblicato, non uno
                  scenario, e moltiplicarlo lo trasformerebbe in un numero che
                  nessuno ha mai scritto. */}
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

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, minHeight: 20 }}>
        {inCorso > 0 && <span className="muted" style={{ fontSize: 12.5 }}>Salvo…</span>}
        {senzaBudget.length > 0 && (
          <span className="badge gold">
            <span className="dot" />
            {senzaBudget.map((t) => t.nome).join(", ")} senza budget
          </span>
        )}
      </div>

      {senzaBudget.length > 0 && (
        <p className="page-caption" style={{ marginTop: 8 }}>
          <strong>Un canale senza budget non porta ADV con sé.</strong> Quanto si può spendere in pubblicità è una
          percentuale sulle <em>vendite del mese</em>, sommate su tutti i canali: finché{" "}
          {senzaBudget.map((t) => t.nome).join(" e ")} {senzaBudget.length === 1 ? "resta" : "restano"} a zero,
          quella percentuale si applica a una base più piccola e l&apos;ADV consentito è più basso del vero. Si
          scrive qui, mese per mese.
        </p>
      )}
    </>
  );
}
