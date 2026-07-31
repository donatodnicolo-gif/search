import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/calc";
import { PropostaForm } from "@/components/PropostaForm";
import { caricaAnno } from "@/lib/calc";
import { caricaConsuntivo } from "@/lib/consuntivo";

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
  const cons = mesiChiusi.length > 0 ? await caricaConsuntivo(dati, mesiChiusi) : null;
  // Ricavi reali mese per mese: la stessa fonte del Consuntivo, così il numero
  // che il responsabile vede qui è quello che vede l'amministratore là.
  const consuntivoMese = Array(12).fill(null) as (number | null)[];
  for (const r of cons?.perMese ?? []) consuntivoMese[r.month - 1] = r.ricavi;

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
        consuntivoMese={consuntivoMese}
      />
    </>
  );
}
