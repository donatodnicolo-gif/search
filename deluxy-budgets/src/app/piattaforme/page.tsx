import { advBudgetMese, ANNO_CORRENTE, caricaAnno } from "@/lib/calc";
import { PiattaformeEditor } from "@/components/PiattaformeEditor";

export const dynamic = "force-dynamic";

export default async function Piattaforme() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  // Budget ADV per mese: è la base che si ripartisce tra le piattaforme.
  const budgetMese: number[] = [];
  for (let m = 1; m <= 12; m++) budgetMese.push(advBudgetMese(dati, m));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Piattaforme ADV</h1>
          <p className="page-caption">
            Ripartizione del budget pubblicitario {dati.year} tra le piattaforme. Imposti le %
            (diverse mese per mese) e gli importi si calcolano da soli sul budget ADV del mese.
          </p>
        </div>
      </div>
      <PiattaformeEditor
        year={dati.year}
        budgetMese={budgetMese}
        piattaforme={dati.piattaforme.map((p) => ({
          id: p.id,
          nome: p.nome,
          colore: p.colore,
          split: p.split,
        }))}
      />
    </>
  );
}
