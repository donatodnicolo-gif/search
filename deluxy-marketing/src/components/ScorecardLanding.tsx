import { salvaScorecardLanding } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { formattaData } from "@/lib/dominio";
import {
  COLORE_FASCIA_LANDING,
  CRITERI_LANDING,
  ETICHETTA_FASCIA_LANDING,
} from "@/lib/copy-lint";

// Scorecard landing 13 criteri /100 (doc 9.2 §10) con pre-check di lingua:
// una campagna ENG che atterra su un URL senza /en è un gap di message-match.
export async function ScorecardLanding({ landingId }: { landingId: string }) {
  const landing = await prisma.landingPage.findUnique({
    where: { id: landingId },
    include: {
      scorecards: { orderBy: { data: "desc" }, take: 3 },
      campagne: { select: { nome: true } },
    },
  });
  if (!landing) return null;

  // Pre-check lingua (doc 9.3 FASE 1): regola /en per le pagine inglesi
  const urlEn = /\/en\//.test(landing.url) || landing.url.includes("/en");
  const campagneEng = landing.campagne.filter((c) => /eng|english|\bEN\b/i.test(c.nome));
  const gapLingua = campagneEng.length > 0 && !urlEn && landing.lingua !== "en";
  const ultima = landing.scorecards[0];

  return (
    <section className="scheda">
      <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        Scorecard (13 criteri, doc 9.2)
        {ultima && (
          <span className="tag-salute" style={{ color: COLORE_FASCIA_LANDING[ultima.fascia] }}>
            <span className="dot" />
            {ultima.voto}/100 · {ETICHETTA_FASCIA_LANDING[ultima.fascia]}
          </span>
        )}
      </div>

      {gapLingua && (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
          <span>
            <b>Gap di lingua</b>: {campagneEng.map((c) => c.nome).join(", ")} è in inglese ma
            questa landing non ha il prefisso /en (doc 9.3: message-match di lingua).
          </span>
        </div>
      )}

      <form className="modulo" action={salvaScorecardLanding} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
        <input type="hidden" name="landingId" value={landing.id} />
        {CRITERI_LANDING.map((c) => (
          <div className="campo-modulo" key={c.chiave}>
            <label>{c.nome} <span className="cella-muta">(peso {c.peso})</span></label>
            <input
              name={c.chiave}
              type="number"
              min={0}
              max={5}
              step={1}
              defaultValue={ultima ? (JSON.parse(ultima.criteri) as Record<string, number>)[c.chiave] ?? "" : ""}
              placeholder="0-5"
            />
          </div>
        ))}
        <div className="campo-modulo largo">
          <label>Note</label>
          <input name="note" placeholder="Cosa è cambiato rispetto all'ultima valutazione" />
        </div>
        <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
          <button className="btn" type="submit">Calcola e salva il voto</button>
        </div>
      </form>

      {landing.scorecards.length > 0 && (
        <div className="cella-sub" style={{ marginTop: 10 }}>
          Storico:{" "}
          {landing.scorecards.map((s) => `${formattaData(s.data)}: ${s.voto}/100`).join(" · ")}
          {landing.scorecards.length >= 2 &&
            ` — ${landing.scorecards[0].voto >= landing.scorecards[1].voto ? "in miglioramento ↑" : "in peggioramento ↓"}`}
        </div>
      )}
    </section>
  );
}
