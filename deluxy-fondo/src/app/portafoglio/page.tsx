/**
 * Portafoglio — cosa è stato deciso davvero, e cosa costerebbe decidere altro.
 *
 * Tre blocchi, tenuti separati di proposito:
 *  1. le posizioni reali, con quantità e prezzo pagati, rivalutate ogni giorno;
 *  2. il simulatore: «quanto mi costerebbe comprare N azioni di X»;
 *  3. le ipotesi salvate.
 *
 * Le simulazioni non entrano in nessun totale reale. È la distinzione che un foglio di
 * calcolo perde per prima, e da lì in poi non si sa più cosa si possiede.
 */

import { costruisciPortafoglio } from "@/lib/portafoglio";
import { leggiSerie } from "@/lib/archivio";
import { TITOLI_TUTTI } from "@/lib/universo";
import { Avviso, Metrica } from "@/componenti/pezzi";
import { dataBreve, numero, percentuale, prezzo, punti, verso } from "@/lib/formato";

export const dynamic = "force-dynamic";

/** Il simulatore riceve simbolo e quantità dalla query: nessun JavaScript nel browser. */
type Ricerca = { titolo?: string; quantita?: string; prezzo?: string };

export default async function Portafoglio({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const q = await searchParams;
  const v = await costruisciPortafoglio();

  // --- Simulazione richiesta dal modulo ------------------------------------
  const simSimbolo = q.titolo && q.titolo !== "" ? q.titolo : null;
  const simQuantita = q.quantita ? Number(q.quantita.replace(",", ".")) : null;
  const simPrezzoIndicato = q.prezzo ? Number(q.prezzo.replace(",", ".")) : null;

  let sim: {
    nome: string;
    simbolo: string;
    quantita: number;
    prezzo: number | null;
    dalMercato: boolean;
    data: string | null;
    valuta: string;
    esborso: number | null;
    problema: string | null;
  } | null = null;

  if (simSimbolo && simQuantita !== null && Number.isFinite(simQuantita) && simQuantita > 0) {
    const serie = await leggiSerie(simSimbolo);
    const ultimo = serie?.barre.at(-1) ?? null;
    const titolo = TITOLI_TUTTI.find((t) => t.simbolo === simSimbolo);
    const usato =
      simPrezzoIndicato !== null && Number.isFinite(simPrezzoIndicato) && simPrezzoIndicato > 0
        ? simPrezzoIndicato
        : (ultimo?.chiusura ?? null);
    sim = {
      nome: titolo?.nome ?? serie?.nome ?? simSimbolo,
      simbolo: simSimbolo,
      quantita: simQuantita,
      prezzo: usato,
      dalMercato: simPrezzoIndicato === null || !Number.isFinite(simPrezzoIndicato),
      data: ultimo?.data ?? null,
      valuta: serie?.valuta ?? "EUR",
      esborso: usato !== null ? usato * simQuantita : null,
      problema: usato === null ? "Prezzi non disponibili per questo titolo." : null,
    };
  }

  const t = v.totali;

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">Portafoglio</h1>
        <p className="page-sub">
          Le posizioni decise davvero, rivalutate a ogni aggiornamento, e le ipotesi su quanto
          costerebbe comprare una certa quantità di azioni. Le due cose restano separate: le
          simulazioni non entrano in nessun totale reale.
        </p>
      </div>

      {/* ---------------- Riepilogo ---------------- */}
      <div className="sezione">
        <div className="metriche">
          <Metrica
            nome="Posizioni valutate"
            valore={String(t.valutate)}
            nota={t.daCompletare > 0 ? `${t.daCompletare} da completare` : "tutte complete"}
          />
          <Metrica
            nome="Capitale investito"
            valore={t.costo !== null ? prezzo(t.costo, t.valutaComune ?? "EUR") : "non disponibile"}
            nota="prezzo pagato, commissioni incluse"
          />
          <Metrica
            nome="Valore attuale"
            valore={t.valore !== null ? prezzo(t.valore, t.valutaComune ?? "EUR") : "non disponibile"}
            nota="alle ultime chiusure disponibili"
          />
          <Metrica
            nome="Utile o perdita"
            valore={
              t.utilePerdita !== null
                ? `${prezzo(t.utilePerdita, t.valutaComune ?? "EUR")} (${percentuale(t.utilePerditaPercentuale)})`
                : "non disponibile"
            }
            colore={verso(t.utilePerdita)}
            nota="al netto delle commissioni di acquisto"
          />
        </div>

        {t.valutate === 0 ? (
          <div style={{ marginTop: 16 }}>
            <Avviso titolo="Nessuna posizione valutabile ancora." icona="=">
              Le posizioni registrate esistono ma non hanno quantità e prezzo di carico: finché
              mancano, l&apos;app <strong>non le valuta e non le conta</strong> nei totali,
              invece di mostrare zeri che sembrerebbero una perdita totale. Compilali in{" "}
              <code>dati/portafoglio.json</code>.
            </Avviso>
          </div>
        ) : null}

        {t.valutaComune === null && t.valutate > 1 ? (
          <div style={{ marginTop: 12 }}>
            <Avviso grave titolo="Valute diverse in portafoglio.">
              Le posizioni valutate non sono tutte nella stessa valuta, quindi i totali non
              vengono sommati: mettere insieme euro e dollari senza convertirli darebbe un
              numero senza significato. I singoli titoli restano corretti.
            </Avviso>
          </div>
        ) : null}
      </div>

      {/* ---------------- Posizioni ---------------- */}
      <div className="sezione">
        <div className="sezione-titolo">Posizioni</div>
        <p className="sezione-sub">
          «Contro l&apos;indice» risponde alla domanda che conta: avrei fatto meglio a comprare
          l&apos;indice lo stesso giorno? Il confronto parte dalla data di acquisto.
        </p>

        {v.posizioni.length === 0 ? (
          <div className="vuoto">Nessuna posizione registrata.</div>
        ) : (
          <div className="tabella-scroll">
            <table className="tab" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 190 }}>Titolo</th>
                  <th className="num">Quantità</th>
                  <th className="num">Carico</th>
                  <th className="num">Ultimo</th>
                  <th className="num">Valore</th>
                  <th className="num">Utile / perdita</th>
                  <th className="num">Contro l&apos;indice</th>
                </tr>
              </thead>
              <tbody>
                {v.posizioni.map((p) => (
                  <tr key={p.posizione.id}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{p.posizione.nome}</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                        {p.posizione.isin ? `${p.posizione.isin} · ` : ""}
                        {p.posizione.borsa ?? p.posizione.simbolo}
                      </div>
                      {/* Se i prezzi non vengono dalla sede di esecuzione, va detto qui. */}
                      {p.posizione.fontePrezzi ? (
                        <div style={{ fontSize: 11, color: "var(--orange)", marginTop: 3 }}>
                          prezzi da {p.posizione.simbolo}, non dalla sede di esecuzione
                        </div>
                      ) : null}
                      {p.posizione.dataAcquisto ? (
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          dal {dataBreve(p.posizione.dataAcquisto)}
                          {p.giorniDetenzione !== null ? ` · ${p.giorniDetenzione} giorni` : ""}
                        </div>
                      ) : null}
                    </td>

                    {p.completa ? (
                      <>
                        <td className="num">{numero(p.posizione.quantita, 0)}</td>
                        <td className="num">{prezzo(p.posizione.prezzoCarico, p.posizione.valuta)}</td>
                        <td className="num">
                          {prezzo(p.ultimoPrezzo, p.posizione.valuta)}
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            {dataBreve(p.ultimaData)}
                          </div>
                        </td>
                        <td className="num">
                          {prezzo(p.valoreAttuale, p.posizione.valuta)}
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            costo {prezzo(p.costoTotale, p.posizione.valuta)}
                          </div>
                        </td>
                        <td className={`num ${verso(p.utilePerdita)}`} style={{ fontWeight: 600 }}>
                          {prezzo(p.utilePerdita, p.posizione.valuta)}
                          <div style={{ fontSize: 11, fontWeight: 400 }}>
                            {percentuale(p.utilePerditaPercentuale)}
                          </div>
                        </td>
                        <td className={`num ${verso(p.eccesso)}`} style={{ fontWeight: 600 }}>
                          {p.eccesso === null && !p.posizione.dataAcquisto ? (
                            <>
                              <span className="badge oro">manca la data</span>
                              <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 400, marginTop: 4 }}>
                                senza data di acquisto non c&apos;è periodo da confrontare
                              </div>
                            </>
                          ) : (
                            <>
                              {punti(p.eccesso)}
                              <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 400 }}>
                                indice {percentuale(p.rendimentoIndice)}
                              </div>
                            </>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={6}>
                        <div className="badge oro">da completare</div>
                        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 5, maxWidth: "70ch" }}>
                          {p.problema}
                        </div>
                        {p.ultimoPrezzo !== null ? (
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                            Il titolo però è tracciato: ultima chiusura{" "}
                            <strong>{prezzo(p.ultimoPrezzo, p.posizione.valuta)}</strong> del{" "}
                            {dataBreve(p.ultimaData)}.
                          </div>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* La tesi di ogni posizione, scritta prima: è il documento che ex post si tende a riscrivere. */}
        {v.posizioni.some((p) => p.posizione.tesi || p.posizione.note) ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {v.posizioni.map((p) =>
              p.posizione.tesi || p.posizione.note ? (
                <div className="card" key={`nota-${p.posizione.id}`}>
                  <div className="card-titolo" style={{ fontSize: 14 }}>
                    {p.posizione.nome} — perché è in portafoglio
                  </div>
                  {p.posizione.tesi ? (
                    <p style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.55 }}>{p.posizione.tesi}</p>
                  ) : null}
                  {p.posizione.note ? (
                    <p style={{ fontSize: 12.5, marginTop: 8, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                      {p.posizione.note}
                    </p>
                  ) : null}
                  {p.posizione.fontePrezzi ? (
                    <p style={{ fontSize: 12, marginTop: 8, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
                      <strong>Da dove vengono i prezzi.</strong> {p.posizione.fontePrezzi}
                    </p>
                  ) : null}
                </div>
              ) : null
            )}
          </div>
        ) : null}
      </div>

      {/* ---------------- Simulatore ---------------- */}
      <div className="sezione">
        <div className="sezione-titolo">Ipotizza un investimento</div>
        <p className="sezione-sub">
          Quante azioni, di quale titolo: l&apos;app calcola l&apos;esborso al prezzo
          dell&apos;ultima chiusura, o a un prezzo che indichi tu. È solo aritmetica su un
          prezzo — non contiene alcun giudizio sul fatto che convenga.
        </p>

        <form method="get" className="card" style={{ marginTop: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
              alignItems: "end",
            }}
          >
            <div className="campo-blocco">
              <label className="etichetta" htmlFor="titolo">
                Titolo
              </label>
              <select className="campo" id="titolo" name="titolo" defaultValue={simSimbolo ?? ""}>
                <option value="">— scegli —</option>
                {TITOLI_TUTTI.map((tt) => (
                  <option key={tt.simbolo} value={tt.simbolo}>
                    {tt.nome} ({tt.simbolo})
                  </option>
                ))}
                {/* I titoli in portafoglio possono stare fuori dall'universo monitorato. */}
                {v.file.posizioni
                  .filter((p) => !TITOLI_TUTTI.some((tt) => tt.simbolo === p.simbolo))
                  .map((p) => (
                    <option key={p.simbolo} value={p.simbolo}>
                      {p.nome} ({p.simbolo})
                    </option>
                  ))}
              </select>
            </div>

            <div className="campo-blocco">
              <label className="etichetta" htmlFor="quantita">
                Quante azioni
              </label>
              <input
                className="campo"
                id="quantita"
                name="quantita"
                type="number"
                min="1"
                step="1"
                placeholder="es. 100"
                defaultValue={q.quantita ?? ""}
              />
            </div>

            <div className="campo-blocco">
              <label className="etichetta" htmlFor="prezzo">
                Prezzo per azione <span style={{ color: "var(--text-tertiary)" }}>(facoltativo)</span>
              </label>
              <input
                className="campo"
                id="prezzo"
                name="prezzo"
                type="text"
                inputMode="decimal"
                placeholder="vuoto = ultima chiusura"
                defaultValue={q.prezzo ?? ""}
              />
            </div>

            <button className="btn" type="submit">
              Calcola
            </button>
          </div>
        </form>

        {sim ? (
          <div className="card" style={{ marginTop: 12 }}>
            {sim.problema ? (
              <Avviso grave titolo="Non calcolabile.">{sim.problema}</Avviso>
            ) : (
              <>
                <div className="card-titolo">
                  {numero(sim.quantita, 0)} azioni di {sim.nome}
                </div>
                <div className="metriche" style={{ marginTop: 12 }}>
                  <Metrica
                    nome="Prezzo per azione"
                    valore={prezzo(sim.prezzo, sim.valuta)}
                    nota={
                      sim.dalMercato
                        ? `ultima chiusura del ${dataBreve(sim.data)}`
                        : "prezzo indicato da te"
                    }
                  />
                  <Metrica nome="Esborso" valore={prezzo(sim.esborso, sim.valuta)} nota="commissioni escluse" />
                  <Metrica
                    nome="Quota del portafoglio"
                    valore={
                      t.valore !== null && sim.esborso !== null && t.valutaComune === sim.valuta
                        ? percentuale(sim.esborso / (t.valore + sim.esborso))
                        : "non disponibile"
                    }
                    nota={
                      t.valore !== null && t.valutaComune === sim.valuta
                        ? "peso che avrebbe dopo l'acquisto"
                        : "serve un portafoglio valutato nella stessa valuta"
                    }
                  />
                </div>
                <div className="fonte">
                  Aritmetica su un prezzo di chiusura: non include commissioni, spread fra
                  denaro e lettera, imposte, né lo scostamento fra il prezzo visto e quello
                  effettivamente eseguito. Su un ordine reale queste voci contano.
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Ipotesi salvate nel file */}
        {v.ipotesi.length > 0 ? (
          <div style={{ marginTop: 20 }}>
            <div className="card-titolo" style={{ fontSize: 14, marginBottom: 8 }}>
              Ipotesi salvate
            </div>
            <div className="tabella-scroll">
              <table className="tab" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    <th>Titolo</th>
                    <th className="num">Quantità</th>
                    <th className="num">Prezzo</th>
                    <th className="num">Esborso</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {v.ipotesi.map((i) => (
                    <tr key={i.ipotesi.id}>
                      <td>
                        <div style={{ fontWeight: 550 }}>{i.ipotesi.nome}</div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{i.ipotesi.simbolo}</div>
                      </td>
                      <td className="num">{numero(i.ipotesi.quantita, 0)}</td>
                      <td className="num">
                        {prezzo(i.prezzoUsato, i.valuta)}
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {i.prezzoDalMercato ? `chiusura ${dataBreve(i.ultimaData)}` : "prezzo indicato"}
                        </div>
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {prezzo(i.esborso, i.valuta)}
                      </td>
                      <td style={{ fontSize: 12.5, color: "var(--text-secondary)", maxWidth: "40ch" }}>
                        {i.ipotesi.note ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fonte">
              Le ipotesi <strong>non</strong> sono conteggiate nei totali del portafoglio: sono
              simulazioni. Per trasformarne una in posizione reale si aggiunge una voce in{" "}
              <code>posizioni</code> con quantità, prezzo pagato e data.
            </div>
          </div>
        ) : null}
      </div>

      {/* ---------------- Come si aggiorna ---------------- */}
      <div className="sezione">
        <div className="sezione-titolo">Come si aggiorna e cosa non fa</div>
        <div className="card">
          <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            I prezzi delle posizioni si rivalutano a ogni giro di <code>npm run aggiorna</code>,
            che scarica anche i titoli presenti solo in portafoglio e non nell&apos;universo
            monitorato. Ogni valore mostrato porta accanto la data della chiusura da cui viene:
            se un titolo resta indietro, si vede.
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 10 }}>
            Il confronto con l&apos;indice usa <strong>{v.benchmarkUsato}</strong>
            {v.totalReturn ? ", a dividendi reinvestiti" : ", che è un indice di prezzo"}. Per i
            titoli quotati fuori dall&apos;area euro la differenza include il movimento del
            cambio.
          </p>
          <div style={{ marginTop: 14 }}>
            <Avviso grave titolo="Questa pagina non esegue nulla.">
              Non c&apos;è alcun collegamento con un intermediario: nessun ordine parte da qui e
              nessun ordine può partire da qui. È un registro di ciò che hai già deciso, più una
              calcolatrice. Le posizioni si inseriscono a mano in{" "}
              <code>dati/portafoglio.json</code>, e la decisione di comprare o vendere resta
              interamente tua.
            </Avviso>
          </div>
        </div>
      </div>
    </main>
  );
}
