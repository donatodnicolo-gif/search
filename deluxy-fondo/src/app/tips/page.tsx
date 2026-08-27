/**
 * Tips — chi somiglia alla tesi, e a quale prezzo.
 *
 * Due cose separate, tenute separate di proposito:
 *
 *  1. Uno **screening** ordinato per affinità con le condizioni della tesi. Ogni criterio è
 *     visibile con il suo esito, quindi il posto in classifica si può contestare guardando i
 *     criteri invece di fidarsi del numero.
 *  2. Un **calcolatore del livello di ingresso** in cui la regola la sceglie chi legge, e
 *     l'app fa il conto. Non c'è una regola consigliata di default, perché consigliarla
 *     sarebbe l'unica parte del lavoro che questa app non deve fare.
 *
 * La pagina si apre dichiarando che la tesi non è dimostrata. È l'ordine giusto: prima quanto
 * poco si sa, poi la classifica.
 */

import { leggiSerie } from "@/lib/archivio";
import { Avviso, Badge, Metrica, Vuoto } from "@/componenti/pezzi";
import { dataBreve, numero, percentuale, prezzo, prezzoUnitario, punti, verso } from "@/lib/formato";
import { REGOLE, calcolaIngresso, calcolaLivelli, screening, type RegolaIngresso } from "@/lib/tips";
import { tuttiIMandati } from "@/lib/vista";

export const dynamic = "force-dynamic";

type Ricerca = { titolo?: string; regola?: string; sconto?: string; quantita?: string };

const REGOLA_VALIDA = (x: string | undefined): x is RegolaIngresso =>
  !!x && REGOLE.some((r) => r.id === x);

export default async function Tips({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const q = await searchParams;
  const { candidati, attesa, esclusi } = await screening();

  // Il tasso storico di successo della tesi: è il contesto senza cui la classifica sotto
  // sembra una lista della spesa.
  const { mandati } = await tuttiIMandati();
  const conEccesso = mandati.filter((m) => m.eccesso !== null);
  const vincenti = conEccesso.filter((m) => m.eccesso! > 0).length;

  const inRadar = candidati.filter((c) => c.copertura >= 0.5);
  const scartati = candidati.filter((c) => c.copertura < 0.5);
  const massimo = inRadar.length ? inRadar[0].affinita : 0;
  const pariMerito = inRadar.filter((c) => Math.abs(c.affinita - massimo) < 0.5).length;

  // --- Calcolatore del livello di ingresso ---------------------------------
  const simSimbolo = q.titolo && q.titolo !== "" ? q.titolo : null;
  const simRegola: RegolaIngresso | null = REGOLA_VALIDA(q.regola) ? q.regola : null;
  const scontoNum = q.sconto ? Number(q.sconto.replace(",", ".")) : 0;
  const sconto = Number.isFinite(scontoNum) ? Math.min(Math.max(scontoNum, -50), 90) / 100 : 0;
  const quantita = q.quantita ? Number(q.quantita.replace(",", ".")) : null;

  const serieSim = simSimbolo ? await leggiSerie(simSimbolo) : null;
  const livelliSim = calcolaLivelli(serieSim);
  const calcolo = simSimbolo && simRegola ? calcolaIngresso(serieSim, livelliSim, simRegola, sconto) : null;
  const tutti = [...candidati, ...attesa];
  const candidatoSim = simSimbolo ? tutti.find((c) => c.simbolo === simSimbolo) ?? null : null;
  const esborso =
    calcolo?.prezzoIngresso != null && quantita !== null && Number.isFinite(quantita) && quantita > 0
      ? calcolo.prezzoIngresso * quantita
      : null;

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">Tips</h1>
        <p className="page-sub">
          Quali aziende dell&apos;universo somigliano di più alle condizioni della tesi, e a
          quale prezzo corrisponde la regola di ingresso che scegli tu. Sono due conti
          separati: il primo ordina, il secondo calcola. Nessuno dei due raccomanda.
        </p>
      </div>

      <Avviso grave titolo="Prima della classifica, il dato che la ridimensiona.">
        Su {conEccesso.length} mandati misurati in questa app,{" "}
        <strong>
          {vincenti} hanno battuto l&apos;indice
        </strong>{" "}
        ({conEccesso.length ? Math.round((vincenti / conEccesso.length) * 100) : 0}%). La tesi
        del cambio di management <strong>non è dimostrata</strong>, e sul caso da cui è nata —
        TIM — l&apos;esito è negativo. Quello che segue è quindi un elenco di casi che{" "}
        <em>somigliano</em> alla tesi, non di casi che funzioneranno. La differenza è tutta la
        differenza.
      </Avviso>

      <Avviso icona="§">
        <strong>Non ti diciamo a quanto comprare.</strong> Indicare un prezzo di acquisto a una
        persona è consulenza finanziaria, attività riservata. Qui la regola la scegli tu — «il
        10% sotto la media a 200 giorni», «il minimo dell&apos;anno» — e l&apos;app calcola a
        quale numero corrisponde oggi, quante volte quel prezzo si è visto davvero, e quanto
        costerebbero N azioni. È aritmetica su dati pubblici.
      </Avviso>

      {/* ------------------------------------------------------------------ */}
      <div className="sezione">
        <div className="sezione-titolo">Nel radar</div>
        <p className="sezione-sub">
          Ordinati per affinità con le condizioni che la letteratura associa ai turnaround:
          uscita forzata del predecessore, successore esterno, titolo che andava male prima del
          cambio, evento di primo livello, finestra temporale utile. Un criterio non
          accertabile viene escluso e i pesi si rinormalizzano — non vale zero.
        </p>

        {pariMerito > 1 ? (
          <Avviso titolo="La classifica non separa i primi.">
            {pariMerito} casi hanno lo stesso punteggio massimo: i criteri sono binari, quindi
            l&apos;affinità distingue le <em>classi</em>, non i singoli. Fra pari merito ordiniamo
            per mandato più giovane — chi è arrivato da meno tempo ha ancora davanti la parte
            di storia che la tesi pretende di anticipare. È una convenzione, non una misura.
          </Avviso>
        ) : null}

        {inRadar.length === 0 ? (
          <Vuoto titolo="Nessun caso in radar">
            Nessun caso ha almeno la metà dei criteri accertabile: sotto quella soglia il
            punteggio non viene mostrato, perché un&apos;affinità calcolata su pochi dati
            sembrerebbe identica a una calcolata su tutti. I casi entrano qui quando le fonti
            coprono abbastanza criteri.
          </Vuoto>
        ) : (
          <div className="tabella-scroll">
            {/* era `className="tabella"`, classe inesistente: tabella senza stile (28/08/2026) */}
            <table className="tab">
              <thead>
                <tr>
                  <th>Azienda</th>
                  <th>Chi guida</th>
                  <th>Dall&apos;annuncio</th>
                  <th className="num">Affinità</th>
                  <th className="num">Mandato vs indice</th>
                  <th className="num">Prezzo</th>
                  <th className="num">Dal massimo 52s</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inRadar.map((c) => (
                  <tr key={c.simbolo}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{c.nome}</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {c.simbolo} · {c.settore} · {c.paese}
                      </div>
                    </td>
                    <td>
                      {c.persona ?? <span className="neutro">non indicato</span>}
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {c.evento.forzato === true
                          ? "dopo un'uscita forzata"
                          : c.evento.forzato === false
                            ? "successione ordinata"
                            : "modalità di uscita non accertata"}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {dataBreve(c.evento.dataAnnuncio)}
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {numero(c.mesiDallEvento, 0)} mesi fa
                      </div>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {numero(c.affinita, 0)}
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 400 }}>
                        su {Math.round(c.copertura * 100)}% dei criteri
                      </div>
                    </td>
                    <td className={`num ${verso(c.mandato?.eccesso ?? null)}`}>
                      {c.mandato?.eccesso != null ? punti(c.mandato.eccesso) : <span className="neutro">—</span>}
                    </td>
                    <td className="num">{prezzoUnitario(c.livelli.prezzo, c.livelli.valuta)}</td>
                    <td className={`num ${verso(c.livelli.daMassimo)}`}>
                      {percentuale(c.livelli.daMassimo)}
                    </td>
                    <td className="num">
                      <a className="chip" href={`/tips?titolo=${encodeURIComponent(c.simbolo)}#calcolatore`}>
                        Livelli
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="fonte">
          {esclusi > 0
            ? `${esclusi} cas${esclusi === 1 ? "o escluso" : "i esclusi"} per mancanza di prezzi. `
            : null}
          {scartati.length > 0
            ? `${scartati.length} con meno della metà dei criteri accertabili: non entrano in classifica perché un punteggio su metà dei dati sembra identico a uno su tutti.`
            : null}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {attesa.length > 0 ? (
        <div className="sezione">
          <div className="sezione-titolo">Annunciati, non ancora insediati</div>
          <p className="sezione-sub">
            Qui il nuovo amministratore delegato è stato nominato ma non è ancora al comando.
            Sono i casi in cui la storia che la tesi pretende di anticipare deve ancora
            cominciare — e proprio per questo <strong>non hanno un mandato da misurare</strong>:
            il rendimento di questi mesi è del predecessore, non suo. L&apos;app non lo attribuisce
            a chi arriva.
          </p>

          <div className="tabella-scroll">
            {/* era `className="tabella"`, classe inesistente: tabella senza stile (28/08/2026) */}
            <table className="tab">
              <thead>
                <tr>
                  <th>Azienda</th>
                  <th>Chi arriva</th>
                  <th>Annuncio</th>
                  <th>In carica dal</th>
                  <th className="num">Prezzo</th>
                  <th className="num">Dal massimo 52s</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {attesa.map((c) => (
                  <tr key={c.simbolo}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{c.nome}</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {c.simbolo} · {c.settore} · {c.paese}
                      </div>
                    </td>
                    <td>
                      {c.persona ?? <span className="neutro">non indicato</span>}
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {c.evento.successoreEsterno === true
                          ? "arriva da fuori"
                          : c.evento.successoreEsterno === false
                            ? "successore interno"
                            : "provenienza non accertata"}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{dataBreve(c.evento.dataAnnuncio)}</td>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 550 }}>
                      {dataBreve(c.evento.dataEfficacia)}
                    </td>
                    <td className="num">{prezzoUnitario(c.livelli.prezzo, c.livelli.valuta)}</td>
                    <td className={`num ${verso(c.livelli.daMassimo)}`}>
                      {percentuale(c.livelli.daMassimo)}
                    </td>
                    <td className="num">
                      <a className="chip" href={`/tips?titolo=${encodeURIComponent(c.simbolo)}#calcolatore`}>
                        Livelli
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      <div className="sezione">
        <div className="sezione-titolo">Perché ciascuno è dove è</div>
        <p className="sezione-sub">
          Il punteggio non è un giudizio: è la somma dei criteri qui sotto. Chi non è
          d&apos;accordo con un criterio sa esattamente quale riga togliere.
        </p>

        {inRadar.slice(0, 8).map((c) => (
          <div className="card" key={c.simbolo}>
            <div className="card-testa">
              <div>
                <div className="card-titolo">{c.nome}</div>
                <div className="card-sub">
                  {c.evento.titolo} · {dataBreve(c.evento.dataAnnuncio)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {c.evento.contaminato ? <Badge testo="evento contaminato" colore="var(--orange)" /> : null}
                <Badge testo={`tier ${c.evento.tier}`} />
                <Badge testo={`affinità ${numero(c.affinita, 0)}`} forte />
              </div>
            </div>

            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
              {c.evento.descrizione}
            </p>

            <div className="tabella-scroll">
              {/* era `className="tabella"`, classe inesistente: tabella senza stile (28/08/2026) */}
              <table className="tab">
                <tbody>
                  {c.criteri.map((cr) => (
                    <tr key={cr.nome}>
                      <td style={{ width: 34 }}>
                        {cr.soddisfatto === true ? "sì" : cr.soddisfatto === false ? "no" : "?"}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{cr.nome}</div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{cr.spiegazione}</div>
                      </td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        {cr.soddisfatto === null ? (
                          <span className="neutro">escluso</span>
                        ) : (
                          `peso ${cr.peso}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {c.evento.contaminato ? (
              <div className="fonte">
                Nella finestra intorno all&apos;annuncio cadono altri fatti rilevanti: il
                movimento del prezzo non è attribuibile al solo cambio di gestione, e
                l&apos;affinità è scontata del 25%.
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      <div className="sezione" id="calcolatore">
        <div className="sezione-titolo">A quanto comprare: il conto lo fa l&apos;app, la regola la scegli tu</div>
        <p className="sezione-sub">
          Scegli un riferimento e uno sconto. L&apos;app calcola il prezzo corrispondente, quanto
          dista da oggi, e — il dato che conta di più — <strong>quante sedute dell&apos;ultimo
          anno hanno davvero chiuso a quel livello o sotto</strong>. Un prezzo che non si è mai
          visto in dodici mesi è un ordine che rischia di non essere mai eseguito.
        </p>

        <form method="get" className="card" style={{ marginTop: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
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
                {tutti.map((c) => (
                  <option key={c.simbolo} value={c.simbolo}>
                    {c.nome} ({c.simbolo})
                  </option>
                ))}
              </select>
            </div>

            <div className="campo-blocco">
              <label className="etichetta" htmlFor="regola">
                Riferimento
              </label>
              <select className="campo" id="regola" name="regola" defaultValue={simRegola ?? ""}>
                <option value="">— scegli —</option>
                {REGOLE.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo-blocco">
              <label className="etichetta" htmlFor="sconto">
                Sconto sul riferimento (%)
              </label>
              <input
                className="campo"
                id="sconto"
                name="sconto"
                type="text"
                inputMode="decimal"
                placeholder="es. 10"
                defaultValue={q.sconto ?? ""}
              />
            </div>

            <div className="campo-blocco">
              <label className="etichetta" htmlFor="quantita">
                Quante azioni <span style={{ color: "var(--text-tertiary)" }}>(facoltativo)</span>
              </label>
              <input
                className="campo"
                id="quantita"
                name="quantita"
                type="number"
                min="1"
                step="1"
                placeholder="es. 50"
                defaultValue={q.quantita ?? ""}
              />
            </div>

            <button className="btn" type="submit">
              Calcola
            </button>
          </div>
        </form>

        {simSimbolo && !simRegola ? (
          <Avviso titolo="Manca il riferimento.">
            Scegli su cosa applicare lo sconto: media a 200 giorni, media a 50, mediana a sei
            mesi, minimo dell&apos;anno o prezzo di oggi. Non c&apos;è un&apos;opzione
            preselezionata, perché preselezionarne una sarebbe già un consiglio.
          </Avviso>
        ) : null}

        {simSimbolo ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-testa">
              <div>
                <div className="card-titolo">{candidatoSim?.nome ?? simSimbolo}</div>
                <div className="card-sub">
                  Riferimenti al {dataBreve(livelliSim.data)} · prezzi in {livelliSim.valuta}
                </div>
              </div>
            </div>
            <div className="metriche" style={{ marginTop: 12 }}>
              <Metrica nome="Ultima chiusura" valore={prezzoUnitario(livelliSim.prezzo, livelliSim.valuta)} />
              <Metrica
                nome="Media 200 giorni"
                valore={prezzoUnitario(livelliSim.media200, livelliSim.valuta)}
                nota={livelliSim.daMedia200 != null ? `oggi ${percentuale(livelliSim.daMedia200)}` : null}
              />
              <Metrica nome="Media 50 giorni" valore={prezzoUnitario(livelliSim.media50, livelliSim.valuta)} />
              <Metrica nome="Mediana 6 mesi" valore={prezzoUnitario(livelliSim.mediana6m, livelliSim.valuta)} />
              <Metrica nome="Minimo 52 settimane" valore={prezzoUnitario(livelliSim.minimo52, livelliSim.valuta)} />
              <Metrica
                nome="Massimo 52 settimane"
                valore={prezzoUnitario(livelliSim.massimo52, livelliSim.valuta)}
                nota={livelliSim.daMassimo != null ? `oggi ${percentuale(livelliSim.daMassimo)}` : null}
              />
            </div>
          </div>
        ) : null}

        {calcolo ? (
          <div className="card" style={{ marginTop: 12 }}>
            {calcolo.problema && calcolo.prezzoIngresso === null ? (
              <Avviso grave titolo="Non calcolabile.">{calcolo.problema}</Avviso>
            ) : (
              <>
                <div className="card-titolo">
                  {calcolo.nomeRegola}
                  {sconto !== 0 ? `, meno ${numero(sconto * 100, 1)}%` : ", senza sconto"}
                </div>
                <div className="metriche" style={{ marginTop: 12 }}>
                  <Metrica
                    nome="Prezzo che ne risulta"
                    valore={prezzoUnitario(calcolo.prezzoIngresso, livelliSim.valuta)}
                    nota={`riferimento ${prezzoUnitario(calcolo.riferimento, livelliSim.valuta)}`}
                  />
                  <Metrica
                    nome="Distanza da oggi"
                    valore={percentuale(calcolo.distanzaDaOggi)}
                    nota={
                      calcolo.distanzaDaOggi != null && calcolo.distanzaDaOggi < 0
                        ? "il titolo dovrebbe scendere"
                        : calcolo.distanzaDaOggi != null && calcolo.distanzaDaOggi > 0
                          ? "sopra il prezzo attuale"
                          : null
                    }
                    colore={verso(calcolo.distanzaDaOggi)}
                  />
                  <Metrica
                    nome="Sedute a quel livello o sotto"
                    valore={
                      calcolo.seduteSottoLivello === null
                        ? "non calcolabile"
                        : `${calcolo.seduteSottoLivello} su ${calcolo.seduteTotali}`
                    }
                    nota="nell'ultimo anno di borsa"
                  />
                  {esborso !== null ? (
                    <Metrica
                      nome={`Esborso per ${numero(quantita!, 0)} azioni`}
                      valore={prezzo(esborso, livelliSim.valuta)}
                      nota="commissioni e cambio esclusi"
                    />
                  ) : null}
                </div>

                {calcolo.problema ? (
                  <div style={{ marginTop: 12 }}>
                    <Avviso titolo="Attenzione.">{calcolo.problema}</Avviso>
                  </div>
                ) : null}

                <div className="fonte">
                  {REGOLE.find((r) => r.id === calcolo.regola)?.spiegazione} · Il calcolo usa
                  serie rettificate per dividendi e frazionamenti: su un titolo che stacca
                  cedole, il prezzo storico rettificato è più basso di quello che vedevi allora
                  sullo schermo del broker.
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="sezione">
        <Avviso icona="i">
          <strong>Come leggere questa pagina.</strong> L&apos;affinità misura la somiglianza a
          un&apos;ipotesi, non la probabilità di guadagno. I livelli di prezzo sono descrizioni
          del passato: la media a 200 giorni dice dov&apos;è stato il titolo, non dove andrà, e
          il minimo dell&apos;anno non è un pavimento — i titoli ci passano sotto regolarmente.
          Nessuna delle due cose sostituisce la lettura dei bilanci.
        </Avviso>
      </div>
    </main>
  );
}
