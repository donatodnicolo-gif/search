import { notFound } from "next/navigation";
import { AndamentoMensile } from "@/components/AndamentoMensile";
import { Badge } from "@/components/Badge";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { SceltaPeriodo } from "@/components/SceltaPeriodo";
import { SelettoreStato } from "@/components/SelettoreStato";
import { Stagionalita } from "@/components/Stagionalita";
import { Sidebar } from "@/components/Sidebar";
import { cambiaStatoGruppo, cambiaStatoKeyword, creaOperazioneGruppo, creaOperazioneKeyword, rinominaGruppo } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { periodoApp } from "@/lib/periodo-condiviso";
import { giudizioKeyword } from "@/lib/salute";
import {
  COLORE_BRAND,
  ETICHETTA_BRAND,
  formattaData,
  formattaDataOra,
  formattaEuro,
  formattaNumero,
  roas as calcolaRoas,
  STATI_KEYWORD,
  ETICHETTA_STATO_KEYWORD,
} from "@/lib/dominio";
import {
  COLORE_STATO_GRUPPO,
  ETICHETTA_STATO_GRUPPO,
  ETICHETTA_STATO_PIATTAFORMA,
  ETICHETTA_TIPO_GRUPPO,

  letturaRoas,
  nomeGruppo,
  STATI_GRUPPO,
} from "@/lib/gruppi";

export const dynamic = "force-dynamic";

// Scheda di un gruppo di annunci: gli stessi occhi della scheda campagna, un
// piano più sotto. Qui si vede se il gruppo si merita la spesa che si prende,
// e da qui si mette in pausa — passando dalla coda approvata, mai a mano.
export default async function SchedaGruppo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bloccata?: string; preset?: string; da?: string; a?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { bloccata } = sp;

  // Il periodo è quello condiviso di tutta l'app, come sulla scheda campagna.
  // Prima qui era inchiodato agli ultimi 30 giorni: su un gruppo fermo da
  // settimane quella finestra è VUOTA, e la scheda mostrava tutti zeri senza
  // dire che era una questione di date. Un gruppo con 761 giorni di storia
  // sembrava non aver mai speso niente.
  const periodo = await periodoApp(sp);

  const gruppo = await prisma.gruppo.findUnique({
    where: { id },
    include: {
      campagna: {
        select: {
          id: true, nome: true, brand: true, classe: true, stato: true,
          // Su Google il budget sta sulla CAMPAGNA, mai sul gruppo: senza
          // saperlo qui non si capisce di quanto si sta parlando.
          budgetGiornaliero: true, strategiaOfferta: true,
        },
      },
      // Tutte le metriche: il filtro sul periodo si fa qui sotto, e serve
      // conoscere anche l'ultimo giorno con dati per poterlo dire.
      metriche: { orderBy: { data: "desc" } },
      operazioni: { orderBy: { creataIl: "desc" }, take: 10 },
    },
  });
  if (!gruppo) notFound();

  const da = periodo.corrente.da;
  const nelPeriodo = gruppo.metriche.filter((m) => m.data >= periodo.corrente.da && m.data < periodo.corrente.a);
  // L'ultimo giorno in cui questo gruppo ha davvero speso: è la risposta alla
  // domanda «perché è tutto a zero?».
  const ultimoConDati = gruppo.metriche.find((m) => (m.spesa ?? 0) > 0)?.data ?? null;
  const spesa = nelPeriodo.reduce((s, m) => s + (m.spesa ?? 0), 0);
  const ricavi = nelPeriodo.reduce((s, m) => s + (m.ricavi ?? 0), 0);
  const conversioni = nelPeriodo.reduce((s, m) => s + (m.conversioni ?? 0), 0);
  const click = nelPeriodo.reduce((s, m) => s + (m.click ?? 0), 0);
  const r = calcolaRoas(ricavi, spesa);
  const lettura = letturaRoas(r, spesa, gruppo.brand);
  const inPausa = gruppo.statoPiattaforma === "PAUSED";
  const pmax = gruppo.tipo === "asset_group_pmax";

  // Quanto pesa dentro la sua campagna, nello stesso periodo
  const totaleCampagna = await prisma.metricaGruppo.aggregate({
    where: { data: { gte: da }, gruppo: { campagnaId: gruppo.campagnaId } },
    _sum: { spesa: true, ricavi: true },
  });
  const spesaCampagna = totaleCampagna._sum.spesa ?? 0;
  const quota = spesaCampagna > 0 ? spesa / spesaCampagna : null;

  // I fratelli: quanti gruppi attivi ha la campagna madre.
  // Serve a leggere il budget. Il budget giornaliero è della campagna, non del
  // gruppo: se i gruppi attivi sono più d'uno se lo dividono in base all'asta,
  // e nessuno sa quanto ne prende ciascuno. Se invece questo è l'UNICO attivo,
  // quel budget è di fatto suo — e allora la domanda «sto spendendo tutto
  // quello che potrei?» ha una risposta.
  const fratelli = await prisma.gruppo.findMany({
    where: { campagnaId: gruppo.campagnaId },
    select: { id: true, nome: true, nomeVisibile: true, statoPiattaforma: true },
  });
  const attivi = fratelli.filter((g) => g.statoPiattaforma !== "PAUSED" && g.statoPiattaforma !== "REMOVED");
  const unicoAttivo = attivi.length === 1 && attivi[0].id === gruppo.id;

  // Con un solo gruppo attivo si può dire quanto del budget viene consumato:
  // spesa media al giorno contro budget giornaliero della campagna.
  const budget = gruppo.campagna.budgetGiornaliero;
  const giorniConSpesa = nelPeriodo.filter((m) => (m.spesa ?? 0) > 0).length;
  const spesaMediaGiorno = giorniConSpesa > 0 ? spesa / giorniConSpesa : null;
  const usoBudget = unicoAttivo && budget && spesaMediaGiorno != null ? spesaMediaGiorno / budget : null;

  // Le keyword e i testi che vivono in questo gruppo: il campo `gruppo` di
  // CopyAnnuncio può elencarne più d'uno ("Gruppo A, Gruppo B"), quindi si
  // cerca per contenuto.
  const copy = await prisma.copyAnnuncio.findMany({
    where: { campagna: gruppo.campagna.nome, gruppo: { contains: gruppo.nome } },
    orderBy: [{ tipo: "asc" }, { spesa: "desc" }],
    take: 200,
  });
  const keyword = copy.filter((c) => c.tipo === "keyword");

  // Le parole cercate davvero, quelle che hanno fatto scattare gli annunci.
  // Anche queste sono a finestra (dal/al scritti dallo script), non giornaliere.
  const termini = await prisma.termineRicerca.findMany({
    where: { campagnaId: gruppo.campagnaId, gruppo: { contains: gruppo.nome } },
    orderBy: [{ spesa: "desc" }, { clic: "desc" }],
    take: 60,
  });
  const conFinestra = termini.find((t) => t.dal && t.al);
  const finestraTermini = conFinestra?.dal && conFinestra?.al
    ? `${formattaData(conFinestra.dal)} – ${formattaData(conFinestra.al)}`
    : null;

  // Quando è stata scattata la fotografia delle keyword: serve a dire che NON
  // seguono il periodo scelto in cima alla pagina.
  const ultimaLetturaKeyword = keyword.reduce<Date | null>(
    (max, k) => (k.metricheAl && (!max || k.metricheAl > max) ? k.metricheAl : max),
    null
  );
  const testi = copy.filter((c) => c.tipo === "titolo" || c.tipo === "descrizione");

  const operazioneAperta = gruppo.operazioni.find((o) => o.stato === "in_attesa" || o.stato === "approvata");

  return (
    <div className="layout">
      <Sidebar attiva="gruppi" brandAttivo={gruppo.brand} />
      <main className="main">
        {/* Si arriva quasi sempre da una campagna, non dall elenco: tornare
            all elenco fa ripartire la ricerca da capo. La campagna madre e il
            ritorno naturale, l elenco resta a fianco. */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <a className="ritorno" href={`/campagne/${gruppo.campagnaId}`}>← {gruppo.campagna.nome}</a>
          <a className="ritorno" href="/gruppi" style={{ opacity: .7 }}>Tutti i gruppi</a>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">{nomeGruppo(gruppo)}</h1>
            <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {/* Quando il nome è nostro, quello di Google resta a vista: è
                  quello da cercare nell'interfaccia di Google Ads, e senza si
                  perderebbe l'unico modo di ritrovare il gruppo di là. */}
              {gruppo.nomeVisibile && (
                <span className="tag-neutro" title="Il nome che ha su Google Ads">
                  su Google: {gruppo.nome}
                </span>
              )}
              <a href={`/campagne/${gruppo.campagnaId}`}>{gruppo.campagna.nome}</a>
              <Badge testo={ETICHETTA_BRAND[gruppo.brand] ?? gruppo.brand} colore={COLORE_BRAND[gruppo.brand] ?? "var(--text-tertiary)"} />
              {gruppo.tipo && <span className="tag-neutro">{ETICHETTA_TIPO_GRUPPO[gruppo.tipo] ?? gruppo.tipo}</span>}
              {/* Lo stato di Google sta sempre in testa, non solo quando è un
                  problema: quello è il fatto, il giudizio dell'app è un'altra
                  cosa e sta nel suo riquadro più sotto. */}
              <Badge
                testo={
                  ETICHETTA_STATO_PIATTAFORMA[gruppo.statoPiattaforma?.toUpperCase() ?? ""] ??
                  "stato su Google non ancora letto"
                }
                colore={
                  inPausa
                    ? "var(--orange)"
                    : gruppo.statoPiattaforma === "ENABLED"
                      ? "var(--green)"
                      : "var(--text-tertiary)"
                }
              />
            </p>
          </div>
        </div>

        <SceltaPeriodo periodo={periodo} da={sp.da} a={sp.a} azione={`/gruppi/${gruppo.id}`} />

        {bloccata && (
          <div className="avviso-errore">
            <strong>Bloccata dal change control:</strong> {bloccata}
          </div>
        )}

        {/* Zero speso in un periodo non vuol dire zero speso mai. Senza questa
            riga la scheda di un gruppo fermo è indistinguibile da quella di un
            gruppo che non ha mai funzionato — e la differenza è tutta. */}
        {nelPeriodo.length === 0 && (
          <div className="nota-info">
            <span className="nota-icona">📅</span>
            <span>
              <b>In questo periodo il gruppo non ha dati.</b>{" "}
              {ultimoConDati ? (
                <>
                  L&apos;ultimo giorno in cui ha speso è il <b>{formattaData(ultimoConDati)}</b>: i numeri
                  qui sotto sono a zero per le date scelte, non perché il gruppo non abbia mai lavorato
                  (ne ha {formattaNumero(gruppo.metriche.length)} giorni in archivio). Allarga il periodo
                  qui sopra per vederli.
                </>
              ) : (
                <>Non risulta spesa in nessun giorno: questo gruppo non ha mai erogato.</>
              )}
            </span>
          </div>
        )}

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(spesa)}</div>
            <div className="kpi-etichetta">
              Spesa nel periodo{quota != null ? ` · ${Math.round(quota * 100)}% della campagna` : ""}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(ricavi)}</div>
            <div className="kpi-etichetta">Ricavi attribuiti</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaNumero(Math.round(conversioni * 10) / 10)}</div>
            <div className="kpi-etichetta">
              Conversioni{conversioni > 0 ? ` · CPA ${formattaEuro(spesa / conversioni)}` : ""}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaNumero(click)}</div>
            <div className="kpi-etichetta">Click</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ color: lettura.colore }}>{lettura.testo}</div>
            <div className="kpi-etichetta">ROAS · {lettura.spiega}</div>
          </div>
          {/* Il budget è della campagna, non del gruppo: qui si dice di chi è
              e se questo gruppo se lo prende tutto. */}
          <div className="kpi">
            <div className="kpi-valore">{budget != null ? `${formattaEuro(budget)}/g` : "—"}</div>
            <div className="kpi-etichetta">
              Budget della campagna
              {unicoAttivo
                ? " · tutto suo: è l'unico gruppo attivo"
                : attivi.length > 1
                  ? ` · diviso con altri ${attivi.length - 1} gruppi attivi`
                  : ""}
            </div>
          </div>
        </div>

        {/* Il flag che l'utente ha chiesto: cambia come si legge tutto il resto */}
        {unicoAttivo ? (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>È l&apos;unico gruppo attivo della campagna.</b> Il budget giornaliero di{" "}
              <a href={`/campagne/${gruppo.campagnaId}`} style={{ color: "var(--blue)" }}>{gruppo.campagna.nome}</a>
              {budget != null ? <> — <b>{formattaEuro(budget)}</b> — </> : " "}
              va tutto qui, quindi spesa del gruppo e spesa della campagna coincidono
              {usoBudget != null && (
                <>
                  : nei giorni in cui ha speso ne ha usato in media il{" "}
                  <b style={{ color: usoBudget >= 0.9 ? "var(--orange)" : undefined }}>{Math.round(usoBudget * 100)}%</b>
                  {usoBudget >= 0.9
                    ? " — è al tetto, e con un budget più alto probabilmente spenderebbe di più"
                    : usoBudget < 0.5
                      ? " — resta larga metà del budget: non è il budget a frenarlo"
                      : ""}
                </>
              )}
              . Mettere in pausa questo gruppo ferma la campagna.
            </span>
          </div>
        ) : attivi.length > 1 ? (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              La campagna ha <b>{attivi.length} gruppi attivi</b> che si dividono lo stesso budget
              {budget != null ? <> di <b>{formattaEuro(budget)}</b> al giorno</> : ""}: quanto ne
              prenda ciascuno lo decide l&apos;asta, non una ripartizione fissa. Qui sopra la quota
              vera, misurata sulla spesa. Gli altri attivi:{" "}
              {attivi
                .filter((g) => g.id !== gruppo.id)
                .map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && " · "}
                    <a href={`/gruppi/${g.id}`} style={{ color: "var(--blue)" }}>{g.nomeVisibile ?? g.nome}</a>
                  </span>
                ))}
              .
            </span>
          </div>
        ) : null}

        <div className="due-colonne">
          <div>
            <section className="scheda">
              <div className="scheda-titolo">Quando si vende — i dodici mesi</div>
              <p className="cella-sub" style={{ marginBottom: 14, whiteSpace: "normal" }}>
                I mesi già passati sono dati veri; per quelli che restano c&apos;è la media degli anni
                precedenti. Non è una previsione: è quello che è successo, e serve a sapere quando
                conviene avere budget pronto.
              </p>
              <Stagionalita
                punti={gruppo.metriche.map((m) => ({
                  data: m.data,
                  spesa: m.spesa,
                  ricavi: m.ricavi,
                  conversioni: m.conversioni,
                }))}
              />
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Andamento spesa nel periodo</div>
              <GraficoSpesa punti={[...nelPeriodo].reverse().map((m) => ({ data: m.data, valore: m.spesa ?? 0 }))} />
            </section>

            <section className="scheda">
              <div className="scheda-titolo">
                Metriche per mese ({gruppo.metriche.length} giorni)
              </div>
              <AndamentoMensile
                metriche={gruppo.metriche}
                vuoto={
                  <>
                    Nessuna metrica: le manda lo script di Google Ads con <code>AZIONE = &quot;gruppi&quot;</code>.
                  </>
                }
              />
            </section>

            {keyword.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Keyword del gruppo ({keyword.length})</div>

                {/* Questi numeri NON seguono il periodo scelto in cima, e va
                    detto prima della tabella: chi guarda "anno" e legge una
                    spesa di 30 giorni sbaglia di un ordine di grandezza. */}
                <div className="nota-info" style={{ marginBottom: 12 }}>
                  <span className="nota-icona">◈</span>
                  <span>
                    <b>Questi numeri non seguono il periodo scelto.</b> Le keyword non hanno una
                    storia giorno per giorno: l&apos;app conserva l&apos;ultima fotografia mandata dallo
                    script, che copre la <b>finestra fissa dello script</b> (30 giorni)
                    {ultimaLetturaKeyword && <> ed è aggiornata al <b>{formattaData(ultimaLetturaKeyword)}</b></>}.
                    Le metriche di gruppo qui sopra, invece, sono giornaliere e seguono il periodo.
                  </span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Keyword</th>
                        <th>Stato</th>
                        <th className="num">Spesa</th>
                        <th className="num">Incasso</th>
                        <th className="num">QS</th>
                        <th>Su Google</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keyword.map((k) => {
                        const inPausaGoogle = k.statoPiattaforma === "PAUSED";
                        // Il giudizio e lo stesso della pagina Keywords: una
                        // parola che spende senza rendere si vede in rosso da
                        // qui, senza doverla cercare altrove.
                        const g = giudizioKeyword(k.incasso ?? 0, k.spesa ?? 0);
                        return (
                          <tr key={k.id}>
                            <td>
                              <div className="cella-nome" style={g.colore === "var(--red)" ? { color: "var(--red)" } : undefined} title={g.spiega}>
                                {g.colore === "var(--red)" && <span aria-hidden="true">● </span>}
                                {k.testo}
                              </div>
                              <div className="cella-sub" style={{ color: g.colore }}>{g.etichetta}</div>
                              {k.gruppo && k.gruppo !== gruppo.nome && (
                                <div className="cella-sub">anche in: {k.gruppo}</div>
                              )}
                            </td>
                            <td>
                              {/* Lo stato deciso qui: è una nostra etichetta di
                                  lavoro, non tocca Google. */}
                              <form action={cambiaStatoKeyword}>
                                <input type="hidden" name="id" value={k.id} />
                                <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}`} />
                                <SelettoreStato
                                  valore={k.stato}
                                  opzioni={STATI_KEYWORD.map((s) => ({ valore: s, etichetta: ETICHETTA_STATO_KEYWORD[s] ?? s }))}
                                />
                              </form>
                            </td>
                            <td className="num">{formattaEuro(k.spesa)}</td>
                            <td className="num">{formattaEuro(k.incasso)}</td>
                            <td className="num cella-muta">{k.punteggioQualita ?? "—"}</td>
                            <td>
                              {/* Questo invece cambia Google davvero, quindi
                                  passa dalla coda: mette in attesa, non esegue. */}
                              <form action={creaOperazioneKeyword} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input type="hidden" name="campagnaId" value={gruppo.campagna.id} />
                                <input type="hidden" name="testo" value={k.testo} />
                                <input type="hidden" name="gruppo" value={gruppo.nome} />
                                <input type="hidden" name="idEsternoKeyword" value={k.idEsterno ?? ""} />
                                <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}`} />
                                <input type="hidden" name="tipo" value={inPausaGoogle ? "attiva_keyword" : "pausa_keyword"} />
                                <span className="tag-salute" style={{ color: inPausaGoogle ? "var(--text-tertiary)" : "var(--green)" }}>
                                  <span className="dot" />
                                  {inPausaGoogle ? "in pausa" : "attiva"}
                                </span>
                                <button className="btn small btn-secondario" type="submit">
                                  {inPausaGoogle ? "Riattiva" : "Metti in pausa"}
                                </button>
                              </form>
                              {/* Escludere e diverso da mettere in pausa: la
                                  negativa impedisce alla parola di far scattare
                                  gli annunci anche in futuro, e vale su tutta la
                                  campagna. Livello L0, il piu leggero. */}
                              <form action={creaOperazioneKeyword} style={{ marginTop: 6 }}>
                                <input type="hidden" name="campagnaId" value={gruppo.campagna.id} />
                                <input type="hidden" name="testo" value={k.testo} />
                                <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}`} />
                                <input type="hidden" name="tipo" value="negativa" />
                                <button className="btn small btn-secondario" type="submit" title="Aggiunge la parola come negativa: non fara piu scattare gli annunci di questa campagna">
                                  Escludi
                                </button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="cella-sub" style={{ marginTop: 8 }}>
                  «Riattiva» e «Metti in pausa» non toccano Google adesso: mettono l&apos;operazione in
                  coda, il guardrail la controlla e parte solo dopo la tua approvazione in{" "}
                  <a href="/operazioni" style={{ color: "var(--blue)" }}>Operazioni</a>.
                </p>
              </section>
            )}

            {termini.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">
                  Parole cercate davvero ({termini.length})
                </div>
                <p className="cella-sub" style={{ marginBottom: 12, whiteSpace: "normal" }}>
                  Cosa ha digitato la gente per far comparire questi annunci — non le keyword che
                  abbiamo scritto noi, ma le ricerche vere che le hanno attivate. È qui che si
                  trovano le parole da aggiungere e quelle da escludere.
                  {finestraTermini && (
                    <> Finestra: <b>{finestraTermini}</b>.</>
                  )}
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Parola cercata</th>
                        <th className="num">Spesa</th>
                        <th className="num">Clic</th>
                        <th className="num">Conv.</th>
                        <th className="num">Ricavi</th>
                        <th>Intercettata da</th>
                        <th data-no-ordina>Azione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {termini.map((t) => {
                        // Una parola cercata che spende e non converte e il
                        // caso da guardare per primo: si segna in rosso qui,
                        // invece di lasciarla in mezzo alle altre.
                        const brucia = (t.spesa ?? 0) >= 15 && (t.conversioni ?? 0) === 0;
                        const gia = t.stato === "escluso" || t.stato === "da_escludere";
                        return (
                        <tr key={t.id}>
                          <td style={{ maxWidth: 260 }}>
                            <div className="cella-nome" style={brucia ? { color: "var(--red)" } : undefined} title={brucia ? `${(t.spesa ?? 0).toFixed(0)} EUR spesi e nessuna conversione` : undefined}>
                              {brucia && <span aria-hidden="true">● </span>}
                              {t.testo}
                            </div>
                            {t.stato !== "nuovo" && (
                              <div className="cella-sub">{t.stato.replace("_", " ")}</div>
                            )}
                          </td>
                          <td className="num">{formattaEuro(t.spesa)}</td>
                          <td className="num">{formattaNumero(t.clic)}</td>
                          <td className="num">{formattaNumero(t.conversioni)}</td>
                          <td className="num">{formattaEuro(t.ricavi)}</td>
                          <td className="cella-muta" style={{ maxWidth: 200 }}>
                            {t.keyword ?? "—"}
                            {t.keywordDiverse && t.keywordDiverse > 1 && (
                              <div className="cella-sub">
                                e altre {t.keywordDiverse - 1}: i numeri sono la somma
                              </div>
                            )}
                          </td>
                          <td>
                            {gia ? (
                              <span className="cella-sub">già segnata</span>
                            ) : (
                              <form action={creaOperazioneKeyword}>
                                <input type="hidden" name="campagnaId" value={gruppo.campagna.id} />
                                <input type="hidden" name="testo" value={t.testo} />
                                <input type="hidden" name="ritorno" value={`/gruppi/${gruppo.id}`} />
                                <input type="hidden" name="tipo" value="negativa" />
                                <input type="hidden" name="motivo" value={`Parola cercata: ${(t.spesa ?? 0).toFixed(0)} EUR, ${t.clic ?? 0} clic, ${t.conversioni ?? 0} conversioni`} />
                                <button className="btn small btn-secondario" type="submit" title="Mette in coda la negativa: la parola non fara piu scattare gli annunci">
                                  Escludi
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12 }}>
                  <a className="btn small btn-secondario" href={`/termini?campagna=${encodeURIComponent(gruppo.campagna.nome)}`}>
                    Tutte le parole cercate della campagna
                  </a>
                </div>
              </section>
            )}

            {testi.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Titoli e descrizioni usati qui ({testi.length})</div>
                <ul className="storia">
                  {testi.map((t) => (
                    <li key={t.id}>
                      <span className="storia-data">{t.tipo === "titolo" ? "H" : "D"}</span>
                      <span className="storia-testo">{t.testo}</span>
                      <span className="storia-autore">{t.rendimento ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div>
            <section className="scheda">
              <div className="scheda-titolo">Come si chiama qui</div>
              <form className="modulo" action={rinominaGruppo}>
                <input type="hidden" name="id" value={gruppo.id} />
                <div className="campo-modulo largo">
                  <input
                    name="nomeVisibile"
                    defaultValue={gruppo.nomeVisibile ?? ""}
                    placeholder={gruppo.nome}
                    maxLength={120}
                  />
                </div>
                <div className="azioni-modulo">
                  <button className="btn small" type="submit">Salva nome</button>
                </div>
              </form>
              <p className="cella-sub">
                Vale <b>solo dentro l&apos;app</b>: su Google Ads il gruppo continua a chiamarsi
                «{gruppo.nome}», ed è giusto così — quel nome è la chiave con cui l&apos;import lo
                ritrova. Svuota la casella per tornare a mostrare quello di Google.
              </p>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Stato nell&apos;app</div>
              <form action={cambiaStatoGruppo}>
                <input type="hidden" name="id" value={gruppo.id} />
                <SelettoreStato
                  valore={gruppo.stato}
                  colore={COLORE_STATO_GRUPPO[gruppo.stato]}
                  opzioni={STATI_GRUPPO.map((s) => ({ valore: s, etichetta: ETICHETTA_STATO_GRUPPO[s] }))}
                />
              </form>
              <p className="cella-sub" style={{ marginTop: 8 }}>
                È il giudizio tuo e non viene mai sovrascritto dall&apos;import: lo stato vero di
                Google resta a parte ({gruppo.statoPiattaforma ?? "non ancora letto"}).
              </p>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Agire su Google</div>
              {pmax ? (
                <div className="vuoto-mini">
                  I gruppi di asset delle Performance Max non si fermano da script: si gestiscono
                  nell&apos;interfaccia di Google Ads.
                </div>
              ) : operazioneAperta ? (
                <div className="vuoto-mini">
                  C&apos;è già un&apos;operazione in coda su questo gruppo (
                  {operazioneAperta.stato === "approvata" ? "approvata, in attesa dello script" : "da approvare"}):{" "}
                  <a href="/operazioni">vai alle operazioni</a>.
                </div>
              ) : (
                <form className="modulo" action={creaOperazioneGruppo}>
                  <input type="hidden" name="gruppoId" value={gruppo.id} />
                  <input type="hidden" name="tipo" value={inPausa ? "attiva_gruppo" : "pausa_gruppo"} />
                  <div className="campo-modulo largo">
                    <label>Perché</label>
                    <input name="motivo" placeholder={inPausa ? "Perché riaccenderlo" : "Perché fermarlo"} />
                  </div>
                  <div className="campo-modulo largo">
                    <label>Come si torna indietro (richiesto sulle L2)</label>
                    <input name="rollbackPiano" placeholder="Es. si riattiva il gruppo e si rimette il budget di prima" />
                  </div>
                  <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                    <button className="btn small" type="submit">
                      {inPausa ? "Metti in coda: riattiva il gruppo" : "Metti in coda: metti in pausa il gruppo"}
                    </button>
                  </div>
                </form>
              )}
              <p className="cella-sub" style={{ marginTop: 8 }}>
                Niente parte da qui: l&apos;operazione entra in coda, la approvi tu in{" "}
                <a href="/operazioni">Operazioni</a>, e la esegue lo script alla passata dopo.
              </p>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Dettagli</div>
              <div className="griglia-campi" style={{ gridTemplateColumns: "1fr" }}>
                <dl className="campo">
                  <dt>Campagna</dt>
                  <dd>
                    <a href={`/campagne/${gruppo.campagnaId}`}>{gruppo.campagna.nome}</a> ({gruppo.campagna.classe})
                  </dd>
                </dl>
                <dl className="campo">
                  <dt>Id sulla piattaforma</dt>
                  <dd style={{ overflowWrap: "anywhere" }}>{gruppo.idEsterno ?? "—"}</dd>
                </dl>
                <dl className="campo">
                  <dt>Ultimo giorno con dati</dt>
                  <dd>{gruppo.metriche[0] ? formattaData(gruppo.metriche[0].data) : "—"}</dd>
                </dl>
                <dl className="campo">
                  <dt>Aggiornato</dt>
                  <dd>{formattaDataOra(gruppo.aggiornatoIl)}</dd>
                </dl>
                {gruppo.note && (
                  <dl className="campo">
                    <dt>Note</dt>
                    <dd>{gruppo.note}</dd>
                  </dl>
                )}
              </div>
            </section>

            {gruppo.operazioni.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Operazioni su questo gruppo</div>
                <ul className="storia">
                  {gruppo.operazioni.map((o) => (
                    <li key={o.id}>
                      <span className="storia-data">{formattaData(o.creataIl)}</span>
                      <span className="storia-testo">
                        {o.tipo === "pausa_gruppo" ? "Pausa" : "Riattivazione"}
                        {o.esito ? ` — ${o.esito}` : ""}
                      </span>
                      <span className="storia-autore">{o.stato}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
