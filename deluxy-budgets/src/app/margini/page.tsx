import { ANNO_CORRENTE, caricaAnno, totaliMaison } from "@/lib/calc";
import { quotaDeluxyAnno } from "@/lib/quota";
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
  // ⚠️ **La stessa funzione delle altre pagine.** Qui c'era ancora
  // `misuraQuota(anno, tuttiIMesi, [])`, che con il venduto vuoto restituisce la
  // **stima** del 40% invece della misura: questa pagina diceva 1.196.953 € di
  // ricavi contro i 1.101.929 del P&L, cioè 95.000 € di differenza sulla stessa
  // parola. È lo stesso guasto già trovato su `/dashboard` il 23/08/2026 — e si
  // ripresenta ogni volta che una pagina si calcola la quota per conto suo.
  const q = (await quotaDeluxyAnno(dati.year, dati.maisons)).percentuale / 100;
  const ricavi: Record<string, number> = {};
  for (const [slug, v] of Object.entries(venduto)) ricavi[slug] = slug === "D2C" ? v * q : v;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Margini</h1>
          <p className="page-caption">
            <strong>Tutti i margini dell&apos;azienda, in un posto solo.</strong> Sopra quelli per{" "}
            <strong>tipologia di servizio</strong>, che valgono sul budget delle maison; sotto quelli
            delle <strong>linee commerciali</strong>, che hanno il loro. Il costo del venduto del
            P&amp;L {dati.year} è la somma dei ricavi al netto del margine di ognuno: cambiando il mix
            di vendita cambia il margine complessivo.
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
        linee={dati.linee.map((l) => ({
          id: l.id,
          nome: l.nome,
          marginePct: l.marginePct,
          budget: l.mesi.reduce((s, v) => s + v, 0),
        }))}
      />
    </>
  );
}
