/**
 * Scheda del caso guida: TIM.
 *
 * Struttura: prima quello che oggi conta davvero (l'offerta pubblica in corso), poi la
 * misura degli eventi di management, poi i nove bilanci con gli indicatori della svolta,
 * poi le trappole contabili. In quest'ordine perché è l'ordine in cui uno perde i soldi.
 */

import { dettaglioTitolo } from "@/lib/vista";
import { leggiBilanci } from "@/lib/bilanci";
import { Avviso, Badge, Metrica } from "@/componenti/pezzi";
import { Grafico } from "@/componenti/Grafico";
import { dataBreve, milioni, numero, percentuale, prezzo, punti, verso } from "@/lib/formato";
import { trovaTitolo } from "@/lib/universo";

export const dynamic = "force-dynamic";

const SIMBOLO = "TIT.MI";

export default async function PaginaTim() {
  const d = await dettaglioTitolo(SIMBOLO);
  const bilanci = await leggiBilanci(SIMBOLO);
  const titolo = trovaTitolo(SIMBOLO);

  if (!d.serie || !d.indicatori) {
    return (
      <main className="wrap">
        <h1 className="page-title">TIM</h1>
        <div className="sezione">
          <Avviso grave titolo="Dati non disponibili.">
            Esegui <code>npm run aggiorna</code>.
          </Avviso>
        </div>
      </main>
    );
  }

  const esercizi = bilanci?.esercizi ?? [];

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">TIM — Telecom Italia</h1>
        <p className="page-sub">
          Il caso da cui nasce la tesi. Nove bilanci, undici eventi di management, dieci anni
          di prezzi: sotto, quello che i numeri dicono davvero.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Badge testo={`ISIN ${titolo?.isin ?? "n/d"}`} />
          <Badge testo="raggruppamento 1:10 il 15/06/2026" colore="var(--orange)" />
          <Badge testo="offerta pubblica in corso" colore="var(--red)" forte />
        </div>
      </div>

      <div className="sezione">
        <Avviso grave titolo="Oggi TIM non è un titolo telco: è un derivato di Poste Italiane.">
          È in corso l&apos;offerta pubblica di acquisto e scambio di Poste (adesioni dal
          20/07/2026 all&apos;<strong>11/09/2026</strong>, pagamento il 18/09). Il corrispettivo
          è <strong>1,67 € in contanti più 0,218 azioni Poste</strong>: il{" "}
          <strong>78%</strong> del valore è carta di un&apos;altra società. Dall&apos;apertura
          del periodo di adesione i movimenti giornalieri di TIM hanno{" "}
          <strong>correlazione 0,82 e beta 0,74 con Poste</strong>, contro una correlazione di
          0,14 con l&apos;indice di Milano. Le adesioni erano all&apos;<strong>1,97%</strong> al
          17/08/2026, contro una soglia del 66,67% che l&apos;offerente può però rinunciare.
          Qualunque indicatore tecnico calcolato in questo regime misura la probabilità di
          esito dell&apos;operazione, non il valore dell&apos;azienda.
        </Avviso>
      </div>

      {d.mandato && d.fasiDelMandato.length ? (
        <div className="sezione">
          <div className="sezione-titolo">Il mandato in corso: {d.mandato.titolo}</div>
          <p className="sezione-sub">
            È da qui che si misura la gestione — dal {dataBreve(d.mandato.dataAnnuncio)}, non
            dall&apos;ultimo evento societario. Il totale del mandato, però, è la somma di due
            fasi opposte: mostrarlo da solo farebbe credere a un andamento lineare che non è
            mai esistito.
          </p>
          <div className="tabella-scroll">
            <table className="tab" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Fase</th>
                  <th>Periodo</th>
                  <th className="num">TIM</th>
                  <th className="num">Indice</th>
                  <th className="num">Differenza</th>
                  <th className="num">Annuo composto</th>
                </tr>
              </thead>
              <tbody>
                {d.fasiDelMandato.map((f, i) => (
                  <tr key={f.etichetta} style={i === 0 ? { background: "var(--fill)" } : undefined}>
                    <td style={{ fontWeight: i === 0 ? 600 : 400 }}>{f.etichetta}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                      {dataBreve(f.da)} → {dataBreve(f.a)}
                      <div style={{ color: "var(--text-tertiary)" }}>{numero(f.anni, 1)} anni</div>
                    </td>
                    <td className={`num ${verso(f.titolo)}`}>{percentuale(f.titolo)}</td>
                    <td className={`num ${verso(f.benchmark)}`}>{percentuale(f.benchmark)}</td>
                    <td className={`num ${verso(f.eccesso)}`} style={{ fontWeight: 600 }}>
                      {punti(f.eccesso)}
                    </td>
                    <td className="num">{percentuale(f.cagr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14 }}>
            <Avviso titolo="Come si legge." icona="=">
              Nell&apos;intero mandato il titolo <strong>resta sotto l&apos;indice</strong>. Il
              risultato complessivo è però la somma di una prima fase profondamente negativa e
              di una seconda molto positiva, e lo spartiacque non è una decisione di gestione:
              è la <strong>cessione della rete</strong>. Attribuire l&apos;intero recupero al
              cambio di management significa attribuirgli anche i due anni e mezzo precedenti,
              che sono nello stesso mandato.
            </Avviso>
          </div>
        </div>
      ) : null}

      <div className="sezione">
        <div className="sezione-titolo">Dove sta il prezzo</div>
        <div className="metriche">
          <Metrica nome="Ultima chiusura" valore={prezzo(d.indicatori.ultimo, d.indicatori.valuta)} nota={`del ${dataBreve(d.indicatori.ultimaData)}`} />
          <Metrica nome="12 mesi" valore={percentuale(d.indicatori.rendimenti["12m"])} colore={verso(d.indicatori.rendimenti["12m"])} />
          <Metrica nome="5 anni" valore={percentuale(d.indicatori.rendimenti["5a"])} colore={verso(d.indicatori.rendimenti["5a"])} />
          <Metrica
            nome="5 anni contro l'indice"
            valore={punti(d.indicatori.rendimentiRelativi["5a"])}
            nota="l'indice è di prezzo: a dividendi reinvestiti il divario è peggiore di 15-20 punti"
            colore={verso(d.indicatori.rendimentiRelativi["5a"])}
          />
          <Metrica nome="Massimo 52 settimane" valore={prezzo(d.indicatori.massimo52w, d.indicatori.valuta)} />
          <Metrica nome="Minimo 52 settimane" valore={prezzo(d.indicatori.minimo52w, d.indicatori.valuta)} />
          <Metrica nome="Volatilità annua" valore={percentuale(d.indicatori.volatilita250)} nota="250 sedute" />
          <Metrica
            nome="Beta contro l'indice"
            valore={numero(d.indicatori.beta250)}
            nota="poco significativo: il titolo segue l'offerta, non il mercato"
          />
        </div>
      </div>

      <div className="sezione">
        <div className="card">
          <div className="card-titolo">Dieci anni, con gli eventi di management</div>
          <div className="card-sub">
            Serie rettificata per dividendi e operazioni sul capitale: il raggruppamento 1:10
            del giugno 2026 è già dentro, quindi non si vede alcun crollo del 90%.
          </div>
          <div style={{ marginTop: 14 }}>
            <Grafico serie={d.serie} benchmark={d.benchmark} eventi={d.studi.map((s) => s.evento)} altezza={300} />
          </div>
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Ogni evento, misurato</div>
        <p className="sezione-sub">
          Rendimento anomalo rispetto all&apos;indice, con il modello di mercato stimato sulle
          250 sedute che precedono l&apos;evento. Dove lo storico non basta, non viene mostrato
          alcun numero.
        </p>
        <div className="tabella-scroll">
          <table className="tab">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Data</th>
                <th>Tipo</th>
                <th className="num">[-1,+1]</th>
                <th className="num">[0,+20]</th>
                <th className="num">[0,+120]</th>
                <th className="num">[0,+250]</th>
              </tr>
            </thead>
            <tbody>
              {d.studi.map(({ evento, studio }) => {
                const f = (et: string) => studio?.finestre.find((x) => x.etichetta === et)?.car ?? null;
                return (
                  <tr key={evento.id}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{evento.titolo}</div>
                      {evento.contaminato ? (
                        <div style={{ fontSize: 12, color: "var(--red)", marginTop: 3 }}>
                          contaminato: nella finestra succedeva anche altro
                        </div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{dataBreve(evento.dataAnnuncio)}</td>
                    <td>
                      <Badge testo={evento.tier} />
                    </td>
                    {(["[-1,+1]", "[0,+20]", "[0,+120]", "[0,+250]"] as const).map((et) => (
                      <td key={et} className={`num ${verso(f(et))}`}>
                        {studio?.problema ? <span className="neutro">—</span> : percentuale(f(et))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="fonte">
          Lettura: nessun evento paga nell&apos;immediato. Il rendimento in eccesso, quando
          c&apos;è, si forma fra il secondo e il quarto mese, e solo sugli eventi di cessione e
          di cambio dell&apos;azionista. L&apos;unico evento significativo attribuibile al
          lavoro di un amministratore delegato è il piano del 7 marzo 2024, e ha segno negativo.
        </div>
      </div>

      {bilanci ? (
        <>
          <div className="sezione">
            <div className="sezione-titolo">I nove bilanci</div>
            <p className="sezione-sub">
              Ricostruiti da comunicati e relazioni ufficiali. La colonna «perimetro» dice se
              l&apos;anno è confrontabile con il precedente: quasi mai lo è.
            </p>
            <div className="tabella-scroll">
              <table className="tab" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Esercizio</th>
                    <th className="num">Ricavi</th>
                    <th className="num">EBITDAaL</th>
                    <th className="num">Risultato del gruppo</th>
                    <th className="num">Debito netto AL</th>
                    <th className="num">Leva</th>
                    <th className="num">Cassa (equity FCF AL)</th>
                    <th className="num">Dipendenti</th>
                    <th>Pubblicato</th>
                  </tr>
                </thead>
                <tbody>
                  {esercizi.map((e) => (
                    <tr key={e.esercizio}>
                      <td style={{ fontWeight: 600 }}>{e.esercizio}</td>
                      <td className="num">{milioni(e.ricavi)}</td>
                      <td className="num">{milioni(e.ebitdaAL)}</td>
                      <td className={`num ${verso(e.risultatoNettoGruppo)}`}>{milioni(e.risultatoNettoGruppo)}</td>
                      <td className="num">{milioni(e.debitoNettoAL ?? e.debitoNettoContabile)}</td>
                      <td className="num">{e.leva === null ? "—" : `${numero(e.leva, 2)}x`}</td>
                      <td className={`num ${verso(e.equityFcfAL)}`}>{milioni(e.equityFcfAL)}</td>
                      <td className="num">{e.dipendenti === null ? "—" : e.dipendenti.toLocaleString("it-IT")}</td>
                      <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{dataBreve(e.pubblicato)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fonte">
              La data di pubblicazione è quella che conta: prima di quel giorno il dato non era
              conoscibile da nessuno. Usare la chiusura d&apos;esercizio al suo posto è
              l&apos;errore che fa sembrare profittevole qualunque strategia.
            </div>
          </div>

          <div className="sezione">
            <div className="sezione-titolo">Gli indicatori che hanno segnalato la svolta</div>
            <p className="sezione-sub">
              In ordine di accensione, con la distinzione fra quelli che migliorano{" "}
              <em>perché l&apos;azienda ha venduto un pezzo di sé</em> e quelli che migliorano{" "}
              <em>perché la gestione funziona</em>.
            </p>
            <div className="timeline">
              {bilanci.indicatoriDellaSvolta.map((i) => {
                const operativo = i.natura.includes("operativo");
                return (
                  <div key={i.ordine} className={`timeline-voce ${operativo ? "chiave" : ""}`}>
                    <div className="timeline-data">
                      {dataBreve(i.dataPubblica)} · {i.natura}
                    </div>
                    <div className="timeline-titolo">{i.indicatore}</div>
                    <div className="timeline-testo">{i.primoSegnale}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 18 }}>
              <Avviso titolo="Cessione o gestione?" icona="=">
                <strong>2024:</strong> {bilanci.cessioneOGestione["2024"]}
                <br />
                <strong>2025:</strong> {bilanci.cessioneOGestione["2025"]}
                <br />
                <em>{bilanci.cessioneOGestione.sintesi}</em>
              </Avviso>
            </div>
          </div>

          <div className="sezione">
            <div className="sezione-titolo">Trappole contabili</div>
            <p className="sezione-sub">
              Ognuna di queste, presa alla lettera da un programma, produce un numero sbagliato
              senza far fallire alcun calcolo. Sono il motivo per cui questa app non legge i
              fondamentali gratuiti su TIM.
            </p>
            <div className="card">
              <ol style={{ margin: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                {bilanci.trappoleContabili.map((t, i) => (
                  <li key={i} style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                    {t}
                  </li>
                ))}
              </ol>
            </div>
            <div style={{ marginTop: 12 }}>
              <Avviso grave titolo="Divergenza fra le fonti gratuite e la società.">
                {bilanci.divergenzeNote}
              </Avviso>
            </div>
          </div>
        </>
      ) : null}

      {d.indicatori.giorniDiVolume.length ? (
        <div className="sezione">
          <div className="sezione-titolo">Giorni di volume anomalo, ultimo anno</div>
          <p className="sezione-sub">Sono i giorni in cui è successo qualcosa. Vanno letti a mano.</p>
          <div className="tabella-scroll">
            <table className="tab">
              <thead>
                <tr>
                  <th>Data</th>
                  <th className="num">Volume sulla media</th>
                  <th className="num">Variazione del giorno</th>
                </tr>
              </thead>
              <tbody>
                {d.indicatori.giorniDiVolume.map((g) => (
                  <tr key={g.data}>
                    <td>{dataBreve(g.data)}</td>
                    <td className="num">{numero(g.rapportoSuMedia, 1)}×</td>
                    <td className={`num ${verso(g.variazione)}`}>{percentuale(g.variazione)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </main>
  );
}
