import { ANNO_CORRENTE, caricaAnno } from "@/lib/calc";
import { SpeseEditor } from "@/components/SpeseEditor";

export const dynamic = "force-dynamic";

export default async function Spese() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Spese ADV</h1>
          <p className="page-caption">
            Quanto si può spendere in pubblicità per maison, come % delle vendite budget del mese.
            Le percentuali sono personalizzabili mese per mese; l&apos;importo consentito si aggiorna di conseguenza.
          </p>
        </div>
      </div>
      <SpeseEditor
        year={dati.year}
        maisons={dati.maisons.map((m) => ({
          id: m.id,
          nome: m.nome,
          mesi: m.mesi.map((x) => ({
            month: x.month,
            vendite: x.d2c + x.eventi + x.b2b,
            percent: x.advPercent,
            pubblicato: x.advPubblicato,
          })),
        }))}
      />
    </>
  );
}
