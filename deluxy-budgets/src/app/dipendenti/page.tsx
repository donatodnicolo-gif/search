import { ANNO_CORRENTE, caricaAnno } from "@/lib/calc";
import { DipendentiEditor } from "@/components/DipendentiEditor";

export const dynamic = "force-dynamic";

export default async function Dipendenti() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dipendenti e collaboratori</h1>
          <p className="page-caption">
            Costo del personale {dati.year}: dipendenti a RAL, stagisti e consulenti, con i mesi
            in cui il costo è effettivamente a carico dell&apos;azienda. Confluisce nel P&amp;L.
          </p>
        </div>
      </div>
      <DipendentiEditor
        year={dati.year}
        persone={dati.persone}
        maisons={dati.maisons.map((m) => ({ id: m.id, nome: m.nome }))}
      />
    </>
  );
}
