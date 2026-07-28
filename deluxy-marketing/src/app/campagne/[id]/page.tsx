import { notFound } from "next/navigation";
import { FreschezzaDati } from "@/components/FreschezzaDati";
import { GuardrailCampagna } from "@/components/GuardrailCampagna";
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
import { Sidebar } from "@/components/Sidebar";
import { TabellaGruppi } from "@/components/TabellaGruppi";
import { VenditeCampagna } from "@/components/VenditeCampagna";
import { aggiungiMetrica, cambiaStatoCampagna } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { GIORNI_LETTURA, gruppiConNumeri } from "@/lib/gruppi";
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
  searchParams: Promise<{ bloccata?: string; salvata?: string; aggiornamento?: string }>;
}) {
  const { id } = await params;
  const { bloccata, salvata, aggiornamento } = await searchParams;
  const campagna = await prisma.campagna.findUnique({
    where: { id },
    include: {
      metriche: { orderBy: { data: "desc" }, take: 60 },
      azioni: { orderBy: { creataIl: "desc" } },
      landing: true,
    },
  });
  if (!campagna) notFound();

  // I gruppi della campagna: la media di campagna qui sopra può nascondere un
  // gruppo che rende il doppio e uno che brucia. Vanno guardati separati.
  const gruppi = await gruppiConNumeri({ campagnaId: campagna.id });

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
            <h1 className="page-title">{campagna.nome}</h1>
            <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{spesa > 0 ? formattaEuro(spesa) : "—"}</div>
            <div className="kpi-etichetta">Spesa (ultimi {campagna.metriche.length} gg registrati)</div>
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

        <TerminiRicerca campagnaId={campagna.id} brand={campagna.brand} />

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
              <div className="scheda-titolo">Metriche giornaliere</div>
              {campagna.metriche.length === 0 ? (
                <div className="vuoto-mini">Nessuna metrica: aggiungila qui sotto o via API.</div>
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
                      {campagna.metriche.map((m) => {
                        const rm = roas(m.ricavi, m.spesa);
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
