import { ANNO_CORRENTE, caricaAnno, frazioneQuotaD2C, totaliMaison } from "@/lib/calc";
import { fetchMarginiBrand } from "@/lib/orders";
import { eur, pct } from "@/lib/format";
import { quotaDeluxyAnno } from "@/lib/quota";
import { MarginiEditor } from "@/components/MarginiEditor";

export const dynamic = "force-dynamic";

export default async function Margini() {
  const dati = await caricaAnno(ANNO_CORRENTE);
  // Il margine D2C per brand, misurato da Orders sugli ordini riconciliati.
  const margini = await fetchMarginiBrand(ANNO_CORRENTE);

  // **Venduto** a budget per tipologia: e il prezzo pieno pagato dal cliente,
  // non quello che entra nel conto economico. La quota si applica maison per
  // maison (26/08: i brand non marginano uguale), qui come nel P&L.
  const quotaAnno = await quotaDeluxyAnno(dati.year, dati.maisons);
  const venduto: Record<string, number> = {};
  const ricaviPerMaison: Record<string, number> = {};
  for (const m of dati.maisons) {
    for (const [slug, v] of Object.entries(totaliMaison(m).perServizio)) {
      venduto[slug] = (venduto[slug] ?? 0) + v;
      ricaviPerMaison[slug] =
        (ricaviPerMaison[slug] ?? 0) + (slug === "D2C" ? v * frazioneQuotaD2C(quotaAnno, m.slug) : v);
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
  const ricavi = ricaviPerMaison;

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
      {/* ---- Il margine D2C, brand per brand, da Orders ----
          Sola lettura: la misura vive negli ordini riconciliati e la regola in
          Orders → Impostazioni. Qui si LEGGE, perché è qui che si ragiona di
          margini — ma scriverla qui sarebbe la copia che il contratto dati
          vieta. */}
      <h2 className="section-title">Margine D2C per brand — misurato da Orders</h2>
      {margini.ok ? (
        <div className="card tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Negozio</th>
                  <th className="num">Margine</th>
                  <th className="num">Su quanti ordini</th>
                  <th className="num">Copertura del lordo</th>
                  <th>Come</th>
                </tr>
              </thead>
              <tbody>
                {margini.brand.filter((b) => b.lordo > 0).map((b) => (
                  <tr key={b.brand}>
                    <td style={{ fontWeight: 500 }}>{b.brand}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {b.margineMisurato !== null ? pct(b.margineMisurato) : pct(margini.regola.margine)}
                    </td>
                    <td className="num muted">
                      {b.margineMisurato !== null ? `${b.ordiniMisurati} su ${b.ordini}` : "—"}
                    </td>
                    <td className="num muted">
                      {b.margineMisurato !== null ? pct(b.coperturaPct) : "—"}
                    </td>
                    <td>
                      {b.margineMisurato !== null ? (
                        <span className="badge green"><span className="dot" />misurato (riconciliazioni)</span>
                      ) : (
                        <span className="badge neutral"><span className="dot" />regola: nessun ordine riconciliato</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="page-caption" style={{ margin: "10px 14px 4px" }}>
            La <strong>media pesata sul venduto</strong> di questi margini è la quota D2C che il conto
            economico usa per convertire il budget. La misura arriva dagli ordini con il{" "}
            <strong>costo del fornitore scritto</strong> (riconciliazione banca o Customer Service): dove la
            copertura è bassa il numero è un&apos;<strong>indicazione</strong>, e si affina da solo man mano
            che le riconciliazioni crescono. La regola di ripiego ({pct(margini.regola.margine)}) si cambia
            in <strong>Orders → Impostazioni</strong>, non qui.
          </p>
        </div>
      ) : (
        <div className="card">
          <p className="page-caption" style={{ margin: 0 }}>
            <strong>Orders non risponde</strong> ({margini.errore}): senza i margini per brand la quota D2C
            usa la regola unica o i ripieghi, e la pagina del conto economico dice quale.
          </p>
        </div>
      )}

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
