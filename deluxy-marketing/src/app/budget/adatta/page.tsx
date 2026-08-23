import { Sidebar } from "@/components/Sidebar";
import { AdattaBudget } from "@/components/AdattaBudget";
import { prisma } from "@/lib/db";
import { budgetDaBudgets, meseDiSito } from "@/lib/budgets";
import { accodaBudgetCampagne } from "@/lib/azioni";
import { ETICHETTA_SITO, formattaEuro, MESI_IT, SITI } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// **Adattare i budget delle campagne al tetto di Budgets, mese per mese.**
//
// ⚠️ Il pezzo che mancava. L'app sapeva dire quanto si può spendere (Budgets) e
// quanto è acceso (Google/Meta), ma per farli combaciare bisognava aprire una
// campagna per volta, ricordarsi il totale a mente e rifare la somma a ogni
// modifica. Qui si vedono tutte insieme, il totale si aggiorna mentre si
// scrive, e si mette in coda in un colpo solo quello che è cambiato.
//
// ⚠️ E UNA COSA CHE VA DETTA SUBITO: qui non si programma il futuro. Le
// operazioni partono quando qualcuno le approva e lo script passa — non il
// primo del mese. Guardare il tetto di settembre serve a DECIDERE oggi; se la
// modifica deve valere da settembre, si mette in coda a settembre.

export default async function AdattaBudgetPagina({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; mese?: string; esito?: string }>;
}) {
  const sp = await searchParams;
  const oggi = new Date();
  const anno = oggi.getFullYear();
  const brand = (SITI as readonly string[]).includes(sp.brand ?? "") ? (sp.brand as string) : (SITI[0] as string);
  const mese = Math.min(12, Math.max(1, Number(sp.mese) || oggi.getMonth() + 1));
  const giorniMese = new Date(anno, mese, 0).getDate();

  const [campagne, budgets] = await Promise.all([
    prisma.campagna.findMany({
      where: { brand, stato: { notIn: ["defunta", "conclusa"] } },
      select: {
        id: true,
        nome: true,
        canale: true,
        statoPiattaforma: true,
        budgetGiornaliero: true,
      },
      orderBy: [{ statoPiattaforma: "asc" }, { budgetGiornaliero: "desc" }],
    }),
    budgetDaBudgets(anno),
  ]);

  // Chi ha già un cambio di budget in coda: rifarlo adesso vorrebbe dire due
  // modifiche sulla stessa campagna, e la seconda cancella la prima senza che
  // nessuno l'abbia deciso.
  const inCoda = await prisma.operazioneAdv.findMany({
    where: {
      tipo: "budget",
      campagnaId: { in: campagne.map((c) => c.id) },
      stato: { in: ["in_attesa", "approvata"] },
    },
    select: { campagnaId: true, parametri: true },
  });
  const giaInCoda = new Map<string, number | null>();
  for (const o of inCoda) {
    if (!o.campagnaId) continue;
    try {
      giaInCoda.set(o.campagnaId, JSON.parse(o.parametri ?? "{}").budget ?? null);
    } catch {
      giaInCoda.set(o.campagnaId, null);
    }
  }

  const mb = meseDiSito(budgets, brand, mese);
  const tetto = mb?.advConsentito ?? null;

  return (
    <div className="layout">
      <Sidebar attiva="budget" brandAttivo={brand} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Adatta i budget · {ETICHETTA_SITO[brand] ?? brand}</h1>
            <p className="page-sub">
              Quanto è acceso oggi, contro quanto <b>Deluxy Budgets</b> consente per{" "}
              {MESI_IT[mese - 1]}. Si scrivono i nuovi budget qui, il totale si aggiorna mentre
              scrivi, e quello che cambi va in coda — da approvare come ogni altra modifica.
            </p>
          </div>
          <a className="btn small btn-secondario" href="/budget">
            ← Budget
          </a>
        </div>

        {sp.esito && <div className="nota-ok">{sp.esito}</div>}

        <section className="scheda" style={{ paddingBottom: 14 }}>
          <div className="pill-scelta" style={{ marginBottom: 10, flexWrap: "wrap" }}>
            {SITI.map((s) => (
              <a
                key={s}
                className={`pill-opt${s === brand ? " attuale" : ""}`}
                href={`/budget/adatta?brand=${s}&mese=${mese}`}
              >
                {ETICHETTA_SITO[s] ?? s}
              </a>
            ))}
          </div>
          <div className="pill-scelta" style={{ flexWrap: "wrap" }}>
            {MESI_IT.map((nome, i) => (
              <a
                key={nome}
                className={`pill-opt${mese === i + 1 ? " attuale" : ""}`}
                href={`/budget/adatta?brand=${brand}&mese=${i + 1}`}
              >
                {nome.slice(0, 3)}
              </a>
            ))}
          </div>
          {/* ⚠️ Il mese cambia il TETTO che si guarda, non quando parte la
              modifica: le operazioni partono all'approvazione, non il primo del
              mese. Dirlo qui evita di programmare settembre a metà agosto e
              scoprirlo dalla spesa. */}
          <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
            Il mese scelto cambia <b>il tetto con cui ti confronti</b>, non quando la modifica parte:
            le operazioni partono quando le approvi. Se un budget deve valere da {MESI_IT[mese - 1]},
            va messo in coda in quel mese.
          </p>
        </section>

        {!budgets.ok && (
          <div className="nota-avviso">
            Il tetto non si è potuto leggere da Budgets: {budgets.errore}
          </div>
        )}

        <AdattaBudget
          brand={brand}
          etichettaBrand={ETICHETTA_SITO[brand] ?? brand}
          mese={MESI_IT[mese - 1]}
          giorniMese={giorniMese}
          tetto={tetto}
          tettoTesto={tetto != null ? formattaEuro(tetto) : null}
          campagne={campagne.map((c) => ({
            id: c.id,
            nome: c.nome,
            canale: c.canale ?? "",
            accesa: c.statoPiattaforma === "ENABLED",
            budget: c.budgetGiornaliero,
            inCoda: giaInCoda.has(c.id),
            budgetInCoda: giaInCoda.get(c.id) ?? null,
          }))}
          azione={accodaBudgetCampagne}
        />
      </main>
    </div>
  );
}
