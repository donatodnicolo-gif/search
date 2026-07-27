import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { caricaAnno } from "@/lib/calc";
import { eur, MESI } from "@/lib/format";
import { DecisioneProposta } from "@/components/DecisioneProposta";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  BOZZA: "neutral",
  INVIATA: "blue",
  APPROVATA: "green",
  RESPINTA: "red",
};

export default async function DettaglioProposta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.propostaBudget.findUnique({ where: { id } });
  if (!p) notFound();

  const [maisons, linee, dati] = await Promise.all([
    prisma.maison.findMany(),
    prisma.lineaCommerciale.findMany(),
    caricaAnno(p.year),
  ]);

  let valori: { month: number; valore: number }[] = [];
  try {
    valori = JSON.parse(p.valori);
  } catch {
    valori = [];
  }
  const totale = valori.reduce((s, v) => s + (v.valore || 0), 0);

  const ambito =
    p.ambitoTipo === "GLOBALE"
      ? "Tutta l'azienda"
      : p.ambitoTipo === "MAISON"
        ? maisons.find((m) => m.slug === p.ambitoSlug)?.nome ?? p.ambitoSlug ?? "—"
        : linee.find((l) => l.slug === p.ambitoSlug)?.nome ?? p.ambitoSlug ?? "—";

  // Quanto c'è oggi a budget sullo stesso ambito: chi approva deve vedere da
  // cosa si sta staccando la proposta, non solo il numero proposto.
  const maison = p.ambitoTipo === "MAISON" ? dati.maisons.find((m) => m.slug === p.ambitoSlug) : null;
  const attuale = maison
    ? maison.mesi.reduce((s, m) => s + Object.values(m.vendite).reduce((a, v) => a + v, 0), 0)
    : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Proposta di {p.autore}</h1>
          <p className="page-caption">
            {p.ruolo} · {ambito} · budget {p.year} · inviata il {p.createdAt.toLocaleDateString("it-IT")}
          </p>
        </div>
        <div className="page-actions">
          <span className={`badge ${BADGE[p.stato] ?? "neutral"}`}>
            <span className="dot" />
            {p.stato.charAt(0) + p.stato.slice(1).toLowerCase()}
          </span>
          <Link className="btn secondary" href="/proposte">Tutte le proposte</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Totale proposto {p.year}</div>
          <div className="kpi-value">{eur(totale)}</div>
          <div className="kpi-sub">{valori.length} mesi compilati</div>
        </div>
        {attuale !== null && (
          <div className="kpi">
            <div className="kpi-label">Oggi a budget su {ambito}</div>
            <div className="kpi-value">{eur(attuale)}</div>
            <div className="kpi-sub">
              {attuale > 0 ? `la proposta è ${totale >= attuale ? "+" : ""}${Math.round(((totale - attuale) / attuale) * 100)}%` : "nessun budget attuale"}
            </div>
          </div>
        )}
        {p.decisaIl && (
          <div className="kpi">
            <div className="kpi-label">Decisa il</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{p.decisaIl.toLocaleDateString("it-IT")}</div>
            <div className="kpi-sub">{p.consolidataSu ? `consolidata su ${p.consolidataSu}` : "non ancora consolidata"}</div>
          </div>
        )}
      </div>

      <h2 className="section-title">I dodici mesi proposti</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {MESI.map((m) => (<th className="num" key={m}>{m}</th>))}
                <th className="num">Totale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {MESI.map((_, i) => {
                  const v = valori.find((x) => x.month === i + 1)?.valore ?? 0;
                  return <td className="num" key={i}>{eur(v)}</td>;
                })}
                <td className="num" style={{ fontWeight: 700 }}>{eur(totale)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {p.note && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>Note di chi l&apos;ha inviata</div>
          {p.note}
        </div>
      )}

      {p.notaAdmin && (
        <div className="card" style={{ marginTop: 12, borderColor: p.stato === "RESPINTA" ? "var(--red)" : "var(--green)" }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>Risposta dell&apos;admin</div>
          {p.notaAdmin}
        </div>
      )}

      <DecisioneProposta
        id={p.id}
        stato={p.stato}
        ambitoTipo={p.ambitoTipo}
        consolidataSu={p.consolidataSu}
        tipologie={dati.tipologie.map((t) => ({ slug: t.slug, nome: t.nome }))}
      />
    </>
  );
}
