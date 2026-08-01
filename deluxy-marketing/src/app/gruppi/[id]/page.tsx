import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { SceltaPeriodo } from "@/components/SceltaPeriodo";
import { SelettoreStato } from "@/components/SelettoreStato";
import { Sidebar } from "@/components/Sidebar";
import { cambiaStatoGruppo, creaOperazioneGruppo } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { periodoApp } from "@/lib/periodo-condiviso";
import {
  COLORE_BRAND,
  ETICHETTA_BRAND,
  formattaData,
  formattaDataOra,
  formattaEuro,
  formattaNumero,
  roas as calcolaRoas,
} from "@/lib/dominio";
import {
  COLORE_STATO_GRUPPO,
  ETICHETTA_STATO_GRUPPO,
  ETICHETTA_STATO_PIATTAFORMA,
  ETICHETTA_TIPO_GRUPPO,

  letturaRoas,
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
      campagna: { select: { id: true, nome: true, brand: true, classe: true, stato: true } },
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

  // Le keyword e i testi che vivono in questo gruppo: il campo `gruppo` di
  // CopyAnnuncio può elencarne più d'uno ("Gruppo A, Gruppo B"), quindi si
  // cerca per contenuto.
  const copy = await prisma.copyAnnuncio.findMany({
    where: { campagna: gruppo.campagna.nome, gruppo: { contains: gruppo.nome } },
    orderBy: [{ tipo: "asc" }, { spesa: "desc" }],
    take: 200,
  });
  const keyword = copy.filter((c) => c.tipo === "keyword");
  const testi = copy.filter((c) => c.tipo === "titolo" || c.tipo === "descrizione");

  const operazioneAperta = gruppo.operazioni.find((o) => o.stato === "in_attesa" || o.stato === "approvata");

  return (
    <div className="layout">
      <Sidebar attiva="gruppi" brandAttivo={gruppo.brand} />
      <main className="main">
        <a className="ritorno" href="/gruppi">← Gruppi di annunci</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">{gruppo.nome}</h1>
            <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
        </div>

        <div className="due-colonne">
          <div>
            <section className="scheda">
              <div className="scheda-titolo">Andamento spesa</div>
              <GraficoSpesa punti={[...gruppo.metriche].reverse().map((m) => ({ data: m.data, valore: m.spesa ?? 0 }))} />
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Metriche giornaliere ({gruppo.metriche.length} giorni)</div>
              {gruppo.metriche.length === 0 ? (
                <div className="vuoto-mini">
                  Nessuna metrica: le manda lo script di Google Ads con <code>AZIONE = &quot;gruppi&quot;</code>.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Giorno</th>
                        <th className="num">Spesa</th>
                        <th className="num">Impr.</th>
                        <th className="num">Click</th>
                        <th className="num">Conv.</th>
                        <th className="num">Ricavi</th>
                        <th className="num">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gruppo.metriche.map((m) => {
                        const rm = calcolaRoas(m.ricavi, m.spesa);
                        return (
                          <tr key={m.id}>
                            <td className="cella-muta">{formattaData(m.data)}</td>
                            <td className="num">{formattaEuro(m.spesa)}</td>
                            <td className="num">{formattaNumero(m.impression)}</td>
                            <td className="num">{formattaNumero(m.click)}</td>
                            <td className="num">{formattaNumero(m.conversioni)}</td>
                            <td className="num">{formattaEuro(m.ricavi)}</td>
                            <td className="num">{rm != null ? `${rm.toFixed(1)}×` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {keyword.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Keyword del gruppo ({keyword.length})</div>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Keyword</th>
                        <th className="num">Spesa</th>
                        <th className="num">Incasso</th>
                        <th className="num">QS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keyword.map((k) => (
                        <tr key={k.id}>
                          <td>
                            <div className="cella-nome">{k.testo}</div>
                            {k.gruppo && k.gruppo !== gruppo.nome && (
                              <div className="cella-sub">anche in: {k.gruppo}</div>
                            )}
                          </td>
                          <td className="num">{formattaEuro(k.spesa)}</td>
                          <td className="num">{formattaEuro(k.incasso)}</td>
                          <td className="num cella-muta">{k.punteggioQualita ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="cella-sub" style={{ marginTop: 8 }}>
                  Spesa e incasso delle keyword sono la lettura degli ultimi 30 giorni dello script
                  <code> AZIONE = &quot;copy&quot;</code>: sono per campagna, non per giorno.
                </p>
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
