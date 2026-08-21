import { ANNO_CORRENTE, caricaAnno, venditeMese } from "@/lib/calc";
import { primoMeseAperto } from "@/lib/periodo";
import { MESI } from "@/lib/format";
import { SpeseEditor } from "@/components/SpeseEditor";

export const dynamic = "force-dynamic";

export default async function Spese() {
  const dati = await caricaAnno(ANNO_CORRENTE);
  // Deciso qui e non nel componente: `new Date()` dentro un client component
  // dà un valore sul server e uno nel browser, e a cavallo del primo del mese
  // i due render non coinciderebbero.
  const aperto = primoMeseAperto(dati.year);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Spese ADV</h1>
          <p className="page-caption">
            Quanto si può spendere in pubblicità per brand, come % delle vendite budget del mese.
            Le percentuali sono personalizzabili mese per mese; l&apos;importo consentito si aggiorna di conseguenza.
            {aperto > 1 && aperto <= 12 && (
              <>
                {" "}
                I mesi <strong>già passati</strong> (Gen–{MESI[aperto - 2]}) sono in{" "}
                <strong>sola lettura</strong>: si decide quanto spendere prima del mese, e riscrivere la
                percentuale dopo non cambia la spesa — cancella solo lo scostamento.
              </>
            )}
          </p>
        </div>
      </div>
      <SpeseEditor
        year={dati.year}
        primoMeseAperto={aperto}
        maisons={dati.maisons.map((m) => ({
          id: m.id,
          nome: m.nome,
          mesi: m.mesi.map((x) => ({
            month: x.month,
            vendite: venditeMese(x),
            percent: x.advPercent,
            pubblicato: x.advPubblicato,
          })),
        }))}
      />
    </>
  );
}
