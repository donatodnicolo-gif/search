import { ANNO_CORRENTE, caricaAnno, totaliMaison } from "@/lib/calc";
import { MarginiEditor } from "@/components/MarginiEditor";

export const dynamic = "force-dynamic";

export default async function Margini() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  // Ricavi a budget per tipologia: servono a mostrare quanto pesa ogni
  // percentuale sul margine complessivo.
  const ricavi: Record<string, number> = {};
  for (const m of dati.maisons) {
    for (const [slug, v] of Object.entries(totaliMaison(m).perServizio)) {
      ricavi[slug] = (ricavi[slug] ?? 0) + v;
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Margini</h1>
          <p className="page-caption">
            Il margine lordo per tipologia di servizio. Il costo del venduto del P&amp;L {dati.year} è la
            somma dei ricavi di ogni tipologia al netto del suo margine: cambiando il mix di vendita
            cambia il margine complessivo.
          </p>
        </div>
      </div>
      <MarginiEditor
        tipologie={dati.tipologie.map((t) => ({
          id: t.id,
          slug: t.slug,
          nome: t.nome,
          marginePct: t.marginePct,
          note: t.note,
          ricavi: ricavi[t.slug] ?? 0,
          vociFinance: t.vociFinance,
        }))}
      />
    </>
  );
}
