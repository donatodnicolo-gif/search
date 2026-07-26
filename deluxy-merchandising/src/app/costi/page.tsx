import { Sidebar } from "@/components/Sidebar";
import { BarraMargine } from "@/components/BarraMargine";
import { prisma } from "@/lib/db";
import { calcolaMargine, coloreMargine, euro, percentuale } from "@/lib/dominio";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Quanti prodotti si mostrano in tabella: il catalogo può contenerne migliaia
// (l'import dal venduto ne crea uno per ogni articolo venduto) e la pagina
// intera diventerebbe illeggibile oltre che lentissima.
const LIMITE = 100;

export default async function CostiPage() {
  const prodotti = await prisma.prodotto.findMany({
    where: { fase: { not: "archiviato" }, prezzoVendita: { gt: 0 } },
    include: { collezione: { select: { nome: true, margineTarget: true } } },
  });

  // Costo 0 = costo non ancora inserito, non prodotto a costo zero: mostrarlo
  // in tabella significherebbe scrivere "margine 100%" su tutto il catalogo.
  // Questi prodotti si contano a parte, e si dice che vanno compilati.
  const senzaCosto = prodotti.filter((p) => p.costoProduzione <= 0);
  const conCosto = prodotti.filter((p) => p.costoProduzione > 0);

  const righe = conCosto
    .map((p) => ({ p, m: calcolaMargine(p.costoProduzione, p.prezzoVendita), target: p.collezione?.margineTarget ?? null }))
    .sort((a, b) => a.m.marginePct - b.m.marginePct);
  const mostrate = righe.slice(0, LIMITE);

  const sottoTarget = righe.filter((r) => r.target != null && r.m.marginePct * 100 < r.target);
  const margineMedio = righe.length ? righe.reduce((s, r) => s + r.m.marginePct, 0) / righe.length : 0;
  const valoreListino = prodotti.reduce((s, p) => s + p.prezzoVendita, 0);

  return (
    <div className="layout">
      <Sidebar attiva="costi" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Costi & margini</h1>
            <p className="page-sub">La marginalità di ogni prodotto rispetto al target della sua collezione. In rosso i prodotti sotto obiettivo.</p>
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi"><div className="kpi-valore">{percentuale(margineMedio)}</div><div className="kpi-etichetta">Margine medio</div></div>
          <div className="kpi"><div className="kpi-valore" style={{ color: sottoTarget.length ? "var(--red)" : "var(--green)" }}>{sottoTarget.length}</div><div className="kpi-etichetta">Sotto target</div></div>
          <div className="kpi"><div className="kpi-valore">{righe.length}</div><div className="kpi-etichetta">Prodotti con costo inserito</div></div>
          <div className="kpi"><div className="kpi-valore" style={{ color: senzaCosto.length ? "var(--orange)" : undefined }}>{senzaCosto.length}</div><div className="kpi-etichetta">Senza costo: margine non calcolabile</div></div>
          <div className="kpi"><div className="kpi-valore">{euro(valoreListino)}</div><div className="kpi-etichetta">Valore di listino</div></div>
        </div>

        {senzaCosto.length > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              {senzaCosto.length} prodotti a listino non hanno il <b>costo di produzione</b> e restano fuori da
              questa pagina: a costo zero risulterebbero tutti al 100% di margine, che è falso. Si compila dalla
              scheda prodotto, tab «Costi &amp; margini».
            </span>
          </div>
        )}

        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Prodotto</th><th>Collezione</th><th className="num">Costo</th><th className="num">Prezzo</th>
                <th className="num">Guadagno</th><th>Margine</th>
              </tr>
            </thead>
            <tbody>
              {mostrate.map(({ p, m, target }) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/prodotti/${p.id}?tab=costi`} className="cella-nome">{p.nome}</Link>
                    <div className="cella-sub">{p.codice}</div>
                  </td>
                  <td className="cella-muta">{p.collezione?.nome ?? "—"}{target != null ? ` · target ${target}%` : ""}</td>
                  <td className="num">{euro(m.costo)}</td>
                  <td className="num">{euro(m.prezzo)}</td>
                  <td className="num" style={{ color: coloreMargine(m.marginePct, target) }}>{euro(m.guadagno)}</td>
                  <td><BarraMargine marginePct={m.marginePct} target={target} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {righe.length > mostrate.length && (
          <p className="page-sub" style={{ marginTop: 12 }}>
            Mostrati i {mostrate.length} prodotti col margine più basso; altri {righe.length - mostrate.length}{" "}
            non sono in tabella.
          </p>
        )}
        {righe.length === 0 && (
          <div className="vuoto">
            Nessun prodotto con costo di produzione inserito: senza costo il margine non si calcola.
          </div>
        )}
      </main>
    </div>
  );
}
