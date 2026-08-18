/**
 * Cruscotto — la prima cosa che si vede ogni giorno.
 *
 * Ordine deliberato: prima il verdetto sulla strategia, poi i titoli, poi le notizie.
 * Il verdetto sta in cima perché è la cosa che un cruscotto di solito nasconde: se la
 * strategia che l'app monitora ha perso contro l'indice, va detto prima dei numeri, non
 * in una nota a piè di pagina.
 */

import { costruisciCruscotto, notizieRilevanti } from "@/lib/vista";
import { Avviso, Badge, BarraPunteggio, Metrica, StatoFonti } from "@/componenti/pezzi";
import { Grafico } from "@/componenti/Grafico";
import { data, dataBreve, percentuale, prezzo, punti, verso } from "@/lib/formato";
import { eta } from "@/lib/archivio";

// Ricalcolo a ogni richiesta: i file in `dati/` cambiano quando gira l'aggiornamento.
export const dynamic = "force-dynamic";

const COLORE_RUOLO: Record<string, string> = {
  guida: "var(--gold)",
  "controllo-riuscito": "var(--green)",
  "controllo-fallito": "var(--red)",
};

const ETICHETTA_RUOLO: Record<string, string> = {
  guida: "caso guida",
  "controllo-riuscito": "controllo, riuscito",
  "controllo-fallito": "controllo, fallito",
};

export default async function Cruscotto() {
  const c = await costruisciCruscotto();
  const guida = c.titoli.find((t) => t.titolo.ruolo === "guida");
  const rilevanti = notizieRilevanti(c.notizie).slice(0, 8);

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">Cambio di management come segnale</h1>
        <p className="page-sub">
          Dati aggiornati ogni giorno su aziende che hanno cambiato vertice o azionista di
          controllo, con la misura di quanto quel cambio abbia davvero spostato il prezzo.
        </p>
      </div>

      <div className="sezione">
        <Avviso grave titolo="Quello che i dati dicono della tesi di partenza.">
          Sul caso guida, TIM, la strategia «compra a ogni cambio di amministratore delegato e
          tieni fino al successivo» ha reso <strong>+60,3%</strong> in 4,7 anni, contro{" "}
          <strong>+100%</strong> del semplice comprare e tenere lo stesso titolo e{" "}
          <strong>+106%</strong> dell&apos;indice di Milano nello stesso periodo. Su dieci anni
          TIM ha reso <strong>circa zero</strong> contro il <strong>+350%</strong> del FTSE MIB
          a dividendi reinvestiti. Su undici eventi di management misurati, l&apos;unico
          statisticamente significativo attribuibile al lavoro di un amministratore delegato è{" "}
          <strong>negativo</strong>: −20% alla presentazione del piano del 7 marzo 2024. Il
          rialzo del titolo è arrivato dalla cessione della rete e dal cambio di azionista, non
          dal cambio di gestione.{" "}
          <a href="/metodo" style={{ textDecoration: "underline" }}>
            Come è stato misurato
          </a>
          .
        </Avviso>
      </div>

      {guida?.serie ? (
        <div className="sezione">
          <div className="card">
            <div className="card-testa">
              <div>
                <div className="card-titolo">{guida.titolo.nome} contro l&apos;indice, ultimi 5 anni</div>
                <div className="card-sub">
                  Base 100. Le linee verticali sono gli eventi registrati; quelle rosse sono
                  eventi in cui succedeva anche altro, quindi il movimento non è attribuibile
                  al cambio di management.
                </div>
              </div>
              <Badge testo={`aggiornato ${eta(guida.serie.scaricataIl)}`} colore="var(--green)" />
            </div>
            <div style={{ marginTop: 14 }}>
              <Grafico
                serie={guida.serie}
                benchmark={c.benchmark}
                eventi={guida.eventi}
                da={new Date(Date.now() - 5 * 365 * 86_400_000).toISOString().slice(0, 10)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="sezione">
        <div className="sezione-titolo">Titoli monitorati</div>
        <p className="sezione-sub">
          L&apos;elenco contiene di proposito anche cambi di management che non hanno prodotto
          nulla. Un elenco di soli casi riusciti insegnerebbe la lezione sbagliata.
        </p>

        <div className="tabella-scroll">
          <table className="tab">
            <thead>
              <tr>
                <th>Titolo</th>
                <th>Mandato in corso</th>
                <th className="num">Prezzo</th>
                <th className="num">12 mesi</th>
                <th className="num">contro l&apos;indice</th>
                <th style={{ minWidth: 170 }}>Punteggio di attenzione</th>
              </tr>
            </thead>
            <tbody>
              {c.titoli.map((t) => (
                <tr key={t.titolo.simbolo}>
                  <td>
                    <div style={{ fontWeight: 550 }}>
                      {t.titolo.ruolo === "guida" ? (
                        <a href="/tim" style={{ textDecoration: "underline" }}>
                          {t.titolo.nome}
                        </a>
                      ) : (
                        t.titolo.nome
                      )}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <Badge testo={ETICHETTA_RUOLO[t.titolo.ruolo]} colore={COLORE_RUOLO[t.titolo.ruolo]} />
                    </div>
                  </td>
                  <td>
                    {t.ultimoEvento ? (
                      <>
                        <div style={{ fontSize: 13 }}>{t.ultimoEvento.titolo}</div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                          in carica dal {dataBreve(t.ultimoEvento.dataAnnuncio)} · {t.ultimoEvento.tier}
                        </div>
                        {/* L'evento più recente non è quasi mai un cambio di vertice: dirlo
                            evita di attribuire alla gestione un movimento che non è suo. */}
                        {t.eventoPiuRecente && t.eventoPiuRecente.id !== t.ultimoEvento.id ? (
                          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 5, fontStyle: "italic" }}>
                            evento più recente, non di gestione: {t.eventoPiuRecente.titolo} (
                            {dataBreve(t.eventoPiuRecente.dataAnnuncio)})
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="neutro">nessuno registrato</span>
                    )}
                  </td>
                  <td className="num">
                    {t.indicatori ? prezzo(t.indicatori.ultimo, t.indicatori.valuta) : "—"}
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {t.indicatori?.ultimaData ? dataBreve(t.indicatori.ultimaData) : ""}
                    </div>
                  </td>
                  <td className={`num ${verso(t.indicatori?.rendimenti["12m"] ?? null)}`}>
                    {percentuale(t.indicatori?.rendimenti["12m"] ?? null)}
                  </td>
                  <td className={`num ${verso(t.indicatori?.rendimentiRelativi["12m"] ?? null)}`}>
                    {punti(t.indicatori?.rendimentiRelativi["12m"] ?? null)}
                  </td>
                  <td>
                    <BarraPunteggio punteggio={t.punteggio} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="fonte">
          Il punteggio misura quanto un caso somiglia alle condizioni che la letteratura
          associa ai turnaround riusciti. <strong>Non è un consiglio di acquisto</strong> e non
          ha alcun potere predittivo dimostrato: serve a ordinare l&apos;attenzione.
        </div>
      </div>

      {guida?.indicatori ? (
        <div className="sezione">
          <div className="sezione-titolo">Il caso guida oggi</div>
          <div className="metriche">
            <Metrica
              nome="Prezzo"
              valore={prezzo(guida.indicatori.ultimo, guida.indicatori.valuta)}
              nota={`chiusura del ${dataBreve(guida.indicatori.ultimaData)}`}
            />
            <Metrica
              nome="12 mesi contro l'indice"
              valore={punti(guida.indicatori.rendimentiRelativi["12m"])}
              colore={verso(guida.indicatori.rendimentiRelativi["12m"])}
            />
            <Metrica
              nome="5 anni contro l'indice"
              valore={punti(guida.indicatori.rendimentiRelativi["5a"])}
              nota="l'indice è di prezzo: il confronto favorisce il titolo"
              colore={verso(guida.indicatori.rendimentiRelativi["5a"])}
            />
            <Metrica
              nome="Volatilità annua"
              valore={percentuale(guida.indicatori.volatilita250)}
              nota="ultime 250 sedute"
            />
            <Metrica
              nome="Massimo ribasso"
              valore={percentuale(guida.indicatori.drawdownMassimo?.valore ?? null)}
              nota={
                guida.indicatori.drawdownMassimo
                  ? `dal ${dataBreve(guida.indicatori.drawdownMassimo.da)} al ${dataBreve(guida.indicatori.drawdownMassimo.a)}`
                  : null
              }
              colore="giu"
            />
            <Metrica
              nome="Distanza dalla media a 200"
              valore={percentuale(guida.indicatori.distanzaMa200)}
              colore={verso(guida.indicatori.distanzaMa200)}
            />
          </div>
        </div>
      ) : null}

      {rilevanti.length ? (
        <div className="sezione">
          <div className="sezione-titolo">Notizie da leggere a mano</div>
          <p className="sezione-sub">
            Titoli che contengono parole di governance o di operazione straordinaria.{" "}
            <strong>Non sono fatti societari accertati</strong>: un titolo di giornale non lo è
            finché non c&apos;è il comunicato. Servono a sapere dove guardare.
          </p>
          <div className="card">
            {rilevanti.map((n, i) => (
              <div key={n.url} style={{ paddingTop: i ? 11 : 0, paddingBottom: 11, borderBottom: i === rilevanti.length - 1 ? 0 : "1px solid var(--hairline)" }}>
                <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 500 }}>
                  {n.titolo}
                </a>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                  {n.editore ? <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{n.editore}</span> : null}
                  {n.pubblicata ? (
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>· {dataBreve(new Date(n.pubblicata).toISOString().slice(0, 10))}</span>
                  ) : null}
                  {n.segnali.length ? <Badge testo="governance" colore="var(--gold)" /> : null}
                  {n.straordinarie.length ? <Badge testo="operazione straordinaria" colore="var(--purple)" /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sezione">
        <StatoFonti fonti={c.istantanea?.fonti ?? []} generataIl={c.istantanea?.generataIl ?? null} />
        {!c.istantanea ? (
          <div style={{ marginTop: 12 }}>
            <Avviso grave titolo="Nessun aggiornamento registrato.">
              Esegui <code>npm run aggiorna</code> per scaricare i dati.
            </Avviso>
          </div>
        ) : null}
        <div className="fonte">Pagina generata il {data(c.generatoIl)}.</div>
      </div>
    </main>
  );
}
