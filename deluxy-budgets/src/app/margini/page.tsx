import { ANNO_CORRENTE, caricaAnno, totaliMaison } from "@/lib/calc";
import { misuraQuota } from "@/lib/quota";
import { MarginiEditor } from "@/components/MarginiEditor";

export const dynamic = "force-dynamic";

export default async function Margini() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  // **Venduto** a budget per tipologia: e il prezzo pieno pagato dal cliente,
  // non quello che entra nel conto economico.
  const venduto: Record<string, number> = {};
  for (const m of dati.maisons) {
    for (const [slug, v] of Object.entries(totaliMaison(m).perServizio)) {
      venduto[slug] = (venduto[slug] ?? 0) + v;
    }
  }

  // ⚠️ **Sul D2C nel bilancio entra solo la quota che resta a Deluxy.** Sul
  // resto del venduto Deluxy e un intermediario: quei soldi girano ai partner e
  // sono una partita di giro, non un ricavo. Chiamare «ricavi» il venduto lordo
  // qui dentro faceva sembrare il costo del venduto enorme rispetto a un numero
  // che nel P&L non compare — ed e la stessa confusione che teneva in piedi il
  // doppio conteggio corretto il 23/08/2026.
  const q = (await misuraQuota(dati.year, [1,2,3,4,5,6,7,8,9,10,11,12], [])).percentuale / 100;
  const ricavi: Record<string, number> = {};
  for (const [slug, v] of Object.entries(venduto)) ricavi[slug] = slug === "D2C" ? v * q : v;

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
          venduto: venduto[t.slug] ?? 0,
          vociFinance: t.vociFinance,
        }))}
      />
    </>
  );
}
