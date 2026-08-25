import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Icona } from "@/components/Icona";
import { Scadenza } from "@/components/Scadenza";
import { Sidebar } from "@/components/Sidebar";
import { elaboraSchedaAnalisi } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  COLORE_BRAND,
  COLORE_ESITO,
  COLORE_STATO_AZIONE,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_ESITO,
  ETICHETTA_STATO_AZIONE,
  ETICHETTA_TIPO_ANALISI,
  formattaData,
  formattaDataOra,
  STATI_AZIONE_APERTI,
} from "@/lib/dominio";
import { categoriaCampagna, iconaCanale } from "@/lib/salute";
import { COLORE_PRIORITA, COLORE_VERDETTO, ETICHETTA_VERDETTO, mappaCampagneCitate, schedaDi } from "@/lib/scheda-analisi";

export const dynamic = "force-dynamic";

const SPIEGA_ESITO: Record<string, string> = {
  ok: "Nessun problema bloccante emerso",
  attenzione: "Ci sono gap da chiudere, non bloccanti",
  critico: "Problemi che richiedono un intervento immediato",
};

const SPIEGA_VERDETTO: Record<string, string> = {
  rosso: "Serve un intervento: il documento lo dichiara",
  giallo: "Gap da chiudere, non bloccanti",
  verde: "Niente di bloccante nel periodo letto",
};

export default async function SchedaAnalisi({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scheda?: string; errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const analisi = await prisma.analisi.findUnique({
    where: { id },
    include: { azioni: { orderBy: { creataIl: "desc" } } },
  });
  if (!analisi) notFound();

  const scheda = schedaDi(analisi);

  // Le campagne che la scheda nomina, agganciate a quelle vere. I documenti
  // abbreviano i nomi, quindi l'aggancio è normalizzato — e l'ambiguo NON si
  // aggancia: un chip grigio è meglio di un link alla campagna sbagliata.
  const nomiCitati = scheda
    ? [...new Set([...scheda.campagne.map((c) => c.nome), ...scheda.findings.flatMap((f) => f.campagne)])]
    : [];
  const agganci = await mappaCampagneCitate(nomiCitati, { brand: analisi.brand, canale: analisi.canale });
  const idCampagna = (nome: string) => agganci.get(nome)?.id ?? null;

  const ChipCampagna = ({ nome }: { nome: string }) => {
    const cid = idCampagna(nome);
    return cid ? (
      <a key={nome} className="tag-neutro" href={`/campagne/${cid}`} style={{ textDecoration: "none" }}>
        {nome}
      </a>
    ) : (
      <span key={nome} className="tag-neutro" style={{ opacity: 0.65 }} title="Campagna non trovata nell'app con questo nome">
        {nome}
      </span>
    );
  };

  const aperte = analisi.azioni.filter((a) => STATI_AZIONE_APERTI.includes(a.stato)).length;
  const categoria = categoriaCampagna(`${analisi.titolo} ${analisi.fileDrive ?? ""}`);
  const coloreVerdetto = scheda ? COLORE_VERDETTO[scheda.verdetto] : null;
  const coloreEsito =
    coloreVerdetto ?? (analisi.esito ? COLORE_ESITO[analisi.esito] ?? "var(--text-tertiary)" : "var(--fill-active)");
  const elaborabile = Boolean(analisi.fileDrive && /\.(md|txt)$/i.test(analisi.fileDrive));

  return (
    <div className="layout">
      <Sidebar attiva="analisi" brandAttivo={analisi.brand} canaleAttivo={analisi.canale ?? undefined} />
      <main className="main">
        <a className="ritorno" href="/analisi">← Analisi</a>

        {sp.scheda === "fallita" && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.05)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>✕</span>
            <span>
              <b>L&apos;elaborazione della scheda è fallita.</b> {sp.errore ?? ""}
            </span>
          </div>
        )}

        <section className="scheda-hero">
          <span className="hero-barra" style={{ background: coloreEsito }} />
          <div className="hero-corpo">
            <div className="hero-tag">
              <span className="tag-salute" style={{ color: COLORE_BRAND[analisi.brand] ?? "var(--text-tertiary)" }}>
                <span className="dot" />
                {ETICHETTA_BRAND[analisi.brand] ?? analisi.brand}
              </span>
              {analisi.canale && (
                <span className="tag-neutro">
                  <Icona nome={iconaCanale(analisi.canale)} />
                  {ETICHETTA_CANALE[analisi.canale] ?? analisi.canale}
                </span>
              )}
              <span className="tag-neutro">
                <Icona nome={categoria.icona} />
                {categoria.nome}
              </span>
              <span className="tag-neutro">{ETICHETTA_TIPO_ANALISI[analisi.tipo] ?? analisi.tipo}</span>
              {scheda?.periodo && <span className="tag-neutro">{scheda.periodo}</span>}
            </div>
            <h1 className="page-title" style={{ fontSize: 26, marginTop: 10 }}>{analisi.titolo}</h1>
            {/* La frase-verdetto della scheda sta sotto il titolo: è la
                risposta alla domanda per cui si apre un'analisi. */}
            {scheda && (
              <p className="page-sub" style={{ marginTop: 6, maxWidth: 760 }}>
                <b style={{ color: coloreVerdetto ?? undefined }}>{scheda.titolo}</b>
              </p>
            )}
            <div className="hero-meta">
              <span>{formattaData(analisi.dataAnalisi)}</span>
              <span>·</span>
              <span>origine {analisi.origine}</span>
              {analisi.fileDrive && (
                <>
                  <span>·</span>
                  <span title={analisi.fileDrive} style={{ overflowWrap: "anywhere" }}>
                    {analisi.fileDrive.split("/").pop()}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="hero-esito" style={{ color: coloreEsito }}>
            <div className="hero-esito-valore">
              {scheda
                ? ETICHETTA_VERDETTO[scheda.verdetto]
                : analisi.esito
                  ? ETICHETTA_ESITO[analisi.esito] ?? analisi.esito
                  : "Nessun esito"}
            </div>
            <div className="hero-esito-nota">
              {scheda
                ? SPIEGA_VERDETTO[scheda.verdetto]
                : analisi.esito
                  ? SPIEGA_ESITO[analisi.esito] ?? ""
                  : "Esito non dichiarato nel documento"}
            </div>
          </div>
        </section>

        {/* ══ LA SCHEDA: il documento rielaborato in forma grafica ══ */}
        {scheda ? (
          <>
            {/* I numeri che decidono il verdetto. Il colore dice il VERSO
                (buona o cattiva notizia per noi), non il segno aritmetico:
                un CPM che scende è verde anche se il numero cala. */}
            {scheda.kpi.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
                  gap: 10,
                  marginBottom: 18,
                }}
              >
                {scheda.kpi.map((k, i) => (
                  <div key={i} className="kpi" style={{ padding: "14px 16px" }}>
                    <div
                      className="kpi-valore"
                      style={{
                        fontSize: 22,
                        color:
                          k.verso === "cattivo" ? "var(--red)" : k.verso === "buono" ? "var(--green)" : undefined,
                      }}
                    >
                      {k.valore}
                    </div>
                    <div className="kpi-etichetta">{k.etichetta}</div>
                    {k.confronto && (
                      <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal" }}>
                        {k.confronto}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="due-colonne">
              <div>
                {/* I findings, i più gravi in cima: la barra a sinistra e la
                    pillola dicono la priorità prima che si legga una parola. */}
                <section className="scheda">
                  <div className="scheda-titolo">Cosa ha trovato ({scheda.findings.length})</div>
                  {scheda.findings.length === 0 ? (
                    <div className="vuoto-mini">Il documento non elenca findings.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[...scheda.findings]
                        .sort((a, b) => a.priorita.localeCompare(b.priorita))
                        .map((f, i) => (
                          <div
                            key={i}
                            style={{
                              borderLeft: `3px solid ${COLORE_PRIORITA[f.priorita]}`,
                              paddingLeft: 12,
                              paddingTop: 2,
                              paddingBottom: 2,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                              <Badge testo={f.priorita} colore={COLORE_PRIORITA[f.priorita]} />
                              <b style={{ fontSize: 13.5 }}>{f.titolo}</b>
                            </div>
                            <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 4 }}>
                              {f.dettaglio}
                            </div>
                            {f.campagne.length > 0 && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                {f.campagne.map((n) => (
                                  <ChipCampagna key={n} nome={n} />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </section>

                {/* Le campagne, ognuna col SUO semaforo: è la riga che il
                    bottone ANALISI della scheda campagna mostra come tooltip,
                    qui per esteso e cliccabile. */}
                {scheda.campagne.length > 0 && (
                  <section className="scheda">
                    <div className="scheda-titolo">Campagna per campagna ({scheda.campagne.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[...scheda.campagne]
                        .sort((a, b) => ["rosso", "giallo", "verde"].indexOf(a.verdetto) - ["rosso", "giallo", "verde"].indexOf(b.verdetto))
                        .map((c) => {
                          const cid = idCampagna(c.nome);
                          return (
                            <div key={c.nome} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                              <span
                                title={ETICHETTA_VERDETTO[c.verdetto]}
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "50%",
                                  background: COLORE_VERDETTO[c.verdetto],
                                  flexShrink: 0,
                                  position: "relative",
                                  top: 1,
                                }}
                              />
                              <div style={{ minWidth: 0 }}>
                                {cid ? (
                                  <a className="cella-nome" href={`/campagne/${cid}`}>{c.nome}</a>
                                ) : (
                                  <span className="cella-nome" style={{ opacity: 0.75 }}>{c.nome}</span>
                                )}
                                <div className="cella-sub" style={{ whiteSpace: "normal" }}>{c.nota}</div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </section>
                )}

                <section className="scheda">
                  <div className="scheda-titolo">
                    Azioni derivate ({analisi.azioni.length}{aperte > 0 ? `, ${aperte} aperte` : ""})
                  </div>
                  {analisi.azioni.length === 0 ? (
                    <div className="vuoto-mini">Nessuna azione collegata: creane una dal bottone qui accanto.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Azione</th>
                            <th>Stato</th>
                            <th>Scadenza</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analisi.azioni.map((a) => (
                            <tr key={a.id}>
                              <td><a href={`/azioni/${a.id}`} className="cella-nome">{a.titolo}</a></td>
                              <td>
                                <Badge testo={ETICHETTA_STATO_AZIONE[a.stato] ?? a.stato} colore={COLORE_STATO_AZIONE[a.stato] ?? "var(--text-tertiary)"} />
                              </td>
                              <td>
                                <Scadenza data={a.scadenza} chiusa={!STATI_AZIONE_APERTI.includes(a.stato)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

              <div>
                <section className="scheda">
                  <div className="scheda-titolo">In breve</div>
                  <div className="sintesi-testo">{scheda.sintesi}</div>
                </section>

                {/* Le azioni che il DOCUMENTO propone: non sono ancora azioni
                    dell'app — diventarlo è un click, ma è un click di una
                    persona. */}
                {scheda.azioni.length > 0 && (
                  <section className="scheda">
                    <div className="scheda-titolo">Cosa propone il documento</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[...scheda.azioni]
                        .sort((a, b) => a.priorita.localeCompare(b.priorita))
                        .map((a, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                            <Badge testo={a.codice ? `${a.priorita} ${a.codice}` : a.priorita} colore={COLORE_PRIORITA[a.priorita]} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, whiteSpace: "normal" }}>{a.testo}</div>
                              {a.quando && <div className="cella-sub">entro {a.quando}</div>}
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>
                )}

                {scheda.nonCoperto.length > 0 && (
                  <section className="scheda">
                    <div className="scheda-titolo">Cosa NON copre</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)" }}>
                      {scheda.nonCoperto.map((n, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{n}</li>
                      ))}
                    </ul>
                    <div className="cella-sub" style={{ marginTop: 8, whiteSpace: "normal" }}>
                      Dichiarato dal documento stesso: un&apos;analisi che dice cosa le manca vale più di una
                      che sembra completa.
                    </div>
                  </section>
                )}

                <section className="scheda">
                  <div className="scheda-titolo">Cosa fare</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <a className="btn" href={`/azioni/nuova?analisi=${analisi.id}&brand=${analisi.brand}`}>
                      Crea azione da questa analisi
                    </a>
                    <a className="btn btn-secondario" href={`/analisi?brand=${analisi.brand}`}>
                      Altre analisi {ETICHETTA_BRAND[analisi.brand] ?? analisi.brand}
                    </a>
                  </div>
                </section>

                <section className="scheda">
                  <div className="scheda-titolo">La scheda e il documento</div>
                  <div className="cella-sub" style={{ whiteSpace: "normal" }}>
                    Questa scheda è la <b>rilettura AI</b> del documento (
                    {analisi.elaborataIl ? formattaDataOra(analisi.elaborataIl) : "—"}
                    {analisi.elaborataCon ? `, ${analisi.elaborataCon}` : ""}). La fonte resta il file su Drive
                    {analisi.fileDrive ? `: ${analisi.fileDrive}` : "."}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {elaborabile && (
                      <form action={elaboraSchedaAnalisi}>
                        <input type="hidden" name="id" value={analisi.id} />
                        <button className="btn small btn-secondario" type="submit" title="Rilegge il documento da Drive e rifà la scheda: utile se il file è cambiato">
                          Rielabora
                        </button>
                      </form>
                    )}
                    {analisi.fileDrive && (
                      <a className="btn small btn-secondario" href={`/drive?q=${encodeURIComponent(analisi.fileDrive.split("/").pop() ?? "")}`}>
                        Trova su Drive
                      </a>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Senza scheda: la pagina di prima, più l'invito a elaborarla. */}
            <div className="kpi-riga">
              <div className="kpi">
                <div className="kpi-valore">{analisi.azioni.length}</div>
                <div className="kpi-etichetta">Azioni derivate</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore" style={aperte > 0 ? { color: "var(--orange)" } : undefined}>{aperte}</div>
                <div className="kpi-etichetta">Ancora aperte</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore" style={{ fontSize: 18 }}>{ETICHETTA_TIPO_ANALISI[analisi.tipo] ?? analisi.tipo}</div>
                <div className="kpi-etichetta">Tipo di analisi</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore" style={{ fontSize: 18 }}>
                  {analisi.canale ? ETICHETTA_CANALE[analisi.canale] ?? analisi.canale : "—"}
                </div>
                <div className="kpi-etichetta">Canale</div>
              </div>
            </div>

            <div className="due-colonne">
              <div>
                <section className="scheda">
                  <div className="scheda-titolo">Sintesi operativa</div>
                  <div className="sintesi-testo">{analisi.sintesi}</div>
                </section>

                <section className="scheda">
                  <div className="scheda-titolo">
                    Azioni derivate ({analisi.azioni.length}{aperte > 0 ? `, ${aperte} aperte` : ""})
                  </div>
                  {analisi.azioni.length === 0 ? (
                    <div className="vuoto-mini">Nessuna azione collegata: creane una dal bottone qui accanto.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Azione</th>
                            <th>Stato</th>
                            <th>Scadenza</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analisi.azioni.map((a) => (
                            <tr key={a.id}>
                              <td><a href={`/azioni/${a.id}`} className="cella-nome">{a.titolo}</a></td>
                              <td>
                                <Badge testo={ETICHETTA_STATO_AZIONE[a.stato] ?? a.stato} colore={COLORE_STATO_AZIONE[a.stato] ?? "var(--text-tertiary)"} />
                              </td>
                              <td>
                                <Scadenza data={a.scadenza} chiusa={!STATI_AZIONE_APERTI.includes(a.stato)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

              <div>
                {/* La scheda non c'è ancora: il bottone la fa nascere. Solo per
                    i documenti di testo — un .xlsx non si manda a un modello. */}
                <section className="scheda" style={{ borderColor: "rgba(0,113,227,.3)" }}>
                  <div className="scheda-titolo">Scheda grafica</div>
                  {elaborabile ? (
                    <>
                      <div className="cella-sub" style={{ whiteSpace: "normal" }}>
                        L&apos;AI legge il documento completo da Drive e lo rielabora in verdetto, numeri
                        chiave, findings con priorità e campagne citate — la stessa pagina, in forma grafica.
                      </div>
                      <form action={elaboraSchedaAnalisi} style={{ marginTop: 10 }}>
                        <input type="hidden" name="id" value={analisi.id} />
                        <button className="btn" type="submit">Elabora la scheda</button>
                      </form>
                    </>
                  ) : (
                    <div className="cella-sub" style={{ whiteSpace: "normal" }}>
                      {analisi.fileDrive
                        ? "Il documento non è testo (.md/.txt): la scheda si elabora solo dai documenti leggibili."
                        : "Questa analisi non ha un documento su Drive: non c'è niente da rielaborare."}
                    </div>
                  )}
                </section>

                <section className="scheda">
                  <div className="scheda-titolo">Cosa fare</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <a className="btn" href={`/azioni/nuova?analisi=${analisi.id}&brand=${analisi.brand}`}>
                      Crea azione da questa analisi
                    </a>
                    <a className="btn btn-secondario" href={`/analisi?brand=${analisi.brand}`}>
                      Altre analisi {ETICHETTA_BRAND[analisi.brand] ?? analisi.brand}
                    </a>
                    {analisi.canale && (
                      <a className="btn btn-secondario" href={`/campagne?canale=${analisi.canale}`}>
                        Campagne {ETICHETTA_CANALE[analisi.canale] ?? analisi.canale}
                      </a>
                    )}
                  </div>
                </section>

                <section className="scheda">
                  <div className="scheda-titolo">Documento su Drive</div>
                  {analisi.fileDrive ? (
                    <>
                      <div className="cella-sub" style={{ whiteSpace: "normal", overflowWrap: "anywhere", fontSize: 12.5 }}>
                        {analisi.fileDrive}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <a className="btn small btn-secondario" href={`/drive?q=${encodeURIComponent(analisi.fileDrive.split("/").pop() ?? "")}`}>
                          Trova nell&apos;indice Drive
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="vuoto-mini">Nessun documento collegato</div>
                  )}
                </section>

                {analisi.note && (
                  <section className="scheda">
                    <div className="scheda-titolo">Note</div>
                    <div className="sintesi-testo">{analisi.note}</div>
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
