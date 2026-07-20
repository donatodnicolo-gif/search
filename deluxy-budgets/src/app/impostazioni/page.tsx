import { ANNO_CORRENTE, caricaAnno, LIVELLI } from "@/lib/calc";
import { ImpostazioniForm } from "@/components/ImpostazioniForm";

export const dynamic = "force-dynamic";

export default async function Impostazioni() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  const scenari = LIVELLI.map((l) => {
    const s = dati.scenari.find((x) => x.livello === l.key);
    return {
      livello: l.key,
      label: l.label,
      moltiplicatore: s?.moltiplicatore ?? 1,
      premio: s?.premio ?? 0,
    };
  });
  const costi = dati.costi
    .filter((c) => c.maisonId === null)
    .map((c) => ({ id: c.id, tipo: c.tipo, label: c.label, valore: c.valore }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Scenari, premi e costi</h1>
          <p className="page-caption">
            I 3 livelli di budget {ANNO_CORRENTE} (moltiplicatore sul pubblicato e premio al raggiungimento)
            e le voci di costo usate dal P&amp;L.
          </p>
        </div>
      </div>
      <ImpostazioniForm year={ANNO_CORRENTE} scenari={scenari} costi={costi} />
    </>
  );
}
