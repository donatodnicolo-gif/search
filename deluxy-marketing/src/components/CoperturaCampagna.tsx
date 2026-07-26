import { prisma } from "@/lib/db";
import { daGiorni, GIORNI_LETTURA } from "@/lib/gruppi";

// La quota impressioni risponde a una domanda che i totali non toccano: quanto
// altro ci sarebbe da prendere, e perché non lo stiamo prendendo. Sono due
// strade opposte — soldi finiti (budget) o posizione insufficiente (rank) — e
// confonderle porta ad alzare il budget di una campagna che non lo spende già.
export async function CoperturaCampagna({ campagnaId }: { campagnaId: string }) {
  const righe = await prisma.metricaCampagna.findMany({
    where: { campagnaId, data: { gte: daGiorni(GIORNI_LETTURA) } },
    select: { impression: true, quotaImpressioni: true, persaBudget: true, persaRank: true },
  });

  // Media pesata sulle impressioni: un giorno da 4 impressioni non conta come
  // un giorno da 4.000.
  let peso = 0, quota = 0, budget = 0, rank = 0, giorniConDato = 0;
  for (const r of righe) {
    if (r.quotaImpressioni == null) continue;
    const p = Math.max(r.impression ?? 0, 1);
    peso += p;
    quota += r.quotaImpressioni * p;
    budget += (r.persaBudget ?? 0) * p;
    rank += (r.persaRank ?? 0) * p;
    giorniConDato++;
  }

  if (giorniConDato === 0) {
    return (
      <section className="scheda">
        <div className="scheda-titolo">Copertura delle ricerche</div>
        <div className="vuoto-mini">
          Quota impressioni non ancora arrivata. La manda lo script con <b>AZIONE = &quot;metriche&quot;</b> dalla
          versione del 26/07/2026: sulle campagne che non la espongono (Performance Max, Display)
          Google non la fornisce affatto, ed è normale che resti vuota.
        </div>
      </section>
    );
  }

  const pc = (n: number) => `${Math.round((n / peso) * 100)}%`;
  const persaBudgetPc = budget / peso;
  const persaRankPc = rank / peso;
  const limite =
    persaBudgetPc >= 0.2
      ? { testo: "Limitata dal budget", colore: "var(--orange)" }
      : persaRankPc >= 0.4
        ? { testo: "Limitata dalla posizione", colore: "var(--blue)" }
        : { testo: "Nessun limite evidente", colore: "var(--green)" };

  return (
    <section className="scheda">
      <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        Copertura delle ricerche · ultimi {GIORNI_LETTURA} giorni
        <span className="tag-salute" style={{ color: limite.colore }}>
          <span className="dot" />
          {limite.testo}
        </span>
      </div>
      <div className="kpi-riga" style={{ marginBottom: 0 }}>
        <div className="kpi">
          <div className="kpi-valore">{pc(quota)}</div>
          <div className="kpi-etichetta">Quota impressioni: quante delle ricerche buone ci vedono</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={persaBudgetPc >= 0.2 ? { color: "var(--orange)" } : undefined}>
            {pc(budget)}
          </div>
          <div className="kpi-etichetta">Persa perché il budget finisce</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore" style={persaRankPc >= 0.4 ? { color: "var(--blue)" } : undefined}>
            {pc(rank)}
          </div>
          <div className="kpi-etichetta">Persa per posizione: offerta o qualità basse</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{giorniConDato}</div>
          <div className="kpi-etichetta">Giorni con il dato (su {righe.length} registrati)</div>
        </div>
      </div>
      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        Se si perde per <b>budget</b> ha senso alzarlo: la domanda c&apos;è e non la si serve. Se si perde
        per <b>posizione</b> alzare il budget non cambia niente — lì si lavora su offerte, qualità
        dell&apos;annuncio e pertinenza della pagina.
      </p>
    </section>
  );
}
