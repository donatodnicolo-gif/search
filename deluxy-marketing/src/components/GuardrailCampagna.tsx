import { cambiaClasseCampagna, creaOperazione, registraModifica } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  CLASSI_CAMPAGNA,
  COLORE_ALERT,
  COLORE_CLASSE,
  ETICHETTA_CLASSE,
  ETICHETTA_LIVELLO,
  formattaDataOra,
  formattaEuro,
  LIVELLI_MODIFICA,
} from "@/lib/dominio";
import {
  apprendimento,
  candidataTraino,
  gateBidding,
  giudicabilita,
  pacing,
  regoleSeAllora,
  roasRealeStimato,
  valutaAlert,
  alertA4,
  valoreONumero,
  type MetricaGiorno,
} from "@/lib/guardrail";

// Il blocco guardrail della scheda campagna: tutte le protezioni del doc 11
// più i calcolatori del doc 8.1/10. Valuta gli alert a ogni visita (idempotente
// per giorno) e genera l'azione P0 quando un rosso scatta su una traino.
export async function GuardrailCampagna({
  campagnaId,
  bloccata,
  salvata,
}: {
  campagnaId: string;
  bloccata?: string;
  salvata?: string;
}) {
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    include: {
      metriche: { orderBy: { data: "asc" }, take: 60 },
      modifiche: { orderBy: { eseguitaIl: "desc" }, take: 5 },
      incidenti: { where: { stato: "aperto" } },
    },
  });
  if (!campagna) return null;
  const metriche: MetricaGiorno[] = campagna.metriche;
  const traino = campagna.classe === "traino";

  // Candidatura traino: quota sul totale account (= brand) degli ultimi 30 giorni
  const giorni30 = new Date(Date.now() - 30 * 86_400_000);
  const account = await prisma.metricaCampagna.aggregate({
    where: { data: { gte: giorni30 }, campagna: { brand: campagna.brand } },
    _sum: { ricavi: true, spesa: true },
  });
  const mie30 = metriche.filter((m) => m.data >= giorni30);
  const ricavi30 = mie30.reduce((s, m) => s + (m.ricavi ?? 0), 0);
  const spesa30 = mie30.reduce((s, m) => s + (m.spesa ?? 0), 0);
  const candidatura = candidataTraino(
    campagna.brand, ricavi30, spesa30,
    account._sum.ricavi ?? 0, account._sum.spesa ?? 0
  );

  // Alert (doc 11 §4): valutati adesso, persistiti una volta al giorno.
  const rilevati = valutaAlert(metriche, traino);
  const a4 = alertA4(campagna.annunciInReview, campagna.annunciTotali);
  if (a4) rilevati.push(a4);
  const oggi = new Date();
  oggi.setUTCHours(0, 0, 0, 0);
  for (const a of rilevati) {
    const creato = await prisma.alert
      .upsert({
        where: { campagnaId_tipo_giorno: { campagnaId, tipo: a.tipo, giorno: oggi } },
        create: { campagnaId, tipo: a.tipo, livello: a.livello, messaggio: a.messaggio, giorno: oggi },
        update: {},
      })
      .catch(() => null);
    // A1/A2 su traino: azione P0 automatica (una sola per alert)
    if (creato && traino && (a.tipo === "A1" || a.tipo === "A2") && creato.creatoIl.getTime() > Date.now() - 60_000) {
      await prisma.azione.create({
        data: {
          titolo: `P0 ${a.tipo} su traino "${campagna.nome}": ${a.tipo === "A1" ? "acquisto muto" : "erogazione crollata"}`,
          descrizione: a.messaggio,
          brand: campagna.brand,
          canale: campagna.canale,
          priorita: "alta",
          owner: "ai",
          scadenza: new Date(Date.now() + 86_400_000),
          campagnaId,
          eventi: { create: { tipo: "creazione", autore: "sistema", testo: `Generata dall'alert ${a.tipo} (doc 11 §4)` } },
        },
      });
    }
  }

  const inizioSettimana = new Date();
  inizioSettimana.setDate(inizioSettimana.getDate() - ((inizioSettimana.getDay() + 6) % 7));
  inizioSettimana.setHours(0, 0, 0, 0);
  const l2Settimana = campagna.modifiche.filter(
    (m) => (m.livello === "L2" || m.livello === "L3") && m.eseguitaIl >= inizioSettimana
  ).length;

  const ultimaModifica = campagna.modifiche[0]?.eseguitaIl ?? null;
  const giud = giudicabilita(ultimaModifica);
  const metriche7 = metriche.slice(-7);
  const pace = pacing(metriche7, campagna.budgetGiornaliero);
  const proposte = regoleSeAllora(metriche7, campagna.budgetGiornaliero, campagna.cpaTarget);
  const conv30 = mie30.reduce((s, m) => s + (m.conversioni ?? 0), 0);
  const cpa30 = conv30 > 0 ? spesa30 / conv30 : null;
  const app = apprendimento(campagna.budgetGiornaliero, cpa30);
  const gate = gateBidding(conv30, ricavi30 > 0);
  const vn = valoreONumero(campagna.strategiaOfferta, conv30, ricavi30);
  const roas30 = spesa30 > 0 ? ricavi30 / spesa30 : null;
  const reale = roas30 != null ? roasRealeStimato(roas30) : null;

  return (
    <>
      {bloccata && (
        <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--red)" }}>⛔</span>
          <span><b>Modifica bloccata dal change control:</b> {bloccata}</span>
        </div>
      )}
      {salvata === "modifica" && (
        <div className="conferma">
          <span className="segno">✓</span>
          Modifica registrata. Promemoria di verifica creati a +24h e +72h; blackout di 72 ore attivo.
        </div>
      )}
      {campagna.incidenti.length > 0 && (
        <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--red)" }}>⚠</span>
          <span>
            <b>FREEZE attivo</b>: questa campagna è coperta da{" "}
            {campagna.incidenti.map((i) => i.codice).join(", ")} (voce APERTA nello{" "}
            <a href="/errori" style={{ color: "var(--blue)" }}>storico errori</a>): nessuna modifica finché non si chiude.
          </span>
        </div>
      )}

      <section className="scheda">
        <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          Guardrail
          <span className="tag-salute" style={{ color: COLORE_CLASSE[campagna.classe] }}>
            <span className="dot" />
            {ETICHETTA_CLASSE[campagna.classe]}
          </span>
          <span className="tag-salute" style={{ color: giud.stato === "blackout" ? "var(--orange)" : "var(--green)" }} title="Doc 10 §1.4: 72 ore di blackout dopo ogni modifica a offerte/budget — i dati in finestra non valgono come giudizio">
            <span className="dot" />
            {giud.stato === "blackout" ? `In blackout fino a ${formattaDataOra(giud.fino)}` : "Giudicabile"}
          </span>
        </div>


        <div className="nota-info" style={vn.daCambiare ? { borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" } : undefined}>
          <span className="nota-icona" style={vn.daCambiare ? { color: "var(--orange)" } : undefined}>◈</span>
          <span>
            <b>Check VALORE vs NUMERO</b> (obbligatorio dal 16/7/2026 su ogni campagna attiva):{" "}
            <b style={{ color: vn.tipo === "valore" ? "var(--green)" : vn.tipo === "numero" ? "var(--blue)" : "var(--text-tertiary)" }}>
              {vn.etichetta}
            </b>
            {campagna.strategiaOfferta ? ` (${campagna.strategiaOfferta})` : ""}. {vn.raccomandazione}
          </span>
        </div>

        {candidatura.candidata && campagna.classe !== "traino" && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>Candidata TRAINO</b>: {candidatura.motivo}. La conferma del flag si fa solo al
              checkpoint del lunedì (doc 11 §1).
            </span>
          </div>
        )}

        <form className="pill-scelta" action={cambiaClasseCampagna} style={{ marginBottom: 14 }}>
          <input type="hidden" name="id" value={campagna.id} />
          {CLASSI_CAMPAGNA.map((c) => (
            <button
              key={c}
              className={`pill-opt${campagna.classe === c ? " attuale" : ""}`}
              style={{ color: campagna.classe === c ? undefined : COLORE_CLASSE[c] }}
              type="submit"
              name="classe"
              value={c}
              disabled={campagna.classe === c}
            >
              <span className="dot" />
              <span style={{ color: "var(--text)" }}>{ETICHETTA_CLASSE[c]}</span>
            </button>
          ))}
        </form>

        {rilevati.length > 0 && (
          <ul className="storia" style={{ marginBottom: 12 }}>
            {rilevati.map((a) => (
              <li key={a.tipo}>
                <span className="storia-data" style={{ color: COLORE_ALERT[a.livello], fontWeight: 700 }}>{a.tipo}</span>
                <span className="storia-testo">{a.messaggio}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="kpi-riga" style={{ marginBottom: 0 }}>
          <div className="kpi">
            <div className="kpi-valore" style={{ fontSize: 20 }}>
              {app ? `${Math.round(app.eventiSettimana)}/50` : "—"}
            </div>
            <div className="kpi-etichetta" title="Doc 8.1 §5.2: eventi/settimana = budget×7 ÷ costo evento; servono ~50 per uscire dall'apprendimento">
              Eventi/settimana previsti
              {app && !app.apprende ? ` · budget minimo ${formattaEuro(app.budgetMinimoGiorno)}/g` : ""}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ fontSize: 20 }}>
              {pace ? `${Math.round((pace.rapporto ?? 0) * 100)}%` : "—"}
            </div>
            <div className="kpi-etichetta" style={pace && !pace.dentroBanda ? { color: "var(--orange)" } : undefined}>
              Pacing 7g ({pace ? `${formattaEuro(pace.spesa7)} su ${formattaEuro(pace.atteso)}` : "—"}, banda ±15%)
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ fontSize: 20 }}>
              {gate.tcpa ? (gate.tcpaIdeale ? "Pronta" : "Quasi") : "No"}
            </div>
            <div className="kpi-etichetta" title="Doc 4 §2.2: tCPA con ≥30 conv/30g (ideale 50); tROAS da ≥15 conv con valore">
              Gate bidding auto ({conv30} conv/30g{gate.troas ? " · tROAS ok" : ""})
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ fontSize: 20 }}>
              {reale ? `${reale.min.toFixed(1)}-${reale.max.toFixed(1)}×` : "—"}
            </div>
            <div className="kpi-etichetta" title="Doc 10 §3: le piattaforme sovrastimano 1,3-1,6× — il reale è il 60-75% del dichiarato">
              ROAS reale stimato (60-75% del dichiarato)
            </div>
          </div>
        </div>

        {proposte.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="cella-sub" style={{ marginBottom: 6 }}>REGOLE SE/ALLORA DEL CHECKPOINT (doc 10 §7) — proposte, non esecuzioni:</div>
            {proposte.map((p, i) => (
              <div className="cella-sub" key={i} style={{ whiteSpace: "normal", marginBottom: 4 }}>→ {p}</div>
            ))}
          </div>
        )}
      </section>


      <section className="scheda">
        <div className="scheda-titolo">Chiedi allo script di eseguire (scrittura su Google Ads)</div>
        <p className="cella-sub" style={{ marginBottom: 12 }}>
          Qui non si esegue nulla: si mette in <b>coda</b>. L&apos;operazione resta in attesa finché
          non la approvi in <a href="/operazioni" style={{ color: "var(--blue)" }}>Operazioni</a>;
          solo allora lo script di Google Ads la prende, la esegue e riferisce. Il guardrail
          controlla prima: se una regola è violata, l&apos;operazione non entra nemmeno in coda.
        </p>
        <form className="modulo" action={creaOperazione}>
          <input type="hidden" name="campagnaId" value={campagna.id} />
          <input type="hidden" name="l2Settimana" value={l2Settimana} />
          <div className="campo-modulo">
            <label>Operazione</label>
            <select name="tipo" defaultValue="pausa_campagna">
              <option value="pausa_campagna">Metti in pausa la campagna</option>
              <option value="attiva_campagna">Riattiva la campagna</option>
              <option value="budget">Cambia budget giornaliero</option>
            </select>
          </div>
          <div className="campo-modulo">
            <label>Nuovo budget €/g (solo per «cambia budget»)</label>
            <input name="budget" type="number" step="0.5" min="0" placeholder={campagna.budgetGiornaliero != null ? String(campagna.budgetGiornaliero) : ""} />
          </div>
          <div className="campo-modulo largo">
            <label>Perché</label>
            <input name="motivo" placeholder="Il motivo resta nello storico accanto all&apos;operazione" />
          </div>
          <div className="campo-modulo largo">
            <label>Piano di rollback {traino ? "(obbligatorio su traino per L2/L3)" : ""}</label>
            <input name="rollbackPiano" placeholder="Come si torna indietro se peggiora" />
          </div>
          {traino && (
            <div className="campo-modulo largo">
              <label>Add-before-pause — solo per mettere in pausa (doc 11, da ERR-2026-001)</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                  Sostituto approvato il
                  <input name="sostitutoApprovatoIl" type="date" style={{ font: "inherit", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)" }} />
                </label>
                <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                  Giorni di dati del sostituto
                  <input name="sostitutoGiorniDati" type="number" min="0" style={{ width: 120, font: "inherit", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--hairline-strong)" }} />
                </label>
              </div>
            </div>
          )}
          <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
            <button className="btn" type="submit">Metti in coda</button>
          </div>
        </form>
      </section>

      <section className="scheda">
        <div className="scheda-titolo">Registra una modifica gia fatta a mano (change control, doc 11)</div>
        <p className="cella-sub" style={{ marginBottom: 12 }}>
          Ogni modifica reale passa da qui: parte il blackout 72h e nascono le verifiche a +24h e
          +72h. Su una traino: max ±20% di budget, mai venerdì-domenica, L2/L3 solo con rollback.
        </p>
        <form className="modulo" action={registraModifica}>
          <input type="hidden" name="campagnaId" value={campagna.id} />
          <div className="campo-modulo largo">
            <label>Cosa è stato modificato <span className="obbligatorio">*</span></label>
            <input name="descrizione" required placeholder="Es. budget da 15 a 18 €/g" />
          </div>
          <div className="campo-modulo">
            <label>Livello</label>
            <select name="livello" defaultValue="L1">
              {LIVELLI_MODIFICA.map((l) => (
                <option key={l} value={l}>{ETICHETTA_LIVELLO[l]}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label>Variazione budget %</label>
            <input name="deltaBudgetPct" type="number" step="1" placeholder="es. 20 o -15" />
          </div>
          <div className="campo-modulo">
            <label>Prima</label>
            <input name="prima" placeholder="stato esatto prima" />
          </div>
          <div className="campo-modulo">
            <label>Dopo</label>
            <input name="dopo" placeholder="stato esatto dopo" />
          </div>
          <div className="campo-modulo largo">
            <label>Piano di rollback {traino ? "(obbligatorio per L2/L3)" : ""}</label>
            <input name="rollbackPiano" placeholder="Trigger di ripristino e azione esatta per tornare indietro" />
          </div>
          <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
            <button className="btn" type="submit">Registra modifica</button>
          </div>
        </form>
        {campagna.modifiche.length > 0 && (
          <ul className="storia" style={{ marginTop: 12 }}>
            {campagna.modifiche.map((m) => (
              <li key={m.id}>
                <span className="storia-data">{formattaDataOra(m.eseguitaIl)}</span>
                <span className="storia-testo">
                  <b>{m.livello}</b> {m.descrizione}
                  {(m.prima || m.dopo) && (
                    <span className="cella-sub">{m.prima ?? "—"} → {m.dopo ?? "—"}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
