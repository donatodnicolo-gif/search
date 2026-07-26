import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import {
  aiConfigurata,
  COLORE_PRIORITA,
  COLORE_TIPO_OSSERVAZIONE,
  datiPerAI,
  ETICHETTA_TIPO_OSSERVAZIONE,
  ricomponi,
  type DatiPerAI,
} from "@/lib/ai-trend";
import { chiediLetturaAI, eliminaLettura } from "@/lib/azioni-vendite";
import { prisma } from "@/lib/db";
import { euro, iso } from "@/lib/dominio";
import { ETICHETTA_FINESTRA, FINESTRE } from "@/lib/vendite";

export const dynamic = "force-dynamic";

export default async function TrendAiPage({
  searchParams,
}: {
  searchParams: Promise<{ lettura?: string; giorni?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const giorni = FINESTRE.includes(Number(sp.giorni) as (typeof FINESTRE)[number])
    ? Number(sp.giorni)
    : 90;

  const [storico, dati] = await Promise.all([
    prisma.letturaTrend.findMany({ orderBy: { creataIl: "desc" }, take: 10 }),
    datiPerAI(giorni),
  ]);

  const scelta = sp.lettura ? storico.find((l) => l.id === sp.lettura) : storico[0];
  const lettura = scelta ? ricomponi(scelta) : null;
  const datiDellaLettura: DatiPerAI | null = scelta
    ? (() => {
        try {
          return JSON.parse(scelta.dati) as DatiPerAI;
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="layout">
      <Sidebar attiva="trend-ai" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Trend con AI</h1>
            <p className="page-sub">
              Una lettura del venduto scritta dal modello sui numeri già calcolati dall&apos;app. L&apos;AI non
              somma e non esegue: interpreta e propone, decidere resta un gesto umano.
            </p>
          </div>
          <form action={chiediLetturaAI} className="riga-azione">
            <select name="giorni" defaultValue={String(giorni)} aria-label="Periodo da leggere">
              {FINESTRE.map((g) => (
                <option key={g} value={g}>
                  {ETICHETTA_FINESTRA[g]}
                </option>
              ))}
            </select>
            <button className="btn" type="submit" disabled={!aiConfigurata()}>
              Chiedi la lettura
            </button>
          </form>
        </div>

        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}

        {!aiConfigurata() && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Chiave OpenAI non configurata: aggiungi <code>OPENAI_API_KEY</code> (e se vuoi{" "}
              <code>OPENAI_MODEL</code>) alle variabili d&apos;ambiente dell&apos;app. Senza chiave la pagina resta
              utile: qui sotto c&apos;è il pacchetto di numeri che verrebbe mandato al modello.
            </span>
          </div>
        )}

        {dati.qualitaDato.righeVendute === 0 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Nel periodo non c&apos;è nessuna vendita registrata: qualunque lettura sarebbe aria fritta. Importa
              il venduto da <Link href="/vendite">Vendite &amp; trend</Link>.
            </span>
          </div>
        )}

        {lettura && scelta && (
          <>
            <div className="scheda">
              <div className="scheda-titolo">
                Lettura del {iso(scelta.creataIl)} · periodo {iso(scelta.dal)} → {iso(scelta.al)} · modello{" "}
                {scelta.modello}
              </div>
              <p className="lettura-sintesi">{lettura.sintesi}</p>
            </div>

            {lettura.osservazioni.length > 0 && (
              <div className="griglia-osservazioni">
                {lettura.osservazioni.map((o, i) => (
                  <div className="scheda osservazione" key={i}>
                    <Badge
                      testo={ETICHETTA_TIPO_OSSERVAZIONE[o.tipo] ?? o.tipo}
                      colore={COLORE_TIPO_OSSERVAZIONE[o.tipo] ?? "var(--text-tertiary)"}
                    />
                    <h3 className="osservazione-titolo">{o.titolo}</h3>
                    <p className="osservazione-testo">{o.spiegazione}</p>
                    {o.numeri && <p className="osservazione-numeri">{o.numeri}</p>}
                  </div>
                ))}
              </div>
            )}

            {lettura.azioni.length > 0 && (
              <div className="scheda">
                <div className="scheda-titolo">Azioni proposte — nessuna viene eseguita in automatico</div>
                <ul className="lista-azioni">
                  {lettura.azioni.map((a, i) => (
                    <li key={i}>
                      <span className="azione-priorita" style={{ color: COLORE_PRIORITA[a.priorita] ?? "var(--text-tertiary)" }}>
                        {a.priorita}
                      </span>
                      <div>
                        <div className="cella-nome">{a.titolo}</div>
                        <div className="cella-sub">
                          {a.area} · {a.perche}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {lettura.domande.length > 0 && (
              <div className="scheda">
                <div className="scheda-titolo">Cosa serve sapere per decidere meglio</div>
                <ul className="lista-domande">
                  {lettura.domande.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="scheda">
              <div className="scheda-titolo">I numeri dati al modello</div>
              <p className="page-sub" style={{ marginBottom: 12 }}>
                Si conservano insieme alla lettura: a mesi di distanza si può verificare su quali dati era
                fondata.
              </p>
              <details>
                <summary className="dettagli-summary">Mostra il pacchetto</summary>
                <pre className="codice-blocco">{JSON.stringify(datiDellaLettura ?? dati, null, 2)}</pre>
              </details>
              <form action={eliminaLettura.bind(null, scelta.id)} style={{ marginTop: 14 }}>
                <button className="btn btn-secondario small" type="submit">
                  Elimina questa lettura
                </button>
              </form>
            </div>
          </>
        )}

        {!lettura && (
          <div className="scheda">
            <div className="scheda-titolo">Numeri pronti per la lettura ({ETICHETTA_FINESTRA[giorni]})</div>
            <div className="kpi-riga" style={{ marginBottom: 8 }}>
              <div className="kpi">
                <div className="kpi-valore">{euro(dati.totali.ricavo)}</div>
                <div className="kpi-etichetta">Ricavo · {dati.totali.variazioneRicavo}</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{dati.totali.pezzi}</div>
                <div className="kpi-etichetta">Pezzi · {dati.totali.variazionePezzi}</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{dati.riordino.articoliDaRiordinare}</div>
                <div className="kpi-etichetta">Articoli da riordinare</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{dati.riordino.inRottura.length}</div>
                <div className="kpi-etichetta">Sotto il lead time</div>
              </div>
            </div>
            <details>
              <summary className="dettagli-summary">Mostra il pacchetto completo</summary>
              <pre className="codice-blocco">{JSON.stringify(dati, null, 2)}</pre>
            </details>
          </div>
        )}

        {storico.length > 1 && (
          <div className="scheda">
            <div className="scheda-titolo">Letture precedenti</div>
            <table>
              <tbody>
                {storico.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/trend-ai?lettura=${l.id}`} className="cella-nome">
                        {iso(l.creataIl)}
                      </Link>
                      <div className="cella-sub">
                        {iso(l.dal)} → {iso(l.al)} · {l.modello}
                      </div>
                    </td>
                    <td className="cella-muta">{l.sintesi.slice(0, 160)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
