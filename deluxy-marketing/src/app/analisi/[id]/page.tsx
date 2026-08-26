import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Icona } from "@/components/Icona";
import { Scadenza } from "@/components/Scadenza";
import { Sidebar } from "@/components/Sidebar";
import { accodaAzioneScheda, elaboraSchedaAnalisi, riconciliaSchedaAnalisi, rispondiAzioneScheda } from "@/lib/azioni";
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
import { COLORE_PRIORITA, COLORE_RISPOSTA, COLORE_STATO_RICONCILIATO, COLORE_VERDETTO, descriviOperazione, ETICHETTA_RISPOSTA, ETICHETTA_STATO_RICONCILIATO, ETICHETTA_VERDETTO, mappaCampagneCitate, operazioneDaProposta, proposteDi, riconciliazioneDi, risposteDi, schedaDi } from "@/lib/scheda-analisi";

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
  searchParams: Promise<{ scheda?: string; coda?: string; errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const analisi = await prisma.analisi.findUnique({
    where: { id },
    include: { azioni: { orderBy: { creataIl: "desc" } } },
  });
  if (!analisi) notFound();

  const scheda = schedaDi(analisi);
  // Cosa risulta FATTO di quello che il report chiede, incrociato con la coda
  // dall'AI (cron dopo ogni giro, o il bottone «Riconcilia adesso»).
  const riconciliazione = riconciliazioneDi(analisi);
  // Le risposte dell'utente alle azioni: la voce che torna ai progetti di
  // analisi via Drive. Qui si mostrano e si danno.
  const risposte = risposteDi(analisi);
  const statoAzione = (indice: number) => riconciliazione?.azioni.find((a) => a.indice === indice) ?? null;

  // Le campagne che la scheda nomina, agganciate a quelle vere. I documenti
  // abbreviano i nomi, quindi l'aggancio è normalizzato — e l'ambiguo NON si
  // aggancia: un chip grigio è meglio di un link alla campagna sbagliata.
  const nomiCitati = scheda
    ? [
        ...new Set([
          ...scheda.campagne.map((c) => c.nome),
          ...scheda.findings.flatMap((f) => f.campagne),
          ...scheda.azioni.flatMap((a) => proposteDi(a).map((o) => o.campagna)),
        ]),
      ]
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

  // Le azioni della scheda che si possono METTERE IN CODA: la mappa dell'AI
  // rivista dal codice (tipo, parametri, canale della campagna) e l'aggancio
  // non ambiguo. E se un'operazione IDENTICA è già in coda viva, il bottone
  // diventa «già in coda»: il doppio invio è la trappola di stamattina.
  // La coda comprende anche le ESEGUITE: un'operazione già fatta non deve
  // ripresentarsi come bottone — è il doppio invio con un giorno di ritardo.
  const codaViva = scheda
    ? await prisma.operazioneAdv.findMany({
        where: {
          stato: { in: ["in_attesa", "approvata", "eseguita"] },
          campagnaId: { in: [...agganci.values()].map((x) => x.id) },
        },
        select: { id: true, tipo: true, campagnaId: true, parametri: true, stato: true },
      })
    : [];
  // Le proposte di UN'azione, riviste dal codice: una per campagna citata.
  const propostePronte = (i: number) => {
    const az = scheda!.azioni[i];
    return proposteDi(az).flatMap((proposta, k) => {
      const aggancio = agganci.get(proposta.campagna);
      if (!aggancio) return [];
      const pronta = operazioneDaProposta(proposta, aggancio.canale);
      if (!pronta) return [];
      const parametri = pronta.parametri ? JSON.stringify(pronta.parametri) : null;
      const uguale = codaViva.find((o) => {
        if (o.tipo !== pronta.tipo || o.campagnaId !== aggancio.id) return false;
        if ((o.parametri ?? null) === parametri) return true;
        // ⚠️ Per le rimozioni il confronto è per SOTTOINSIEME: la proposta
        // «per descrizione» e l'operazione eseguita «titolo + descrizione»
        // sono la stessa rimozione — il claim è quello. Senza questo, il
        // bottone riproponeva una rimozione già fatta.
        if (pronta.tipo === "rimuovi_estensione" && o.parametri && pronta.parametri) {
          try {
            const suoi = JSON.parse(o.parametri) as Record<string, unknown>;
            return Object.entries(pronta.parametri).every(
              ([k, v]) => String(suoi[k] ?? "").trim().toLowerCase() === String(v ?? "").trim().toLowerCase()
            );
          } catch { return false; }
        }
        return false;
      });
      return [{
        k,
        pronta,
        aggancio,
        inCoda: uguale?.stato === "in_attesa" || uguale?.stato === "approvata",
        eseguitaId: uguale?.stato === "eseguita" ? uguale.id : null,
      }];
    });
  };

  // ═══ UNA COLONNA SOLA (richiesta utente, 26/08): findings e azioni sono la
  // stessa storia raccontata due volte — F16 dice che le enhanced conversions
  // sono rotte, la #19 dice di aggiustarle. Ogni azione si attacca al finding
  // che la CITA (il codice «#17» compare nel testo del finding); le azioni che
  // nessun finding cita restano in un blocco a parte. L'aggancio esige un
  // confine dopo il codice: «#1» non deve combaciare dentro «#17».
  const azioniDelFinding = new Map<number, number[]>();
  const azioniAttaccate = new Set<number>();
  if (scheda) {
    for (let ai = 0; ai < scheda.azioni.length; ai++) {
      const az = scheda.azioni[ai];
      // 1) La parola dell'AI, che ha scritto entrambi: `finding` è l'indice
      // del finding a cui l'azione risponde. È il legame giusto anche quando
      // il finding non cita il codice (F5 non nomina la #50, ma la #50 è la
      // sua cura).
      if (az.finding != null && Number.isInteger(az.finding) && az.finding >= 0 && az.finding < scheda.findings.length) {
        azioniDelFinding.set(az.finding, [...(azioniDelFinding.get(az.finding) ?? []), ai]);
        azioniAttaccate.add(ai);
        continue;
      }
      // 2) Le schede vecchie non hanno `finding`: si ripiega sulla citazione
      // del codice nel testo del finding, col confine dopo il numero.
      const cod = az.codice?.trim();
      if (!cod || cod.length < 2) continue;
      const re = new RegExp(cod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![0-9A-Za-z])");
      for (let fi = 0; fi < scheda.findings.length; fi++) {
        const f = scheda.findings[fi];
        if (re.test(f.titolo + " " + f.dettaglio)) {
          azioniDelFinding.set(fi, [...(azioniDelFinding.get(fi) ?? []), ai]);
          azioniAttaccate.add(ai);
          break;
        }
      }
    }
  }
  const azioniRestanti = scheda ? scheda.azioni.map((_, i) => i).filter((i) => !azioniAttaccate.has(i)) : [];

  // La riga di UN'azione proposta: pillola, testo, stato riconciliato, bottone.
  // È una funzione perché vive in due posti — sotto il finding che la cita e
  // nel blocco delle azioni senza finding.
  const rigaAzione = (indice: number) => {
    const az = scheda!.azioni[indice];
    const pronte = propostePronte(indice);
    const st = statoAzione(indice);
    return (
      <div key={indice} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <Badge testo={az.codice ? `${az.priorita} ${az.codice}` : az.priorita} colore={COLORE_PRIORITA[az.priorita]} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, whiteSpace: "normal" }}>
            {az.testo}
            {st && (
              <span style={{ marginLeft: 8, display: "inline-flex", gap: 6, alignItems: "center" }}>
                <Badge testo={ETICHETTA_STATO_RICONCILIATO[st.stato]} colore={COLORE_STATO_RICONCILIATO[st.stato]} />
              </span>
            )}
          </div>
          {st?.nota && (
            <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 2 }}>
              {st.nota}
              {st.operazioni.map((oid) => (
                <a key={oid} href={`/operazioni#op-${oid}`} style={{ marginLeft: 6, color: "var(--blue)" }} title="Apri l'operazione nella coda">
                  → operazione
                </a>
              ))}
            </div>
          )}
          {az.quando && <div className="cella-sub">entro {az.quando}</div>}
          {/* UNA RIGA PER PROPOSTA — un'azione su quattro campagne sono
              quattro bottoni, ognuno col suo destino: da accodare, già in
              coda, o già eseguita (e allora niente bottone: il doppio invio
              con un giorno di ritardo resta un doppio invio). */}
          {/* LA RISPOSTA dell'utente: accolta/respinta/rimandata + nota.
              Finisce su Drive nello stesso giro, così la prossima analisi la
              esamina — respinta non si ripropone senza fatti nuovi. */}
          {(() => {
            const risp = risposte[String(indice)];
            return (
              <div style={{ marginTop: 6 }}>
                {risp && (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginRight: 8 }}>
                    <Badge testo={ETICHETTA_RISPOSTA[risp.r]} colore={COLORE_RISPOSTA[risp.r]} />
                    {risp.nota && <span className="cella-sub" style={{ whiteSpace: "normal" }}>{risp.nota}</span>}
                  </span>
                )}
                <details style={{ display: "inline-block" }}>
                  <summary className="cella-sub" style={{ cursor: "pointer", listStyle: "none", color: "var(--blue)" }}>
                    {risp ? "cambia risposta" : "Rispondi alla proposta"}
                  </summary>
                  <form
                    action={rispondiAzioneScheda}
                    style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}
                  >
                    <input type="hidden" name="analisi" value={analisi.id} />
                    <input type="hidden" name="indice" value={indice} />
                    <input
                      name="nota"
                      placeholder="Nota per la prossima analisi (facoltativa)"
                      defaultValue={risp?.nota ?? ""}
                      style={{ minWidth: 260, fontSize: 12.5 }}
                    />
                    <button className="btn small btn-secondario" type="submit" name="r" value="accolta" style={{ color: "var(--green)" }}>
                      Accogli
                    </button>
                    <button className="btn small btn-secondario" type="submit" name="r" value="respinta" style={{ color: "var(--red)" }}>
                      Respingi
                    </button>
                    <button className="btn small btn-secondario" type="submit" name="r" value="rimandata" style={{ color: "var(--orange)" }} title="Di' nella nota quando ripresentarla">
                      Rimanda
                    </button>
                  </form>
                </details>
              </div>
            );
          })()}
          {pronte.length > 0 && !["fatta"].includes(st?.stato ?? "") && (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {pronte.map((ex) =>
                ex.eseguitaId ? (
                  <a
                    key={ex.k}
                    className="tag-neutro"
                    href={`/operazioni#op-${ex.eseguitaId}`}
                    style={{ textDecoration: "none", color: "var(--green)" }}
                    title={`Già eseguita su ${ex.aggancio.nome}`}
                  >
                    ✓ {descriviOperazione(ex.pronta)} — già eseguita
                  </a>
                ) : ex.inCoda ? (
                  <a key={ex.k} className="tag-neutro" href="/operazioni" style={{ textDecoration: "none" }}>
                    ✓ già in coda — vai ad approvarla
                  </a>
                ) : (
                  <form key={ex.k} action={accodaAzioneScheda} style={{ display: "inline" }}>
                    <input type="hidden" name="analisi" value={analisi.id} />
                    <input type="hidden" name="indice" value={indice} />
                    <input type="hidden" name="op" value={ex.k} />
                    <button
                      className="btn small btn-secondario"
                      type="submit"
                      title={`Nasce «da approvare» su /operazioni, per ${ex.aggancio.nome}: niente parte senza il tuo ok`}
                    >
                      Metti in coda: {descriviOperazione(ex.pronta)} · {ex.aggancio.nome} →
                    </button>
                  </form>
                )
              )}
            </div>
          )}
        </div>
      </div>
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

        {sp.coda === "fallita" && (
          <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
            <span>
              <b>Non messa in coda.</b> {sp.errore ?? ""}
            </span>
          </div>
        )}

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

            {/* ═══ UNA COLONNA SOLA: il finding e l'azione che ne discende
                stanno insieme — la diagnosi sopra, la cura sotto, lo stato
                riconciliato accanto. La testata porta la riconciliazione. */}
            <section className="scheda">
              <div className="scheda-titolo" style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span>Cosa ha trovato — e cosa fare ({scheda.findings.length})</span>
                <span className="cella-sub" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  {analisi.riconciliataIl
                    ? `riconciliato con la coda ${formattaDataOra(analisi.riconciliataIl)}`
                    : "non ancora riconciliato con la coda"}
                </span>
                <form action={riconciliaSchedaAnalisi} style={{ marginLeft: "auto" }}>
                  <input type="hidden" name="id" value={analisi.id} />
                  <button
                    className="btn small btn-secondario"
                    type="submit"
                    title="Incrocia le azioni del report con la coda operazioni: cosa risulta fatto, in corso, fallito"
                  >
                    Riconcilia adesso
                  </button>
                </form>
              </div>
              {scheda.findings.length === 0 ? (
                <div className="vuoto-mini">Il documento non elenca findings.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {scheda.findings
                    .map((f, fi) => ({ f, fi }))
                    .sort((x, y) => x.f.priorita.localeCompare(y.f.priorita))
                    .map(({ f, fi }) => (
                      <div
                        key={fi}
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
                        {/* Le azioni che questo finding CITA: la cura sotto la
                            diagnosi, con un filo di rientro e il fondo appena
                            diverso perché si veda dove finisce l'una e comincia
                            l'altra. */}
                        {(azioniDelFinding.get(fi) ?? []).length > 0 && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: "8px 10px",
                              background: "var(--fill-quaternary, rgba(0,0,0,.03))",
                              borderRadius: 8,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            {(azioniDelFinding.get(fi) ?? []).map((ai) => rigaAzione(ai))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
              {/* Le azioni che NESSUN finding cita: in fondo alla stessa
                  colonna, non in un'altra — è la richiesta. */}
              {azioniRestanti.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--separator, rgba(0,0,0,.08))" }}>
                  <div className="cella-sub" style={{ marginBottom: 8 }}>
                    Altre azioni proposte dal documento, non legate a un finding qui sopra ({azioniRestanti.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {azioniRestanti
                      .sort((x, y) => scheda.azioni[x].priorita.localeCompare(scheda.azioni[y].priorita))
                      .map((ai) => rigaAzione(ai))}
                  </div>
                </div>
              )}
            </section>

            <div className="due-colonne">
              <div>
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
