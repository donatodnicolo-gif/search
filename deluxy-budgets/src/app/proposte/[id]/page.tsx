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

  let valori: { month: number; canale?: string; valore: number }[] = [];
  try {
    valori = JSON.parse(p.valori);
  } catch {
    valori = [];
  }
  const totale = valori.reduce((s, v) => s + (v.valore || 0), 0);
  // Le linee di business che la proposta nomina, nell'ordine delle tipologie.
  // Vuoto = proposta scritta con un numero solo per mese (globale, linea
  // commerciale, o una maison proposta prima del 31/07/2026).
  const canaliProposti = dati.tipologie
    .map((t) => t.slug)
    .filter((slug) => valori.some((v) => v.canale === slug));

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

  // Il budget di oggi voce per voce e mese per mese: serve al pannello per
  // mostrare **cosa si sovrascrive** prima di consolidare. Senza, «Consolida»
  // è un bottone che riscrive il budget pubblicato senza far vedere cosa
  // toglie — ed è così che il 31/07/2026 sono spariti 692.728 € di budget
  // Deluxy.it su gennaio-giugno.
  const budgetAttuale: Record<string, number[]> = {};
  if (maison) {
    for (const t of dati.tipologie) {
      budgetAttuale[t.slug] = maison.mesi.map((m) => m.vendite[t.slug] ?? 0);
    }
  }

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

      <h2 className="section-title">I mesi proposti</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {canaliProposti.length > 0 && <th style={{ minWidth: 140 }}>Linea di business</th>}
                {MESI.map((m) => (<th className="num" key={m}>{m}</th>))}
                <th className="num">Totale</th>
              </tr>
            </thead>
            <tbody>
              {/* Una proposta di maison arriva **linea per linea** (dal
                  31/07/2026): mostrarla schiacciata su una riga sola
                  nasconderebbe proprio l'informazione per cui si chiede il
                  dettaglio — su quale linea il responsabile sta puntando. */}
              {canaliProposti.length > 0 ? (
                <>
                  {canaliProposti.map((slug) => {
                    const righe = valori.filter((v) => v.canale === slug);
                    const tot = righe.reduce((s, v) => s + (v.valore || 0), 0);
                    return (
                      <tr key={slug}>
                        <td style={{ fontWeight: 500 }}>
                          {dati.tipologie.find((t) => t.slug === slug)?.nome ?? slug}
                        </td>
                        {MESI.map((_, i) => {
                          const v = righe.find((x) => x.month === i + 1);
                          return (
                            <td className={`num ${v ? "" : "muted"}`} key={i}>
                              {v ? eur(v.valore) : "—"}
                            </td>
                          );
                        })}
                        <td className="num" style={{ fontWeight: 600 }}>{eur(tot)}</td>
                      </tr>
                    );
                  })}
                  <tr className="tot">
                    <td>Totale</td>
                    {MESI.map((_, i) => {
                      const v = valori.filter((x) => x.month === i + 1);
                      return (
                        <td className={`num ${v.length ? "" : "muted"}`} key={i}>
                          {v.length ? eur(v.reduce((s, x) => s + (x.valore || 0), 0)) : "—"}
                        </td>
                      );
                    })}
                    <td className="num">{eur(totale)}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  {MESI.map((_, i) => {
                    const v = valori.find((x) => x.month === i + 1);
                    return (
                      <td className={`num ${v ? "" : "muted"}`} key={i}>{v ? eur(v.valore) : "—"}</td>
                    );
                  })}
                  <td className="num" style={{ fontWeight: 700 }}>{eur(totale)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="page-caption" style={{ marginTop: 12 }}>
        Un mese a <strong>—</strong> non è un mese proposto a zero: è un mese che la proposta{" "}
        <strong>non contiene</strong>, e che il consolidamento quindi non tocca. I mesi già chiusi non si
        propongono, per questo di solito mancano.
      </p>

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
        valori={valori}
        budgetAttuale={budgetAttuale}
      />
    </>
  );
}
