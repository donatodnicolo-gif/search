import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { aggiungiAVetrina, rimuoviDaVetrina, spostaInVetrina } from "@/lib/azioni";
import { etichettaCategoria, etichettaStagione } from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function VetrinaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vetrina = await prisma.vetrina.findUnique({
    where: { id },
    include: {
      prodotti: { orderBy: { posizione: "asc" }, include: { prodotto: true } },
    },
  });
  if (!vetrina) notFound();

  const presenti = new Set(vetrina.prodotti.map((vp) => vp.prodottoId));
  const disponibili = await prisma.prodotto.findMany({
    where: { id: { notIn: [...presenti] }, fase: { not: "archiviato" } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, codice: true },
  });

  const aggiungi = async (fd: FormData) => {
    "use server";
    const pid = fd.get("prodottoId");
    if (typeof pid === "string" && pid) await aggiungiAVetrina(id, pid);
  };

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 900 }}>
        <a className="ritorno" href="/visual">← Visual merchandising</a>
        <div className="page-head">
          <div>
            <div className="prodotto-codice">{vetrina.tipo}{vetrina.stagione ? ` · ${etichettaStagione(vetrina.stagione)}` : ""}</div>
            <h1 className="page-title">{vetrina.nome}</h1>
            {vetrina.descrizione && <p className="page-sub">{vetrina.descrizione}</p>}
          </div>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Sequenza di esposizione</div>
          {vetrina.prodotti.length === 0 ? (
            <div className="vuoto-mini">Nessun prodotto in scena. Aggiungine uno qui sotto.</div>
          ) : (
            <div className="vetrina-lista">
              {vetrina.prodotti.map((vp, i) => (
                <div className="vetrina-riga" key={vp.id}>
                  <span className="vetrina-pos">{i + 1}</span>
                  <span className="vetrina-mini">
                    {vp.prodotto.immagine ? <img src={vp.prodotto.immagine} alt="" /> : "❀"}
                  </span>
                  <span className="vetrina-info">
                    <a href={`/prodotti/${vp.prodottoId}`} className="cella-nome">{vp.prodotto.nome}</a>
                    <div className="cella-sub">{vp.prodotto.codice} · {etichettaCategoria(vp.prodotto.categoria)}</div>
                  </span>
                  <span className="vetrina-azioni">
                    <form action={spostaInVetrina.bind(null, vp.id, id, "su")}>
                      <button className="icon-btn" title="Sposta su" type="submit" disabled={i === 0}>↑</button>
                    </form>
                    <form action={spostaInVetrina.bind(null, vp.id, id, "giu")}>
                      <button className="icon-btn" title="Sposta giù" type="submit" disabled={i === vetrina.prodotti.length - 1}>↓</button>
                    </form>
                    <form action={rimuoviDaVetrina.bind(null, vp.id, id)}>
                      <button className="icon-btn" title="Rimuovi" type="submit">✕</button>
                    </form>
                  </span>
                </div>
              ))}
            </div>
          )}

          <form action={aggiungi} style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <select name="prodottoId" defaultValue="" style={{ flex: 1, font: "inherit", padding: "9px 12px", borderRadius: "var(--radius-m)", background: "var(--fill)", border: "1px solid transparent" }}>
              <option value="" disabled>Aggiungi un prodotto…</option>
              {disponibili.map((p) => (
                <option key={p.id} value={p.id}>{p.nome} — {p.codice}</option>
              ))}
            </select>
            <button type="submit" className="btn" disabled={disponibili.length === 0}>Aggiungi</button>
          </form>
        </div>
      </main>
    </div>
  );
}
