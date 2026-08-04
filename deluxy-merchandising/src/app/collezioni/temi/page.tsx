import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/dominio";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";
import { creaTema } from "@/lib/azioni-temi";

export const dynamic = "force-dynamic";

// I **temi**: raggruppamenti liberi di collezioni, trasversali ai negozi.
// «Natale», «San Valentino», «Matrimoni». Non hanno criteri automatici: chi ci
// sta dentro lo decide una persona, e per questo non si sovrappongono alle
// tipologie (che invece si definiscono per criteri sui prodotti).
export default async function TemiPage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; messaggio?: string }>;
}) {
  const sp = await searchParams;
  const temi = await prisma.temaCollezioni.findMany({
    orderBy: { nome: "asc" },
    include: {
      collezioni: { select: { id: true, negozio: true, prodotti: { select: { prodottoId: true } } } },
    },
  });

  // Il venduto dei temi: una query sola sul periodo, come nel resto dell'app.
  const f = finestra(90);
  const vendite = temi.length
    ? await prisma.vendita.groupBy({
        by: ["prodottoId"],
        where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE },
        _sum: { ricavo: true },
      })
    : [];
  const vp = new Map(vendite.filter((v) => v.prodottoId).map((v) => [v.prodottoId as string, v._sum.ricavo ?? 0]));

  const righe = temi.map((t) => {
    // **I prodotti distinti**, non la somma delle collezioni: un prodotto sta in
    // più collezioni dello stesso tema e sommandole si conterebbe più volte lo
    // stesso incasso (errore già pagato in /visual).
    const prodotti = new Set<string>();
    for (const c of t.collezioni) for (const p of c.prodotti) prodotti.add(p.prodottoId);
    let ricavo = 0;
    for (const id of prodotti) ricavo += vp.get(id) ?? 0;
    const negozi = [...new Set(t.collezioni.map((c) => c.negozio))].sort();
    return { t, collezioni: t.collezioni.length, prodotti: prodotti.size, ricavo, negozi };
  });

  return (
    <div className="layout">
      <Sidebar attiva="collezioni" />
      <main className="main" style={{ maxWidth: 980 }}>
        <a className="ritorno" href="/collezioni">← Collezioni</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Temi</h1>
            <p className="page-sub">
              Raggruppamenti <b>liberi</b> di collezioni, anche di negozi diversi: «Natale», «San Valentino»,
              «Matrimoni». Chi ci sta dentro <b>lo decidi tu</b> — nessun criterio automatico, a differenza delle{" "}
              <Link href="/visual/tipologie">tipologie</Link>, che si definiscono per criteri sui prodotti. Una
              collezione può stare in <b>più temi</b> insieme.
            </p>
          </div>
        </div>

        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        <div className="scheda">
          <div className="scheda-titolo">Nuovo tema</div>
          <form action={creaTema} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input name="nome" placeholder="Nome del tema (es. Natale)" required style={{ minWidth: 280 }} />
            <input name="descrizione" placeholder="A cosa serve (facoltativo)" style={{ minWidth: 260 }} />
            <button type="submit" className="btn btn-primario">Crea e scegli le collezioni</button>
          </form>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">I temi ({temi.length})</div>
          {temi.length === 0 ? (
            <div className="vuoto-mini">
              Nessun tema. Serve a tenere insieme collezioni che vanno insieme — le vetrine di Natale dei tre negozi,
              per esempio — e a ritrovarle senza cercarle una per una fra le 343.
            </div>
          ) : (
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tema</th>
                    <th>Negozi</th>
                    <th className="num">Collezioni</th>
                    <th className="num">Prodotti</th>
                    <th className="num">Venduto 90gg</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => (
                    <tr key={r.t.id} className="riga-cliccabile">
                      <td>
                        <Link href={`/collezioni/temi/${r.t.id}`} className="cella-nome link-riga">
                          {r.t.nome}
                        </Link>
                        {r.t.descrizione && <div className="cella-sub">{r.t.descrizione}</div>}
                      </td>
                      <td className="cella-muta">{r.negozi.join(", ") || "—"}</td>
                      <td className="num">{r.collezioni || "—"}</td>
                      {/* Prodotti **distinti**: la stessa scheda in due collezioni
                          del tema si conta una volta sola. */}
                      <td className="num">{r.prodotti || "—"}</td>
                      <td className="num">{r.ricavo > 0 ? euro(r.ricavo) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="page-sub" style={{ marginTop: 12 }}>
            Prodotti e venduto contano i <b>prodotti distinti</b> del tema: la stessa scheda in due collezioni si conta
            una volta sola, altrimenti verrebbero fuori fatturati che non esistono.
          </p>
        </div>
      </main>
    </div>
  );
}
