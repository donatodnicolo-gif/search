import { euro } from "@/lib/format";
import { schedaPartner } from "@/lib/stato-credito";
import { leggiRegole } from "@/lib/regole-stati";
import { BadgeCredito } from "./BadgeCredito";

// Scheda "salute del credito" di un cliente: come la leggerebbe un CFO in
// riunione — stato, esposizione, aging (a scadere / 1-30 / 31-60 / 61-90 / >90),
// comportamento storico di pagamento e azione consigliata.
export async function CreditoCard({ partnerId }: { partnerId: string }) {
  // Le fasce sono quelle configurate in Impostazioni → Regole degli stati.
  const { credito: r } = await leggiRegole();
  const s = await schedaPartner(partnerId, { regole: r });

  const fasce = [
    { k: "A scadere", v: s.aging.correnti, forte: false },
    { k: `1-${r.fascia1} gg`, v: s.aging.f30, forte: false },
    { k: `${r.fascia1 + 1}-${r.fascia2} gg`, v: s.aging.f60, forte: true },
    { k: `${r.fascia2 + 1}-${r.fascia3} gg`, v: s.aging.f90, forte: true },
    { k: `oltre ${r.fascia3} gg`, v: s.aging.oltre90, forte: true },
  ];

  return (
    <>
      <h2 className="section-title">Salute del credito</h2>
      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <BadgeCredito s={s} titolo={false} />
          <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>{s.motivo}</span>
        </div>

        <div className="info-grid">
          <div className="info-item">
            <div className="k">Esposizione</div>
            <div className="v">{euro(s.esposizione)}</div>
          </div>
          <div className="info-item">
            <div className="k">Di cui scaduto</div>
            <div className={`v ${s.scaduto >= 0.01 ? "neg" : ""}`}>{euro(s.scaduto)}</div>
          </div>
          <div className="info-item">
            <div className="k">Ritardo massimo</div>
            <div className="v">{s.giorniRitardoMax ? `${s.giorniRitardoMax} giorni` : "—"}</div>
          </div>
          <div className="info-item">
            <div className="k">Fatture aperte</div>
            <div className="v">{s.fattureAperte}{s.fattureScadute ? ` (${s.fattureScadute} scadute)` : ""}</div>
          </div>
          <div className="info-item">
            <div className="k">Puntualità storica</div>
            <div className="v">{s.puntualita == null ? "—" : `${s.puntualita}%`}</div>
          </div>
          <div className="info-item">
            <div className="k">Ritardo medio con cui paga</div>
            <div className="v">
              {s.ritardoMedioStorico == null ? "—" : s.ritardoMedioStorico === 0 ? "nei termini" : `${s.ritardoMedioStorico} giorni`}
            </div>
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Aging del credito</th>
                {fasce.map((f) => <th key={f.k} className="num">{f.k}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="muted">Importi IVA inclusa</td>
                {fasce.map((f) => (
                  <td key={f.k} className={`num ${f.v >= 0.01 && f.forte ? "neg" : ""}`}>
                    {f.v >= 0.01 ? euro(f.v) : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {s.aging.senzaScadenza >= 0.01 && (
          <p style={{ fontSize: 13, color: "var(--orange)", marginTop: 10 }}>
            {euro(s.aging.senzaScadenza)} di fatture aperte <strong>senza data di scadenza</strong>: non
            entrano nell&apos;aging finché non gliela metti.
          </p>
        )}

        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 14 }}>
          <strong>Cosa fare:</strong> {s.azione}
        </p>
      </div>
    </>
  );
}
