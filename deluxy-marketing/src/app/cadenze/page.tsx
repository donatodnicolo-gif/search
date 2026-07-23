import { Sidebar } from "@/components/Sidebar";
import { spuntaOccorrenza } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { formattaData, FREQUENZE_CADENZA } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Calcola l'ultima data "dovuta" per una frequenza (lunedì per la settimanale,
// il 1° del mese per la mensile, ecc.).
function ultimaDovuta(frequenza: string, oggi: Date): Date {
  const d = new Date(oggi);
  d.setHours(0, 0, 0, 0);
  if (frequenza === "settimanale" || frequenza === "bisettimanale") {
    const indietro = (d.getDay() + 6) % 7; // lunedì
    d.setDate(d.getDate() - indietro);
    return d;
  }
  if (frequenza === "mensile") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (frequenza === "trimestrale") return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return new Date(d.getFullYear(), 0, 1); // annuale
}

// Cadenze ricorrenti (doc 5 §8.1, doc 10 §7): il lunedì e il 1° del mese
// l'app genera le occorrenze dovute; le scadute non eseguite vanno in rosso.
export default async function PaginaCadenze() {
  const cadenze = await prisma.cadenza.findMany({
    where: { attiva: true },
    include: { occorrenze: { orderBy: { prevista: "desc" }, take: 6 } },
    orderBy: { nome: "asc" },
  });

  // Genera (idempotente) l'occorrenza dovuta per ogni cadenza.
  const oggi = new Date();
  for (const c of cadenze) {
    const dovuta = ultimaDovuta(c.frequenza, oggi);
    await prisma.cadenzaOccorrenza.upsert({
      where: { cadenzaId_prevista: { cadenzaId: c.id, prevista: dovuta } },
      create: { cadenzaId: c.id, prevista: dovuta },
      update: {},
    });
  }
  const aggiornate = await prisma.cadenza.findMany({
    where: { attiva: true },
    include: { occorrenze: { orderBy: { prevista: "desc" }, take: 6 } },
    orderBy: { nome: "asc" },
  });
  const inRitardo = aggiornate.filter((c) =>
    c.occorrenze.some((o) => !o.eseguitaIl && o.prevista < new Date(Date.now() - 86_400_000))
  );

  return (
    <div className="layout">
      <Sidebar attiva="cadenze" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Cadenze</h1>
            <p className="page-sub">
              I riti ricorrenti dei Definitivi: checkpoint del lunedì, manutenzione mensile,
              refresh delle liste. L&apos;app genera le occorrenze dovute e tiene il conto di cosa è
              stato fatto davvero.
            </p>
          </div>
        </div>

        {inRitardo.length > 0 && (
          <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
            <span>
              <b>{inRitardo.length} cadenze in ritardo</b>: {inRitardo.map((c) => c.nome).join(" · ")}
            </span>
          </div>
        )}

        {aggiornate.map((c) => {
          const corrente = c.occorrenze[0];
          const fatta = Boolean(corrente?.eseguitaIl);
          return (
            <section className="scheda" key={c.id}>
              <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {c.nome}
                <span className="tag-neutro">{FREQUENZE_CADENZA[c.frequenza] ?? c.frequenza}</span>
                <span className="tag-salute" style={{ color: fatta ? "var(--green)" : "var(--orange)" }}>
                  <span className="dot" />
                  {fatta ? `Fatta ${formattaData(corrente!.eseguitaIl)}` : `Dovuta dal ${formattaData(corrente?.prevista)}`}
                </span>
                {c.fonte && (
                  <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-tertiary)" }}>
                    {c.fonte}
                  </span>
                )}
              </div>
              {c.checklist && (
                <div className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
                  {c.checklist}
                </div>
              )}
              {!fatta && corrente && (
                <form className="modulo" action={spuntaOccorrenza} style={{ gridTemplateColumns: "2fr auto" }}>
                  <input type="hidden" name="id" value={corrente.id} />
                  <div className="campo-modulo">
                    <label>Esito (facoltativo)</label>
                    <input name="esito" placeholder="Cosa è emerso da questo giro" />
                  </div>
                  <div className="azioni-modulo" style={{ alignSelf: "end" }}>
                    <button className="btn small" type="submit">Segna come fatta</button>
                  </div>
                </form>
              )}
              {c.occorrenze.length > 1 && (
                <div className="cella-sub" style={{ marginTop: 8 }}>
                  Storico: {c.occorrenze.slice(1).map((o) => `${formattaData(o.prevista)} ${o.eseguitaIl ? "✓" : "✗"}`).join(" · ")}
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
