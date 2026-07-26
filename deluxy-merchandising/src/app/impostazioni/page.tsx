import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import {
  attivaNegozio,
  eliminaChiaveAiAzione,
  eliminaNegozio,
  salvaChiaveAiAzione,
  salvaNegozioAzione,
  salvaPromptCategorieAzione,
  verificaNegozioAzione,
} from "@/lib/azioni-negozi";
import { cifraturaConfigurata } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { CATEGORIE, etichettaCategoria, iso } from "@/lib/dominio";
import { elencoNegozi, PERMESSI, VERSIONE_API } from "@/lib/negozi";
import { statoSegreto } from "@/lib/segreti";

export const dynamic = "force-dynamic";

const COLORE_LIVELLO: Record<string, string> = {
  obbligatorio: "var(--red)",
  consigliato: "var(--gold-strong)",
  opzionale: "var(--text-tertiary)",
};

export default async function ImpostazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const [negozi, chiaveAi, righePrompt] = await Promise.all([
    elencoNegozi(),
    statoSegreto("OPENAI_API_KEY"),
    prisma.promptCategoria.findMany(),
  ]);
  const prompt = new Map(righePrompt.map((r) => [r.categoria, r.prompt]));
  const cifraturaOk = cifraturaConfigurata();

  return (
    <div className="layout">
      <Sidebar attiva="impostazioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Negozi Shopify</h1>
            <p className="page-sub">
              Da qui decidi tu <b>con quali negozi</b> Merchandising parla e con quale token. Il token è per
              negozio — su Shopify non ne esiste uno che li apra tutti — e serve a leggere prodotti e
              collezioni, e a scriverli quando lo vorrai.
            </p>
          </div>
        </div>

        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
        {sp.esito === "salvato" && (
          <div className="nota-info">
            <span className="nota-icona">✓</span>
            <span>Negozio salvato e verificato subito: l&apos;esito è nella scheda qui sotto.</span>
          </div>
        )}
        {sp.esito === "chiave" && (
          <div className="nota-info">
            <span className="nota-icona">✓</span>
            <span>Chiave OpenAI salvata cifrata: la scrittura AI delle descrizioni è accesa.</span>
          </div>
        )}
        {sp.esito === "chiave-tolta" && (
          <div className="nota-info">
            <span className="nota-icona">✓</span>
            <span>Chiave OpenAI rimossa: il bottone «Scrivi con l&apos;AI» torna spento.</span>
          </div>
        )}
        {sp.esito === "prompt" && (
          <div className="nota-info">
            <span className="nota-icona">✓</span>
            <span>Prompt salvati: le prossime descrizioni partono da lì.</span>
          </div>
        )}
        {sp.esito === "eliminato" && (
          <div className="nota-info">
            <span className="nota-icona">✓</span>
            <span>Negozio eliminato. I prodotti e le vendite restano: si tocca solo il collegamento.</span>
          </div>
        )}

        {!cifraturaOk && (
          <div className="avviso-errore">
            <b>APP_SECRET non impostata.</b> Senza, il token finirebbe in chiaro nel database: preferisco non
            salvarlo. Aggiungi <code>APP_SECRET</code> alle variabili d&apos;ambiente dell&apos;app (una frase
            lunga a caso va benissimo) e ricarica.
          </div>
        )}

        {/* ---------- Negozi collegati ---------- */}
        {negozi.length === 0 ? (
          <div className="vuoto">
            Nessun negozio collegato. Aggiungine uno qui sotto: servono il dominio tecnico
            (<code>nome.myshopify.com</code>) e il token Admin API dell&apos;app che crei su Shopify.
          </div>
        ) : (
          <div className="griglia-negozi">
            {negozi.map((n) => {
              const verifica = verificaNegozioAzione.bind(null, n.id);
              const attiva = attivaNegozio.bind(null, n.id, !n.attivo);
              const elimina = eliminaNegozio.bind(null, n.id);
              const ok = n.esitoVerifica === "ok";
              return (
                <div className="scheda negozio" id={`negozio-${n.id}`} key={n.id}>
                  <div className="negozio-testa">
                    <div>
                      <div className="card-brand-nome">{n.nome}</div>
                      <div className="cella-sub">{n.dominio}</div>
                    </div>
                    <Badge
                      testo={
                        !n.verificatoIl ? "Da verificare" : ok ? "Funziona" : "Non funziona"
                      }
                      colore={!n.verificatoIl ? "var(--text-tertiary)" : ok ? "var(--green)" : "var(--red)"}
                    />
                  </div>

                  <dl className="griglia-campi" style={{ margin: "14px 0" }}>
                    <div className="campo">
                      <dt>Token</dt>
                      <dd>impostato · impronta {n.tokenImpronta || "—"}</dd>
                    </div>
                    <div className="campo">
                      <dt>Ultima verifica</dt>
                      <dd>{n.verificatoIl ? iso(n.verificatoIl) : "mai"}</dd>
                    </div>
                    <div className="campo">
                      <dt>Stato</dt>
                      <dd>{n.attivo ? "attivo (usato dagli import)" : "sospeso"}</dd>
                    </div>
                  </dl>

                  {n.messaggio && (
                    <p className={ok ? "page-sub" : "avviso-errore"} style={{ marginBottom: 12 }}>
                      {n.messaggio}
                    </p>
                  )}

                  {n.verificatoIl && (
                    <div style={{ marginBottom: 14 }}>
                      <div className="scheda-titolo">Permessi del token</div>
                      <div className="pill-scelta">
                        {PERMESSI.map((p) => {
                          const c = n.permessi.includes(p.scope);
                          return (
                            <span
                              key={p.scope}
                              className="pill-opt"
                              style={{ color: c ? "var(--green)" : COLORE_LIVELLO[p.livello], cursor: "default" }}
                              title={p.cosaSblocca}
                            >
                              <span className="dot" />
                              {p.scope}
                              {c ? "" : p.livello === "obbligatorio" ? " — manca" : " — assente"}
                            </span>
                          );
                        })}
                      </div>
                      {n.permessi.filter((p) => !PERMESSI.some((x) => x.scope === p)).length > 0 && (
                        <p className="cella-sub" style={{ marginTop: 8 }}>
                          Altri permessi presenti:{" "}
                          {n.permessi.filter((p) => !PERMESSI.some((x) => x.scope === p)).join(", ")}
                        </p>
                      )}
                    </div>
                  )}

                  <details>
                    <summary className="dettagli-summary">Modifica dominio o sostituisci il token</summary>
                    <form action={salvaNegozioAzione} className="modulo">
                      <input type="hidden" name="id" value={n.id} />
                      <div className="campo-modulo">
                        <label htmlFor={`nome-${n.id}`}>Nome</label>
                        <input id={`nome-${n.id}`} name="nome" defaultValue={n.nome} required />
                      </div>
                      <div className="campo-modulo">
                        <label htmlFor={`dominio-${n.id}`}>Dominio tecnico</label>
                        <input id={`dominio-${n.id}`} name="dominio" defaultValue={n.dominio} required />
                      </div>
                      <div className="campo-modulo largo">
                        <label htmlFor={`token-${n.id}`}>Nuovo token (lascia vuoto per non cambiarlo)</label>
                        <input id={`token-${n.id}`} name="token" type="password" placeholder="shpat_…" autoComplete="off" />
                      </div>
                      <div className="azioni-modulo">
                        <button className="btn" type="submit">Salva</button>
                      </div>
                    </form>
                  </details>

                  <div className="riga-azione" style={{ marginTop: 14 }}>
                    <form action={verifica}>
                      <button className="btn btn-secondario small" type="submit">Verifica ora</button>
                    </form>
                    <form action={attiva}>
                      <button className="btn btn-secondario small" type="submit">
                        {n.attivo ? "Sospendi" : "Riattiva"}
                      </button>
                    </form>
                    <form action={elimina}>
                      <button className="btn btn-secondario small" type="submit">Elimina</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ---------- Nuovo negozio ---------- */}
        <div className="scheda" style={{ marginTop: 18 }}>
          <div className="scheda-titolo">Collega un negozio</div>
          <form action={salvaNegozioAzione} className="modulo">
            <div className="campo-modulo">
              <label htmlFor="nome">Nome <span className="obbligatorio">*</span></label>
              <input id="nome" name="nome" placeholder="Flowers" required />
            </div>
            <div className="campo-modulo">
              <label htmlFor="dominio">Dominio tecnico <span className="obbligatorio">*</span></label>
              <input id="dominio" name="dominio" placeholder="nome-negozio.myshopify.com" required />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="token">Token Admin API <span className="obbligatorio">*</span></label>
              <input id="token" name="token" type="password" placeholder="shpat_…" autoComplete="off" required />
            </div>
            <div className="azioni-modulo">
              <button className="btn" type="submit" disabled={!cifraturaOk}>Collega e verifica</button>
            </div>
          </form>
          <p className="page-sub" style={{ marginTop: 12 }}>
            Il token si salva <b>cifrato</b> e non viene più rimostrato: per cambiarlo lo si sostituisce. Le
            chiamate usano l&apos;Admin API versione <b>{VERSIONE_API}</b>.
          </p>
        </div>

        {/* ---------- Scrittura AI ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Scrittura AI delle descrizioni</div>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Serve una chiave OpenAI. {chiaveAi.presente ? "" : "Finché manca, il bottone «Scrivi con l'AI» nel form prodotto resta spento."}
          </p>
          {chiaveAi.presente ? (
            <>
              <p className="page-sub">
                Chiave impostata{" "}
                {chiaveAi.origine === "ambiente" ? (
                  <>
                    <b>nell&apos;ambiente</b> (variabile <code>OPENAI_API_KEY</code>): ha la precedenza su
                    qualunque chiave inserita qui.
                  </>
                ) : (
                  <>
                    <b>da questa pagina</b> · impronta {chiaveAi.impronta} ·{" "}
                    {chiaveAi.aggiornataIl ? iso(chiaveAi.aggiornataIl) : ""}
                  </>
                )}
              </p>
              {chiaveAi.origine === "app" && (
                <form action={eliminaChiaveAiAzione} style={{ marginTop: 12 }}>
                  <button className="btn btn-secondario small" type="submit">Togli la chiave</button>
                </form>
              )}
            </>
          ) : null}
          {chiaveAi.origine !== "ambiente" && (
            <form action={salvaChiaveAiAzione} className="modulo" style={{ marginTop: 12 }}>
              <div className="campo-modulo largo">
                <label htmlFor="chiave">{chiaveAi.presente ? "Sostituisci la chiave" : "Chiave OpenAI"}</label>
                <input id="chiave" name="chiave" type="password" placeholder="sk-…" autoComplete="off" required />
              </div>
              <div className="azioni-modulo">
                <button className="btn" type="submit" disabled={!cifraturaOk}>Salva la chiave</button>
              </div>
            </form>
          )}
        </div>

        {/* ---------- Prompt per categoria ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Prompt AI per categoria</div>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Come nel form Categorie di app.deluxy.it: qui si scrive <b>una volta</b> come si racconta una
            famiglia di prodotti, e ogni descrizione generata parte già nella lingua giusta — le torte non si
            descrivono come i bouquet. Lascia vuoto per non dare indicazioni.
          </p>
          <form action={salvaPromptCategorieAzione}>
            <div className="modulo">
              {CATEGORIE.map((c) => (
                <div className="campo-modulo largo" key={c}>
                  <label htmlFor={`prompt-${c}`}>{etichettaCategoria(c)}</label>
                  <textarea
                    id={`prompt-${c}`}
                    name={`prompt-${c}`}
                    rows={2}
                    defaultValue={prompt.get(c) ?? ""}
                    placeholder={
                      c === "BOUQUET"
                        ? "Es. parla di fiori e colori, mai di numero di steli se non è indicato; chiudi con l'occasione giusta."
                        : "Indicazioni per chi scrive le descrizioni di questa categoria."
                    }
                  />
                </div>
              ))}
            </div>
            <div className="azioni-modulo">
              <button className="btn" type="submit">Salva i prompt</button>
            </div>
          </form>
        </div>

        {/* ---------- Permessi da dare all'app ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Permessi da dare all&apos;app Shopify</div>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Su ogni negozio: <b>Impostazioni → App e canali di vendita → Sviluppa app → Crea app</b>, poi
            <b> Configurazione → Admin API integration → Modifica</b>, spunta i permessi qui sotto, salva e
            installa. Il token (<code>shpat_…</code>) compare una volta sola in <b>Credenziali API</b>: copialo
            subito e incollalo qui sopra.
          </p>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Permesso</th>
                  <th>Serve a</th>
                  <th>Livello</th>
                </tr>
              </thead>
              <tbody>
                {PERMESSI.map((p) => (
                  <tr key={p.scope}>
                    <td>
                      <span className="cella-nome" style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
                        {p.scope}
                      </span>
                    </td>
                    <td className="cella-muta">{p.cosaSblocca}</td>
                    <td>
                      <Badge
                        testo={p.livello}
                        colore={COLORE_LIVELLO[p.livello]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="page-sub" style={{ marginTop: 14 }}>
            I due <b>obbligatori</b> bastano per leggere prodotti e collezioni, crearle, modificarle e
            riordinarne i prodotti: su Shopify le collezioni stanno dentro il permesso dei prodotti, non ne
            hanno uno proprio. Gli altri servono quando si vuole andare oltre la lettura — giacenze,
            pubblicazione sui canali, immagini. Dare solo quelli che servono è la scelta giusta: un token può
            essere rubato, e uno che non sa scrivere fa molti meno danni.
          </p>
        </div>
      </main>
    </div>
  );
}
