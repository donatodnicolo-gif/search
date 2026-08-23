import { ANNO_CORRENTE, advPubblicatoAnno, caricaAnno } from "@/lib/calc";
import { primoMeseAperto } from "@/lib/periodo";
import { fetchSpesaPerBrand } from "@/lib/marketing";
import { MESI } from "@/lib/format";
import { SpeseEditor } from "@/components/SpeseEditor";

export const dynamic = "force-dynamic";

export default async function Spese() {
  const dati = await caricaAnno(ANNO_CORRENTE);
  // Deciso qui e non nel componente: `new Date()` dentro un client component
  // dà un valore sul server e uno nel browser, e a cavallo del primo del mese
  // i due render non coinciderebbero.
  const aperto = primoMeseAperto(dati.year);

  // La pubblicità **davvero spesa**, brand per brand e mese per mese. Per un
  // mese chiuso la domanda non è «quanto posso spendere» ma «quanto ho speso»:
  // si chiedono solo i mesi già chiusi, perché sui mesi aperti la spesa è
  // ancora in corso e non è una misura.
  const mesiChiusi = Array.from({ length: aperto - 1 }, (_, i) => i + 1).filter((m) => m <= 12);
  const spesa = mesiChiusi.length > 0
    ? await fetchSpesaPerBrand(dati.year, mesiChiusi)
    : { ok: false, errore: "", perMaison: new Map<string, (number | null)[]>(), senzaMaison: [] };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Spese ADV</h1>
          <p className="page-caption">
            Come si distribuisce fra i mesi il <strong>budget pubblicitario dell&apos;anno</strong> di ogni
            brand. Ogni casella è una <strong>quota di quel monte</strong>, quindi le dodici percentuali di un
            brand devono fare <strong>100%</strong>: sopra il 100 si starebbe impegnando pubblicità che non
            c&apos;è.
            {aperto > 1 && aperto <= 12 && (
              <>
                {" "}
                I mesi <strong>già passati</strong> (Gen–{MESI[aperto - 2]}) sono in{" "}
                <strong>sola lettura</strong> e portano la quota <strong>davvero consumata</strong>: si decide
                quanto spendere prima del mese, e riscrivere la percentuale dopo non cambia la spesa.
              </>
            )}
          </p>
        </div>
      </div>
      <SpeseEditor
        year={dati.year}
        primoMeseAperto={aperto}
        spesaOk={spesa.ok}
        brandSenzaCasa={spesa.senzaMaison}
        maisons={dati.maisons.map((m) => {
          const speso = spesa.perMaison.get(m.slug) ?? null;
          return {
            id: m.id,
            nome: m.nome,
            // Il monte pubblicità dell'anno: è il **100%** di questo brand, e
            // tutte le sue caselle sono quote di questo numero.
            pubblicatoAnno: advPubblicatoAnno(m),
            mesi: m.mesi.map((x) => ({
              month: x.month,
              // Quanto è stato speso davvero in pubblicità su questo brand in
              // questo mese. `null` = non misurato (mese aperto, Marketing non
              // risponde, o brand che in Marketing non esiste), che non è
              // «zero speso».
              speso: speso ? speso[x.month - 1] ?? null : null,
              percent: x.advPercent,
              pubblicato: x.advPubblicato,
            })),
          };
        })}
      />
    </>
  );
}
