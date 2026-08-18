/**
 * Mandati — il monitoraggio stabile della tesi.
 *
 * Un tratto per ogni amministratore delegato, dalla nomina alla nomina del successore.
 * È la domanda giusta da fare a una strategia sul cambio di management: non «quanto ha
 * fatto il titolo negli ultimi 12 mesi», ma «quanto ha reso da quando comanda questa
 * persona, rispetto al mercato».
 *
 * In fondo c'è il riepilogo: quanti mandati hanno battuto l'indice. È il numero che decide
 * se la tesi sta in piedi, ed è calcolato su un campione che resta troppo piccolo per
 * concludere — cosa che la pagina dice invece di nascondere.
 */

import { tuttiIMandati } from "@/lib/vista";
import { Avviso, Badge, Metrica } from "@/componenti/pezzi";
import { dataBreve, numero, percentuale, prezzo, punti, verso } from "@/lib/formato";
import { trovaTitolo } from "@/lib/universo";
import { mediana } from "@/lib/statistica";

export const dynamic = "force-dynamic";

const ETICHETTA_RUOLO: Record<string, string> = {
  guida: "caso guida",
  "controllo-riuscito": "controllo, riuscito",
  "controllo-fallito": "controllo, fallito",
  recente: "cambio recente",
};

const COLORE_RUOLO: Record<string, string> = {
  guida: "var(--gold)",
  "controllo-riuscito": "var(--green)",
  "controllo-fallito": "var(--red)",
  recente: "var(--blue)",
};

export default async function Mandati() {
  const { mandati, benchmarkUsato, totalReturn } = await tuttiIMandati();

  // Il conteggio si fa solo sui mandati con un confronto calcolabile.
  const conEccesso = mandati.filter((m) => m.eccesso !== null);
  const vincenti = conEccesso.filter((m) => m.eccesso! > 0);
  const eccessi = conEccesso.map((m) => m.eccesso!);
  const eccessoMediano = mediana(eccessi);
  const eccessoMedio = eccessi.length ? eccessi.reduce((s, x) => s + x, 0) / eccessi.length : null;
  const conclusi = mandati.filter((m) => !m.inCorso);
  const inCorso = mandati.filter((m) => m.inCorso);

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">Mandati</h1>
        <p className="page-sub">
          Un tratto per ogni amministratore delegato, dal giorno dell&apos;annuncio della
          nomina fino a quella del successore. È il monitoraggio della tesi: quanto ha reso il
          titolo sotto ciascuna gestione, rispetto al mercato.
        </p>
      </div>

      <div className="sezione">
        <div className="metriche">
          <Metrica
            nome="Mandati misurati"
            valore={String(conEccesso.length)}
            nota={`${inCorso.length} in corso, ${conclusi.length} conclusi`}
          />
          <Metrica
            nome="Hanno battuto l'indice"
            valore={`${vincenti.length} su ${conEccesso.length}`}
            nota={conEccesso.length ? `${Math.round((vincenti.length / conEccesso.length) * 100)}% dei casi` : null}
            colore={vincenti.length * 2 > conEccesso.length ? "su" : "giu"}
          />
          <Metrica
            nome="Differenza mediana"
            valore={punti(eccessoMediano)}
            nota="rispetto all'indice, sul mandato intero"
            colore={verso(eccessoMediano)}
          />
          <Metrica
            nome="Differenza media"
            valore={punti(eccessoMedio)}
            nota="più esposta ai casi estremi della mediana"
            colore={verso(eccessoMedio)}
          />
        </div>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <Avviso grave titolo="Il campione è troppo piccolo per concludere.">
            Con {conEccesso.length} mandati non si può affermare nulla di statistico: servono
            almeno 40 casi indipendenti fuori campione, e per un risultato con un intervallo di
            confidenza credibile ne servirebbero oltre 60. Quello che segue è una{" "}
            <strong>descrizione di casi</strong>, non una stima. Va letto per capire come si
            comportano i turnaround, non per dedurne una probabilità.
          </Avviso>

          {totalReturn ? (
            <Avviso titolo="Confronto a dividendi reinvestiti." icona="=">
              L&apos;indice di riferimento è <strong>{benchmarkUsato}</strong>, che reinveste i
              dividendi come fanno le serie dei titoli. Non è un dettaglio: il FTSE MIB puro è
              un indice di <em>prezzo</em> e su dieci anni segna +219% contro il{" "}
              <strong>+348%</strong> della versione a dividendi reinvestiti. Usare quello
              regalerebbe a ogni titolo 3-4 punti l&apos;anno, e su un mandato lungo bastano a
              far sembrare vincente una gestione che ha perso contro il mercato.
            </Avviso>
          ) : (
            <Avviso grave titolo="Confronto contro un indice di prezzo.">
              La serie a dividendi reinvestiti non è disponibile, quindi il confronto usa{" "}
              <strong>{benchmarkUsato}</strong>, che esclude i dividendi:{" "}
              <strong>tutte le differenze qui sotto favoriscono i titoli</strong> di circa 3-4
              punti l&apos;anno. Esegui <code>npm run aggiorna</code> per scaricarla.
            </Avviso>
          )}
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Ogni mandato, misurato</div>
        <p className="sezione-sub">
          I mandati in corso sono in cima. «Differenza» è quanto il titolo ha fatto meglio o
          peggio dell&apos;indice nello stesso identico periodo — è la colonna che conta,
          perché un +80% in un mercato che fa +97% è una perdita relativa.
        </p>

        <div className="tabella-scroll">
          <table className="tab" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Chi guida</th>
                <th>Periodo</th>
                <th className="num">Titolo</th>
                <th className="num">Indice</th>
                <th className="num">Differenza</th>
                <th className="num">Annuo</th>
                <th className="num">Volatilità</th>
                <th className="num">Ribasso max</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {mandati.map((m) => {
                const titolo = trovaTitolo(m.simbolo);
                return (
                  <tr key={m.eventoId}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{m.nomeTitolo}</div>
                      <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>{m.chi}</div>
                      {titolo ? (
                        <div style={{ marginTop: 5 }}>
                          <Badge testo={ETICHETTA_RUOLO[titolo.ruolo]} colore={COLORE_RUOLO[titolo.ruolo]} />
                        </div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                      {dataBreve(m.dataInizio)}
                      <div style={{ color: "var(--text-tertiary)" }}>
                        {m.inCorso ? "in corso" : `→ ${dataBreve(m.dataFine)}`} · {numero(m.anni, 1)} anni
                      </div>
                    </td>
                    <td className={`num ${verso(m.rendimento)}`}>
                      {percentuale(m.rendimento)}
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {prezzo(m.prezzoIniziale, m.valuta)} → {prezzo(m.prezzoFinale, m.valuta)}
                      </div>
                    </td>
                    <td className={`num ${verso(m.rendimentoBenchmark)}`}>{percentuale(m.rendimentoBenchmark)}</td>
                    <td className={`num ${verso(m.eccesso)}`} style={{ fontWeight: 600 }}>
                      {punti(m.eccesso)}
                    </td>
                    <td className="num">{percentuale(m.cagr)}</td>
                    <td className="num">{percentuale(m.volatilita)}</td>
                    <td className="num giu">{percentuale(m.drawdown?.valore ?? null)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Badge testo={m.tier} />
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-tertiary)" }}>
                        {m.forzato === null ? "uscita non accertata" : m.forzato ? "uscita forzata" : "uscita ordinata"}
                        <br />
                        {m.successoreEsterno === null
                          ? "provenienza non accertata"
                          : m.successoreEsterno
                            ? "successore esterno"
                            : "successore interno"}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="fonte">
          Il periodo parte dal giorno dell&apos;<strong>annuncio</strong> della nomina. In un
          test vero l&apos;ingresso andrebbe fissato alla chiusura del giorno{" "}
          <em>successivo</em>, perché la notizia esce a mercati aperti: qui i rendimenti sono
          quindi leggermente ottimistici. Sono inoltre lordi, senza commissioni né spread, e
          l&apos;indice di confronto è di prezzo, il che favorisce ancora i titoli di 3-4 punti
          l&apos;anno.
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Cosa si vede, guardando la colonna «Differenza»</div>
        <div className="card">
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            La domanda della tesi è: <em>arrivare un nuovo amministratore delegato fa battere
            il mercato?</em> La risposta, su questo campione, è che{" "}
            <strong>
              {vincenti.length} mandati su {conEccesso.length} hanno superato l&apos;indice
            </strong>{" "}
            e la differenza mediana è di {punti(eccessoMediano)}. Con numeri del genere e un
            campione così piccolo, la distinzione fra «funziona» e «è caso» non è ancora
            decidibile.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 11 }}>
            La cosa più utile qui non è la media: è guardare i singoli casi e chiedersi{" "}
            <strong>cosa è successo davvero in quel mandato</strong>. Dove il titolo ha corso,
            quasi sempre c&apos;è di mezzo una cessione, un compratore o un vento di settore —
            non una decisione di gestione. È il motivo per cui questa app separa gli eventi di
            management da quelli di controllo e di perimetro.
          </p>
        </div>
      </div>
    </main>
  );
}
