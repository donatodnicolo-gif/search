/**
 * Dati — da dove viene ogni numero, e quali fonti sono state provate e scartate.
 *
 * Serve a rendere l'app verificabile: chi legge deve poter risalire a ogni valore, e sapere
 * quali strade sono già state percorse senza esito.
 */

import { costruisciCruscotto } from "@/lib/vista";
import { StatoFonti, Badge, Avviso } from "@/componenti/pezzi";
import { FONTI_DOCUMENTATE } from "@/lib/fonti";
import { dataBreve } from "@/lib/formato";
import { eta } from "@/lib/archivio";

export const dynamic = "force-dynamic";

const SCARTATE = [
  { fonte: "Stooq (CSV)", motivo: "Risponde con una verifica JavaScript anti-robot, non con i dati. Inutilizzabile da un processo automatico." },
  { fonte: "Yahoo quoteSummary", motivo: "HTTP 401, richiede cookie e token di sessione. Il percorso «fundamentals-timeseries» invece passa." },
  { fonte: "Alpha Vantage", motivo: "La chiave dimostrativa è rifiutata sui dati veri; il piano gratuito dà 25 richieste al giorno." },
  { fonte: "Twelve Data, Financial Modeling Prep, EODHD", motivo: "Richiedono tutte una chiave a pagamento." },
  { fonte: "Borsa Italiana — RSS", motivo: "404 su tutti i percorsi provati: non esiste un feed pubblico." },
  { fonte: "eMarket Storage (comunicati regolamentati)", motivo: "Nessun feed dichiarato; accessibile solo raschiando l'HTML." },
  { fonte: "Consob — partecipazioni rilevanti", motivo: "Portale senza tabelle né file scaricabili: nessun download strutturato." },
  { fonte: "SEC EDGAR per TIM S.p.A.", motivo: "TIM si è deregistrata nel luglio 2019: l'ultimo bilancio depositato è quello del 2018. Attenzione: la società brasiliana TIM S.A. continua a depositare, e una ricerca per nome la scambia per la capogruppo." },
];

export default async function Dati() {
  const c = await costruisciCruscotto();

  return (
    <main className="wrap">
      <div>
        <h1 className="page-title">Dati</h1>
        <p className="page-sub">
          Da dove viene ogni numero, quanto è vecchio, e quali fonti sono state provate senza
          successo — così nessuno le riprova pensando che funzionino.
        </p>
      </div>

      <div className="sezione">
        <StatoFonti fonti={c.istantanea?.fonti ?? []} generataIl={c.istantanea?.generataIl ?? null} />
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Serie storiche in archivio</div>
        <div className="tabella-scroll">
          <table className="tab">
            <thead>
              <tr>
                <th>Titolo</th>
                <th>Simbolo</th>
                <th className="num">Sedute</th>
                <th>Periodo coperto</th>
                <th>Scaricata</th>
                <th>Rettifica</th>
              </tr>
            </thead>
            <tbody>
              {c.titoli.map((t) => (
                <tr key={t.titolo.simbolo}>
                  <td>{t.titolo.nome}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12.5 }}>{t.titolo.simbolo}</td>
                  <td className="num">{t.serie?.barre.length ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                    {t.serie ? `${dataBreve(t.serie.barre[0]?.data)} → ${dataBreve(t.serie.barre.at(-1)?.data)}` : "—"}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{t.serie ? eta(t.serie.scaricataIl) : "—"}</td>
                  <td>
                    {t.serie?.fonte.includes("adjclose") ? (
                      <Badge testo="rettificata" colore="var(--green)" />
                    ) : (
                      <Badge testo="NON rettificata" colore="var(--red)" forte />
                    )}
                  </td>
                </tr>
              ))}
              {c.benchmark ? (
                <tr>
                  <td>FTSE MIB (riferimento)</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12.5 }}>{c.benchmark.simbolo}</td>
                  <td className="num">{c.benchmark.barre.length}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                    {dataBreve(c.benchmark.barre[0]?.data)} → {dataBreve(c.benchmark.barre.at(-1)?.data)}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{eta(c.benchmark.scaricataIl)}</td>
                  <td>
                    <Badge testo="indice di prezzo" colore="var(--orange)" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14 }}>
          <Avviso titolo="Il riferimento è un indice di prezzo." icona="!">
            Il FTSE MIB non include i dividendi reinvestiti, mentre i titoli sono rettificati
            per i dividendi. Ogni confronto con l&apos;indice mostrato in questa app{" "}
            <strong>favorisce il titolo</strong> di circa 3-4 punti percentuali all&apos;anno.
            Sui dieci anni il divario reale è quindi peggiore di quanto le tabelle facciano
            vedere.
          </Avviso>
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Fonti in uso</div>
        <div className="card">
          <ul style={{ margin: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
            {FONTI_DOCUMENTATE.map((f) => (
              <li key={f.url}>
                {f.titolo} —{" "}
                <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", color: "var(--text-secondary)" }}>
                  apri
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Fonti provate e scartate</div>
        <p className="sezione-sub">
          Verificate una per una con chiamate reali. Sono elencate perché non vengano
          reintrodotte per abitudine.
        </p>
        <div className="tabella-scroll">
          <table className="tab">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Fonte</th>
                <th>Perché non si può usare</th>
              </tr>
            </thead>
            <tbody>
              {SCARTATE.map((s) => (
                <tr key={s.fonte}>
                  <td style={{ fontWeight: 550 }}>{s.fonte}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{s.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sezione">
        <div className="sezione-titolo">Come si aggiorna</div>
        <div className="card">
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Il giro quotidiano si lancia con <code>npm run aggiorna</code> (aggiungere{" "}
            <code>-- --breve</code> per il solo ultimo anno). Scarica prezzi, fondamentali e
            notizie, e scrive l&apos;esito di <em>ogni</em> fonte in{" "}
            <code>dati/istantanea.json</code>: quello che si vede in cima a questa pagina è il
            risultato reale dell&apos;ultimo giro, non una spia sempre verde.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>
            Se una fonte fallisce, il file esistente <strong>non viene toccato</strong> e il
            fallimento viene dichiarato. È la differenza fra un dato vecchio riconoscibile come
            tale e un dato vecchio servito come fresco — che è il modo in cui un cruscotto fa
            perdere soldi senza che nessuno se ne accorga.
          </p>
        </div>
      </div>
    </main>
  );
}
