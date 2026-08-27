import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/calc";
import { PropostaForm } from "@/components/PropostaForm";
import { caricaAnno } from "@/lib/calc";
import { consuntivoPerAmbito } from "@/lib/proposta-consuntivo";
import { chiGuarda } from "@/lib/chi-guarda";

export const dynamic = "force-dynamic";

export default async function NuovaProposta() {
  // I mesi già passati non si propongono: sono successi. Si mostrano con il
  // **consuntivo vero** e la casella bloccata — chiedere a un responsabile di
  // "proporre" gennaio a luglio inoltrato non è una svista di interfaccia, è
  // un invito a scrivere un numero che non conta niente, e che poi finisce nel
  // budget consolidato accanto a quelli veri.
  const oggi = new Date();
  const meseInCorso = oggi.getUTCFullYear() === ANNO_CORRENTE ? oggi.getUTCMonth() + 1 : 13;
  const mesiChiusi = Array.from({ length: Math.max(0, meseInCorso - 1) }, (_, i) => i + 1);
  const [maisons, linee, dati] = await Promise.all([
    prisma.maison.findMany({ orderBy: { ordine: "asc" } }),
    prisma.lineaCommerciale.findMany({ orderBy: { ordine: "asc" } }),
    caricaAnno(ANNO_CORRENTE),
  ]);
  // **Il consuntivo dipende dall'ambito**: quello aziendale su una proposta di
  // maison non è «un'approssimazione», è il numero di qualcun altro. Il calcolo
  // è qui sul server, una mappa ambito → dodici mesi, e il pannello si limita a
  // leggere la casella dell'ambito scelto.
  const ambiti = await consuntivoPerAmbito(
    dati,
    mesiChiusi,
    linee.map((l) => ({ slug: l.slug, nome: l.nome }))
  );

  // ⚠️⚠️ **IL CONSUNTIVO AZIENDALE NON ESCE DA QUESTA PAGINA PER UN NON-ADMIN**
  // (buco chiuso il 27/08/2026).
  //
  // `consuntivoPerAmbito` calcola anche l'ambito **GLOBALE**: i ricavi reali di
  // tutta l'azienda, mese per mese — fatturato di Finance più il ricavo
  // dell'ecommerce. Quella mappa veniva passata **intera** al componente client,
  // quindi finiva nel payload della pagina: per leggerla non serviva nemmeno
  // selezionare l'ambito, bastavano gli strumenti di sviluppo del browser. E la
  // pagina è aperta a chiunque abbia il profilo `proposte`, cioè a qualsiasi
  // utente del Hub che non sia admin.
  //
  // ⭐ **Quello che non deve arrivare al browser non si nasconde: non si manda.**
  // Un dato passato come prop a un componente client è pubblico per chi ha
  // quella pagina, comunque lo si disegni.
  const chi = await chiGuarda();
  const ambitiVisibili = chi.admin
    ? ambiti
    : Object.fromEntries(Object.entries(ambiti).filter(([k]) => k !== "GLOBALE"));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nuova proposta budget</h1>
          <p className="page-caption">
            Proposta di budget {ANNO_CORRENTE} da parte di un Responsabile: vendite mensili per l&apos;ambito scelto.
          </p>
        </div>
      </div>
      <PropostaForm
        year={ANNO_CORRENTE}
        maisons={maisons.map((m) => ({ slug: m.slug, nome: m.nome }))}
        linee={linee.map((l) => ({ slug: l.slug, nome: l.nome }))}
        tipologie={dati.tipologie.map((t) => ({ slug: t.slug, nome: t.nome }))}
        ambiti={ambitiVisibili}
        mesiChiusi={mesiChiusi}
      />
    </>
  );
}
