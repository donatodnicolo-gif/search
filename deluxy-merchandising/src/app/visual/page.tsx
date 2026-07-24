import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { creaVetrina } from "@/lib/azioni";
import { etichettaStagione } from "@/lib/dominio";
import Link from "next/link";

export const dynamic = "force-dynamic";

const TIPI: [string, string][] = [
  ["vetrina", "Vetrina"],
  ["lookbook", "Lookbook"],
  ["homepage", "Homepage"],
  ["capsule", "Capsule"],
];

export default async function VisualPage() {
  const vetrine = await prisma.vetrina.findMany({
    orderBy: { creataIl: "desc" },
    include: { _count: { select: { prodotti: true } } },
  });

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Visual merchandising</h1>
            <p className="page-sub">Gli allestimenti: vetrine, lookbook e capsule in cui il prodotto viene messo in scena, in un ordine curato.</p>
          </div>
        </div>

        <div className="due-colonne">
          <div>
            {vetrine.length === 0 ? (
              <div className="vuoto">Nessun allestimento. Creane uno dal modulo a fianco.</div>
            ) : (
              <div className="griglia-collezioni">
                {vetrine.map((v) => (
                  <Link key={v.id} href={`/visual/${v.id}`} className="card-collezione">
                    <div className="card-cover">
                      <span className="card-cover-stagione">{v.tipo}{v.stagione ? ` · ${etichettaStagione(v.stagione)}` : ""}</span>
                    </div>
                    <div className="card-corpo">
                      <span className="card-nome">{v.nome}</span>
                      <p className="card-tema">{v.descrizione ?? "—"}</p>
                      <div className="card-meta">
                        <span className="card-meta-num"><b>{v._count.prodotti}</b> prodotti in scena</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <form action={creaVetrina}>
            <div className="scheda">
              <div className="scheda-titolo">Nuovo allestimento</div>
              <div className="modulo" style={{ gridTemplateColumns: "1fr" }}>
                <div className="campo-modulo">
                  <label>Nome <span className="obbligatorio">*</span></label>
                  <input name="nome" required placeholder="Vetrina Flagship — Ora Blu" />
                </div>
                <div className="campo-modulo">
                  <label>Tipo</label>
                  <select name="tipo" defaultValue="vetrina">
                    {TIPI.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                  </select>
                </div>
                <div className="campo-modulo">
                  <label>Stagione</label>
                  <input name="stagione" placeholder="SS26" />
                </div>
                <div className="campo-modulo">
                  <label>Descrizione</label>
                  <textarea name="descrizione" rows={2} />
                </div>
              </div>
              <div className="azioni-modulo">
                <button type="submit" className="btn">Crea</button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
