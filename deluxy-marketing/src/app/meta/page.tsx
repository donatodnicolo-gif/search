import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { cambiaStatoTestMeta, creaTestMeta } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  COLORE_STATO_TEST,
  ETICHETTA_BRAND,
  ETICHETTA_STATO_TEST,
  formattaData,
  formattaEuro,
  STATI_TEST_META,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

const FASI = [
  ["A", "A — Attention"],
  ["I", "I — Interest"],
  ["D", "D — Desire"],
  ["X", "X — Retargeting"],
  ["retention", "Retention"],
  ["trasversale", "Trasversale"],
] as const;

// Meta & test: il backlog dei test pianificabili in anticipo secondo il
// modello AIDA dei Definitivi (documenti 8, 8.1, 8.2, 8.3 su Drive).
export default async function PaginaMeta({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const test = await prisma.testMeta.findMany({
    where: brand ? { brand: { in: [brand, "cross"] } } : {},
    orderBy: [{ dataVerifica: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
  });

  return (
    <div className="layout">
      <Sidebar attiva="meta" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Meta &amp; test</h1>
            <p className="page-sub">
              Il backlog dei test Meta pianificati in anticipo: ipotesi, variabile, metrica di
              successo, guardrail. Modello AIDA e vincoli operativi nei Definitivi 8.x su Drive
              (finestre di apprendimento ≥50 eventi/settimana, blackout 72h post-offerta, freeze Ferragosto).
            </p>
          </div>
        </div>

        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            Regole rapide dal modello: budget minimo pratico 30-50 €/g · mai toccare in
            apprendimento (7-14 gg) · variazioni budget max +15-20% ogni 3-4 gg · un solo gesto
            creativo ogni ≥2 settimane (slot lunedì) · freeze creativo da giovedì 13/8.
          </span>
        </div>

        <div className="board">
          {STATI_TEST_META.map((stato) => {
            const colonna = test.filter((t) => t.stato === stato);
            return (
              <div className="board-colonna" key={stato}>
                <div className="board-testata">
                  <span className="board-titolo" style={{ color: COLORE_STATO_TEST[stato] }}>
                    <span className="sb-dot" style={{ background: "currentColor", width: 8, height: 8 }} />
                    <span style={{ color: "var(--text)" }}>{ETICHETTA_STATO_TEST[stato]}</span>
                  </span>
                  <span className="board-conta">{colonna.length}</span>
                </div>
                {colonna.map((t) => (
                  <div className="board-card" key={t.id}>
                    <div className="board-card-nome">{t.titolo}</div>
                    <div className="cella-sub" style={{ margin: "6px 0", whiteSpace: "normal" }}>{t.ipotesi}</div>
                    <div className="board-card-sub">
                      <Badge testo={ETICHETTA_BRAND[t.brand] ?? t.brand} colore={COLORE_BRAND[t.brand] ?? "var(--text-tertiary)"} />
                      {t.fase && <span>Fase {t.fase}</span>}
                      {t.budgetGiornaliero != null && <span>{formattaEuro(t.budgetGiornaliero)}/g</span>}
                      {t.dataVerifica && <span>verifica {formattaData(t.dataVerifica)}</span>}
                    </div>
                    {t.metricaSuccesso && (
                      <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal" }}>
                        Successo: {t.metricaSuccesso}
                      </div>
                    )}
                    {t.lezione && (
                      <div className="cella-sub" style={{ marginTop: 4, whiteSpace: "normal", color: "var(--green)" }}>
                        Lezione: {t.lezione}
                      </div>
                    )}
                    <form className="pill-scelta" action={cambiaStatoTestMeta} style={{ marginTop: 8 }}>
                      <input type="hidden" name="id" value={t.id} />
                      {STATI_TEST_META.filter((s) => s !== stato).slice(0, 3).map((s) => (
                        <button key={s} className="pill-opt" type="submit" name="stato" value={s} style={{ color: COLORE_STATO_TEST[s] }}>
                          <span className="dot" />
                          <span style={{ color: "var(--text)" }}>{ETICHETTA_STATO_TEST[s]}</span>
                        </button>
                      ))}
                    </form>
                  </div>
                ))}
                {colonna.length === 0 && <div className="vuoto-mini">Nessun test</div>}
              </div>
            );
          })}
        </div>

        <section className="scheda" style={{ marginTop: 18 }}>
          <div className="scheda-titolo">Pianifica un nuovo test</div>
          <form className="modulo" action={creaTestMeta}>
            <div className="campo-modulo largo">
              <label>Titolo <span className="obbligatorio">*</span></label>
              <input name="titolo" required placeholder="Es. Hook video vs statica in fase A (Flowers)" />
            </div>
            <div className="campo-modulo largo">
              <label>Ipotesi da falsificare <span className="obbligatorio">*</span></label>
              <textarea name="ipotesi" required rows={2} placeholder="Cosa ci aspettiamo e perché…" />
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
              <label>Fase AIDA</label>
              <select name="fase" defaultValue="">
                <option value="">—</option>
                {FASI.map(([v, e]) => (
                  <option key={v} value={v}>{e}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label>Variabile testata</label>
              <input name="variabile" placeholder="hook, pubblico, formato, struttura…" />
            </div>
            <div className="campo-modulo">
              <label>Metrica di successo</label>
              <input name="metricaSuccesso" placeholder="costo LPV, costo ATC, ROAS vs BE…" />
            </div>
            <div className="campo-modulo">
              <label>Budget €/giorno</label>
              <input name="budgetGiornaliero" type="number" step="0.5" min="0" />
            </div>
            <div className="campo-modulo">
              <label>Inizio previsto</label>
              <input name="dataInizio" type="date" />
            </div>
            <div className="campo-modulo">
              <label>Verifica prevista</label>
              <input name="dataVerifica" type="date" />
            </div>
            <div className="campo-modulo">
              <label>Stato</label>
              <select name="stato" defaultValue="idea">
                {STATI_TEST_META.slice(0, 3).map((s) => (
                  <option key={s} value={s}>{ETICHETTA_STATO_TEST[s]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label>Guardrail / vincoli</label>
              <input name="guardrail" placeholder="Es. non partire in finestra di apprendimento; stop se frequenza > 6" />
            </div>
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Aggiungi al backlog</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
