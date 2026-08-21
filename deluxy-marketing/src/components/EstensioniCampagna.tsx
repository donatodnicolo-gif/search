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

// L ordine in cui si guardano: prima quelle che portano da qualche parte.
const ESTENSIONI_ORDINE = ["sitelink", "callout", "snippet", "immagine"] as const;

// Cosa fa ognuna, in una riga. Sono quattro cose diverse messe sotto la
// stessa parola «estensione», e senza dirlo la tabella si legge come un
// elenco di nomi a caso.
const SPIEGA_TIPO: Record<string, string> = {
  sitelink: "link in più sotto l'annuncio, ognuno con la sua pagina",
  callout: "frasi brevi che NON si cliccano: servono a occupare spazio e a rassicurare",
  snippet: "elenchi per categoria (es. «Servizi: consegna, biglietto, vaso»)",
  immagine: "la foto che Google può affiancare all'annuncio",
};

// ⚠️ UN ELENCO SENZA STATO SI LEGGE COME «TUTTE ATTIVE».
//
// Lo script legge `campaign_asset.status` e lo salva da sempre, ma questa
// scheda non lo guardava nemmeno una volta: elencava insieme quelle che
// escono e quelle ferme. Misurato il 21/08/2026 su «[Deluxyflowers] -
// ITALIAN - ENG»: **17 sitelink su 30 erano in pausa**, e 4 callout su 5.
// Chi leggeva la scheda credeva di avere trenta link sotto l'annuncio e ne
// aveva tredici. È la stessa famiglia dello «stato dedotto invece che
// misurato»: il dato c'era, mancava solo la voglia di mostrarlo.
//
// Null = attiva: le righe vecchie, arrivate prima che lo script mandasse lo
// stato, sono quasi tutte attive e marcarle «in pausa» sarebbe un allarme
// falso. Tutto ciò che non è ENABLED (né vuoto) invece si dichiara.
function inPausa(e: { statoPiattaforma: string | null }): boolean {
  const s = (e.statoPiattaforma ?? "").toUpperCase();
  return s !== "" && s !== "ENABLED";
}

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
  // ⚠️ GLI ASSET DI ACCOUNT VANNO RISTRETTI AL *NOSTRO* ACCOUNT.
  //
  // `livello: "account"` da solo pesca gli asset di account di TUTTI e tre i
  // conti: su una campagna Flowers comparivano il logo di CakeDesign e i
  // callout di Gifts. Misurato il 21/08/2026 su «[Deluxyflowers] - ITALIAN -
  // ENG»: 15 estensioni su 76 erano di un altro brand. Non è un fastidio
  // estetico — un asset di account vale per tutte le campagne di QUEL conto, e
  // mostrarne uno di un altro racconta che l'annuncio potrebbe uscire col logo
  // sbagliato, che è falso.
  //
  // La chiave precisa c'è già: lo script mette agli asset di account il
  // segnaposto `(account NNN-NNN-NNNN)` nel campo campagna (vedi `leggiAsset`).
  // Si filtra su quello; se l'account della campagna non è ancora noto si
  // ripiega sul brand, che è meno preciso ma non mescola i marchi.
  const campagna = await prisma.campagna.findUnique({
    where: { id: campagnaId },
    select: { account: true, brand: true },
  });
  const contenitoreAccount = campagna?.account ? `(account ${campagna.account})` : null;

  const righe = await prisma.copyAnnuncio.findMany({
    where: {
      OR: [
        { campagna: nomeCampagna },
        // Gli asset di account valgono anche per questa campagna, se il gruppo
        // o la campagna non ne hanno di propri — ma solo quelli del suo conto.
        contenitoreAccount
          ? { livello: "account", campagna: contenitoreAccount }
          : { livello: "account", brand: campagna?.brand ?? "" },
      ],
    },
    orderBy: [{ tipo: "asc" }, { spesa: { sort: "desc", nulls: "last" } }],
  });

  const testi = righe.filter((r) => (r.tipo === "titolo" || r.tipo === "descrizione") && r.campagna === nomeCampagna);
  const estensioni = righe.filter((r) => ["sitelink", "callout", "snippet", "immagine"].includes(r.tipo));
  const titoli = testi.filter((t) => t.tipo === "titolo");
  const descrizioni = testi.filter((t) => t.tipo === "descrizione");

  const perTipo = (tipo: string) => estensioni.filter((e) => e.tipo === tipo);
  const conteggi = ["sitelink", "callout", "snippet", "immagine"].map((t) => ({
    tipo: t,
    n: perTipo(t).length,
    attive: perTipo(t).filter((e) => !inPausa(e)).length,
  }));
  // ⚠️ «Manca» si decide sulle ATTIVE: un tipo che ha solo estensioni in
  // pausa è mancante a tutti gli effetti — nella pagina dei risultati non
  // compare niente, esattamente come se non ne avessimo mai fatte.
  const mancanti = conteggi.filter((c) => c.attive === 0).map((c) => ETICHETTA_TIPO[c.tipo]);

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
                {/* Il numero grande è quello che ESCE: è la risposta alla
                    domanda che uno si fa guardando la scheda. Le ferme
                    stanno sotto, dette per nome. */}
                <div className="kpi-valore" style={c.attive === 0 ? { color: "var(--orange)" } : undefined}>
                  {c.attive}
                </div>
                <div className="kpi-etichetta">
                  {ETICHETTA_TIPO[c.tipo]}
                  {c.n > c.attive && (
                    <span style={{ color: "var(--orange)" }}> · {c.n - c.attive} in pausa</span>
                  )}
                </div>
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

          {/* ⚠️ UNA TABELLA SOLA PER QUATTRO COSE DIVERSE NON SI LEGGE.
              Prima erano tutte insieme, con le colonne del tipo più ricco:
              «Destinazione» era un trattino su callout, snippet e immagini —
              che una destinazione non ce l'hanno per definizione — e la colonna
              «Tipo» ripeteva a ogni riga quello che l'ordinamento già
              raggruppava. Il risultato era una griglia dove l'unica colonna
              piena era il nome, e per le immagini il nome è il file esportato
              da Shopify: «Immagine sito web - 2026-05-14 12:19:10.705 (4)_1.jpg».
              Ora: un blocco per tipo, e ogni blocco mostra solo quello che quel
              tipo ha davvero. */}
          {ESTENSIONI_ORDINE.filter((t) => perTipo(t).length > 0).map((tipo) => {
            // Prima le attive: sono quelle su cui si può ragionare. Le ferme
            // restano in fondo, visibili — toglierle nasconderebbe il lavoro
            // già fatto che basterebbe riaccendere.
            const lista = perTipo(tipo)
              .slice()
              .sort((a, b) => Number(inPausa(a)) - Number(inPausa(b)));
            const ereditate = lista.filter((e) => e.campagna !== nomeCampagna).length;
            const ferme = lista.filter((e) => inPausa(e)).length;
            return (
              <div className="brief-blocco" key={tipo} style={{ marginTop: 14 }}>
                <div className="brief-sotto">
                  {ETICHETTA_TIPO[tipo]} ({lista.length - ferme}
                  {ferme > 0 ? ` attive · ${ferme} in pausa` : ""})
                  <span className="cella-sub" style={{ fontWeight: 400 }}>
                    {" — "}
                    {SPIEGA_TIPO[tipo]}
                    {ereditate > 0 &&
                      ` · ${ereditate} ereditat${ereditate === 1 ? "a" : "e"} dall'account: valgono per tutte le campagne di questo conto, non solo per questa`}
                  </span>
                </div>

                {tipo === "immagine" ? (
                  // Le immagini si GUARDANO. Il nome del file non dice niente
                  // (è l'esportazione di Shopify), quindi l'anteprima è grande
                  // e il nome scende a didascalia.
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {lista.map((e) => (
                      <div key={e.id} style={{ width: 104, opacity: inPausa(e) ? 0.55 : 1 }}>
                        {e.anteprima ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={e.anteprima}
                            alt={e.testo}
                            title={e.testo}
                            style={{ width: 104, height: 104, objectFit: "cover", borderRadius: 10, border: "1px solid var(--hairline)" }}
                          />
                        ) : (
                          <div style={{ width: 104, height: 104, borderRadius: 10, background: "var(--fill)" }} />
                        )}
                        <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 4 }}>
                          {e.note ?? ""}
                          {inPausa(e) && <div style={{ color: "var(--orange)" }}>in pausa</div>}
                          {e.campagna !== nomeCampagna && <div>ereditata</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="brief-elenco">
                    {lista.map((e) => (
                      <li key={e.id} style={inPausa(e) ? { opacity: 0.55 } : undefined}>
                        {e.testo}
                        {inPausa(e) && (
                          <span className="cella-sub" style={{ color: "var(--orange)" }}> · in pausa: non esce</span>
                        )}
                        {/* La destinazione solo dove esiste: i sitelink ce
                            l'hanno, callout e snippet no. */}
                        {e.finalUrl && (
                          <span className="cella-sub" style={{ overflowWrap: "anywhere" }}> → {e.finalUrl}</span>
                        )}
                        {e.campagna !== nomeCampagna && <span className="cella-sub"> · ereditata</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
