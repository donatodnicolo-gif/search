import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import {
  attivaNegozio,
  eliminaChiaveAiAzione,
  eliminaNegozio,
  salvaChiaveAiAzione,
  salvaNegozioAzione,
  creaChiaveApiAzione,
  revocaChiaveApiAzione,
  salvaPromptCategorieAzione,
  salvaLineeGuidaSeoAzione,
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
  searchParams: Promise<{ esito?: string; errore?: string; messaggio?: string; nuova?: string }>;
}) {
  const sp = await searchParams;
  const [negozi, chiaveAi, righePrompt, chiavi, canali] = await Promise.all([
    elencoNegozi(),
    statoSegreto("OPENAI_API_KEY"),
    prisma.promptCategoria.findMany(),
    prisma.apiKey.findMany({ orderBy: { creataIl: "desc" } }),
    // I nomi che i negozi hanno **nel venduto**: servono a collegare la scheda
    // Shopify alle vendite, che arrivano da Orders con i nomi dei brand.
    prisma.vendita.findMany({ distinct: ["canale"], select: { canale: true }, orderBy: { canale: "asc" } }),
  ]);
  const canaliVenduto = canali.map((c) => c.canale).filter(Boolean);
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
        {sp.esito === "seo-brand" && (
          <div className="nota-info">
            <span className="nota-icona">✓</span>
            <span>
              Linee guida SEO salvate. Le usa <b>«Scrivi con AI»</b> sulle collezioni di quel negozio, dalla
              prossima bozza: il SEO già scritto non si tocca.
            </span>
          </div>
        )}
        {sp.esito === "aggiornato" && (
          <div className="nota-info">
            <span className="nota-icona">✓</span>
            <span>
              Quel negozio era già collegato: ho <b>sostituito le sue credenziali</b> con quelle nuove e l&apos;ho
              verificato subito. L&apos;esito è nella sua scheda.
            </span>
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
              const salvaLineeGuidaSeo = salvaLineeGuidaSeoAzione.bind(null, n.id);
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
                      <dt>Come si autentica</dt>
                      <dd>
                        {n.modo === "credenziali" ? (
                          <>
                            Client ID + Secret · token coniato dall&apos;app
                            {n.tokenScadeIl ? `, valido fino alle ${n.tokenScadeIl.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}
                          </>
                        ) : n.modo === "token" ? (
                          <>Token statico · impronta {n.tokenImpronta || "—"}</>
                        ) : (
                          "nessuna credenziale"
                        )}
                      </dd>
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
                    <summary className="dettagli-summary">Modifica dominio o cambia le credenziali</summary>
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
                        <label htmlFor={`canale-${n.id}`}>
                          Nome nel venduto {canaliVenduto.length > 0 && <em>— usati oggi: {canaliVenduto.join(", ")}</em>}
                        </label>
                        <input
                          id={`canale-${n.id}`}
                          name="canaleVendite"
                          defaultValue={n.canaleVendite ?? ""}
                          placeholder="come si chiama questo negozio negli ordini"
                        />
                      </div>
                      <div className="campo-modulo">
                        <label htmlFor={`clientId-${n.id}`}>Nuovo Client ID</label>
                        <input id={`clientId-${n.id}`} name="clientId" autoComplete="off" placeholder="lascia vuoto per non cambiarlo" />
                      </div>
                      <div className="campo-modulo">
                        <label htmlFor={`clientSecret-${n.id}`}>Nuovo Client Secret</label>
                        <input id={`clientSecret-${n.id}`} name="clientSecret" type="password" autoComplete="off" />
                      </div>
                      <div className="campo-modulo largo">
                        <label htmlFor={`token-${n.id}`}>Oppure un token statico <code>shpat_…</code></label>
                        <input id={`token-${n.id}`} name="token" type="password" placeholder="solo per le app personalizzate vecchio stile" autoComplete="off" />
                      </div>
                      <div className="azioni-modulo">
                        <button className="btn" type="submit">Salva</button>
                      </div>
                    </form>
                  </details>

                  {/* **La zona SEO del brand** (chiesta dall'utente): come e cosa
                      scrivere quando l'AI prepara titoli e descrizioni per le
                      collezioni di questo negozio. Ripiegata: si scrive una
                      volta e si ritocca di rado. */}
                  <details>
                    <summary className="dettagli-summary">
                      Linee guida SEO del brand{n.lineeGuidaSeo ? " — scritte" : " — da scrivere"}
                    </summary>
                    <form action={salvaLineeGuidaSeo} className="modulo" style={{ marginTop: 10 }}>
                      <div className="campo-modulo largo">
                        <label htmlFor={`seoGuida-${n.id}`}>Come e cosa scrivere per {n.nome}</label>
                        <textarea
                          id={`seoGuida-${n.id}`}
                          name="lineeGuidaSeo"
                          rows={5}
                          defaultValue={n.lineeGuidaSeo ?? ""}
                          placeholder={"Es.: tono sobrio da maison; parla di consegna a Milano; cita sempre «cake design» per le torte; mai sconti o superlativi."}
                        />
                        <div className="cella-sub">
                          Le usa «Scrivi con AI» sulle collezioni di questo negozio, con la precedenza sulle regole
                          generiche. Non tocca il SEO già scritto: vale dalla prossima bozza.
                        </div>
                      </div>
                      <div className="azioni-modulo">
                        <button className="btn" type="submit">Salva le linee guida</button>
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
          <div className="scheda-titolo">Collega un negozio (o aggiorna le credenziali di uno già collegato)</div>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Se il nome o il dominio corrispondono a un negozio già in elenco, le credenziali vengono
            <b> sostituite</b> su quello invece di crearne un doppione.
          </p>
          <form action={salvaNegozioAzione} className="modulo">
            <div className="campo-modulo">
              <label htmlFor="nome">Nome <span className="obbligatorio">*</span></label>
              <input id="nome" name="nome" placeholder="Flowers" required />
            </div>
            <div className="campo-modulo">
              <label htmlFor="dominio">Dominio tecnico <span className="obbligatorio">*</span></label>
              <input id="dominio" name="dominio" placeholder="nome-negozio.myshopify.com" required />
            </div>
            <div className="campo-modulo">
              <label htmlFor="clientId">Client ID</label>
              <input id="clientId" name="clientId" autoComplete="off" placeholder="dalla scheda dell'app" />
            </div>
            <div className="campo-modulo">
              <label htmlFor="clientSecret">Client Secret</label>
              <input id="clientSecret" name="clientSecret" type="password" autoComplete="off" />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="canaleVendite">
                Nome nel venduto {canaliVenduto.length > 0 && <em>— usati oggi: {canaliVenduto.join(", ")}</em>}
              </label>
              <input
                id="canaleVendite"
                name="canaleVendite"
                placeholder="come si chiama questo negozio negli ordini (es. cakedesign.me)"
              />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="token">Oppure token statico <code>shpat_…</code> (app personalizzate vecchio stile)</label>
              <input id="token" name="token" type="password" placeholder="solo se la tua app ha ancora un token fisso" autoComplete="off" />
            </div>
            <div className="azioni-modulo">
              <button className="btn" type="submit" disabled={!cifraturaOk}>Collega e verifica</button>
            </div>
          </form>
          <p className="page-sub" style={{ marginTop: 12 }}>
            Le app Shopify di oggi non danno più un token da incollare: danno <b>Client ID</b> e <b>Client
            Secret</b>, e l&apos;app se ne conia uno da sola quando serve (dura circa 24 ore e si rinnova senza
            che nessuno se ne accorga). Il token statico <code>shpat_…</code> resta valido per le app
            personalizzate create nell&apos;admin del negozio: metti l&apos;uno <i>o</i> gli altri.
          </p>
          <p className="page-sub" style={{ marginTop: 8 }}>
            Tutto si salva <b>cifrato</b> e non viene più rimostrato: per cambiarlo lo si sostituisce. Le
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

        {/* ---------- Chiavi API per le altre app ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Chiavi API — far leggere Merchandising alle altre app</div>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Le altre app Deluxy leggono da qui con una chiave nell&apos;header <code>x-api-key</code>. Oggi è
            esposto: <code>GET /api/v1/collezioni</code> (con filtri per negozio, posizione, campagne, stato) e{" "}
            <code>GET /api/v1/collezioni/:id</code> — che accetta anche l&apos;<i>handle</i> di Shopify — con
            dentro i prodotti e il loro venduto. Di ogni collezione escono sia i campi del negozio (tipo,
            condizioni, SEO, ordinamento) sia le nostre decisioni: posizioni, flag campagne, stato, note.
          </p>
          {sp.nuova && (
            <div className="nota-info">
              <span className="nota-icona">✓</span>
              <span>
                Chiave creata — <b>copiala adesso</b>, non si rivede più:
                <br />
                <code style={{ userSelect: "all" }}>{sp.nuova}</code>
              </span>
            </div>
          )}
          {chiavi.length > 0 && (
            <div className="tabella-wrap" style={{ marginBottom: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th>App</th>
                    <th>Creata</th>
                    <th>Ultimo uso</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {chiavi.map((k) => (
                    <tr key={k.id}>
                      <td className="cella-nome">{k.nome}</td>
                      <td className="cella-muta">{iso(k.creataIl)}</td>
                      <td className="cella-muta">{k.ultimoUso ? iso(k.ultimoUso) : "mai usata"}</td>
                      <td>
                        <form action={revocaChiaveApiAzione.bind(null, k.id)}>
                          <button className="btn btn-secondario small" type="submit">
                            Revoca
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={creaChiaveApiAzione} className="modulo">
            <div className="campo-modulo">
              <label htmlFor="nomeChiave">Nuova chiave per</label>
              <input id="nomeChiave" name="nomeChiave" placeholder="deluxy-marketing" required />
            </div>
            <div className="azioni-modulo">
              <button className="btn" type="submit">
                Crea chiave
              </button>
            </div>
          </form>
        </div>

        {/* ---------- Permessi da dare all'app ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Permessi da dare all&apos;app Shopify</div>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Nell&apos;app che crei (Dev Dashboard di Shopify) i permessi si spuntano nella configurazione
            dell&apos;<b>Admin API</b>; poi l&apos;app va <b>installata sul negozio</b>, altrimenti Client ID e
            Secret vengono rifiutati. <b>Client ID</b> e <b>Client Secret</b> stanno nella scheda dell&apos;app
            e si incollano qui sopra. Se invece usi una vecchia <b>app personalizzata</b> creata dentro
            l&apos;admin del negozio (Impostazioni → App e canali di vendita → Sviluppa app), lì trovi ancora
            il token <code>shpat_…</code>, che compare una volta sola.
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
