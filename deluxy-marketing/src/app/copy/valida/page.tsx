import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { BRANDS, ETICHETTA_BRAND, formattaData } from "@/lib/dominio";
import {
  COLORE_GIUDIZIO_COPY,
  copyScore,
  CRITERI_COPY,
  ETICHETTA_GIUDIZIO_COPY,
  lintCopy,
} from "@/lib/copy-lint";

export const dynamic = "force-dynamic";

// Valida copy: il lint dei claim e delle parole per brand (7.2/7.3) più il
// Copy Score /100 (doc 7 §6.6). Tutto via GET: incolli, valuti, salvi.
export default async function PaginaValidaCopy({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const brand = p.brand && (BRANDS as readonly string[]).includes(p.brand) ? p.brand : "flowers";
  const testo = p.testo ?? "";
  const violazioni = testo ? lintCopy(testo, brand) : [];
  const penalitaAuto = violazioni.filter((v) => v.tipo === "tossica").length * 5;

  // Copy Score: se sono arrivati i criteri, calcola e salva.
  const criteriPassati = CRITERI_COPY.every((c) => p[c.chiave] !== undefined && p[c.chiave] !== "");
  let esitoScore: { score: number; giudizio: string; faseDebole: string } | null = null;
  if (testo && criteriPassati && p.salva === "1") {
    const criteri: Record<string, number> = {};
    for (const c of CRITERI_COPY) criteri[c.chiave] = Number(p[c.chiave]);
    esitoScore = copyScore(criteri, penalitaAuto);
    const esiste = await prisma.copyScore.findFirst({
      where: { testoCopy: testo, brand, creataIl: { gte: new Date(Date.now() - 60_000) } },
    });
    if (!esiste) {
      await prisma.copyScore.create({
        data: {
          brand,
          testoCopy: testo,
          criteri: JSON.stringify(criteri),
          penalita: penalitaAuto,
          score: esitoScore.score,
          giudizio: esitoScore.giudizio,
          faseDebole: esitoScore.faseDebole,
        },
      });
    }
  }
  const storici = await prisma.copyScore.findMany({ orderBy: { creataIl: "desc" }, take: 12 });

  return (
    <div className="layout">
      <Sidebar attiva="copy" />
      <main className="main">
        <a className="ritorno" href="/copy">← Copy &amp; annunci</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Valida copy</h1>
            <p className="page-sub">
              Incolla un copy: l&apos;app applica le regole di claim (7.3) e di tono per brand (7.2) —
              rosso = vietato, giallo = parola tossica (−5 punti) — e calcola il Copy Score /100
              del framework AIDA (doc 7 §6.6). Si lancia solo con score ≥65.
            </p>
          </div>
        </div>

        <section className="scheda">
          <form className="modulo" method="get">
            <div className="campo-modulo">
              <label>Brand</label>
              <select name="brand" defaultValue={brand}>
                {BRANDS.filter((b) => b !== "cross").map((b) => (
                  <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label>Copy da validare</label>
              <textarea name="testo" rows={4} defaultValue={testo} placeholder="Incolla titoli, descrizioni o primary text…" />
            </div>

            {testo && (
              <div className="campo-modulo largo">
                <label>Copy Score — criteri 0-5 (pesi: A 25% · I 25% · D 30% · CTA 10% · igiene 10%)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {CRITERI_COPY.map((c) => (
                    <label key={c.chiave} style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 3 }}>
                      {c.nome}
                      <input name={c.chiave} type="number" min={0} max={5} step={1} defaultValue={p[c.chiave] ?? ""} style={{ width: 90, font: "inherit", padding: "6px 8px", borderRadius: 8, border: "1px solid var(--hairline-strong)" }} />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-secondario" type="submit" name="salva" value="">Valida</button>
              {testo && <button className="btn" type="submit" name="salva" value="1">Calcola e salva lo score</button>}
            </div>
          </form>
        </section>

        {testo && (
          <section className="scheda">
            <div className="scheda-titolo">Esito del lint ({ETICHETTA_BRAND[brand]})</div>
            {violazioni.length === 0 ? (
              <div className="tag-salute" style={{ color: "var(--green)", padding: "6px 12px" }}>
                <span className="dot" /> Nessuna violazione: il copy rispetta claim e tono del brand
              </div>
            ) : (
              <ul className="storia">
                {violazioni.map((v, i) => (
                  <li key={i}>
                    <span className="storia-data" style={{ color: v.tipo === "vietato" ? "var(--red)" : "var(--orange)", fontWeight: 600 }}>
                      {v.tipo === "vietato" ? "VIETATO" : "TOSSICA −5"}
                    </span>
                    <span className="storia-testo">
                      <b>“{v.parola}”</b> — {v.motivo}
                      {v.sostituzione && (
                        <span className="cella-sub" style={{ whiteSpace: "normal" }}>
                          Sostituzione del lusso: {v.sostituzione}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {esitoScore && (
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 34, fontWeight: 600, color: COLORE_GIUDIZIO_COPY[esitoScore.giudizio] }}>
                  {esitoScore.score}/100
                </span>
                <span className="tag-salute" style={{ color: COLORE_GIUDIZIO_COPY[esitoScore.giudizio] }}>
                  <span className="dot" />
                  {ETICHETTA_GIUDIZIO_COPY[esitoScore.giudizio]}
                </span>
                <span className="cella-sub">
                  penalità parole tossiche: −{penalitaAuto} · criterio più debole: {esitoScore.faseDebole}
                </span>
              </div>
            )}
          </section>
        )}

        {storici.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Score recenti</div>
            <ul className="storia">
              {storici.map((s) => (
                <li key={s.id}>
                  <span className="storia-data">{formattaData(s.creataIl)}</span>
                  <span className="storia-testo">
                    <b style={{ color: COLORE_GIUDIZIO_COPY[s.giudizio] }}>{s.score}/100</b>{" "}
                    <span className="tag-neutro">{ETICHETTA_BRAND[s.brand] ?? s.brand}</span>{" "}
                    {s.testoCopy.slice(0, 90)}{s.testoCopy.length > 90 ? "…" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
