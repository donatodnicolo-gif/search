/**
 * Metodo — come si misura, cosa si è trovato, cosa servirebbe per fidarsi.
 *
 * Esiste perché un punteggio senza metodo visibile è un oracolo. Qui c'è la formula, la
 * regola sui dati mancanti, il verdetto dell'analisi avversaria e la condizione precisa
 * che renderebbe la strategia credibile.
 */

import { costruisciCruscotto } from "@/lib/vista";
import { Avviso, DettaglioPunteggio } from "@/componenti/pezzi";
import { COPERTURA_MINIMA, PESI_BLOCCHI } from "@/lib/punteggio";

export const dynamic = "force-dynamic";

export default async function Metodo() {
  const c = await costruisciCruscotto();
  const guida = c.titoli.find((t) => t.titolo.ruolo === "guida");

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">Metodo</h1>
        <p className="page-sub">
          Come vengono calcolati i numeri di questa app, cosa è stato trovato misurando il caso
          guida, e a quali condizioni la strategia meriterebbe capitale.
        </p>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Il verdetto dell&apos;analisi avversaria</div>
        <p className="sezione-sub">
          Cinque analisi indipendenti sono state sottoposte a un revisore ostile, che ne ha
          verificato le affermazioni con calcoli propri. Questo è il risultato.
        </p>
        <div className="card">
          <ul style={{ margin: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 11, fontSize: 14, lineHeight: 1.55 }}>
            <li>
              Su TIM, in dieci anni e undici eventi, <strong>nessun cambio di amministratore
              delegato ha prodotto un rendimento anomalo statisticamente distinguibile da
              zero.</strong> I due eventi significativi sono l&apos;offerta di KKR del novembre
              2021 (+32%) e il piano industriale del marzo 2024 (<strong>−20%</strong>, t =
              −5,97): il primo è un compratore, il secondo è l&apos;unico attribuibile al
              lavoro del management, ed è negativo.
            </li>
            <li>
              Il rialzo del +240% da luglio 2024 viene da <strong>cessione della rete, cambio
              dell&apos;azionista di controllo e offerta pubblica</strong>: è merger arbitrage e
              situazioni speciali, non gestione d&apos;impresa.
            </li>
            <li>
              Uno degli errori più costosi era nascosto in un confronto: usando l&apos;indice a
              dividendi reinvestiti invece dell&apos;indice di prezzo, TIM{" "}
              <strong>perde su tutte le finestre temporali</strong>, inclusa quella scelta per
              farla vincere.
            </li>
            <li>
              Il campione necessario non esiste: servirebbero{" "}
              <strong>almeno 40 eventi indipendenti fuori campione</strong>, e nel settore
              telecomunicazioni europeo in vent&apos;anni non ce ne sono abbastanza.
            </li>
          </ul>
        </div>
        <div style={{ marginTop: 14 }}>
          <Avviso grave titolo="Conclusione del revisore.">
            «Il prodotto giusto non è un fondo: è un motore di studio degli eventi e di igiene
            del dato, che dice onestamente <em>questo evento non ha effetto misurabile</em>.» È
            quello che questa app fa.
          </Avviso>
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">La condizione che cambierebbe il verdetto</div>
        <div className="card">
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Un test su <strong>almeno 150 cambi di amministratore delegato in Europa fra il
            2005 e il 2020</strong>, su un universo che comprenda anche le società uscite dal
            listino, quelle scalate e quelle fallite; con ingresso alla chiusura del giorno{" "}
            <em>successivo</em> all&apos;annuncio; con il rendimento in eccesso misurato a
            quattro fattori e con variabili di settore; che mostri un risultato positivo il cui
            intervallo di confidenza al 95% <strong>escluda lo zero dopo costi di transazione e
            costo del prestito titoli</strong>; con mediana e percentuale di successi positive;
            stabile se i pesi si muovono del 50%. E soprattutto:{" "}
            <strong>
              che il risultato sopravviva all&apos;esclusione di ogni caso in cui, entro 24
              mesi, sia arrivata un&apos;offerta pubblica, un cambio dell&apos;azionista di
              controllo o una cessione superiore al 20% del valore d&apos;impresa.
            </strong>
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
            Se il risultato sopravvive a quest&apos;ultima esclusione, la strategia esiste. Se
            sparisce, va chiamata col suo nome: <strong>situazioni speciali e merger
            arbitrage</strong> — cosa legittima, ma molto affollata e con rischi diversi.
          </p>
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Come è costruito il punteggio</div>
        <p className="sezione-sub">
          Cinque blocchi con pesi fissati in anticipo per ragionamento economico e{" "}
          <strong>mai ottimizzati sui dati</strong>: con poche decine di eventi, ottimizzarli
          sarebbe sovradattamento per costruzione.
        </p>
        <div className="tabella-scroll">
          <table className="tab" style={{ minWidth: 420 }}>
            <thead>
              <tr>
                <th>Blocco</th>
                <th className="num">Peso</th>
                <th>Che domanda fa</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Evento di management</td>
                <td className="num">{PESI_BLOCCHI.evento}%</td>
                <td>Quanto è informativo il cambio: uscita forzata, successore esterno, quanto è recente</td>
              </tr>
              <tr>
                <td>Fondamentali</td>
                <td className="num">{PESI_BLOCCHI.fondamentali}%</td>
                <td>L&apos;azienda ha il tempo e la cassa per fare il turnaround, o li incassano i creditori</td>
              </tr>
              <tr>
                <td>Valutazione</td>
                <td className="num">{PESI_BLOCCHI.valutazione}%</td>
                <td>Il prezzo sconta già la ripresa</td>
              </tr>
              <tr>
                <td>Momentum</td>
                <td className="num">{PESI_BLOCCHI.momentum}%</td>
                <td>Il mercato se ne sta accorgendo</td>
              </tr>
              <tr>
                <td>Notizie</td>
                <td className="num">{PESI_BLOCCHI.sentiment}%</td>
                <td>Quanto se ne parla, senza dedurne la direzione</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16 }}>
          <Avviso titolo="Due regole vincolanti sui dati mancanti." icona="·">
            <strong>Una variabile senza dati viene esclusa, non vale zero</strong>: i pesi si
            rinormalizzano sulle variabili disponibili, e la quota di dati effettivamente
            coperta viaggia sempre accanto al punteggio. <strong>Sotto il{" "}
            {COPERTURA_MINIMA * 100}% di copertura non viene mostrato alcun numero</strong>, ma
            la scritta «da valutare»: un punteggio costruito su un terzo dei dati sembra
            identico a uno costruito su tutti, ed è esattamente questa l&apos;illusione da
            evitare.
          </Avviso>
        </div>
      </div>

      {guida?.punteggio ? (
        <div className="sezione">
          <div className="sezione-titolo">Il punteggio del caso guida, variabile per variabile</div>
          <p className="sezione-sub">
            Ogni riga dice il peso, il valore normalizzato e da dove viene il dato. Le variabili
            marcate «esclusa» non sono zero: semplicemente non ci sono, e il peso è stato
            ridistribuito.
          </p>
          <DettaglioPunteggio punteggio={guida.punteggio} />
        </div>
      ) : null}

      <div className="sezione">
        <div className="sezione-titolo">Cosa questa app non fa</div>
        <div className="card">
          <ul style={{ margin: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 9, fontSize: 14, lineHeight: 1.55 }}>
            <li>
              <strong>Non deduce fatti societari dai titoli di giornale.</strong> Una notizia
              con la parola «nomina» non è una nomina finché non c&apos;è il comunicato: le
              notizie vengono elencate perché siano lette a mano, non convertite in segnali.
            </li>
            <li>
              <strong>Non calcola un tono delle notizie.</strong> Sarebbe ricavare un dato
              critico dal testo libero. Il blocco resta scoperto e questo abbassa la copertura,
              come deve.
            </li>
            <li>
              <strong>Non esegue ordini e non si collega ad alcun intermediario.</strong>
            </li>
            <li>
              <strong>Non usa un linguaggio prescrittivo.</strong> Nessun «comprare», nessun
              «vendere», nessun prezzo obiettivo: solo descrizioni di eventi e misure.
            </li>
            <li>
              <strong>Non riempie i buchi.</strong> Se una fonte cade, il valore sparisce e
              viene dichiarato: non viene sostituito con l&apos;ultimo dato noto, che è il modo
              più comune in cui un cruscotto mente.
            </li>
          </ul>
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Vincoli di legge</div>
        <div className="card">
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            In Italia la gestione di portafogli, la gestione collettiva del risparmio e la
            consulenza in materia di investimenti sono attività riservate dal Testo unico della
            finanza: richiedono autorizzazione e una forma societaria vigilata, e
            l&apos;esercizio abusivo è un reato. Le raccomandazioni di investimento diffuse al
            pubblico ricadono inoltre nel regolamento europeo sugli abusi di mercato, che impone
            identità dell&apos;autore, metodologia, conflitti d&apos;interesse e storico delle
            raccomandazioni.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>
            Per questo l&apos;app è uno <strong>strumento di ricerca a uso interno</strong>.
            Prima di gestire denaro di terzi o di pubblicare qualcosa che somigli a una
            raccomandazione, serve il parere di un legale e, con ogni probabilità,
            un&apos;autorizzazione o una partnership con un soggetto vigilato.
          </p>
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">I documenti dell&apos;analisi</div>
        <p className="sezione-sub">
          Tutto il lavoro è nella cartella <code>docs/analisi/</code> del progetto: cinque
          analisi indipendenti, il verdetto del revisore ostile, i nove bilanci letti da un team
          e i KPI di borsa ricalcolati.
        </p>
      </div>
    </main>
  );
}
