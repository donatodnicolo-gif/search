"use client";

// Il dettaglio di una voce di bilancio: cosa la compone, e il posto dove
// cambiarne la composizione.
//
// La scelta che conta è che le associazioni si modificano **qui**, non solo nel
// CFO: quando ci si accorge che un B6 da 349.377 € contro 42.299 € del bilancio
// vero è sbagliato, si è in questa pagina — e mandare l'utente in un'altra
// schermata a cercare la categoria per nome è il modo migliore perché la
// correzione non venga fatta.

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TIPI_PL, VOCI_CE } from "@/lib/cfo";
import { eur, pct } from "@/lib/format";
import type { DettaglioVoce as Dettaglio } from "@/lib/bilancio-dettaglio";

type CatOpt = { id: string; nome: string };

const tipoLabel = (k: string) => TIPI_PL.find((t) => t.key === k)?.label ?? k;
const tipoBadge = (k: string) => TIPI_PL.find((t) => t.key === k)?.badge ?? "neutral";

export function DettaglioVoce({ d, categorie }: { d: Dettaglio; categorie: CatOpt[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [espansa, setEspansa] = useState<string | null>(null);
  const [assegna, setAssegna] = useState<Record<string, string>>({});

  // Cambiare la voce di bilancio (o il tipo di P&L) di una categoria: è lo
  // stesso gesto del CFO e la stessa API — cambia solo il posto da cui si fa.
  async function salvaCategoria(id: string, patch: { tipoPL?: string; voceCE?: string }) {
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/cfo/categorie", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Modifica non riuscita.");
      return;
    }
    router.refresh();
  }

  // Assegnare una controparte del residuo crea una regola permanente: la
  // prossima volta ci arriva da sola, e questa lista si accorcia per sempre.
  async function assegnaControparte(controparte: string) {
    const categoriaId = assegna[controparte];
    if (!categoriaId) return;
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/cfo/regole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match: controparte, esatto: true, categoriaId }),
    });
    setBusy(false);
    if (!res.ok) {
      setErrore("Assegnazione non riuscita.");
      return;
    }
    router.refresh();
  }

  const senzaRegola = d.categorie
    .flatMap((c) => c.controparti.filter((x) => !x.daRegola && x.uscite > 0).map((x) => ({ ...x, categoria: c.nome })))
    .sort((a, b) => b.uscite - a.uscite);

  return (
    <>
      {errore && <div className="avviso-errore" style={{ marginBottom: 12 }}>{errore}</div>}

      {d.avvisi.map((a, i) => (
        <p key={i} className="page-caption" style={{ marginTop: 0, marginBottom: 8 }}>{a}</p>
      ))}

      {d.spiegazione && (
        <div className="card empty">
          <div className="empty-icon">◌</div>
          <div className="empty-title">Questa voce non nasce dai dati dell&apos;app</div>
          <div className="empty-text">{d.spiegazione}</div>
        </div>
      )}

      {d.categorie.length > 0 && (
        <>
          <h2 className="section-title">Categorie di costo che compongono la voce</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Voce P&amp;L</th>
                    <th>Voce di bilancio</th>
                    <th className="num">Uscite {d.periodo ?? d.anno}</th>
                    <th className="num">Quota</th>
                    <th className="num">Senza regola</th>
                    <th className="num">Controparti</th>
                  </tr>
                </thead>
                <tbody>
                  {d.categorie.map((c) => (
                    <Fragment key={c.id}>
                      <tr>
                        <td>
                          <div style={{ fontWeight: 600 }}>{c.nome}</div>
                          {c.predefinita && (
                            <div className="muted" style={{ fontSize: 11 }}>raccoglie il residuo</div>
                          )}
                          {c.quotaPartner && (
                            <div className="muted" style={{ fontSize: 11 }}>quota partner (partita di giro)</div>
                          )}
                        </td>
                        <td>
                          <select
                            value={c.tipoPL}
                            disabled={busy}
                            onChange={(e) => salvaCategoria(c.id, { tipoPL: e.target.value })}
                            style={{ padding: "4px 6px", fontSize: 13 }}
                          >
                            {TIPI_PL.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
                          </select>
                        </td>
                        <td>
                          {/* Spostare la categoria da qui la fa **uscire** da
                              questa pagina: è il gesto che corregge un totale
                              sbagliato, e va fatto dove lo si è visto. */}
                          <select
                            value={c.voceCE}
                            disabled={busy}
                            onChange={(e) => salvaCategoria(c.id, { voceCE: e.target.value })}
                            style={{ padding: "4px 6px", fontSize: 13 }}
                            title={VOCI_CE.find((v) => v.key === c.voceCE)?.aiuto}
                          >
                            {VOCI_CE.map((v) => (<option key={v.key} value={v.key}>{v.label}</option>))}
                          </select>
                          {!c.voceCEImpostata && (
                            <div className="muted" style={{ fontSize: 11 }}>dedotta, da confermare</div>
                          )}
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>{eur(c.uscite)}</td>
                        <td className="num muted">{pct((c.uscite / (d.totale || 1)) * 100, 0)}</td>
                        <td className={`num ${c.residuo > 0 ? "neg" : "muted"}`}>
                          {c.residuo > 0 ? eur(c.residuo) : "—"}
                        </td>
                        <td className="num">
                          <button
                            className="btn secondary small"
                            onClick={() => setEspansa(espansa === c.id ? null : c.id)}
                          >
                            {c.controparti.length} {espansa === c.id ? "▲" : "▼"}
                          </button>
                        </td>
                      </tr>
                      {espansa === c.id && (
                        <tr>
                          <td colSpan={7} style={{ background: "rgba(0,0,0,.03)" }}>
                            <div className="chips">
                              {c.controparti.slice(0, 200).map((x) => (
                                <span
                                  className="chip"
                                  key={x.controparte}
                                  title={x.daRegola ? "presa da una regola" : "nessuna regola la prende: è nel residuo"}
                                  style={x.daRegola ? undefined : { borderStyle: "dashed" }}
                                >
                                  {x.controparte} · {eur(x.uscite)}
                                </span>
                              ))}
                            </div>
                            {c.controparti.length > 200 && (
                              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                                Mostrate le prime 200 di {c.controparti.length}, dalla più costosa.
                              </p>
                            )}
                            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                              Il bordo tratteggiato segna le controparti che <strong>nessuna regola prende</strong>:
                              stanno qui solo perché questa categoria raccoglie il residuo.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  <tr className="tot">
                    <td>Totale</td>
                    <td />
                    <td />
                    <td className="num">{eur(d.categorie.reduce((s, c) => s + c.uscite, 0))}</td>
                    <td />
                    <td className="num">{eur(d.categorie.reduce((s, c) => s + c.residuo, 0))}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {d.righe.length > 0 && (
        <>
          <h2 className="section-title">
            {d.origine === "personale" ? "Persone a budget" : "Da dove vengono i ricavi"}
          </h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce</th>
                    <th className="num">Importo {d.periodo ?? d.anno}</th>
                    <th>Da dove viene</th>
                  </tr>
                </thead>
                <tbody>
                  {d.righe.map((r) => (
                    <tr key={r.nome}>
                      <td style={{ fontWeight: 500 }}>
                        {r.dove ? (
                          <Link href={r.dove} style={{ color: "var(--blue)" }}>{r.nome}</Link>
                        ) : (
                          r.nome
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>{eur(r.importo)}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{r.fonte}</td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td>Totale</td>
                    <td className="num">{eur(d.righe.reduce((s, r) => s + r.importo, 0))}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {senzaRegola.length > 0 && (
        <>
          <h2 className="section-title">
            Senza categoria — {eur(senzaRegola.reduce((s, c) => s + c.uscite, 0))} in {senzaRegola.length} controparti
          </h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Controparte</th>
                    <th className="num">Uscite</th>
                    <th>Assegna a categoria</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {senzaRegola.slice(0, 150).map((c) => (
                    <tr key={c.controparte}>
                      <td style={{ fontWeight: 500 }}>{c.controparte}</td>
                      <td className="num">{eur(c.uscite)}</td>
                      <td style={{ minWidth: 220 }}>
                        <select
                          value={assegna[c.controparte] ?? ""}
                          onChange={(e) => setAssegna((p) => ({ ...p, [c.controparte]: e.target.value }))}
                        >
                          <option value="">Scegli…</option>
                          {categorie.map((cat) => (<option key={cat.id} value={cat.id}>{cat.nome}</option>))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn primary small"
                          disabled={!assegna[c.controparte] || busy}
                          onClick={() => assegnaControparte(c.controparte)}
                        >
                          Assegna
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            {senzaRegola.length > 150 && (
              <>Mostrate le prime 150 per importo, che è dove sta quasi tutta la cifra. </>
            )}
            Queste controparti non le prende nessuna regola: sono in questa voce di bilancio solo perché una
            categoria <strong>raccoglie il residuo</strong>. Assegnarne una crea una regola permanente e la toglie
            da qui per sempre. Il criterio, quando la causale c&apos;è: un <strong>numero d&apos;ordine</strong> è
            un fioraio pagato per quell&apos;ordine (quota partner), un <strong>mese</strong> è il rimborso di un
            valet (costo vero).
          </p>
        </>
      )}
    </>
  );
}
