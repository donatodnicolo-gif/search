import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/calc";
import { PropostaForm } from "@/components/PropostaForm";

export const dynamic = "force-dynamic";

export default async function NuovaProposta() {
  const [maisons, linee] = await Promise.all([
    prisma.maison.findMany({ orderBy: { ordine: "asc" } }),
    prisma.lineaCommerciale.findMany({ orderBy: { ordine: "asc" } }),
  ]);

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
      />
    </>
  );
}
