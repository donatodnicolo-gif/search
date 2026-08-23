import {
  ANNO_CORRENTE, advPubblicatoAnno, budgetAdvAnno, caricaAnno, INIZIALE, nomeFonte,
  rosObiettivo, venditeMese,
} from "@/lib/calc";
import { primoMeseAperto } from "@/lib/periodo";
import { fetchSpesaPerBrand } from "@/lib/marketing";
import { caricaVenduto } from "@/lib/venduto";
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

  // Le **vendite attese** del mese, che qui non sono la base del calcolo ma
  // servono a leggere il risultato: un budget pubblicitario si giudica anche da
  // quanto pesa sul venduto. Sui mesi chiusi vale il venduto vero.
  const vend = await caricaVenduto(dati.year, dati.maisons);

  // **Da quale budget arrivano le vendite attese di quel mese.** Una casella di
  // budget non nasce dal nulla: o viene dal file di monitoraggio caricato a
  // inizio anno, o da una proposta (pubblicita web, team commerciale) che lo ha
  // **sostituito**. Si applica la stessa regola del calcolo — se una proposta ha
  // parlato, l iniziale non conta piu — altrimenti la provenienza scritta qui
  // direbbe una cosa e il numero ne direbbe un altra.
  const fontiDelMese = (perFonte: Record<string, Record<string, number>>) => {
    const usate = new Set<string>();
    for (const perCanale of Object.values(perFonte ?? {})) {
      const daProposte = Object.keys(perCanale ?? {}).filter((k) => k !== INIZIALE);
      if (daProposte.length > 0) daProposte.forEach((k) => usate.add(k));
      else if ((perCanale?.[INIZIALE] ?? 0) !== 0) usate.add(INIZIALE);
    }
    return [...usate].map(nomeFonte);
  };

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
          const reale = vend.ok ? vend.perMaison.get(m.slug) ?? null : null;
          return {
            id: m.id,
            nome: m.nome,
            // Il monte pubblicità dell'anno: è il **100%** di questo brand, e
            // tutte le sue caselle sono quote di questo numero.
            // Stimato dal ROS obiettivo, non ereditato: vendite a budget
            // dell anno diviso il ROS del brand.
            pubblicatoAnno: budgetAdvAnno(m),
            ros: rosObiettivo(m.slug),
            // Quello che il monitoraggio aveva pubblicato: resta come
            // riferimento, per vedere quanto la stima se ne discosta.
            pubblicatoStorico: advPubblicatoAnno(m),
            venditeAnnoBudget: m.mesi.reduce((s, x) => s + venditeMese(x), 0),
            mesi: m.mesi.map((x) => ({
              month: x.month,
              // Quanto è stato speso davvero in pubblicità su questo brand in
              // questo mese. `null` = non misurato (mese aperto, Marketing non
              // risponde, o brand che in Marketing non esiste), che non è
              // «zero speso».
              speso: speso ? speso[x.month - 1] ?? null : null,
              // Le vendite di quel mese: a budget, e quelle vere dove ci sono.
              vendite: venditeMese(x),
              venduto: reale ? reale[x.month - 1] ?? null : null,
              fonti: fontiDelMese(x.perFonte),
              percent: x.advPercent,
              pubblicato: x.advPubblicato,
            })),
          };
        })}
      />
    </>
  );
}
