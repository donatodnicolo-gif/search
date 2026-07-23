import { Sidebar } from "@/components/Sidebar";
import { chiudiIncidente, creaIncidente } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { formattaData } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Storico Errori ERR-* (00.5): registro append-only degli incidenti.
// Prima di ogni modifica L1-L3 si consulta; una voce APERTA = freeze.
export default async function PaginaErrori() {
  const [incidenti, campagne] = await Promise.all([
    prisma.incidente.findMany({
      orderBy: { apertoIl: "desc" },
      include: { campagna: { select: { id: true, nome: true } } },
    }),
    prisma.campagna.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  const aperti = incidenti.filter((i) => i.stato === "aperto");

  const SEZIONI: { campo: "contesto" | "timeline" | "impatto" | "cause" | "erroriProcesso" | "rimedi"; nome: string }[] = [
    { campo: "contesto", nome: "Contesto" },
    { campo: "timeline", nome: "Timeline" },
    { campo: "impatto", nome: "Impatto misurato" },
    { campo: "cause", nome: "Cause (con grado di certezza)" },
    { campo: "erroriProcesso", nome: "Errori di processo" },
    { campo: "rimedi", nome: "Rimedi e regole generate" },
  ];

  return (
    <div className="layout">
      <Sidebar attiva="errori" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Storico errori</h1>
            <p className="page-sub">
              Il registro ERR-* degli incidenti (00.5): append-only, i codici non si riusano mai.
              Prima di qualsiasi modifica L1-L3 si consulta; finché una voce è APERTA, gli oggetti
              che riguarda sono in freeze.
            </p>
          </div>
        </div>

        {aperti.length > 0 && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>⚠</span>
            <span>
              <b>{aperti.length} incidenti APERTI</b>: {aperti.map((i) => i.codice).join(", ")}. Le
              campagne collegate sono in freeze finché non si chiudono con verdetto.
            </span>
          </div>
        )}

        {incidenti.map((i) => (
          <section className="scheda" key={i.id}>
            <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "ui-monospace, Consolas, monospace" }}>{i.codice}</span>
              {i.titolo}
              <span className="tag-salute" style={{ color: i.stato === "aperto" ? "var(--red)" : "var(--green)" }}>
                <span className="dot" />
                {i.stato === "aperto" ? "APERTO — freeze attivo" : `CHIUSO${i.verdetto ? `: ${i.verdetto}` : ""}`}
              </span>
              <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-tertiary)" }}>
                aperto {formattaData(i.apertoIl)}
                {i.chiusoIl ? ` · chiuso ${formattaData(i.chiusoIl)}` : ""}
              </span>
            </div>
            <div className="griglia-campi">
              {SEZIONI.filter((s) => i[s.campo]).map((s) => (
                <dl className="campo" key={s.campo}>
                  <dt>{s.nome}</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{i[s.campo]}</dd>
                </dl>
              ))}
              {(i.oggetti || i.campagna) && (
                <dl className="campo">
                  <dt>Oggetti in freeze</dt>
                  <dd>
                    {i.campagna && (
                      <a href={`/campagne/${i.campagna.id}`} style={{ color: "var(--blue)" }}>{i.campagna.nome}</a>
                    )}
                    {i.campagna && i.oggetti ? " · " : ""}
                    {i.oggetti}
                  </dd>
                </dl>
              )}
            </div>
            {i.stato === "aperto" && (
              <form className="modulo" action={chiudiIncidente} style={{ marginTop: 12, gridTemplateColumns: "2fr auto" }}>
                <input type="hidden" name="id" value={i.id} />
                <div className="campo-modulo">
                  <label>Verdetto di chiusura</label>
                  <input name="verdetto" placeholder="Cosa si è capito, quale regola nasce da qui" required />
                </div>
                <div className="azioni-modulo" style={{ alignSelf: "end" }}>
                  <button className="btn small" type="submit">Chiudi {i.codice}</button>
                </div>
              </form>
            )}
          </section>
        ))}

        <section className="scheda">
          <div className="scheda-titolo">Apri un incidente</div>
          <p className="cella-sub" style={{ marginBottom: 14 }}>
            Si apre quando: una traino degrada dopo una modifica · spesa anomala senza conversioni
            ≥48h · perdita di dati o documenti (00.5).
          </p>
          <form className="modulo" action={creaIncidente}>
            <div className="campo-modulo largo">
              <label>Titolo <span className="obbligatorio">*</span></label>
              <input name="titolo" required placeholder="Es. Crollo conversioni DC4 dopo cambio landing" />
            </div>
            <div className="campo-modulo">
              <label>Campagna coinvolta</label>
              <select name="campagnaId" defaultValue="">
                <option value="">—</option>
                {campagne.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Altri oggetti coinvolti</label>
              <input name="oggetti" placeholder="liste, landing, documenti…" />
            </div>
            <div className="campo-modulo largo">
              <label>Contesto</label>
              <textarea name="contesto" rows={2} />
            </div>
            <div className="campo-modulo largo">
              <label>Timeline</label>
              <textarea name="timeline" rows={2} placeholder="Quando è successo cosa, in ordine" />
            </div>
            <div className="campo-modulo">
              <label>Impatto misurato</label>
              <textarea name="impatto" rows={2} />
            </div>
            <div className="campo-modulo">
              <label>Cause (con grado di certezza)</label>
              <textarea name="cause" rows={2} />
            </div>
            <div className="campo-modulo">
              <label>Errori di processo</label>
              <textarea name="erroriProcesso" rows={2} />
            </div>
            <div className="campo-modulo">
              <label>Rimedi e regole generate</label>
              <textarea name="rimedi" rows={2} />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Apri incidente</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
