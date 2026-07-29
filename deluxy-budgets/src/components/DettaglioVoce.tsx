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
import { eur, MESI, pct } from "@/lib/format";
import type { DettaglioVoce as Dettaglio } from "@/lib/bilancio-dettaglio";

type CatOpt = { id: string; nome: string };
type Movimento = { data: string; importo: number; descrizione: string | null; categoria: string | null };

const tipoLabel = (k: string) => TIPI_PL.find((t) => t.key === k)?.label ?? k;
const tipoBadge = (k: string) => TIPI_PL.find((t) => t.key === k)?.badge ?? "neutral";
const giorno = (iso: string) => {
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
};

// I movimenti di una controparte: quando, quanto, e **con quale causale**.
// Sta fuori dal componente padre di proposito — definito dentro, React ne
// creerebbe un tipo nuovo a ogni render e rimonterebbe il pannello a ogni
// battuta, facendo perdere il fuoco al campo dell'importo.
function Movimenti({
  controparte,
  dati,
  anno,
  comp,
  setComp,
  busy,
  onSposta,
}: {
  controparte: string;
  dati: Movimento[] | { errore: string } | undefined;
  anno: number;
  comp: { chiave: string; anno: number; mese: number; importo: string } | null;
  setComp: (c: { chiave: string; anno: number; mese: number; importo: string } | null) => void;
  busy: boolean;
  onSposta: (mov: Movimento) => void;
}) {
  if (!dati) return <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Carico i movimenti di «{controparte}»…</p>;
  if ("errore" in dati) {
    return (
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
        Movimenti non disponibili: {dati.errore}
      </p>
    );
  }
  if (dati.length === 0) {
    return <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Nessun movimento nel periodo.</p>;
  }
  return (
    <div className="table-wrap" style={{ marginTop: 10 }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 100 }}>Data</th>
            <th className="num" style={{ width: 110 }}>Importo</th>
            <th>Causale</th>
            <th style={{ width: 120 }} />
          </tr>
        </thead>
        <tbody>
          {dati.map((m, i) => {
            const chiave = `${controparte}#${i}`;
            const aperto = comp?.chiave === chiave;
            return (
              <Fragment key={chiave}>
                <tr>
                  <td style={{ whiteSpace: "nowrap" }}>{giorno(m.data)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{eur(m.importo)}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {m.descrizione || <em>nessuna causale (pagamento con carta)</em>}
                  </td>
                  <td>
                    <button
                      className="btn secondary small"
                      onClick={() =>
                        setComp(
                          aperto
                            ? null
                            : { chiave, anno: Number(m.data.slice(0, 4)) - 1, mese: 12, importo: "" }
                        )
                      }
                    >
                      Competenza
                    </button>
                  </td>
                </tr>
                {aperto && (
                  <tr>
                    <td colSpan={4} style={{ background: "rgba(0,0,0,.04)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                        <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
                          Competenza anno
                          <select
                            value={comp.anno}
                            onChange={(e) => setComp({ ...comp, anno: Number(e.target.value) })}
                          >
                            {[anno - 2, anno - 1, anno, anno + 1].map((y) => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </label>
                        <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
                          e mese
                          <select
                            value={comp.mese}
                            onChange={(e) => setComp({ ...comp, mese: Number(e.target.value) })}
                          >
                            {MESI.map((mm, j) => (<option key={mm} value={j + 1}>{mm}</option>))}
                          </select>
                        </label>
                        <label style={{ display: "grid", gap: 3, fontSize: 12 }}>
                          Importo
                          <input
                            value={comp.importo}
                            placeholder={String(m.importo)}
                            onChange={(e) => setComp({ ...comp, importo: e.target.value })}
                            style={{ width: 110, padding: "5px 7px" }}
                          />
                        </label>
                        <button className="btn" disabled={busy} onClick={() => onSposta(m)}>
                          {busy ? "Sposto…" : "Sposta"}
                        </button>
                        <button className="btn secondary" onClick={() => setComp(null)}>Annulla</button>
                        <span className="muted" style={{ fontSize: 12 }}>
                          Il movimento del {giorno(m.data)} verrà <strong>letto</strong> in quell&apos;esercizio.
                          Vuoto = tutto l&apos;importo. Il dato di Finance non cambia: resta la verità di cassa.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DettaglioVoce({
  d,
  categorie,
  dal = 1,
  al = 12,
}: {
  d: Dettaglio;
  categorie: CatOpt[];
  dal?: number;
  al?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [espansa, setEspansa] = useState<string | null>(null);
  const [assegna, setAssegna] = useState<Record<string, string>>({});
  // Categoria nuova, creata dalla riga che si sta assegnando: `per` è la
  // controparte che l'ha fatta nascere, e a cui verrà assegnata subito dopo.
  const [nuova, setNuova] = useState<{ per: string; nome: string; tipoPL: string } | null>(null);
  // I movimenti si chiedono a Finance **quando si apre una controparte**: farlo
  // per tutte insieme vorrebbe dire una chiamata per ognuna, su una pagina che
  // ne mostra centinaia.
  const [aperta, setAperta] = useState<string | null>(null);
  const [movimenti, setMovimenti] = useState<Record<string, Movimento[] | { errore: string }>>({});
  // Quale movimento sta decidendo il proprio esercizio, e verso dove.
  const [comp, setComp] = useState<{ chiave: string; anno: number; mese: number; importo: string } | null>(null);

  async function apri(controparte: string) {
    if (aperta === controparte) { setAperta(null); return; }
    setAperta(controparte);
    setComp(null);
    if (movimenti[controparte]) return;
    const qs = new URLSearchParams({ controparte, anno: String(d.anno), dal: String(dal), al: String(al) });
    const res = await fetch(`/api/movimenti?${qs.toString()}`);
    const body = await res.json().catch(() => null);
    setMovimenti((p) => ({
      ...p,
      [controparte]: body?.ok ? (body.movimenti as Movimento[]) : { errore: body?.error ?? "Movimenti non disponibili." },
    }));
  }

  // Sposta un singolo movimento su un altro esercizio. Il mese di origine non si
  // sceglie: è quello della sua data — è il vantaggio di lavorare sul movimento
  // invece che sul totale del mese.
  async function spostaCompetenza(controparte: string, mov: Movimento) {
    const scritto = Number((comp?.importo || "").replace(",", "."));
    const importo = Number.isFinite(scritto) && scritto > 0 ? scritto : mov.importo;
    const meseOrigine = Number(mov.data.slice(5, 7));
    const annoOrigine = Number(mov.data.slice(0, 4));
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/competenza", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "USCITA",
        voce: controparte,
        annoOrigine,
        meseOrigine,
        annoCompetenza: comp?.anno ?? annoOrigine - 1,
        meseCompetenza: comp?.mese ?? 12,
        importo,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Spostamento non riuscito.");
      return;
    }
    setComp(null);
    router.refresh();
  }

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

  // Creare una categoria **da qui**, senza passare dal CFO. Sembra un dettaglio
  // e non lo è: si scopre che manca «Viaggi e trasferte» proprio mentre si sta
  // guardando un parcheggio da assegnare, e mandare in un'altra schermata a
  // crearla — per poi tornare e ritrovare il posto — è il modo migliore perché
  // la riga resti dov'è.
  async function creaEAssegna(controparte: string) {
    const nome = (nuova?.nome ?? "").trim();
    if (!nome) { setErrore("Indica il nome della categoria."); return; }
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/cfo/categorie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, tipoPL: nuova?.tipoPL ?? "STRUTTURA" }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.id) {
      setBusy(false);
      setErrore(body?.error ?? "Creazione non riuscita.");
      return;
    }
    const reg = await fetch("/api/cfo/regole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match: controparte, esatto: true, categoriaId: body.id }),
    });
    setBusy(false);
    if (!reg.ok) { setErrore("Categoria creata, ma l'assegnazione non è riuscita."); return; }
    setNuova(null);
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
                                // Cliccabile: sotto si aprono i suoi movimenti
                                // con data e causale, ed è da lì che si decide
                                // l'anno di competenza.
                                <button
                                  className="chip"
                                  key={x.controparte}
                                  onClick={() => apri(x.controparte)}
                                  title={x.daRegola ? "presa da una regola — apri i movimenti" : "nessuna regola la prende: è nel residuo — apri i movimenti"}
                                  style={{
                                    borderStyle: x.daRegola ? undefined : "dashed",
                                    fontWeight: aperta === x.controparte ? 600 : undefined,
                                  }}
                                >
                                  {x.controparte} · {eur(x.uscite)} {aperta === x.controparte ? "▲" : "▾"}
                                </button>
                              ))}
                            </div>
                            {aperta && c.controparti.some((x) => x.controparte === aperta) && (
                              <Movimenti
                                controparte={aperta}
                                dati={movimenti[aperta]}
                                anno={d.anno}
                                comp={comp}
                                setComp={setComp}
                                busy={busy}
                                onSposta={(mov) => spostaCompetenza(aperta, mov)}
                              />
                            )}
                            {c.controparti.length > 200 && (
                              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                                Mostrate le prime 200 di {c.controparti.length}, dalla più costosa.
                              </p>
                            )}
                            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                              Il bordo tratteggiato segna le controparti che <strong>nessuna regola prende</strong>:
                              stanno qui solo perché questa categoria raccoglie il residuo. Cliccandone una si vedono
                              i suoi movimenti con <strong>data e causale</strong> — ed è la causale che dice cosa
                              sono — e da lì si sposta un importo su un altro esercizio.
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
                    <Fragment key={c.controparte}>
                      <tr>
                        <td>
                          {/* Cliccabile: per decidere in che categoria va serve
                              la causale, e la causale sta nei movimenti. */}
                          <button
                            className="btn secondary small"
                            onClick={() => apri(c.controparte)}
                            style={{ fontWeight: 500 }}
                          >
                            {c.controparte} {aperta === c.controparte ? "▲" : "▾"}
                          </button>
                        </td>
                        <td className="num">{eur(c.uscite)}</td>
                        <td style={{ minWidth: 220 }}>
                          {nuova?.per === c.controparte ? (
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              <input
                                autoFocus
                                value={nuova.nome}
                                placeholder="Nome della categoria"
                                onChange={(e) => setNuova({ ...nuova, nome: e.target.value })}
                                style={{ width: 160, padding: "4px 6px", fontSize: 13 }}
                              />
                              <select
                                value={nuova.tipoPL}
                                onChange={(e) => setNuova({ ...nuova, tipoPL: e.target.value })}
                                style={{ padding: "4px 6px", fontSize: 13 }}
                              >
                                {TIPI_PL.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
                              </select>
                            </div>
                          ) : (
                            <select
                              value={assegna[c.controparte] ?? ""}
                              onChange={(e) => {
                                if (e.target.value === "__nuova__") {
                                  setErrore(null);
                                  setNuova({ per: c.controparte, nome: "", tipoPL: "STRUTTURA" });
                                  return;
                                }
                                setAssegna((p) => ({ ...p, [c.controparte]: e.target.value }));
                              }}
                            >
                              <option value="">Scegli…</option>
                              {categorie.map((cat) => (<option key={cat.id} value={cat.id}>{cat.nome}</option>))}
                              <option value="__nuova__">+ Nuova categoria…</option>
                            </select>
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {nuova?.per === c.controparte ? (
                            <>
                              <button className="btn primary small" disabled={busy} onClick={() => creaEAssegna(c.controparte)}>
                                {busy ? "Creo…" : "Crea e assegna"}
                              </button>
                              <button className="btn secondary small" style={{ marginLeft: 6 }} onClick={() => setNuova(null)}>
                                Annulla
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn primary small"
                              disabled={!assegna[c.controparte] || busy}
                              onClick={() => assegnaControparte(c.controparte)}
                            >
                              Assegna
                            </button>
                          )}
                        </td>
                      </tr>
                      {aperta === c.controparte && (
                        <tr>
                          <td colSpan={4} style={{ background: "rgba(0,0,0,.03)" }}>
                            <Movimenti
                              controparte={c.controparte}
                              dati={movimenti[c.controparte]}
                              anno={d.anno}
                              comp={comp}
                              setComp={setComp}
                              busy={busy}
                              onSposta={(mov) => spostaCompetenza(c.controparte, mov)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
