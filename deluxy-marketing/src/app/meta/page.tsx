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
  ["A", "A — Attention (freddo)"],
  ["I", "I — Interest"],
  ["D", "D — Desire"],
  ["X", "X — Retargeting"],
  ["retention", "Retention"],
  ["trasversale", "Trasversale"],
] as const;

// Spiegazione delle colonne, mostrata sotto il titolo di ognuna.
const SPIEGA_COLONNA: Record<string, string> = {
  idea: "Proposte da valutare: nessuna data, nessun impegno.",
  pianificato: "Approvati, con data e budget: partiranno.",
  in_corso: "Stanno girando adesso sulle campagne.",
  concluso: "Finiti: in attesa del verdetto.",
  promosso: "Vinti: diventano regola nei Definitivi.",
  respinto: "Persi: l'ipotesi era sbagliata (e lo sappiamo).",
};

// Il prossimo passo sensato per ogni stato: pochi bottoni, chiari.
const PROSSIMI: Record<string, { stato: string; etichetta: string }[]> = {
  idea: [{ stato: "pianificato", etichetta: "Pianifica" }, { stato: "respinto", etichetta: "Scarta" }],
  pianificato: [{ stato: "in_corso", etichetta: "Avvia" }, { stato: "idea", etichetta: "Rimetti tra le idee" }],
  in_corso: [{ stato: "concluso", etichetta: "Concludi" }],
  concluso: [{ stato: "promosso", etichetta: "Promuovi a regola" }, { stato: "respinto", etichetta: "Respingi" }],
  promosso: [],
  respinto: [{ stato: "idea", etichetta: "Riapri come idea" }],
};

// Meta & test: il laboratorio dei test Meta. Ogni card è un esperimento che
// attraversa la board da sinistra a destra (modello AIDA, Definitivi 8.x).
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
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Meta &amp; test</h1>
            <p className="page-sub">
              Il laboratorio delle campagne Meta: ogni card è un <b>esperimento</b> con
              un&apos;ipotesi da dimostrare. Si muove da sinistra a destra: nasce come idea, viene
              pianificato con data e budget, gira, si conclude e — se vince — diventa una regola
              fissa dei Definitivi.
            </p>
          </div>
        </div>

        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            Perché serve pianificarli in anticipo: su Meta un test valido richiede una{" "}
            <b>finestra di apprendimento</b> (7-14 giorni senza toccare nulla), budget adeguato
            (~50 conversioni/settimana) e slot creativi ogni 2 settimane. Chi improvvisa brucia
            budget: il backlog qui sotto viene dai documenti 8.x dei Definitivi.
          </span>
        </div>

        <div className="board" style={{ gridAutoColumns: "minmax(270px, 1fr)" }}>
          {STATI_TEST_META.map((stato) => {
            const colonna = test.filter((t) => t.stato === stato);
            return (
              <div className="board-colonna" key={stato}>
                <div className="board-testata" style={{ alignItems: "flex-start" }}>
                  <span>
                    <span className="board-titolo" style={{ color: COLORE_STATO_TEST[stato] }}>
                      <span className="sb-dot" style={{ background: "currentColor", width: 8, height: 8 }} />
                      <span style={{ color: "var(--text)" }}>{ETICHETTA_STATO_TEST[stato]}</span>
                    </span>
                    <div className="colonna-spiega">{SPIEGA_COLONNA[stato]}</div>
                  </span>
                  <span className="board-conta">{colonna.length}</span>
                </div>
                {colonna.map((t) => (
                  <div className="board-card" key={t.id}>
                    <div className="board-card-nome" style={{ whiteSpace: "normal" }}>{t.titolo}</div>
                    <div className="board-card-sub" style={{ margin: "5px 0 8px" }}>
                      <Badge testo={ETICHETTA_BRAND[t.brand] ?? t.brand} colore={COLORE_BRAND[t.brand] ?? "var(--text-tertiary)"} />
                      {t.fase && <Badge testo={`Fase ${t.fase}`} colore="var(--text-secondary)" />}
                    </div>
                    <div className="test-campo">
                      <span className="test-etichetta">Ipotesi</span>
                      <span className="test-valore">{t.ipotesi}</span>
                    </div>
                    {t.variabile && (
                      <div className="test-campo">
                        <span className="test-etichetta">Cosa cambia</span>
                        <span className="test-valore">{t.variabile}</span>
                      </div>
                    )}
                    {t.metricaSuccesso && (
                      <div className="test-campo">
                        <span className="test-etichetta">Vince se</span>
                        <span className="test-valore">{t.metricaSuccesso}</span>
                      </div>
                    )}
                    {(t.budgetGiornaliero != null || t.dataVerifica) && (
                      <div className="test-campo">
                        <span className="test-etichetta">Quando / quanto</span>
                        <span className="test-valore">
                          {[
                            t.budgetGiornaliero != null ? `${formattaEuro(t.budgetGiornaliero)}/giorno` : null,
                            t.dataVerifica ? `verdetto il ${formattaData(t.dataVerifica)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    )}
                    {t.lezione && (
                      <div className="test-campo">
                        <span className="test-etichetta" style={{ color: "var(--green)" }}>Lezione</span>
                        <span className="test-valore">{t.lezione}</span>
                      </div>
                    )}
                    {t.fonte && <div className="cella-sub" style={{ marginTop: 6 }}>Fonte: {t.fonte}</div>}
                    {PROSSIMI[stato].length > 0 && (
                      <form className="pill-scelta" action={cambiaStatoTestMeta} style={{ marginTop: 10 }}>
                        <input type="hidden" name="id" value={t.id} />
                        {PROSSIMI[stato].map((p) => (
                          <button key={p.stato} className="pill-opt" type="submit" name="stato" value={p.stato} style={{ color: COLORE_STATO_TEST[p.stato] }}>
                            <span className="dot" />
                            <span style={{ color: "var(--text)" }}>{p.etichetta}</span>
                          </button>
                        ))}
                      </form>
                    )}
                  </div>
                ))}
                {colonna.length === 0 && <div className="vuoto-mini">Vuoto</div>}
              </div>
            );
          })}
        </div>

        <section className="scheda" style={{ marginTop: 18 }}>
          <div className="scheda-titolo">Proponi un nuovo test</div>
          <form className="modulo" action={creaTestMeta}>
            <div className="campo-modulo largo">
              <label>Titolo <span className="obbligatorio">*</span></label>
              <input name="titolo" required placeholder="Es. Hook video vs statica in fase A (Flowers)" />
            </div>
            <div className="campo-modulo largo">
              <label>Ipotesi: cosa ci aspettiamo? <span className="obbligatorio">*</span></label>
              <textarea name="ipotesi" required rows={2} placeholder="Es. Il video 9:16 con l'USP nei primi 3 secondi abbassa il costo per visita rispetto alla statica" />
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
              <label>Cosa cambia (variabile)</label>
              <input name="variabile" placeholder="hook, pubblico, formato, struttura…" />
            </div>
            <div className="campo-modulo">
              <label>Vince se (metrica)</label>
              <input name="metricaSuccesso" placeholder="costo per visita, costo ATC, ROAS…" />
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
              <label>Verdetto previsto</label>
              <input name="dataVerifica" type="date" />
            </div>
            <div className="campo-modulo">
              <label>Stato iniziale</label>
              <select name="stato" defaultValue="idea">
                <option value="idea">Idea</option>
                <option value="pianificato">Pianificato</option>
              </select>
            </div>
            <div className="campo-modulo largo">
              <label>Guardrail / vincoli</label>
              <input name="guardrail" placeholder="Es. non toccare in apprendimento; stop se frequenza > 6" />
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
