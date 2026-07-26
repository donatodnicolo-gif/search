import { Sidebar } from "@/components/Sidebar";
import { TabellaGruppi } from "@/components/TabellaGruppi";
import { prisma } from "@/lib/db";
import { BRANDS, ETICHETTA_BRAND, formattaEuro, formattaNumero } from "@/lib/dominio";
import { GIORNI_LETTURA, gruppiConNumeri, letturaRoas } from "@/lib/gruppi";

export const dynamic = "force-dynamic";

const PERIODI = [7, 30, 90];

// Gruppi di annunci: il livello sotto la campagna, dove si decide davvero.
// La media di campagna nasconde un gruppo che spende bene e uno che brucia;
// qui si vedono separati, ordinati per spesa.
export default async function PaginaGruppi({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; campagna?: string; q?: string; giorni?: string }>;
}) {
  const p = await searchParams;
  const giorni = PERIODI.includes(Number(p.giorni)) ? Number(p.giorni) : GIORNI_LETTURA;

  const righe = await gruppiConNumeri({
    brand: p.brand || undefined,
    campagnaId: p.campagna || undefined,
    cerca: p.q || undefined,
    giorni,
  });

  const campagne = await prisma.campagna.findMany({
    where: { gruppi: { some: {} } },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  const spesa = righe.reduce((s, r) => s + r.spesa, 0);
  const ricavi = righe.reduce((s, r) => s + r.ricavi, 0);
  const conversioni = righe.reduce((s, r) => s + r.conversioni, 0);
  const roasTotale = spesa > 0 ? ricavi / spesa : null;

  // I due estremi: il gruppo che rende meglio e quello che brucia di più.
  const conSpesa = righe.filter((r) => r.spesa >= 20);
  const migliore = [...conSpesa].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0] ?? null;
  const peggiore = [...conSpesa].sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0))[0] ?? null;
  const inPausa = righe.filter((r) => r.statoPiattaforma === "PAUSED").length;

  const link = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (p.brand) q.set("brand", p.brand);
    if (p.campagna) q.set("campagna", p.campagna);
    if (p.q) q.set("q", p.q);
    if (giorni !== GIORNI_LETTURA) q.set("giorni", String(giorni));
    for (const k in extra) {
      if (extra[k]) q.set(k, extra[k]);
      else q.delete(k);
    }
    return `/gruppi?${q.toString()}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="gruppi" brandAttivo={p.brand} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Gruppi di annunci</h1>
            <p className="page-sub">
              Il livello sotto la campagna: due gruppi nella stessa campagna possono avere rese
              opposte e la media li nasconde entrambi. Ultimi {giorni} giorni, ordinati per spesa.
              Il ROAS è letto sul break-even del brand. Le Performance Max non hanno gruppi di
              annunci: al loro posto ci sono i gruppi di asset.
            </p>
          </div>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca nel nome…" defaultValue={p.q ?? ""} />
          <select name="brand" defaultValue={p.brand ?? ""}>
            <option value="">Tutti i brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b]}</option>
            ))}
          </select>
          <select name="campagna" defaultValue={p.campagna ?? ""}>
            <option value="">Tutte le campagne</option>
            {campagne.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <select name="giorni" defaultValue={String(giorni)}>
            {PERIODI.map((g) => (
              <option key={g} value={g}>Ultimi {g} giorni</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{righe.length}</div>
            <div className="kpi-etichetta">Gruppi{inPausa > 0 ? ` · ${inPausa} in pausa su Google` : ""}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(spesa)}</div>
            <div className="kpi-etichetta">Spesa nel periodo</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaNumero(Math.round(conversioni))}</div>
            <div className="kpi-etichetta">Conversioni</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{roasTotale != null ? `${roasTotale.toFixed(2)}×` : "—"}</div>
            <div className="kpi-etichetta">ROAS complessivo</div>
          </div>
        </div>

        {migliore && peggiore && migliore.id !== peggiore.id && (
          <section className="scheda">
            <div className="scheda-titolo">I due estremi (almeno 20 € di spesa)</div>
            <div className="due-colonne">
              <div>
                <div className="cella-sub">TIENE SU LA BARACCA</div>
                <div className="cella-nome">
                  <a href={`/gruppi/${migliore.id}`}>{migliore.nome}</a>
                </div>
                <div className="cella-sub">{migliore.campagna}</div>
                <p style={{ marginTop: 6 }}>
                  {formattaEuro(migliore.spesa)} spesi ·{" "}
                  <span style={{ color: letturaRoas(migliore.roas, migliore.spesa, migliore.brand).colore, fontWeight: 600 }}>
                    {letturaRoas(migliore.roas, migliore.spesa, migliore.brand).testo}
                  </span>{" "}
                  · {letturaRoas(migliore.roas, migliore.spesa, migliore.brand).spiega}
                </p>
              </div>
              <div>
                <div className="cella-sub">SE LA MANGIA</div>
                <div className="cella-nome">
                  <a href={`/gruppi/${peggiore.id}`}>{peggiore.nome}</a>
                </div>
                <div className="cella-sub">{peggiore.campagna}</div>
                <p style={{ marginTop: 6 }}>
                  {formattaEuro(peggiore.spesa)} spesi ·{" "}
                  <span style={{ color: letturaRoas(peggiore.roas, peggiore.spesa, peggiore.brand).colore, fontWeight: 600 }}>
                    {letturaRoas(peggiore.roas, peggiore.spesa, peggiore.brand).testo}
                  </span>{" "}
                  · {letturaRoas(peggiore.roas, peggiore.spesa, peggiore.brand).spiega}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="scheda">
          <div className="scheda-titolo">Tutti i gruppi ({righe.length})</div>
          <TabellaGruppi righe={righe} mostraQuota />
        </section>

        {righe.length === 0 && (
          <p className="cella-sub">
            Se l&apos;account manda già le metriche di campagna ma non i gruppi, manca lo script con{" "}
            <code>AZIONE = &quot;gruppi&quot;</code> (una copia per account, ogni settimana). Vedi{" "}
            <a href={link({ giorni: "90" })}>gli ultimi 90 giorni</a> prima di preoccuparti.
          </p>
        )}
      </main>
    </div>
  );
}
