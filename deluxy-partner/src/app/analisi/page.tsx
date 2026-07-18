import Link from "next/link";
import { prisma } from "@/lib/db";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { ivato, nomeMese } from "@/lib/calc";
import { qontoConfigurato, qontoOrganizzazione } from "@/lib/qonto";

export const dynamic = "force-dynamic";

// ANALISI FINANZIARIA — proiezione di cassa per mese.
// Entrate attese = fatture servizi aperte (IVATE), collocate sul mese di
// scadenza; Uscite attese = dovuti ai partner ancora da bonificare. Quanto è
// già scaduto o maturato finisce nel bucket "Arretrato". Il saldo proiettato
// parte dalla liquidità reale letta da Qonto (se collegato).

type Voce = { chi: string; partnerId: string; rif: string; importo: number };
type Bucket = { chiave: string; etichetta: string; entrate: Voce[]; uscite: Voce[] };

export default async function AnalisiPage() {
  const anno = ANNO_CORRENTE;
  const oggi = new Date();
  const meseCorrente = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1));

  const [fattureAperte, tutti] = await Promise.all([
    prisma.fatturaServizio.findMany({
      where: { pagata: false, imponibile: { gt: 0 } },
      include: { partner: true },
    }),
    riepilogoTutti(anno),
  ]);

  // liquidità attuale da Qonto (facoltativa)
  let saldoBanca: number | null = null;
  let contiBanca = "";
  if (await qontoConfigurato()) {
    try {
      const org = await qontoOrganizzazione();
      const attivi = org.conti.filter((c) => !c.status || c.status === "active");
      saldoBanca = attivi.reduce((a, c) => a + c.balance, 0);
      contiBanca = attivi.map((c) => `${c.name ?? c.slug} ${euro(c.balance)}`).join(" · ");
    } catch {
      saldoBanca = null;
    }
  }

  // ---- bucket per mese ----
  const buckets = new Map<string, Bucket>();
  const bucket = (d: Date | null): Bucket => {
    const inizio = d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) : null;
    const arretrato = !inizio || inizio < meseCorrente;
    const chiave = arretrato ? "0-arretrato" : `${inizio!.getUTCFullYear()}-${String(inizio!.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(chiave)) {
      buckets.set(chiave, {
        chiave,
        etichetta: arretrato
          ? "Arretrato (già scaduto)"
          : `${nomeMese(inizio!.getUTCMonth() + 1)} ${inizio!.getUTCFullYear()}`,
        entrate: [],
        uscite: [],
      });
    }
    return buckets.get(chiave)!;
  };

  // ENTRATE: fatture aperte sul mese di scadenza (senza scadenza → competenza)
  for (const f of fattureAperte) {
    const rifData = f.scadenza ?? new Date(Date.UTC(f.anno, f.mese - 1, 28));
    bucket(rifData).entrate.push({
      chi: f.partner.nome,
      partnerId: f.partnerId,
      rif: `fatt. ${f.numero ?? "s.n."}${f.scadenza ? ` · scad. ${dataIt(f.scadenza)}` : ` · ${nomeMese(f.mese)} ${f.anno}`}`,
      importo: ivato(f),
    });
  }

  // USCITE: dovuti ai partner ancora aperti, sul loro mese di competenza
  for (const t of tutti) {
    for (const m of t.mesi) {
      if (m.riepilogo.daBonificare < 0.01) continue;
      bucket(new Date(Date.UTC(anno, m.mese - 1, 28))).uscite.push({
        chi: t.partner.nome,
        partnerId: t.partner.id,
        rif: `dovuto ${nomeMese(m.mese)} ${anno}`,
        importo: m.riepilogo.daBonificare,
      });
    }
  }

  const righe = [...buckets.values()].sort((a, b) => a.chiave.localeCompare(b.chiave));
  const somma = (v: Voce[]) => v.reduce((a, x) => a + x.importo, 0);
  const totEntrate = righe.reduce((a, r) => a + somma(r.entrate), 0);
  const totUscite = righe.reduce((a, r) => a + somma(r.uscite), 0);
  let cumulato = saldoBanca ?? 0;
  const maxBarra = Math.max(1, ...righe.map((r) => Math.max(somma(r.entrate), somma(r.uscite))));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Analisi finanziaria</h1>
          <p className="page-caption">
            Stima di entrate e uscite per mese sulla base delle fatture da incassare e dei bonifici
            da inviare ai partner{saldoBanca != null ? ", partendo dalla liquidità Qonto attuale" : ""}.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        {saldoBanca != null && (
          <div className="kpi">
            <div className="kpi-label">Liquidità attuale (Qonto)</div>
            <div className="kpi-value">{euro(saldoBanca)}</div>
            <div className="kpi-sub">{contiBanca}</div>
          </div>
        )}
        <div className="kpi">
          <div className="kpi-label">Entrate attese</div>
          <div className="kpi-value pos">{euro(totEntrate)}</div>
          <div className="kpi-sub">{fattureAperte.length} fatture da incassare (IVA inclusa)</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Uscite attese</div>
          <div className="kpi-value neg">{euro(totUscite)}</div>
          <div className="kpi-sub">bonifici dovuti ai partner</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{saldoBanca != null ? "Liquidità proiettata" : "Differenza netta"}</div>
          <div className={`kpi-value ${(saldoBanca ?? 0) + totEntrate - totUscite >= 0 ? "pos" : "neg"}`}>
            {euro((saldoBanca ?? 0) + totEntrate - totUscite)}
          </div>
          <div className="kpi-sub">se tutto viene incassato e pagato</div>
        </div>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th style={{ width: "26%" }}></th>
                <th className="num">Entrate attese</th>
                <th className="num">Uscite attese</th>
                <th className="num">Differenza</th>
                {saldoBanca != null && <th className="num">Saldo proiettato</th>}
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => {
                const e = somma(r.entrate);
                const u = somma(r.uscite);
                cumulato += e - u;
                return (
                  <tr key={r.chiave}>
                    <td style={{ fontWeight: 600 }}>
                      {r.etichetta}
                      <details style={{ marginTop: 4 }}>
                        <summary className="muted" style={{ cursor: "pointer", fontSize: 12, fontWeight: 400, listStyle: "none" }}>
                          {r.entrate.length} incassi · {r.uscite.length} pagamenti — dettaglio
                        </summary>
                        <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 400, display: "grid", gap: 3 }}>
                          {[...r.entrate].sort((a, b) => b.importo - a.importo).map((v, i) => (
                            <div key={"e" + i}>
                              <span style={{ color: "var(--green)" }}>+{euro(v.importo)}</span>{" "}
                              <Link href={`/partner/${v.partnerId}`}>{v.chi}</Link>{" "}
                              <span className="muted">({v.rif})</span>
                            </div>
                          ))}
                          {[...r.uscite].sort((a, b) => b.importo - a.importo).map((v, i) => (
                            <div key={"u" + i}>
                              <span style={{ color: "var(--red)" }}>−{euro(v.importo)}</span>{" "}
                              <Link href={`/partner/${v.partnerId}`}>{v.chi}</Link>{" "}
                              <span className="muted">({v.rif})</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 3 }}>
                        <div style={{ height: 7, borderRadius: 4, overflow: "hidden", background: "var(--fill)" }}>
                          <div style={{ width: `${(e / maxBarra) * 100}%`, height: "100%", background: "var(--green)" }} />
                        </div>
                        <div style={{ height: 7, borderRadius: 4, overflow: "hidden", background: "var(--fill)" }}>
                          <div style={{ width: `${(u / maxBarra) * 100}%`, height: "100%", background: "var(--red)" }} />
                        </div>
                      </div>
                    </td>
                    <td className="num pos">{euro(e)}</td>
                    <td className="num neg">{euro(u)}</td>
                    <td className={`num ${e - u >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                      {e - u >= 0 ? "+" : ""}{euro(e - u)}
                    </td>
                    {saldoBanca != null && (
                      <td className={`num ${cumulato >= 0 ? "" : "neg"}`} style={{ fontWeight: 600 }}>
                        {euro(cumulato)}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                <td>Totale</td>
                <td></td>
                <td className="num pos">{euro(totEntrate)}</td>
                <td className="num neg">{euro(totUscite)}</td>
                <td className={`num ${totEntrate - totUscite >= 0 ? "pos" : "neg"}`}>
                  {totEntrate - totUscite >= 0 ? "+" : ""}{euro(totEntrate - totUscite)}
                </td>
                {saldoBanca != null && <td className="num">{euro(cumulato)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        Stima, non previsione certa: le entrate sono collocate sul mese di <strong>scadenza</strong> delle
        fatture aperte (le già scadute in &laquo;Arretrato&raquo;), le uscite sul mese di competenza del
        dovuto. Barre: verde = entrate, rossa = uscite. Man mano che registri incassi e bonifici
        (anche via Import transazioni) la proiezione si aggiorna da sola.
      </p>
    </>
  );
}
