import { notFound } from "next/navigation";
import { AndamentoMensile } from "@/components/AndamentoMensile";
import { FreschezzaDati } from "@/components/FreschezzaDati";
import { GuardrailCampagna } from "@/components/GuardrailCampagna";
import { KeywordCampagna } from "@/components/KeywordCampagna";
import { ProposteAi } from "@/components/ProposteAi";
import { Badge } from "@/components/Badge";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { AggiornaAdesso } from "@/components/AggiornaAdesso";
import { CoperturaCampagna } from "@/components/CoperturaCampagna";
import { EstensioniCampagna } from "@/components/EstensioniCampagna";
import { OggiCampagna } from "@/components/OggiCampagna";
import { SegmentiCampagna } from "@/components/SegmentiCampagna";
import { TerminiRicerca } from "@/components/TerminiRicerca";
import { ProssimeAzioni } from "@/components/ProssimeAzioni";
import { RecapModifiche } from "@/components/RecapModifiche";
import { Scadenza } from "@/components/Scadenza";
import { SceltaPeriodo } from "@/components/SceltaPeriodo";
import { Sidebar } from "@/components/Sidebar";
import { parametriPeriodo, periodoApp } from "@/lib/periodo-condiviso";
import { TabellaGruppi } from "@/components/TabellaGruppi";
import { VenditeCampagna } from "@/components/VenditeCampagna";
import { RinominaInline } from "@/components/RinominaInline";
import { aggiungiMetrica, cambiaStatoCampagna, rinominaCampagna } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { GIORNI_LETTURA, gruppiConNumeri, nomeCampagna } from "@/lib/gruppi";
import {
  COLORE_BRAND,
  COLORE_STATO_AZIONE,
  COLORE_STATO_CAMPAGNA,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_STATO_AZIONE,
  ETICHETTA_STATO_CAMPAGNA,
  formattaData,
  formattaEuro,
  formattaNumero,
  roas,
  SPIEGA_STATO_CAMPAGNA,
  STATI_AZIONE_APERTI,
  STATI_CAMPAGNA,
  STATI_CAMPAGNA_IGNORATE,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function SchedaCampagna({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    bloccata?: string;
    salvata?: string;
    aggiornamento?: string;
    preset?: string;
    da?: string;
    a?: string;
    ord?: string;
    verso?: string;
    // L'ordinamento delle keyword ha i suoi parametri: due tabelle ordinabili
    // nella stessa pagina, se condividessero `ord` si riordinerebbero insieme.
    ordk?: string;
    versok?: string;
    // Esito del giro di proposte AI, di ritorno dalla server action
    ai?: string;
    aiok?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { bloccata, salvata, aggiornamento } = sp;

  // Il periodo è quello di tutta l'app: se si è scelto "mese scorso" sulla
  // dashboard, qui dentro si guarda il mese scorso. Sceglierlo qui lo cambia
  // ovunque — un periodo solo, o due numeri letti a due minuti di distanza
  // sembrano confrontabili e non lo sono.
  const periodo = await periodoApp(sp);
  const campagna = await prisma.campagna.findUnique({
    where: { id },
    include: {
      metriche: {
        where: { data: { gte: periodo.corrente.da, lt: periodo.corrente.a } },
        orderBy: { data: "desc" },
      },
      azioni: { orderBy: { creataIl: "desc" } },
      landing: true,
    },
  });
  if (!campagna) notFound();

  // I gruppi della campagna: la media di campagna qui sopra può nascondere un
  // gruppo che rende il doppio e uno che brucia. Vanno guardati separati.
  const giorniPeriodo = Math.max(
    1,
    Math.round((periodo.corrente.a.getTime() - periodo.corrente.da.getTime()) / 86_400_000)
  );
  const gruppi = await gruppiConNumeri({ campagnaId: campagna.id, giorni: giorniPeriodo });

  const metricheCrono = [...campagna.metriche].reverse();
  const spesa = campagna.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
  const ricavi = campagna.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
  const conv = campagna.metriche.reduce((s, m) => s + (m.conversioni ?? 0), 0);
  const click = campagna.metriche.reduce((s, m) => s + (m.click ?? 0), 0);
  const r = roas(ricavi, spesa);
  // Una campagna defunta non si giudica più: niente spesa di oggi, niente
  // guardrail, niente tasklist. Restano i numeri storici, che sono successi.
  const defunta = (STATI_CAMPAGNA_IGNORATE as readonly string[]).includes(campagna.stato);

  return (
    <div className="layout">
      <Sidebar attiva="campagne" />
      <main className="main">
        <a className="ritorno" href="/campagne">← Campagne</a>
        <div className="page-head">
          <div>
            {/* La matita sta FUORI dall'<h1>: si porta dietro il suo <dialog>,
                e un dialog dentro un titolo è HTML non valido. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 className="page-title">{nomeCampagna(campagna)}</h1>
              <RinominaInline
                id={campagna.id}
                nomeVisibile={campagna.nomeVisibile}
                nomeDiPiattaforma={campagna.nome}
                cosa="la campagna"
                azione={rinominaCampagna}
              />
            </div>
            <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {/* Quando il nome è nostro, quello di Google resta a vista: è
                  quello da cercare nell'interfaccia di Google Ads, e senza si
                  perderebbe l'unico modo di ritrovare la campagna di là. */}
              {campagna.nomeVisibile && (
                <span className="tag-neutro" title="Il nome che ha su Google Ads">
                  su Google: {campagna.nome}
                </span>
              )}
              <Badge testo={ETICHETTA_BRAND[campagna.brand] ?? campagna.brand} colore={COLORE_BRAND[campagna.brand] ?? "var(--text-tertiary)"} />
              <Badge testo={ETICHETTA_CANALE[campagna.canale] ?? campagna.canale} colore="var(--text-secondary)" />
              {campagna.obiettivo && <span>{campagna.obiettivo}</span>}
            </p>
            {/* Lo stato sta col titolo: è la prima cosa che si guarda e la più
                frequente da cambiare, non merita di stare sotto a una scheda. */}
            <form className="pill-scelta" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={campagna.id} />
              {STATI_CAMPAGNA.map((s) => (
                <button
                  key={s}
                  className={`pill-opt${campagna.stato === s ? " attuale" : ""}`}
                  style={{ color: campagna.stato === s ? undefined : COLORE_STATO_CAMPAGNA[s] }}
                  type="submit"
                  formAction={cambiaStatoCampagna.bind(null, s)}
                  disabled={campagna.stato === s}
                  title={campagna.stato === s ? "Stato attuale" : `Porta la campagna a "${ETICHETTA_STATO_CAMPAGNA[s]}"`}
                >
                  <span className="dot" />
                  <span style={{ color: "var(--text)" }}>{ETICHETTA_STATO_CAMPAGNA[s]}</span>
                </button>
              ))}
            </form>
            <p className="cella-sub" style={{ marginTop: 8, whiteSpace: "normal", maxWidth: 720 }}>
              {SPIEGA_STATO_CAMPAGNA[campagna.stato] ?? ""}
            </p>
          </div>
          <a className="btn" href={`/azioni/nuova?campagna=${campagna.id}&brand=${campagna.brand}`}>Nuova azione sulla campagna</a>
        </div>

        <SceltaPeriodo periodo={periodo} da={sp.da} a={sp.a} azione={`/campagne/${campagna.id}`} />

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{spesa > 0 ? formattaEuro(spesa) : "—"}</div>
            <div className="kpi-etichetta">
              Spesa · {periodo.corrente.etichetta} ({campagna.metriche.length} giorni con dati)
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{ricavi > 0 ? formattaEuro(ricavi) : "—"}</div>
            <div className="kpi-etichetta">Ricavi attribuiti</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{conv > 0 ? formattaNumero(conv) : "—"}</div>
            <div className="kpi-etichetta">Conversioni</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{click > 0 ? formattaNumero(click) : "—"}</div>
            <div className="kpi-etichetta">Click</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{r != null ? `${r.toFixed(1)}×` : "—"}</div>
            <div className="kpi-etichetta">ROAS</div>
          </div>
        </div>

        {defunta && (
          <div className="nota-info">
            <span className="nota-icona">⌁</span>
            <span>
              Campagna <b>defunta</b>: non compare negli elenchi, nei contatori e negli alert, e qui
              non si mostrano né la spesa di oggi, né i guardrail, né le prossime azioni. Resta lo
              storico
              {spesa > 0 ? `: i ${formattaEuro(spesa)} che ha speso sono usciti davvero e restano nei totali del brand` : ""}.
              Per rimetterla in giro basta cambiarle stato qui sopra.
            </span>
          </div>
        )}

        {!defunta && <FreschezzaDati brand={campagna.brand} canale={campagna.canale} />}

        {!defunta && (
          <OggiCampagna
            campagnaId={campagna.id}
            brand={campagna.brand}
            budgetGiornaliero={campagna.budgetGiornaliero}
          />
        )}

        {/* ——— Valutazione: prima si capisce, poi si decide, infine si agisce.
            I gruppi stanno qui in cima perché sono il primo taglio che spiega
            la media di campagna. ——— */}
        <section className="scheda">
          <div className="scheda-titolo">
            Gruppi di annunci ({gruppi.length}) · ultimi {GIORNI_LETTURA} giorni
          </div>
          <TabellaGruppi righe={gruppi} mostraCampagna={false} mostraQuota />
          {gruppi.length > 0 && (
            <p className="cella-sub" style={{ marginTop: 10 }}>
              La quota è la fetta di spesa che ogni gruppo si prende dentro questa campagna.
              Aprendo un gruppo si può metterlo in pausa: passa dalla stessa coda approvata.
            </p>
          )}
        </section>

        {/* Il venduto vero, subito dopo i gruppi: le conversioni che dichiara
            la piattaforma e gli euro entrati in cassa sono due numeri diversi,
            e quello che conta è il secondo. */}
        <VenditeCampagna
          campagna={{
            id: campagna.id,
            nome: campagna.nome,
            brand: campagna.brand,
            idEsterno: campagna.idEsterno,
          }}
        />

        <CoperturaCampagna campagnaId={campagna.id} />

        <TerminiRicerca
          campagnaId={campagna.id}
          brand={campagna.brand}
          base={`/campagne/${campagna.id}`}
          altriParametri={parametriPeriodo(periodo)}
          ord={sp.ord}
          verso={sp.verso}
          periodoScelto={{ da: periodo.corrente.da, a: periodo.corrente.a, etichetta: periodo.corrente.etichetta }}
        />

        {/* Le keyword subito dopo le parole cercate: sono i due lati della
            stessa cosa — cosa abbiamo comprato e cosa ci hanno chiesto — e
            separarli vuol dire non vedere mai la distanza fra i due. */}
        <KeywordCampagna
          campagnaId={campagna.id}
          nomeCampagna={campagna.nome}
          brand={campagna.brand}
          base={`/campagne/${campagna.id}`}
          altriParametri={parametriPeriodo(periodo)}
          ord={sp.ordk}
          verso={sp.versok}
        />

        {/* Il parere dell'AI subito dopo le due tabelle: ha appena finito di
            leggerle chi legge, e la proposta arriva sui numeri che ha in testa. */}
        {!defunta && (
          <ProposteAi
            campagna={{ id: campagna.id, nome: campagna.nome, brand: campagna.brand }}
            esito={sp.aiok}
            errore={sp.ai}
          />
        )}

        <SegmentiCampagna campagnaId={campagna.id} brand={campagna.brand} />

        <EstensioniCampagna campagnaId={campagna.id} nomeCampagna={campagna.nome} />

        {!defunta && <GuardrailCampagna campagnaId={campagna.id} bloccata={bloccata} salvata={salvata} />}

        {!defunta && <ProssimeAzioni campagnaId={campagna.id} />}

        <RecapModifiche campagnaId={campagna.id} />

        <AggiornaAdesso dove={`/campagne/${campagna.id}`} esito={aggiornamento} compatto />

        <div className="due-colonne">
          <div>
            <section className="scheda">
              <div className="scheda-titolo">Andamento spesa</div>
              <GraficoSpesa punti={metricheCrono.map((m) => ({ data: m.data, valore: m.spesa ?? 0 }))} />
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Metriche per mese ({campagna.metriche.length} giorni)</div>
              <AndamentoMensile
                metriche={campagna.metriche}
                vuoto="Nessuna metrica: aggiungila qui sotto o via API."
              />
            </section>
          </div>

          <div>
            <section className="scheda">
              <div className="scheda-titolo">Aggiungi metrica del giorno</div>
              <form className="modulo" action={aggiungiMetrica} style={{ gridTemplateColumns: "1fr 1fr" }}>
                <input type="hidden" name="campagnaId" value={campagna.id} />
                <div className="campo-modulo">
                  <label>Giorno <span className="obbligatorio">*</span></label>
                  <input name="data" type="date" required />
                </div>
                <div className="campo-modulo">
                  <label>Spesa (€)</label>
                  <input name="spesa" type="number" step="0.01" min="0" />
                </div>
                <div className="campo-modulo">
                  <label>Impression</label>
                  <input name="impression" type="number" min="0" />
                </div>
                <div className="campo-modulo">
                  <label>Click</label>
                  <input name="click" type="number" min="0" />
                </div>
                <div className="campo-modulo">
                  <label>Conversioni</label>
                  <input name="conversioni" type="number" step="0.01" min="0" />
                </div>
                <div className="campo-modulo">
                  <label>Ricavi (€)</label>
                  <input name="ricavi" type="number" step="0.01" min="0" />
                </div>
                <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                  <button className="btn small" type="submit">Salva metrica</button>
                </div>
              </form>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Dettagli</div>
              <div className="griglia-campi" style={{ gridTemplateColumns: "1fr" }}>
                <dl className="campo">
                  <dt>Budget giornaliero</dt>
                  <dd>{formattaEuro(campagna.budgetGiornaliero)}</dd>
                </dl>
                <dl className="campo">
                  <dt>Periodo</dt>
                  <dd>{formattaData(campagna.inizio)} → {formattaData(campagna.fine)}</dd>
                </dl>
                <dl className="campo">
                  <dt>Id piattaforma</dt>
                  <dd>{campagna.idEsterno ?? "—"}</dd>
                </dl>
                <dl className="campo">
                  <dt>Landing di destinazione</dt>
                  <dd>
                    {campagna.landing ? (
                      <a href={`/landing/${campagna.landing.id}`} style={{ color: "var(--blue)", overflowWrap: "anywhere" }}>
                        {campagna.landing.url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </dl>
                {campagna.note && (
                  <dl className="campo">
                    <dt>Note</dt>
                    <dd>{campagna.note}</dd>
                  </dl>
                )}
              </div>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Azioni sulla campagna ({campagna.azioni.length})</div>
              {campagna.azioni.length === 0 ? (
                <div className="vuoto-mini">Nessuna azione collegata</div>
              ) : (
                <ul className="storia">
                  {campagna.azioni.map((a) => (
                    <li key={a.id}>
                      <span className="storia-testo">
                        <a href={`/azioni/${a.id}`} className="cella-nome">{a.titolo}</a>
                      </span>
                      <span className="storia-autore">
                        <Badge testo={ETICHETTA_STATO_AZIONE[a.stato] ?? a.stato} colore={COLORE_STATO_AZIONE[a.stato] ?? "var(--text-tertiary)"} />
                      </span>
                      {a.scadenza && (
                        <span className="storia-data" style={{ flex: "0 0 auto" }}>
                          <Scadenza data={a.scadenza} chiusa={!STATI_AZIONE_APERTI.includes(a.stato)} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
