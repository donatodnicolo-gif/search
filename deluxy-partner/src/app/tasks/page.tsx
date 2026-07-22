import Link from "next/link";
import { prisma } from "@/lib/db";
import { dataIt, euro } from "@/lib/format";
import { ivato } from "@/lib/calc";
import { ANNO_CORRENTE } from "@/lib/queries";
import { STATI_TASK, PRIORITA_TASK, normPriorita, pesoPriorita } from "@/lib/tasks";
import { creaTask, cambiaStatoTask, eliminaTask } from "@/lib/tasks-actions";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; priorita?: string; creato?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const oggi = new Date();
  const [tasks, partners, scaduteRaw] = await Promise.all([
    prisma.taskFinance.findMany({
      where: {
        ...(sp.stato ? { stato: sp.stato } : {}),
        ...(sp.priorita ? { priorita: sp.priorita } : {}),
      },
      orderBy: [{ stato: "asc" }],
    }),
    prisma.partner.findMany({ where: { attivo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    // fatture scadute non pagate → candidate a un task di sollecito
    prisma.fatturaServizio.findMany({
      where: { anno: ANNO_CORRENTE, pagata: false, imponibile: { gt: 0 }, scadenza: { lt: oggi } },
      include: { partner: true },
      orderBy: { scadenza: "asc" },
    }),
  ]);

  // suggerimenti: fatture scadute per cui non c'è già un task aperto con quel riferimento
  const riferimentiConTask = new Set(
    tasks.filter((t) => t.stato !== "fatto" && t.riferimento).map((t) => t.riferimento!)
  );
  const suggerimenti = scaduteRaw
    .filter((f) => f.numero && !riferimentiConTask.has(f.numero))
    .slice(0, 12);

  const fra7 = new Date(Date.now() + 7 * 86400000);
  // ordina: prima aperti/in corso per scadenza e priorità, poi i fatti
  const pesoStato = (s: string) => (s === "fatto" ? 2 : s === "in_corso" ? 1 : 0);
  const ordinati = [...tasks].sort((a, b) => {
    if (pesoStato(a.stato) !== pesoStato(b.stato)) return pesoStato(a.stato) - pesoStato(b.stato);
    const sa = a.scadenza?.getTime() ?? Infinity;
    const sb = b.scadenza?.getTime() ?? Infinity;
    if (sa !== sb) return sa - sb;
    return pesoPriorita(a.priorita) - pesoPriorita(b.priorita);
  });

  const aperti = tasks.filter((t) => t.stato !== "fatto");
  const inScadenza = aperti.filter((t) => t.scadenza && t.scadenza <= fra7);
  const scaduti = aperti.filter((t) => t.scadenza && t.scadenza < oggi);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tasks finance</h1>
          <p className="page-caption">Attività amministrative da portare a termine: solleciti, emissioni, verifiche, incassi.</p>
        </div>
      </div>

      {sp.creato && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Task creato</span>
        </div>
      )}
      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.errore)}</span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Da fare</div>
          <div className={`kpi-value ${aperti.length ? "neg" : "pos"}`}>{aperti.length}</div>
          <div className="kpi-sub">aperti o in corso</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">In scadenza (7 gg)</div>
          <div className={`kpi-value ${inScadenza.length ? "neg" : "pos"}`}>{inScadenza.length}</div>
          <div className="kpi-sub">{scaduti.length} già scaduti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Completati</div>
          <div className="kpi-value pos">{tasks.filter((t) => t.stato === "fatto").length}</div>
          <div className="kpi-sub">nell&apos;elenco corrente</div>
        </div>
      </div>

      {/* Suggeriti dal finance: fatture scadute da sollecitare */}
      {suggerimenti.length > 0 && (
        <>
          <h2 className="section-title">Suggeriti dal finance — fatture scadute da sollecitare ({suggerimenti.length})</h2>
          <div className="card tight" style={{ marginBottom: 16 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Fattura</th><th>Partner</th><th>Scaduta il</th><th className="num">IVA incl.</th><th></th></tr>
                </thead>
                <tbody>
                  {suggerimenti.map((f) => {
                    const titolo = `Sollecitare fattura ${f.numero} — ${f.partner.nome}`;
                    const scad = f.scadenza ? f.scadenza.toISOString().slice(0, 10) : "";
                    return (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 500 }}>{f.numero}</td>
                        <td style={{ fontSize: 12.5 }}>{f.partner.nome}</td>
                        <td><span className="badge red"><span className="dot" />{dataIt(f.scadenza)}</span></td>
                        <td className="num">{euro(ivato(f))}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <form action={creaTask} style={{ display: "inline" }}>
                            <input type="hidden" name="titolo" value={titolo} />
                            <input type="hidden" name="partnerId" value={f.partnerId} />
                            <input type="hidden" name="riferimento" value={f.numero ?? ""} />
                            <input type="hidden" name="priorita" value="P0" />
                            <input type="hidden" name="scadenza" value={scad} />
                            <button className="btn small primary" type="submit" title="Apri un task di sollecito precompilato">
                              Apri come task
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Nuovo task */}
      <form action={creaTask} className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0, fontSize: 15 }}>Nuovo task</h2>
        <div className="form-grid">
          <div className="full">
            <label className="field-label">Cosa c&apos;è da fare <span className="req">*</span></label>
            <input type="text" name="titolo" required placeholder="es. Sollecitare pagamento fattura 181/2026 a Clivati" />
          </div>
          <div>
            <label className="field-label">Priorità</label>
            <select name="priorita" defaultValue="P1">
              {Object.entries(PRIORITA_TASK).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Assegnata a</label>
            <input type="text" name="assegnatario" placeholder="es. Nicolò / nome o email" />
          </div>
          <div>
            <label className="field-label">Scadenza</label>
            <input type="date" name="scadenza" />
          </div>
          <div>
            <label className="field-label">Partner (facoltativo)</label>
            <select name="partnerId" defaultValue="">
              <option value="">—</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Riferimento (fattura, PAY-…, pro-forma)</label>
            <input type="text" name="riferimento" placeholder="es. 181/2026 o PAY-2026-000123" />
          </div>
          <div className="full">
            <label className="field-label">Note</label>
            <input type="text" name="note" placeholder="Dettagli, contesto…" />
          </div>
        </div>
        <div className="form-footer">
          <button type="submit" className="btn primary">Apri task</button>
        </div>
      </form>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <form className="filters" method="get">
          <select name="stato" defaultValue={sp.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {Object.entries(STATI_TASK).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select name="priorita" defaultValue={sp.priorita ?? ""}>
            <option value="">Tutte le priorità</option>
            {Object.entries(PRIORITA_TASK).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn secondary small" type="submit">Filtra</button>
        </form>
      </div>

      <div className="card tight">
        {ordinati.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">Nessun task</div>
            <div className="empty-text">Apri il primo con il modulo qui sopra.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th><th>Assegnata a</th><th>Partner</th><th>Riferimento</th>
                  <th>Priorità</th><th>Scadenza</th><th>Stato</th><th></th>
                </tr>
              </thead>
              <tbody>
                {ordinati.map((t) => {
                  const st = STATI_TASK[t.stato] ?? STATI_TASK.aperto;
                  const pri = PRIORITA_TASK[normPriorita(t.priorita)];
                  const scaduto = t.stato !== "fatto" && t.scadenza && t.scadenza < oggi;
                  return (
                    <tr key={t.id} style={t.stato === "fatto" ? { opacity: 0.6 } : undefined}>
                      <td>
                        <div style={{ fontWeight: 500, textDecoration: t.stato === "fatto" ? "line-through" : undefined }}>{t.titolo}</div>
                        {t.note && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{t.note}</div>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{t.assegnatario ?? "—"}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {t.partnerId ? <Link href={`/partner/${t.partnerId}`} style={{ color: "var(--blue)" }}>{t.partnerNome}</Link> : "—"}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{t.riferimento ?? "—"}</td>
                      <td><span className={`badge ${pri.badge}`}><span className="dot" />{pri.label}</span></td>
                      <td>
                        {t.scadenza ? (
                          scaduto
                            ? <span className="badge red"><span className="dot" />{dataIt(t.scadenza)}</span>
                            : <span style={{ fontSize: 12.5 }}>{dataIt(t.scadenza)}</span>
                        ) : "—"}
                      </td>
                      <td><span className={`badge ${st.badge}`}><span className="dot" />{st.label}</span></td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                          {t.stato !== "fatto" ? (
                            <>
                              {t.stato === "aperto" && (
                                <form action={cambiaStatoTask.bind(null, t.id, "in_corso")} style={{ display: "inline" }}>
                                  <button className="btn small secondary" type="submit">In corso</button>
                                </form>
                              )}
                              <form action={cambiaStatoTask.bind(null, t.id, "fatto")} style={{ display: "inline" }}>
                                <button className="btn small primary" type="submit">Fatto</button>
                              </form>
                            </>
                          ) : (
                            <form action={cambiaStatoTask.bind(null, t.id, "aperto")} style={{ display: "inline" }}>
                              <button className="btn small secondary" type="submit">Riapri</button>
                            </form>
                          )}
                          <form action={eliminaTask.bind(null, t.id)} style={{ display: "inline" }}>
                            <button className="btn small danger" type="submit">Elimina</button>
                          </form>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
