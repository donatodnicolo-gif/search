import { prisma } from "@/lib/db";
import { GIUDIZI_GOOGLE } from "@/lib/dominio";
import { TestiAnnuncio } from "@/components/TestiAnnuncio";

// Cosa vede davvero chi incontra l'annuncio: titoli e descrizioni con
// l'etichetta di rendimento che Google dà a ogni pezzo, e le estensioni
// (sitelink, callout, snippet, immagini) col livello a cui sono agganciate.
// Un annuncio senza estensioni occupa meno spazio nella pagina dei risultati:
// è una differenza che si vede nel CTR, non nei totali di spesa.

const ORDINE_RENDIMENTO: Record<string, number> = { BEST: 0, GOOD: 1, LEARNING: 2, PENDING: 3, LOW: 4 };

const COLORE_RENDIMENTO: Record<string, string> = {
  BEST: "var(--green)",
  GOOD: "var(--blue)",
  LOW: "var(--red)",
  LEARNING: "var(--text-tertiary)",
  PENDING: "var(--text-tertiary)",
};

const ETICHETTA_TIPO: Record<string, string> = {
  sitelink: "Sitelink",
  callout: "Callout",
  snippet: "Snippet",
  immagine: "Immagine",
};

export async function EstensioniCampagna({
  campagnaId,
  nomeCampagna,
}: {
  campagnaId: string;
  nomeCampagna: string;
}) {
  const righe = await prisma.copyAnnuncio.findMany({
    where: {
      OR: [
        { campagna: nomeCampagna },
        // Gli asset di account valgono anche per questa campagna, se il gruppo
        // o la campagna non ne hanno di propri.
        { livello: "account" },
      ],
    },
    orderBy: [{ tipo: "asc" }, { spesa: { sort: "desc", nulls: "last" } }],
  });

  const testi = righe.filter((r) => (r.tipo === "titolo" || r.tipo === "descrizione") && r.campagna === nomeCampagna);
  const estensioni = righe.filter((r) => ["sitelink", "callout", "snippet", "immagine"].includes(r.tipo));
  const titoli = testi.filter((t) => t.tipo === "titolo");
  const descrizioni = testi.filter((t) => t.tipo === "descrizione");

  const perTipo = (tipo: string) => estensioni.filter((e) => e.tipo === tipo);
  const conteggi = ["sitelink", "callout", "snippet", "immagine"].map((t) => ({ tipo: t, n: perTipo(t).length }));
  const mancanti = conteggi.filter((c) => c.n === 0).map((c) => ETICHETTA_TIPO[c.tipo]);

  const ordina = <T extends { rendimento: string | null }>(a: T, b: T) =>
    (ORDINE_RENDIMENTO[a.rendimento ?? "PENDING"] ?? 9) - (ORDINE_RENDIMENTO[b.rendimento ?? "PENDING"] ?? 9);

  // ⚠️ Google assegna un giudizio (BEST/GOOD/LOW) solo a certi asset: sulle
  // campagne search dei testi risponde **NOT_APPLICABLE** su tutto. Il titolo
  // diceva «dal migliore al peggiore secondo Google» sopra un elenco dove
  // nessuna riga era giudicata: una classifica promessa e non mantenuta, con
  // un ordinamento che non voleva dire niente.
  //
  // Quando non c'è nemmeno un giudizio vero, si dichiara che non c'è e si
  // ordina per lunghezza — che è l'unica cosa azionabile rimasta: i titoli
  // vicini al limite vengono troncati nella pagina dei risultati.
  
  const giudicati = testi.filter((t) => t.rendimento && GIUDIZI_GOOGLE.includes(t.rendimento)).length;
  const perLunghezza = <T extends { caratteri: number | null }>(a: T, b: T) =>
    (b.caratteri ?? 0) - (a.caratteri ?? 0);

  return (
    <section className="scheda">
      <div className="scheda-titolo">Cosa vede chi cerca</div>

      {righe.length === 0 ? (
        <div className="vuoto-mini">
          Nessun testo né estensione per questa campagna. Li mandano gli script con{" "}
          <b>AZIONE = &quot;copy&quot;</b> (titoli e descrizioni) e <b>AZIONE = &quot;asset&quot;</b> (sitelink,
          callout, snippet, immagini).
        </div>
      ) : (
        <>
          <div className="kpi-riga" style={{ marginBottom: 14 }}>
            {/* ⚠️ Prima qui c'era «31/15», che si legge come «31 su un massimo
                di 15», cioè un errore. Non lo è: 31 sono i titoli DIVERSI di
                tutta la campagna, 15 è quanti ne può mostrare un singolo
                annuncio — due cose che non si dividono l'una per l'altra. E
                «max 30 caratteri» parlava di una terza cosa ancora, la
                lunghezza. Tre numeri schiacciati in uno. */}
            <div className="kpi">
              <div className="kpi-valore">{titoli.length}</div>
              <div className="kpi-etichetta">
                Titoli diversi · un annuncio ne mostra fino a 15, lunghi al massimo 30 caratteri
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-valore">{descrizioni.length}</div>
              <div className="kpi-etichetta">
                Descrizioni diverse · fino a 4 per annuncio, lunghe al massimo 90 caratteri
              </div>
            </div>
            {conteggi.map((c) => (
              <div className="kpi" key={c.tipo}>
                <div className="kpi-valore" style={c.n === 0 ? { color: "var(--orange)" } : undefined}>{c.n}</div>
                <div className="kpi-etichetta">{ETICHETTA_TIPO[c.tipo]}</div>
              </div>
            ))}
          </div>

          {mancanti.length > 0 && (
            <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
              <span className="nota-icona" style={{ color: "var(--orange)" }}>◈</span>
              <span>
                <b>Manca {mancanti.join(", ").toLowerCase()}</b>: sono spazio gratuito nella pagina dei
                risultati. Un annuncio più alto viene guardato di più a parità di offerta.
              </span>
            </div>
          )}

          {(titoli.length > 0 || descrizioni.length > 0) && (
            <div style={{ marginBottom: 14 }}>
              {/* Stessa forma di Google Ads: una scheda per testo col
                  conteggio caratteri sotto. Vedi TestiAnnuncio. */}
              <TestiAnnuncio testi={testi} />
            </div>
          )}

          {estensioni.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Estensione</th>
                    <th>Tipo</th>
                    <th>Livello</th>
                    <th>Destinazione</th>
                  </tr>
                </thead>
                <tbody>
                  {estensioni.map((e) => (
                    <tr key={e.id}>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          {e.anteprima && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={e.anteprima} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, flex: "0 0 auto" }} />
                          )}
                          <span style={{ minWidth: 0 }}>
                            <div className="cella-nome">{e.testo}</div>
                            {e.note && <div className="cella-sub" style={{ whiteSpace: "normal" }}>{e.note}</div>}
                          </span>
                        </div>
                      </td>
                      <td className="cella-muta">{ETICHETTA_TIPO[e.tipo] ?? e.tipo}</td>
                      <td>
                        <span className="tag-neutro">{e.livello ?? "—"}</span>
                        {e.campagna !== nomeCampagna && <div className="cella-sub">ereditata</div>}
                      </td>
                      <td className="cella-muta" style={{ maxWidth: 220, overflowWrap: "anywhere" }}>
                        {e.finalUrl ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
