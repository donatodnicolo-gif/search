import { ANNO_CORRENTE, caricaAnno, venditeMese } from "@/lib/calc";
import { primoMeseAperto } from "@/lib/periodo";
import { caricaVenduto } from "@/lib/venduto";
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

  // Il venduto **vero** dei negozi, mese per mese e per brand. Serve ai mesi
  // già chiusi: lì il budget non è più la misura giusta — e su Deluxy.it il
  // budget D2C di gennaio–giugno è a **zero** (azzerato dal consolidamento del
  // 31/07/2026, mai ripristinato), quindi la pagina scriveva «100% = 0 €» su
  // sei mesi in cui si è venduto eccome. Stessa scelta già fatta in `/maison`:
  // i mesi passati portano il loro consuntivo.
  const vend = await caricaVenduto(dati.year, dati.maisons);

  // E la pubblicità **davvero spesa** in quei mesi, brand per brand. Per un mese
  // chiuso la domanda non è più «quanto posso spendere» ma «quanto ho speso»: la
  // percentuale a budget di gennaio è una decisione vecchia, quella vera è
  // spesa ÷ venduto. Si chiedono solo i mesi già chiusi — sui mesi aperti la
  // spesa è ancora in corso e non è una misura.
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
            Quanto si può spendere in pubblicità per brand, come % di quello che il mese vende.
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
        vendutoOk={vend.ok}
        spesaOk={spesa.ok}
        brandSenzaCasa={spesa.senzaMaison}
        maisons={dati.maisons.map((m) => {
          const reale = vend.ok ? vend.perMaison.get(m.slug) ?? null : null;
          const speso = spesa.perMaison.get(m.slug) ?? null;
          return {
            id: m.id,
            nome: m.nome,
            mesi: m.mesi.map((x) => ({
              month: x.month,
              vendite: venditeMese(x),
              // Quanto è stato speso davvero in pubblicità su questo brand in
              // questo mese. `null` = non misurato (mese aperto, oppure
              // Marketing non ha risposto), che non è «zero speso».
              speso: speso ? speso[x.month - 1] ?? null : null,
              // Il venduto vero di quel mese, `null` se Orders non risponde.
              // ⚠️ È il venduto **dei negozi**: per un brand che vende anche
              // eventi o B2B non è tutto il suo giro, ed è per questo che si usa
              // solo quando c'è (sopra lo zero) e non si sostituisce mai a un
              // budget con un dato assente.
              reale: reale ? reale[x.month - 1] ?? 0 : null,
              percent: x.advPercent,
              pubblicato: x.advPubblicato,
            })),
          };
        })}
      />
    </>
  );
}
