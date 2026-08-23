import {
  ANNO_CORRENTE, advPubblicatoAnno, budgetAdvAnno, caricaAnno, FONTI, INIZIALE, nomeFonte,
  rosObiettivo, venditeMese,
} from "@/lib/calc";
import { primoMeseAperto } from "@/lib/periodo";
import { fetchSpesaPerBrand } from "@/lib/marketing";
import { caricaVenduto } from "@/lib/venduto";
import { MESI } from "@/lib/format";
import Link from "next/link";
import { SpeseEditor } from "@/components/SpeseEditor";

export const dynamic = "force-dynamic";

// ---- Su quale budget vendite si stima il monte pubblicitario ----
//
// «Approvato» è il budget che vale davvero: le proposte consolidate hanno
// **sostituito** quello iniziale, ed è quello che usano il P&L e /piattaforme.
// Resta il default. Le altre voci sono una **lente**: servono a rispondere a
// «e se prendessimo l'altro budget, quanta pubblicità sarebbe?» senza cambiare
// niente — la differenza non è teorica, su Deluxy.it il budget iniziale vale
// 1.173.904 € contro i 525.500 approvati, cioè più del doppio.
const APPROVATO = "approvato";

export default async function Spese({
  searchParams,
}: {
  searchParams: Promise<{ base?: string }>;
}) {
  const sp = await searchParams;
  const dati = await caricaAnno(ANNO_CORRENTE);
  // Deciso qui e non nel componente: new Date() dentro un client component da
  // un valore sul server e uno nel browser, e a cavallo del primo del mese i
  // due render non coinciderebbero.
  const aperto = primoMeseAperto(dati.year);

  // Le basi disponibili: quella approvata più ogni fonte che nei dati esiste
  // davvero. Elencare una fonte che nessuno ha usato porterebbe a una vista
  // tutta a zero, che sembra un guasto.
  const fontiPresenti = new Set<string>();
  for (const m of dati.maisons)
    for (const x of m.mesi)
      for (const perCanale of Object.values(x.perFonte ?? {}))
        for (const [f, v] of Object.entries(perCanale ?? {})) if (v !== 0) fontiPresenti.add(f);
  const basi = [
    { key: APPROVATO, nome: "Approvato" },
    ...FONTI.filter((f) => fontiPresenti.has(f.key)).map((f) => ({ key: f.key, nome: f.nome })),
  ];
  const base = basi.some((b) => b.key === sp.base) ? (sp.base as string) : APPROVATO;

  // Le vendite di un mese secondo la base scelta. Su «approvato» vale la regola
  // di sempre (le proposte sostituiscono l'iniziale); su una fonte singola si
  // guarda solo quello che ha scritto lei.
  const venditeDelMese = (x: (typeof dati.maisons)[number]["mesi"][number]) =>
    base === APPROVATO
      ? venditeMese(x)
      : Object.values(x.perFonte ?? {}).reduce((s, perCanale) => s + (perCanale?.[base] ?? 0), 0);
  // Le vendite dell anno su cui si stima: **consuntivo dove c e, budget sul
  // resto**. La base scelta cambia solo la parte a budget — il consuntivo e
  // uno solo, e non e una opinione.
  const venditeAnno = (m: (typeof dati.maisons)[number]) =>
    m.mesi.reduce((s, x) => {
      const budget = venditeDelMese(x);
      const vero = m.vendutoMesi?.[x.month - 1] ?? 0;
      if (vero <= 0) return s + budget;
      if (x.month < aperto) return s + vero;
      if (x.month === aperto) return s + Math.max(vero, budget);
      return s + budget;
    }, 0);
  // Il monte pubblicitario con la base scelta: sulla base approvata e
  // **esattamente** budgetAdvAnno, cioe quello che usano P&L e Piattaforme.
  const monteAdv = (m: (typeof dati.maisons)[number]) =>
    base === APPROVATO ? budgetAdvAnno(m, dati.year) : venditeAnno(m) / rosObiettivo(m.slug);

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
          {base !== APPROVATO && (
            <p className="page-caption" style={{ marginTop: 6 }}>
              <strong style={{ color: "var(--orange)" }}>
                Stai guardando il monte pubblicitario calcolato su «{basi.find((b) => b.key === base)?.nome}».
              </strong>{" "}
              È una <strong>lente</strong>, non un cambio di budget: quello che vale — e che usano il P&amp;L
              e <Link href="/piattaforme" style={{ color: "var(--blue)" }}>Piattaforme</Link> — resta{" "}
              <Link href="/spese" style={{ color: "var(--blue)" }}>l&apos;approvato</Link>.
            </p>
          )}
        </div>
        <div className="page-actions">
          {/* Su quale budget vendite si stima il monte pubblicitario. Il default
              è **l'approvato** perché è quello che vale davvero; le altre voci
              rispondono a «e se prendessimo l'altro budget?». */}
          <div className="seg">
            {basi.map((b) => (
              <Link
                key={b.key}
                href={b.key === APPROVATO ? "/spese" : `/spese?base=${b.key}`}
                className={b.key === base ? "on" : ""}
                title={
                  b.key === APPROVATO
                    ? "Il budget che vale: le proposte consolidate hanno sostituito quello iniziale."
                    : `Solo quello che ha scritto «${b.nome}».`
                }
              >
                {b.nome}
              </Link>
            ))}
          </div>
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
            pubblicatoAnno: monteAdv(m),
            ros: rosObiettivo(m.slug),
            // Quello che il monitoraggio aveva pubblicato: resta come
            // riferimento, per vedere quanto la stima se ne discosta.
            pubblicatoStorico: advPubblicatoAnno(m),
            venditeAnnoBudget: venditeAnno(m),
            mesi: m.mesi.map((x) => ({
              month: x.month,
              // Quanto è stato speso davvero in pubblicità su questo brand in
              // questo mese. `null` = non misurato (mese aperto, Marketing non
              // risponde, o brand che in Marketing non esiste), che non è
              // «zero speso».
              speso: speso ? speso[x.month - 1] ?? null : null,
              // Le vendite di quel mese: a budget, e quelle vere dove ci sono.
              vendite: venditeDelMese(x),
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
