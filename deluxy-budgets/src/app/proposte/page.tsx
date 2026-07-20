import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/calc";
import { eur } from "@/lib/format";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  BOZZA: "neutral",
  INVIATA: "blue",
  APPROVATA: "green",
  RESPINTA: "red",
};

export default async function Proposte() {
  const proposte = await prisma.propostaBudget.findMany({
    where: { year: ANNO_CORRENTE },
    orderBy: { createdAt: "desc" },
  });
  const [maisons, linee] = await Promise.all([
    prisma.maison.findMany(),
    prisma.lineaCommerciale.findMany(),
  ]);

  const nomeAmbito = (p: (typeof proposte)[number]) => {
    if (p.ambitoTipo === "GLOBALE") return "Tutta l'azienda";
    if (p.ambitoTipo === "MAISON") return maisons.find((m) => m.slug === p.ambitoSlug)?.nome ?? p.ambitoSlug;
    return linee.find((l) => l.slug === p.ambitoSlug)?.nome ?? p.ambitoSlug;
  };
  const totale = (p: (typeof proposte)[number]) => {
    try {
      const v = JSON.parse(p.valori) as { valore: number }[];
      return v.reduce((s, x) => s + (x.valore || 0), 0);
    } catch {
      return 0;
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Proposte budget</h1>
          <p className="page-caption">
            Ogni utente di livello Responsabile invia la propria proposta di budget {ANNO_CORRENTE}; qui si raccolgono e confrontano.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn primary" href="/proposte/nuova">Nuova proposta</Link>
        </div>
      </div>

      {proposte.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">✍︎</div>
          <div className="empty-title">Nessuna proposta ancora</div>
          <div className="empty-text">
            Le proposte dei Responsabili compariranno qui.{" "}
            <Link href="/proposte/nuova" style={{ color: "var(--blue)" }}>Invia la prima proposta</Link>.
          </div>
        </div>
      ) : (
        <div className="card tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Autore</th>
                  <th>Ruolo</th>
                  <th>Ambito</th>
                  <th className="num">Totale proposto</th>
                  <th>Stato</th>
                  <th>Data</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {proposte.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.autore}</td>
                    <td className="muted">{p.ruolo}</td>
                    <td>{nomeAmbito(p)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{eur(totale(p))}</td>
                    <td>
                      <span className={`badge ${BADGE[p.stato] ?? "neutral"}`}>
                        <span className="dot" />
                        {p.stato.charAt(0) + p.stato.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="muted">{p.createdAt.toLocaleDateString("it-IT")}</td>
                    <td className="muted" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
