import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { dataBreve } from "@/lib/ordini";
import { CANALI, LISTE, lista, nomeCanale } from "@/lib/segmenti";
import {
  VARIABILI_AUTOMATICHE,
  preparaGiro,
  testoDaMandare,
  variabiliSconosciute,
} from "@/lib/automazioni";
import {
  aggiornaAutomazione,
  annullaMessaggiPronti,
  eliminaAutomazione,
  preparaGiroAutomazione,
  segnaInviati,
} from "@/app/actions";
import { TornaIndietro } from "@/components/TornaIndietro";

export const dynamic = "force-dynamic";

// La scheda di un'automazione: come è fatta, chi colpirebbe adesso (anteprima a
// vuoto, sempre visibile) e i messaggi già preparati.
export default async function SchedaAutomazione({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const a = await prisma.automazione.findUnique({ where: { id }, include: { scriptUsato: true } });
  if (!a) notFound();

  const script = await prisma.script.findMany({ orderBy: { nome: "asc" } });
  const { testo, dichiarate, valori } = testoDaMandare(a);
  const sconosciute = variabiliSconosciute(testo, dichiarate);

  const [messaggi, conteggi, anteprima] = await Promise.all([
    prisma.messaggioAutomazione.findMany({
      where: { automazioneId: id },
      orderBy: { preparatoIl: "desc" },
      take: 100,
    }),
    prisma.messaggioAutomazione.groupBy({
      by: ["stato"],
      where: { automazioneId: id },
      _count: { _all: true },
    }),
    // La prova a vuoto: cosa succederebbe premendo «Prepara» adesso.
    preparaGiro(a, true),
  ]);

  const perStato = Object.fromEntries(conteggi.map((c) => [c.stato, c._count._all]));
  const l = lista(a.lista);

  return (
    <main className="main">
      {/* «Il ritorno al punto esatto» (Libro UX&UI v1.5 §2) */}
      <TornaIndietro fallback="/automazioni" label="Tutte le automazioni" />

      <div className="page-head">
        <div>
          <h1 className="page-title">{a.nome}</h1>
          <p className="page-sub">
            {l ? l.nome : a.lista} · {nomeCanale(a.canale)}
            {a.descrizione ? ` · ${a.descrizione}` : ""}
          </p>
        </div>
        <form action={preparaGiroAutomazione}>
          <input type="hidden" name="id" value={a.id} />
          <button className="btn" type="submit" disabled={anteprima.preparati === 0}>
            Prepara {anteprima.preparati > 0 ? `${anteprima.preparati} messaggi` : "il giro"}
          </button>
        </form>
      </div>

      {sp.esito && <div className="avviso-ok">{sp.esito}</div>}
      {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
      {anteprima.errore && <div className="avviso-errore">{anteprima.errore}</div>}
      {sconosciute.length > 0 && (
        <div className="avviso-errore">
          Nel testo ci sono variabili che nessuno riempirà:{" "}
          <strong>{sconosciute.map((v) => `{{${v}}}`).join(", ")}</strong> — partirebbero scritte
          così come sono.{" "}
          {a.scriptUsato ? (
            <>
              Si dichiarano nello <Link href={`/script/${a.scriptId}`}>script</Link>.
            </>
          ) : (
            "Correggile nel testo qui sotto."
          )}
        </div>
      )}
      {a.scriptUsato && (
        <p className="esito-ricerca">
          Usa lo script <strong>{a.scriptUsato.nome}</strong>{" "}
          <Link href={`/script/${a.scriptId}`}>Aprilo →</Link>
        </p>
      )}

      {/* ---- Prova a vuoto ---- */}
      <div className="scheda">
        <div className="scheda-titolo">Se premi «Prepara» adesso</div>
        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{anteprima.esaminati.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Clienti nella lista esaminati</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{anteprima.preparati.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Messaggi che verrebbero preparati</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{(perStato.pronto ?? 0).toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Già pronti da mandare</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{(perStato.inviato ?? 0).toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Segnati come inviati</div>
          </div>
        </div>

        {anteprima.saltati.length > 0 && (
          <>
            <div className="scheda-titolo" style={{ marginTop: 6 }}>Chi resta fuori, e perché</div>
            <ul className="motivi-rischio">
              {anteprima.saltati.map((s) => (
                <li key={s.motivo}>
                  <strong>{s.quanti}</strong> — {s.motivo}
                </li>
              ))}
            </ul>
          </>
        )}

        {anteprima.messaggi.length > 0 && (
          <>
            <div className="scheda-titolo" style={{ marginTop: 16 }}>Come suonerebbe (primi 3)</div>
            {anteprima.messaggi.slice(0, 3).map((m) => (
              <blockquote key={m.chiave} className="testo-biglietto" style={{ marginBottom: 8 }}>
                <strong>{m.nome || m.recapito}</strong> · {m.recapito}
                {"\n"}
                {m.testo}
              </blockquote>
            ))}
          </>
        )}
      </div>

      {/* ---- Configurazione ---- */}
      <div className="scheda">
        <div className="scheda-titolo">Come è fatta</div>
        <form action={aggiornaAutomazione} className="modulo">
          <input type="hidden" name="id" value={a.id} />
          <div className="campo-modulo">
            <label htmlFor="nome">Nome</label>
            <input id="nome" name="nome" defaultValue={a.nome} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="canale">Canale</label>
            <select id="canale" name="canale" defaultValue={a.canale}>
              {CANALI.map((c) => (
                <option key={c.chiave} value={c.chiave}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label htmlFor="lista">A chi (lista)</label>
            <select id="lista" name="lista" defaultValue={a.lista}>
              {LISTE.map((x) => (
                <option key={x.chiave} value={x.chiave}>{x.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label htmlFor="descrizione">A cosa serve</label>
            <input id="descrizione" name="descrizione" defaultValue={a.descrizione} />
          </div>
          {a.canale === "email" && (
            <div className="campo-modulo largo">
              <label htmlFor="oggetto">Oggetto dell&apos;email</label>
              <input id="oggetto" name="oggetto" defaultValue={a.oggetto} />
            </div>
          )}

          {/* Lo script: si sceglie fra quelli scritti in /script. Il testo qui
              sotto resta come ripiego per chi non vuole crearne uno. */}
          <div className="campo-modulo largo">
            <label htmlFor="scriptId">Script da usare</label>
            <select id="scriptId" name="scriptId" defaultValue={a.scriptId ?? ""}>
              <option value="">— nessuno: uso il testo scritto qui sotto —</option>
              {script.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                  {x.attivo ? "" : " (sospeso)"}
                </option>
              ))}
            </select>
          </div>

          {/* I valori delle variabili dichiarate dallo script: uno per riga,
              con il predefinito già scritto dentro. */}
          {dichiarate.length > 0 && (
            <div className="campo-modulo largo">
              <label>Variabili di questo script</label>
              <div className="modulo" style={{ marginTop: 6 }}>
                {dichiarate.map((v) => (
                  <div className="campo-modulo" key={v.chiave}>
                    <label htmlFor={`valore_${v.chiave}`}>
                      {v.etichetta || v.chiave}
                      {v.obbligatoria ? " (obbligatoria)" : ""}
                    </label>
                    <input
                      id={`valore_${v.chiave}`}
                      name={`valore_${v.chiave}`}
                      defaultValue={valori[v.chiave] ?? ""}
                      placeholder={v.valore ? `predefinito: ${v.valore}` : `{{${v.chiave}}}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="campo-modulo largo">
            <label htmlFor="script">
              {a.scriptUsato ? "Testo scritto qui (non usato: vince lo script)" : "Testo del messaggio"}
            </label>
            <textarea id="script" name="script" rows={6} defaultValue={a.script} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="giorniSilenzio">Non riscrivere prima di (giorni)</label>
            <input id="giorniSilenzio" name="giorniSilenzio" type="number" min={0} defaultValue={a.giorniSilenzio} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="limiteGiro">Quanti messaggi per giro</label>
            <input id="limiteGiro" name="limiteGiro" type="number" min={1} max={2000} defaultValue={a.limiteGiro} />
          </div>
          <div className="campo-modulo largo">
            <label style={{ textTransform: "none", letterSpacing: 0, fontSize: 13.5, fontWeight: 400, color: "var(--text)" }}>
              <input type="checkbox" name="soloConsenso" defaultChecked={a.soloConsenso} style={{ marginRight: 8 }} />
              <strong>Solo chi ha dato il consenso</strong> — da togliere solo per messaggi di
              servizio su un ordine in corso, mai per una promozione
            </label>
            <label style={{ textTransform: "none", letterSpacing: 0, fontSize: 13.5, fontWeight: 400, color: "var(--text)", marginTop: 6 }}>
              <input type="checkbox" name="attiva" defaultChecked={a.attiva} style={{ marginRight: 8 }} />
              Automazione <strong>attiva</strong> (etichetta per chi la guarda: la preparazione
              resta comunque un gesto manuale)
            </label>
          </div>
          <div className="azioni-modulo campo-modulo largo">
            <button className="btn" type="submit">Salva</button>
          </div>
        </form>

        <p className="testo-guida" style={{ marginTop: 10 }}>
          Variabili del cliente, sempre disponibili:{" "}
          {VARIABILI_AUTOMATICHE.map((s, i) => (
            <span key={s.chiave}>
              {i > 0 ? " · " : ""}
              <code className="inline">{`{{${s.chiave}}}`}</code> {s.spiega}
            </span>
          ))}
          . Uno scritto male resta visibile nel testo — te ne accorgi nell&apos;anteprima, non dopo
          l&apos;invio.
        </p>
      </div>

      {/* ---- Messaggi preparati ---- */}
      <div className="scheda">
        <div className="scheda-titolo">
          Messaggi preparati{messaggi.length >= 100 ? " (ultimi 100)" : ""}
        </div>
        {messaggi.length === 0 ? (
          <p className="testo-guida">Nessun messaggio preparato finora.</p>
        ) : (
          <>
            <div className="filtri" style={{ marginBottom: 12 }}>
              <form action={segnaInviati}>
                <input type="hidden" name="id" value={a.id} />
                <button className="btn small" type="submit" disabled={!perStato.pronto}>
                  Segna tutti come inviati
                </button>
              </form>
              <form action={annullaMessaggiPronti}>
                <input type="hidden" name="id" value={a.id} />
                <button className="btn btn-secondario small" type="submit" disabled={!perStato.pronto}>
                  Annulla i pronti
                </button>
              </form>
              <a className="btn btn-secondario small" href={`/automazioni/${a.id}/csv`} download>
                Esporta CSV
              </a>
            </div>
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Destinatario</th>
                    <th>Messaggio</th>
                    <th>Stato</th>
                    <th>Preparato</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {messaggi.map((m) => (
                    <tr key={m.id}>
                      <td className="cella-nome">{m.nome || "—"}</td>
                      <td className="cella-muta">{m.destinatario}</td>
                      <td style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{m.testo}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            color:
                              m.stato === "inviato"
                                ? "var(--green)"
                                : m.stato === "annullato"
                                  ? "var(--text-tertiary)"
                                  : "var(--blue)",
                          }}
                        >
                          <span className="dot" />
                          {m.stato}
                        </span>
                        {m.motivo && <div className="cella-sub">{m.motivo}</div>}
                      </td>
                      <td className="cella-muta">{dataBreve(m.preparatoIl)}</td>
                      <td>
                        {m.stato === "pronto" && (
                          <form action={segnaInviati} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="messaggioId" value={m.id} />
                            <button className="btn btn-secondario small" type="submit">Inviato</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <form action={eliminaAutomazione}>
        <input type="hidden" name="id" value={a.id} />
        <button className="btn btn-secondario small" type="submit">Elimina automazione</button>
      </form>
    </main>
  );
}
