import { CellaResa, Euro } from "@/components/CellaResa";
import { perCategoria } from "@/lib/brand-tabelle";
import { ETICHETTA_CATEGORIA_ORDINE } from "@/lib/vendite-campagna";
import { formattaEuro } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";
import type { Periodo } from "@/lib/periodo";

// Quanto rende ogni FAMIGLIA DI PRODOTTO: incasso da Shopify, spesa
// pubblicitaria e resa, con Google e Meta tenuti separati.
//
// ⚠️ Due rese per riga, e non è un doppione:
//   · **Resa del canale** = quello che Shopify attribuisce a quel canale,
//     diviso quello che si è speso su quel canale. Risponde a «questa
//     pubblicità si ripaga?», e nasce da un'attribuzione last-click che vede
//     solo chi ha cliccato.
//   · **Resa su tutto** = tutto l'incasso della categoria diviso tutta la
//     spesa. Risponde a «questa famiglia sta in piedi?», e dentro ci sono
//     anche l'organico e il diretto — che la pubblicità aiuta a produrre ma
//     non si prende.
// Guardare solo la prima fa chiudere campagne che portavano traffico; guardare
// solo la seconda fa credere che qualsiasi spesa vada bene.

const campagneDette = (n: number) => `${n} ${n === 1 ? "campagna" : "campagne"}`;

export async function BrandPerCategoria({ brand, periodo }: { brand: string; periodo: Periodo }) {
  const t = await perCategoria(brand, periodo);
  const be = breakEvenRoas(brand);

  return (
    <section className="scheda" id="categorie">
      <div className="scheda-titolo">Per categoria di prodotto · {periodo.etichetta}</div>
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        L&apos;<b>incasso</b> è quello di Shopify sulle righe d&apos;ordine di quella famiglia, da
        qualunque provenienza. Il <b>ritorno</b> di Google e di Meta è la parte che{" "}
        <b>Shopify attribuisce</b> a quel canale (last-click: vede chi ha cliccato, non chi ha visto)
        — quindi è una stima, e la <b>resa su tutto</b> accanto dice se la famiglia sta in piedi nel
        complesso. La <b>spesa</b> è quella delle campagne di questa categoria: una campagna prende
        la categoria assegnata sulla sua scheda, o quella dedotta dal nome finché nessuno la sceglie.
      </p>

      {t.righe.length === 0 ? (
        <p className="cella-muta">Nessun incasso e nessuna spesa in questo periodo.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th rowSpan={2}>Categoria</th>
                <th className="num" colSpan={2}>
                  Shopify
                </th>
                <th className="num" colSpan={3}>
                  Google
                </th>
                <th className="num" colSpan={3}>
                  Meta
                </th>
                <th className="num" colSpan={2}>
                  Su tutto
                </th>
              </tr>
              <tr>
                <th className="num">Incasso</th>
                <th className="num">Ordini</th>
                <th className="num">Spesa</th>
                <th className="num">Ritorno</th>
                <th className="num">Resa</th>
                <th className="num">Spesa</th>
                <th className="num">Ritorno</th>
                <th className="num">Resa</th>
                <th className="num">Spesa</th>
                <th className="num">Resa</th>
              </tr>
            </thead>
            <tbody>
              {t.righe.map((r) => {
                const spesa = r.spesaGoogle + r.spesaMeta;
                return (
                  <tr key={r.categoria}>
                    <td>
                      <b>{ETICHETTA_CATEGORIA_ORDINE[r.categoria] ?? r.categoria}</b>
                      {r.campagne > 0 && (
                        <div
                          className="cella-sub"
                          title={
                            r.campagneSenzaScelta > 0
                              ? "Categoria dedotta dal nome della campagna: nessuno l'ha scelta a mano sulla scheda."
                              : undefined
                          }
                        >
                          {campagneDette(r.campagne)}
                          {r.campagneSenzaScelta > 0 &&
                            ` · ${r.campagneSenzaScelta} dedott${r.campagneSenzaScelta === 1 ? "a" : "e"} dal nome`}
                        </div>
                      )}
                      {r.campagne === 0 && r.incasso > 0 && (
                        <div
                          className="cella-sub"
                          style={{ color: "var(--orange)" }}
                          title="Vende senza che nessuna campagna la promuova: o si vende da sé, o è un'occasione non presidiata."
                        >
                          nessuna campagna
                        </div>
                      )}
                    </td>
                    <Euro v={r.incasso} />
                    <td className="num cella-muta">{r.ordini || "—"}</td>
                    <Euro v={r.spesaGoogle} />
                    <Euro v={r.incassoGoogle} zeroEsplicito={r.spesaGoogle > 0} />
                    <CellaResa incasso={r.incassoGoogle} spesa={r.spesaGoogle} breakEven={be} />
                    <Euro v={r.spesaMeta} />
                    <Euro v={r.incassoMeta} zeroEsplicito={r.spesaMeta > 0} />
                    <CellaResa incasso={r.incassoMeta} spesa={r.spesaMeta} breakEven={be} />
                    <Euro v={spesa} />
                    <CellaResa incasso={r.incasso} spesa={spesa} breakEven={be} />
                  </tr>
                );
              })}

              {/* ⚠️ La spesa delle campagne «generico» NON si spalma sulle
                  categorie: spalmarla cambierebbe ogni resa di riga in base a
                  una divisione inventata. Sta in una riga sua, dichiarata, e
                  così i totali tornano. */}
              {t.generico.campagne > 0 && (
                <tr>
                  <td>
                    <b className="cella-muta">Generico</b>
                    <div className="cella-sub" style={{ whiteSpace: "normal" }}>
                      {campagneDette(t.generico.campagne)} che non parlano di una famiglia sola
                    </div>
                  </td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <Euro v={t.generico.spesaGoogle} />
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <Euro v={t.generico.spesaMeta} />
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <Euro v={t.generico.spesaGoogle + t.generico.spesaMeta} />
                  <td className="num cella-muta">—</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <b>Totale</b>
                </td>
                <td className="num">
                  <b>{formattaEuro(t.totali.incasso)}</b>
                </td>
                <td className="num cella-muta">—</td>
                <Euro v={t.totali.spesaGoogle} />
                <Euro v={t.totali.incassoGoogle} zeroEsplicito={t.totali.spesaGoogle > 0} />
                <CellaResa
                  incasso={t.totali.incassoGoogle}
                  spesa={t.totali.spesaGoogle}
                  breakEven={be}
                />
                <Euro v={t.totali.spesaMeta} />
                <Euro v={t.totali.incassoMeta} zeroEsplicito={t.totali.spesaMeta > 0} />
                <CellaResa incasso={t.totali.incassoMeta} spesa={t.totali.spesaMeta} breakEven={be} />
                <td className="num">
                  <b>{formattaEuro(t.totali.spesa)}</b>
                </td>
                <CellaResa incasso={t.totali.incasso} spesa={t.totali.spesa} breakEven={be} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {t.incassoNonAttribuito > 0 && (
        <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 8 }}>
          Di quell&apos;incasso, <b>{formattaEuro(t.incassoNonAttribuito)}</b> Shopify non li
          attribuisce a nessuna pubblicità: ricerca organica, diretto, email, WhatsApp, AI. Non è
          «nessun canale», è <b>non a pagamento</b> — sommarlo a Google o a Meta gonfierebbe il
          ritorno di una pubblicità che non l&apos;ha prodotto.
        </p>
      )}
      <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 6 }}>
        ⚠️ Questo totale somma le <b>righe</b> d&apos;ordine (la merce). La tabella per area qui
        sotto somma gli <b>ordini interi</b> (merce e spedizione), perché l&apos;area è una
        proprietà dell&apos;ordine e non della riga: i due totali non coincidono, ed è giusto così.
      </p>
    </section>
  );
}
