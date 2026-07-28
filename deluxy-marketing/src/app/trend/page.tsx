import { GraficoTrend } from "@/components/GraficoTrend";
import { Sidebar } from "@/components/Sidebar";
import { VisteSalvate } from "@/components/VisteSalvate";
import {
  BRANDS,
  COLORE_BRAND,
  ETICHETTA_BRAND,
  formattaEuro,
  formattaNumero,
  MESI_IT,
} from "@/lib/dominio";
import { trendVendite } from "@/lib/trend-vendite";
import { destinazionePredefinita } from "@/lib/viste";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Trend vendite: dove sta andando il venduto Shopify.
//
// La domanda a cui risponde non è "quanto abbiamo venduto" (quella è la pagina
// Ordini) ma "quanto venderemo, se le cose continuano così" — che è la domanda
// che serve per decidere quanto spendere il mese prossimo.
export default async function PaginaTrend({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; avanti?: string; vista?: string }>;
}) {
  const p = await searchParams;
  const destinazione = await destinazionePredefinita("trend", "/trend", p);
  if (destinazione) redirect(destinazione);

  const brand = p.brand && (BRANDS as readonly string[]).includes(p.brand) ? p.brand : undefined;
  const avanti = Math.min(Math.max(Number(p.avanti) || 6, 1), 12);
  const t = await trendVendite({ brand, mesiAvanti: avanti });

  const proiezioni = t.mesi.filter((m) => m.tipo === "proiezione");
  const crescita = t.fattore != null ? (t.fattore - 1) * 100 : null;
  const link = (cambi: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | undefined> = { brand: p.brand, avanti: p.avanti, ...cambi };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/trend?${s}` : "/trend";
  };

  return (
    <div className="layout">
      <Sidebar attiva="trend" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Trend vendite</h1>
            <p className="page-sub">
              Il venduto Shopify mese per mese e dove sta andando. Serve a una domanda sola: quanto
              venderemo il mese prossimo, se le cose continuano così — che è quella da cui dipende
              quanto ha senso spendere.
            </p>
          </div>
        </div>

        <VisteSalvate pagina="trend" base="/trend" parametri={p} />

        <section className="scheda" style={{ paddingBottom: 14 }}>
          <div className="pill-scelta" style={{ marginBottom: 10 }}>
            <a className={`pill-opt${!brand ? " attuale" : ""}`} href={link({ brand: undefined })}>
              Tutti i brand
            </a>
            {BRANDS.filter((b) => b !== "cross").map((b) => (
              <a
                key={b}
                className={`pill-opt${brand === b ? " attuale" : ""}`}
                href={link({ brand: b })}
                style={{ color: brand === b ? undefined : COLORE_BRAND[b] }}
              >
                {ETICHETTA_BRAND[b]}
              </a>
            ))}
          </div>
          <div className="pill-scelta">
            {[3, 6, 12].map((n) => (
              <a
                key={n}
                className={`pill-opt${avanti === n ? " attuale" : ""}`}
                href={link({ avanti: String(n) })}
              >
                {n} mesi avanti
              </a>
            ))}
          </div>
        </section>

        <section className="scheda">
          <div className="scheda-titolo">
            Venduto mese per mese
            {brand ? ` · ${ETICHETTA_BRAND[brand]}` : " · tutti i brand"}
          </div>
          <GraficoTrend mesi={t.mesi} />
        </section>

        <div className="kpi-riga">
          <div className="kpi">
            <div
              className="kpi-valore"
              style={crescita != null ? { color: crescita >= 0 ? "var(--green)" : "var(--red)" } : undefined}
            >
              {crescita != null ? `${crescita >= 0 ? "+" : ""}${crescita.toFixed(0)}%` : "—"}
            </div>
            <div className="kpi-etichetta">
              {t.fattore != null
                ? `Come sta andando il ${t.annoCorrente} sul ${t.annoCorrente - 1}, sui ${t.mesiConfronto} mesi già chiusi (${formattaEuro(t.quest_anno)} contro ${formattaEuro(t.anno_prima)})`
                : "Crescita non misurabile: servono almeno 2 mesi chiusi confrontabili con l'anno prima"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">
              {t.stimaMeseCorrente != null ? formattaEuro(t.stimaMeseCorrente) : "—"}
            </div>
            <div className="kpi-etichetta">
              {MESI_IT[t.meseCorrente - 1]} come dovrebbe chiudersi (mese intero, non i giorni finora)
              {t.metodo === "livello_recente" && " · al livello dei mesi recenti, senza stagione"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">
              {t.totaleAnnoStimato != null ? formattaEuro(t.totaleAnnoStimato) : "—"}
            </div>
            <div className="kpi-etichetta">
              Come si chiude il {t.annoCorrente}, se il ritmo tiene
              {t.totaleAnnoScorso != null && ` · ${t.annoCorrente - 1}: ${formattaEuro(t.totaleAnnoScorso)}`}
            </div>
          </div>
        </div>

        <section className="scheda">
          <div className="scheda-titolo">Come si legge questa previsione</div>
          <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
            Non è una riga tirata sugli ultimi mesi. Deluxy vende fiori, torte e regali: San
            Valentino, la Festa della mamma e Natale <b>sono</b> l&apos;andamento, non rumore intorno a
            una tendenza — spianarli produrrebbe un dicembre da metà del vero. Quindi la stagione la
            porta l&apos;anno scorso e la crescita la portano i mesi già chiusi:
          </p>
          {t.metodo === "anno_su_anno" && (
            <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12, fontVariantNumeric: "tabular-nums" }}>
              <b>mese previsto = stesso mese del {t.annoCorrente - 1} × {t.fattore!.toFixed(2)}</b> — dove{" "}
              {t.fattore!.toFixed(2)} è {formattaEuro(t.quest_anno)} di quest&apos;anno diviso{" "}
              {formattaEuro(t.anno_prima)} degli stessi {t.mesiConfronto} mesi del {t.annoCorrente - 1}.
            </p>
          )}
          {t.metodo === "livello_recente" && (
            <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12, fontVariantNumeric: "tabular-nums" }}>
              Qui il metodo di sopra <b>non si può usare</b>: l&apos;anno prima non c&apos;è abbastanza
              storico da cui misurare una crescita. Si ripiega sul <b>livello dei mesi chiusi
              recenti</b>, tenuto piatto: <b>{formattaEuro(t.livelloRecente!)} al mese</b>. ⚠️ È una
              previsione <b>senza stagione</b>: dicembre e febbraio saranno più alti, agosto più
              basso. Vale per capire l&apos;ordine di grandezza, non per fare un piano mese per mese.
            </p>
          )}
          {t.metodo === "nessuno" && (
            <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
              Qui non si proietta niente, e non è una svista: non c&apos;è abbastanza storico né per
              misurare una crescita né per riusare una stagione. Un numero, in questa casella,
              sarebbe inventato.
            </p>
          )}
          {t.avvertenze.length > 0 && (
            <ul className="storia" style={{ marginBottom: 0 }}>
              {t.avvertenze.map((a, i) => (
                <li key={i}>
                  <span className="storia-testo" style={{ whiteSpace: "normal" }}>⚠︎ {a}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {proiezioni.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">I prossimi {proiezioni.length} mesi, uno per uno</div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Mese</th>
                    <th className="num">Previsto</th>
                    <th className="num">Ordini previsti</th>
                    <th>Da dove nasce</th>
                  </tr>
                </thead>
                <tbody>
                  {proiezioni.map((m) => (
                    <tr key={`${m.anno}-${m.mese}`}>
                      <td className="cella-nome">
                        {MESI_IT[m.mese - 1]} {m.anno}
                      </td>
                      <td className="num">{formattaEuro(m.vendite)}</td>
                      <td className="num">{m.ordini > 0 ? formattaNumero(m.ordini) : "—"}</td>
                      <td className="cella-muta">
                        {m.base
                          ? `${MESI_IT[m.mese - 1]} ${m.base.anno}: ${formattaEuro(m.base.vendite)} su ${formattaNumero(m.base.ordini)} ordini`
                          : "media dei mesi recenti, senza stagione"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
              Gli ordini previsti sono il conto dell&apos;anno prima moltiplicato per lo stesso fattore:
              vale se lo scontrino medio non cambia. Se state alzando i prezzi, il venduto tiene e il
              numero di ordini no.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
