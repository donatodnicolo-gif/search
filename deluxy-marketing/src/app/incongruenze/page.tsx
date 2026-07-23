import { Sidebar } from "@/components/Sidebar";
import { creaIncongruenza, verdettoIncongruenza } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  COLORE_STATO_INCONGRUENZA,
  ETICHETTA_STATO_INCONGRUENZA,
  formattaData,
  PRIORITA_INCONGRUENZA,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Incongruenze documenti ↔ realtà (MODELLO Incongruenze.md): segnalazioni
// tracciate con verdetto del custode e bilancio finale.
export default async function PaginaIncongruenze() {
  const voci = await prisma.incongruenza.findMany({ orderBy: { creataIl: "desc" } });
  const bilancio = {
    vere: voci.filter((v) => v.stato === "vera" || v.stato === "integrata").length,
    parziali: voci.filter((v) => v.stato === "parziale").length,
    respinte: voci.filter((v) => v.stato === "respinta").length,
    aperte: voci.filter((v) => v.stato === "aperta").length,
  };
  const p0Aperte = voci.filter((v) => v.stato === "aperta" && v.priorita === "P0");

  return (
    <div className="layout">
      <Sidebar attiva="incongruenze" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Incongruenze</h1>
            <p className="page-sub">
              Quando un documento dice una cosa e la realtà ne mostra un&apos;altra, si segnala qui —
              mai correggere direttamente i documenti altrui. Il verdetto genera l&apos;azione di
              correzione.
            </p>
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore" style={bilancio.aperte > 0 ? { color: "var(--orange)" } : undefined}>{bilancio.aperte}</div>
            <div className="kpi-etichetta">Aperte</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{bilancio.vere}</div>
            <div className="kpi-etichetta">Verificate vere</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{bilancio.parziali}</div>
            <div className="kpi-etichetta">Parziali</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{bilancio.respinte}</div>
            <div className="kpi-etichetta">Non confermate</div>
          </div>
        </div>

        {p0Aperte.length > 0 && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>⚠</span>
            <span>
              <b>{p0Aperte.length} incongruenze P0 aperte</b>: bloccano decisioni corrette finché
              non arriva il verdetto — {p0Aperte.map((v) => v.documento).join(" · ")}
            </span>
          </div>
        )}

        {voci.map((v) => (
          <section className="scheda" key={v.id}>
            <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {v.documento}
              <span className="tag-neutro">{PRIORITA_INCONGRUENZA[v.priorita] ?? v.priorita}</span>
              <span className="tag-salute" style={{ color: COLORE_STATO_INCONGRUENZA[v.stato] ?? "var(--text-tertiary)" }}>
                <span className="dot" />
                {ETICHETTA_STATO_INCONGRUENZA[v.stato] ?? v.stato}
              </span>
              <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-tertiary)" }}>
                {formattaData(v.creataIl)}
              </span>
            </div>
            <div className="griglia-campi">
              <dl className="campo">
                <dt>Cosa dice il documento</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{v.dice}</dd>
              </dl>
              <dl className="campo">
                <dt>Cosa risulta nella realtà</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{v.risulta}</dd>
              </dl>
              {v.evidenza && (
                <dl className="campo">
                  <dt>Evidenza</dt>
                  <dd>{v.evidenza}</dd>
                </dl>
              )}
              {v.azioneConsigliata && (
                <dl className="campo">
                  <dt>Azione consigliata</dt>
                  <dd>{v.azioneConsigliata}</dd>
                </dl>
              )}
            </div>
            {v.stato === "aperta" && (
              <form className="pill-scelta" action={verdettoIncongruenza} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={v.id} />
                <button className="pill-opt" name="stato" value="vera" style={{ color: "var(--red)" }}>
                  <span className="dot" /><span style={{ color: "var(--text)" }}>Verificata: vera</span>
                </button>
                <button className="pill-opt" name="stato" value="parziale" style={{ color: "var(--gold-strong)" }}>
                  <span className="dot" /><span style={{ color: "var(--text)" }}>Parziale</span>
                </button>
                <button className="pill-opt" name="stato" value="respinta" style={{ color: "var(--text-tertiary)" }}>
                  <span className="dot" /><span style={{ color: "var(--text)" }}>Non confermata</span>
                </button>
              </form>
            )}
            {(v.stato === "vera" || v.stato === "parziale") && (
              <form className="pill-scelta" action={verdettoIncongruenza} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={v.id} />
                <button className="pill-opt" name="stato" value="integrata" style={{ color: "var(--green)" }}>
                  <span className="dot" /><span style={{ color: "var(--text)" }}>Correzione integrata nei documenti</span>
                </button>
              </form>
            )}
          </section>
        ))}

        <section className="scheda">
          <div className="scheda-titolo">Segnala un&apos;incongruenza</div>
          <form className="modulo" action={creaIncongruenza}>
            <div className="campo-modulo largo">
              <label>Documento coinvolto <span className="obbligatorio">*</span></label>
              <input name="documento" required placeholder="Es. 00.4 Mappa Campagne — scheda DC4" />
            </div>
            <div className="campo-modulo largo">
              <label>Cosa dice il documento <span className="obbligatorio">*</span></label>
              <textarea name="dice" required rows={2} />
            </div>
            <div className="campo-modulo largo">
              <label>Cosa risulta nella realtà <span className="obbligatorio">*</span></label>
              <textarea name="risulta" required rows={2} />
            </div>
            <div className="campo-modulo">
              <label>Evidenza</label>
              <input name="evidenza" placeholder="Screenshot, export, data della verifica live…" />
            </div>
            <div className="campo-modulo">
              <label>Priorità</label>
              <select name="priorita" defaultValue="P1">
                {Object.entries(PRIORITA_INCONGRUENZA).map(([v2, e]) => (
                  <option key={v2} value={v2}>{e}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label>Azione consigliata</label>
              <input name="azioneConsigliata" />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Segnala</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
