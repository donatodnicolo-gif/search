import { cambiaStatoCreativo, salvaCreativo } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  COLORE_STATO_CREATIVO,
  ETICHETTA_BRAND,
  ETICHETTA_STATO_CREATIVO,
  formattaData,
  STATI_CREATIVO,
} from "@/lib/dominio";
import { inFreezeCreativo, prossimoSlotLunedi, triggerFatigue } from "@/lib/guardrail";

// Rotazione creativa Meta (doc 8.3): refresh a segnale, slot del lunedì,
// freeze di Ferragosto, età dei creativi. "I vincenti non si toccano."
export async function RotazioneCreativa() {
  const [creativi, campagneMeta] = await Promise.all([
    prisma.creativo.findMany({ orderBy: [{ stato: "asc" }, { lanciatoIl: "desc" }] }),
    prisma.campagna.findMany({
      where: { canale: "meta_ads", stato: { in: ["attiva", "in_apprendimento"] } },
      include: { metriche: { orderBy: { data: "asc" }, take: 60 } },
    }),
  ]);
  const slot = prossimoSlotLunedi();
  const freeze = inFreezeCreativo();
  const fatiche = campagneMeta
    .map((c) => ({ nome: c.nome, segnale: triggerFatigue(c.metriche) }))
    .filter((f) => f.segnale);
  const oggi = Date.now();

  return (
    <section className="scheda">
      <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        Rotazione creativa
        <span className="tag-neutro">prossimo slot: lunedì {formattaData(slot)} ore 9:30</span>
        {freeze.freeze && (
          <span className="tag-salute" style={{ color: "var(--red)" }}>
            <span className="dot" />
            FREEZE Ferragosto fino al {formattaData(freeze.fino)}
          </span>
        )}
      </div>
      <p className="cella-sub" style={{ marginBottom: 12 }}>
        Refresh a segnale, non a calendario (doc 8.3): si interviene solo sui trigger, in batch,
        nello slot del lunedì, ogni ≥2 settimane. I vincenti non si toccano.
      </p>

      {fatiche.length > 0 && (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
          <span>
            <b>Trigger di fatigue attivi:</b>
            {fatiche.map((f) => (
              <span key={f.nome} style={{ display: "block" }}>· {f.nome}: {f.segnale}</span>
            ))}
          </span>
        </div>
      )}

      {creativi.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Creativo</th>
                <th>Brand</th>
                <th>Fase</th>
                <th className="num">Età</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {creativi.map((c) => {
                const eta = c.lanciatoIl ? Math.floor((oggi - c.lanciatoIl.getTime()) / 86_400_000) : null;
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="cella-nome">{c.nome}</div>
                      {c.note && <div className="cella-sub">{c.note}</div>}
                    </td>
                    <td>
                      <span className="tag-salute" style={{ color: COLORE_BRAND[c.brand] ?? "var(--text-tertiary)" }}>
                        <span className="dot" />
                        {ETICHETTA_BRAND[c.brand] ?? c.brand}
                      </span>
                    </td>
                    <td className="cella-muta">{c.fase}</td>
                    <td className="num">{eta != null ? `${eta} gg` : "—"}</td>
                    <td>
                      {c.stato === "vincente" ? (
                        <span className="tag-salute" style={{ color: "var(--green)" }} title="I vincenti non si toccano (doc 8.3)">
                          <span className="dot" /> Vincente 🔒
                        </span>
                      ) : (
                        <form className="pill-scelta" action={cambiaStatoCreativo}>
                          <input type="hidden" name="id" value={c.id} />
                          {STATI_CREATIVO.filter((s) => s !== c.stato).slice(0, 3).map((s) => (
                            <button key={s} className="pill-opt" name="stato" value={s} style={{ color: COLORE_STATO_CREATIVO[s] }}>
                              <span className="dot" />
                              <span style={{ color: "var(--text)" }}>{ETICHETTA_STATO_CREATIVO[s]}</span>
                            </button>
                          ))}
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form className="modulo" action={salvaCreativo} style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}>
        <div className="campo-modulo">
          <label>Nuovo creativo/concetto</label>
          <input name="nome" required placeholder="Es. Hook video USP 'consegna in giornata'" />
        </div>
        <div className="campo-modulo">
          <label>Brand</label>
          <select name="brand" defaultValue="cross">
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
        </div>
        <div className="campo-modulo">
          <label>Fase</label>
          <select name="fase" defaultValue="A">
            <option value="A">A — freddo</option>
            <option value="ID">I+D</option>
            <option value="X">X — retargeting</option>
          </select>
        </div>
        <div className="campo-modulo">
          <label>Stato</label>
          <select name="stato" defaultValue="in_coda">
            <option value="in_coda">In coda</option>
            <option value="attivo">Attivo</option>
          </select>
        </div>
        <div className="azioni-modulo" style={{ alignSelf: "end" }}>
          <button className="btn small" type="submit">Aggiungi</button>
        </div>
      </form>
    </section>
  );
}
