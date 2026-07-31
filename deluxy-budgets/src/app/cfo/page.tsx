import Link from "next/link";
import { ANNO_CORRENTE } from "@/lib/calc";
import { caricaCategorie, ricostruisci } from "@/lib/cfo";
import { fetchSpeseBanca } from "@/lib/finance";
import { CfoBoard } from "@/components/CfoBoard";

export const dynamic = "force-dynamic";

const PERIODI = [
  { key: "anno", label: "Anno", dal: 1, al: 12 },
  { key: "s1", label: "1° semestre", dal: 1, al: 6 },
  { key: "s2", label: "2° semestre", dal: 7, al: 12 },
];

export default async function CfoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sp = await searchParams;
  const periodo = PERIODI.find((p) => p.key === sp.periodo) ?? PERIODI[0];

  const [res, categorie] = await Promise.all([
    fetchSpeseBanca({ anno: ANNO_CORRENTE, dal: periodo.dal, al: periodo.al }),
    caricaCategorie(),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">CFO</h1>
          <p className="page-caption">
            Le uscite di banca (da Finance) riclassificate in categorie di costo: si ricostruisce la
            struttura dei costi e la si confronta con il P&amp;L. Le regole imparano una volta e valgono
            per sempre.
          </p>
          {/* Chi classifica è Finance (decisione del 31/07/2026). Va scritto
              proprio qui, perché è qui che si creano le regole e ci si aspetta
              di veder cambiare i numeri subito: adesso non cambiano finché
              Finance non rifà la sua passata. Senza questa riga sembra rotto. */}
          <p className="page-caption" style={{ marginTop: 6 }}>
            <strong>La categoria di ogni movimento la decide Finance</strong>, che importa queste regole e le
            applica (anche con l&apos;AI). Qui le regole si <em>scrivono</em>: una regola nuova entra nel conto
            economico <strong>quando Finance rifà la sua passata</strong> — «Applica le regole di Budgets», nella
            sua pagina Spese. Dove Finance non ha ancora classificato, valgono le regole di qui.
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {PERIODI.map((p) => (
              <Link key={p.key} href={`/cfo?periodo=${p.key}`} className={p.key === periodo.key ? "on" : ""}>
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {!res.ok ? (
        <div className="card empty">
          <div className="empty-icon">↯</div>
          <div className="empty-title">{res.configurato ? "Spese non disponibili" : "Collega l'app Finance"}</div>
          <div className="empty-text">{res.errore}</div>
        </div>
      ) : (
        <CfoBoard
          periodoLabel={res.dati.periodo.etichetta}
          anno={ANNO_CORRENTE}
          totali={res.dati.totali}
          righe={ricostruisci(res.dati.controparti, categorie).map((r) => ({
            categoriaId: r.categoria?.id ?? null,
            categoriaNome: r.categoria?.nome ?? null,
            descrizione: r.categoria?.descrizione ?? null,
            tipoPL: r.categoria?.tipoPL ?? null,
            voceCE: r.categoria?.voceCE ?? null,
            voceCEImpostata: r.categoria?.voceCEImpostata ?? false,
            predefinita: r.categoria?.predefinita ?? false,
            colore: r.categoria?.colore ?? null,
            uscite: r.uscite,
            movimenti: r.movimenti,
            perMese: r.perMese,
            controparti: r.controparti,
          }))}
          categorie={categorie.map((c) => ({ id: c.id, nome: c.nome, tipoPL: c.tipoPL, colore: c.colore }))}
        />
      )}
    </>
  );
}
