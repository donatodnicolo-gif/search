import { CellaResa, Euro } from "@/components/CellaResa";
import { Delta } from "@/components/Delta";
import { perArea } from "@/lib/brand-tabelle";
import { ETICHETTA_AREA } from "@/lib/aree";
import { prisma } from "@/lib/db";
import { formattaEuro } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";
import type { Periodo } from "@/lib/periodo";

// Quanto rende ogni CITTÀ: incasso da Shopify, spesa pubblicitaria e resa.
//
// ⚠️⚠️ LE DUE COLONNE DI SPESA NON SONO MISURATE ALLO STESSO MODO, e la pagina
// lo dice invece di far finta:
//   · **Google**: dedotta da dove la campagna tira (le località del suo
//     targeting, che l'app censisce). Una campagna che tira su più città non si
//     divide: finisce in «non ripartibile».
//   · **Meta**: letta da Meta per REGIONE, non per città (è il taglio più fine
//     che le insights danno). La Lombardia la leggiamo come area di Milano
//     perché lì consegniamo solo in città — ma è una nostra lettura.
// Due numeri di natura diversa nella stessa tabella vanno bene solo se chi
// guarda sa quali sono: una stima presentata come misura fa spostare budget su
// una certezza che non c'è.

export async function BrandPerArea({
  brand,
  periodo,
  confronto,
}: {
  brand: string;
  periodo: Periodo;
  /** La finestra scelta nei filtri; assente o `null` = nessuna seconda lettura. */
  confronto?: Periodo | null;
}) {
  const conti = await prisma.accountAdv.findMany({
    where: { piattaforma: "meta_ads", attivo: true, brand },
    select: { idEsterno: true },
  });
  const idConti = conti.map((c) => c.idEsterno);
  const [t, tPrima] = await Promise.all([
    perArea(brand, periodo, idConti),
    // ⚠️ Il confronto rilegge anche le REGIONI di Meta, che è una chiamata
    // alla Graph API: sta sotto la stessa cache di mezz'ora, per periodo, e
    // non si fa affatto quando il confronto è «nessuno».
    confronto ? perArea(brand, confronto, idConti) : Promise.resolve(null),
  ]);
  const primaDi = new Map((tPrima?.righe ?? []).map((r) => [r.area, r]));
  const be = breakEvenRoas(brand);

  return (
    <section className="scheda" id="aree">
      <div className="scheda-titolo">Per area · {periodo.etichetta}</div>
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        L&apos;<b>area</b> di un ordine è la provincia di consegna quando c&apos;è (arriva già
        normalizzata da Deluxy Orders), altrimenti la città scritta al checkout ricondotta alle forme
        conosciute — «Milan», «Rome», «Florence» comprese. La <b>spesa Google</b> è dedotta dalle
        località del targeting; la <b>spesa Meta</b> la dà Meta stessa, <b>per regione e non per
        città</b>: leggiamo la Lombardia come area di Milano perché lì consegniamo solo in città, ma
        è una nostra lettura, non un dato di Meta.
        {confronto && (
          <>
            {" "}
            Sotto incasso e spesa c&apos;è la <b>variazione</b> rispetto a <b>{confronto.etichetta}</b>{" "}
            (sulla spesa il verde vuol dire <b>meno</b> speso).
          </>
        )}
        {t.erroreMeta && (
          <>
            {" "}
            <b style={{ color: "var(--orange)" }}>
              La spesa Meta per regione non è arrivata ({t.erroreMeta}): la sua colonna è vuota
              perché non la sappiamo, non perché sia zero.
            </b>
          </>
        )}
      </p>

      {t.righe.length === 0 ? (
        <p className="cella-muta">Nessun incasso e nessuna spesa in questo periodo.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th rowSpan={2}>Area</th>
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
                  <tr key={r.area}>
                    <td>
                      <b>{ETICHETTA_AREA[r.area] ?? r.area}</b>
                      {r.campagneGoogle > 0 && (
                        <div className="cella-sub">
                          {r.campagneGoogle === 1
                            ? "1 campagna Google che tira solo qui"
                            : `${r.campagneGoogle} campagne Google che tirano solo qui`}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {r.incasso > 0 ? formattaEuro(r.incasso) : "—"}
                      {confronto && (
                        <Delta
                          ora={r.incasso}
                          prima={primaDi.get(r.area)?.incasso ?? 0}
                          etichetta={confronto.etichetta}
                          sotto
                        />
                      )}
                    </td>
                    <td className="num cella-muta">{r.ordini || "—"}</td>
                    <Euro v={r.spesaGoogle} />
                    <Euro v={r.incassoGoogle} zeroEsplicito={r.spesaGoogle > 0} />
                    <CellaResa incasso={r.incassoGoogle} spesa={r.spesaGoogle} breakEven={be} />
                    {t.metaLetta ? (
                      <>
                        <Euro v={r.spesaMeta} />
                        <Euro v={r.incassoMeta} zeroEsplicito={r.spesaMeta > 0} />
                        <CellaResa incasso={r.incassoMeta} spesa={r.spesaMeta} breakEven={be} />
                      </>
                    ) : (
                      <>
                        <td className="num cella-muta" title="Spesa Meta per regione non letta">
                          ?
                        </td>
                        <Euro v={r.incassoMeta} />
                        <CellaResa incasso={r.incassoMeta} spesa={r.spesaMeta} breakEven={be} nonLetto />
                      </>
                    )}
                    <td className="num">
                      {spesa > 0 ? formattaEuro(spesa) : "—"}
                      {confronto && (
                        <Delta
                          ora={spesa}
                          prima={(() => {
                            const p = primaDi.get(r.area);
                            return p ? p.spesaGoogle + p.spesaMeta : 0;
                          })()}
                          etichetta={confronto.etichetta}
                          invertito
                          sotto
                        />
                      )}
                    </td>
                    <CellaResa incasso={r.incasso} spesa={spesa} breakEven={be} />
                  </tr>
                );
              })}

              {/* ⚠️ Spesa che NON si può assegnare a una città: campagne che
                  tirano su più aree o su tutta Italia. Un terzo a testa non è
                  una misura, è una divisione: sta in una riga sua. */}
              {t.nonRipartibile.campagne > 0 && (
                <tr>
                  <td>
                    <b className="cella-muta">Non ripartibile</b>
                    <div className="cella-sub" style={{ whiteSpace: "normal" }}>
                      {t.nonRipartibile.campagne === 1
                        ? "1 campagna Google che non tira su una città sola"
                        : `${t.nonRipartibile.campagne} campagne Google che non tirano su una città sola`}
                      {t.nonRipartibile.nazionale > 0 && ` · ${t.nonRipartibile.nazionale} su tutta Italia`}
                      {t.nonRipartibile.senzaLocalita > 0 &&
                        ` · ${t.nonRipartibile.senzaLocalita} senza località censite`}
                    </div>
                  </td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <Euro v={t.nonRipartibile.spesa} />
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <Euro v={t.nonRipartibile.spesa} />
                  <td className="num cella-muta">—</td>
                </tr>
              )}

              {/* ⚠️ E questi sono gli ordini di cui non sappiamo la
                  destinazione. NON vanno in «Altre zone»: quello vuol dire
                  «fuori dalle tre città», e sarebbe una notizia al posto di
                  un'ignoranza. */}
              {t.nonNota.ordini > 0 && (
                <tr>
                  <td>
                    <b className="cella-muta">Destinazione non nota</b>
                    <div className="cella-sub" style={{ whiteSpace: "normal" }}>
                      né provincia né città riconoscibile sull&apos;ordine
                    </div>
                  </td>
                  <Euro v={t.nonNota.incasso} />
                  <td className="num cella-muta">{t.nonNota.ordini}</td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
                  <td className="num cella-muta">—</td>
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
                  {confronto && tPrima && (
                    <Delta
                      ora={t.totali.incasso}
                      prima={tPrima.totali.incasso}
                      etichetta={confronto.etichetta}
                      sotto
                    />
                  )}
                </td>
                <td className="num cella-muta">—</td>
                <Euro v={t.totali.spesaGoogle} />
                <Euro v={t.totali.incassoGoogle} zeroEsplicito={t.totali.spesaGoogle > 0} />
                <CellaResa incasso={t.totali.incassoGoogle} spesa={t.totali.spesaGoogle} breakEven={be} />
                {t.metaLetta ? <Euro v={t.totali.spesaMeta} /> : <td className="num cella-muta">?</td>}
                <Euro v={t.totali.incassoMeta} zeroEsplicito={t.metaLetta && t.totali.spesaMeta > 0} />
                <CellaResa
                  incasso={t.totali.incassoMeta}
                  spesa={t.totali.spesaMeta}
                  breakEven={be}
                  nonLetto={!t.metaLetta}
                />
                <td className="num">
                  <b>{formattaEuro(t.totali.spesa)}</b>
                </td>
                <CellaResa incasso={t.totali.incasso} spesa={t.totali.spesa} breakEven={be} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
