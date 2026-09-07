import { prisma } from "@/lib/db";
import { dataBreve } from "@/lib/ordini";
import { CATEGORIE } from "@/lib/categorie";
import {
  toggleNegozio, eliminaNegozio, cambiaColoreBrand, cambiaBrandRicerca,
  impostaCategoriaNegozio, sincronizza,
} from "@/app/actions";
import { salvaNegozio, provaNegozio } from "./actions";

export const dynamic = "force-dynamic";

// Negozi Shopify: dove si collegano i negozi da cui arrivano gli ordini.
//
// Prima stava in fondo alle Impostazioni, sotto altre sette schede: chi doveva
// aggiungere un negozio non la trovava. Qui è una sezione sua, e soprattutto
// **dice se il collegamento funziona** — prima si poteva solo salvare un token
// e aspettare la sincronizzazione per scoprire che era sbagliato.
export default async function Negozi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const negozi = await prisma.negozioShopify.findMany({ orderBy: { brand: "asc" } });
  // Quanti ordini ha portato ciascuno: è la risposta alla domanda vera
  // («questo negozio sta funzionando?»), e non costa una chiamata a Shopify.
  const conteggi = await prisma.ordine.groupBy({ by: ["negozioId"], _count: { _all: true } });
  const ordiniPer = new Map(conteggi.map((c) => [c.negozioId, c._count._all]));

  const attivi = negozi.filter((n) => n.attivo).length;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Negozi Shopify</h1>
          <p className="page-sub">
            Da qui arrivano gli ordini. Ogni negozio si collega una volta sola; poi la
            sincronizzazione lo legge <strong>ogni 5 minuti</strong>, da sola.
          </p>
        </div>
        <form action={sincronizza}>
          <input type="hidden" name="giorni" value="90" />
          <button className="btn" type="submit" disabled={attivi === 0}>Sincronizza ora</button>
        </form>
      </div>

      {sp.esito && <div className="avviso-ok">{sp.esito}</div>}
      {sp.errore && <div className="avviso-errore">{sp.errore}</div>}

      {/* ---------- I negozi collegati ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">
          I negozi collegati{" "}
          {negozi.length > 0 && (
            <span className="cella-muta">· {attivi} attivi su {negozi.length}</span>
          )}
        </div>
        {negozi.length === 0 ? (
          <p className="testo-guida">
            Nessun negozio ancora. Aggiungi il primo qui sotto: appena salvato, l&apos;app prova
            il collegamento e ti dice se Shopify risponde.
          </p>
        ) : (
          <div className="tabella-wrap">
            {/* ⚠️ Qui ci sta SOLO il collegamento: chi è, come entra, cosa ha
                portato, e i due comandi. Le personalizzazioni (colore, nome in
                Ricerca fornitori, specialità) hanno una tabella loro più sotto.
                Insieme facevano dieci colonne, e «Prova il collegamento» —
                l'unica azione per cui si viene in questa pagina — finiva oltre
                il bordo dello schermo. */}
            <table>
              <thead>
                <tr>
                  <th>Brand</th><th>Dominio</th><th>Come entra</th><th>Ordini</th>
                  <th>Ultima sync</th><th>Stato</th><th></th>
                </tr>
              </thead>
              <tbody>
                {negozi.map((n) => (
                  <tr key={n.id}>
                    <td className="cella-nome cella-brand">
                      <span className="brand-dot" style={{ background: n.colore }} />
                      {n.brand}
                    </td>
                    <td className="cella-muta">{n.dominio}</td>
                    <td className="cella-muta">
                      {n.clientId ? "App (Client ID/Secret)" : n.token ? "Token statico" : "— niente"}
                    </td>
                    <td className="cella-muta">{(ordiniPer.get(n.id) ?? 0).toLocaleString("it-IT")}</td>
                    <td className="cella-muta">{n.ultimaSync ? dataBreve(n.ultimaSync) : "mai"}</td>
                    <td>
                      <form action={toggleNegozio} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <button className={`badge${n.attivo ? "" : " neutro"}`} style={{ border: 0, cursor: "pointer", color: n.attivo ? "var(--green)" : "var(--text-tertiary)" }}>
                          <span className="dot" />{n.attivo ? "attivo" : "sospeso"}
                        </button>
                      </form>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <form action={provaNegozio} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <button className="btn btn-secondario small" type="submit">Prova il collegamento</button>
                      </form>{" "}
                      <form action={eliminaNegozio} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <button className="btn btn-secondario small" type="submit">Elimina</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="testo-guida" style={{ marginTop: 10 }}>
          <strong>Sospeso</strong> non cancella niente: il negozio resta con i suoi ordini, smette solo
          di essere letto. <strong>Elimina</strong> invece toglie il collegamento — gli ordini già
          importati restano, ma non ne arriveranno altri. «Ordini» conta quelli già importati qui;
          «Prova il collegamento» chiede a Shopify, adesso, chi risponde e quanti ordini vede.
        </p>
      </div>

      {/* ---------- Come si vedono nell'app ---------- */}
      {negozi.length > 0 && (
        <div className="scheda">
          <div className="scheda-titolo">Come si vedono nell&apos;app</div>
          <p className="testo-guida">
            Il <strong>colore</strong> distingue gli ordini a colpo d&apos;occhio (pallino
            nell&apos;elenco, testata delle colonne per brand). Il <strong>nome in Ricerca
            fornitori</strong> serve ai link verso l&apos;app dei fornitori, dove lo stesso negozio
            può chiamarsi diversamente. La <strong>specialità</strong> è la rete di sicurezza delle
            categorie: quando il titolo di un prodotto non dice cos&apos;è, su un negozio che vende
            una cosa sola quella è la risposta giusta.
          </p>
          <div className="tabella-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr><th>Brand</th><th>Colore</th><th>Nome in Ricerca fornitori</th><th>Specialità</th></tr>
              </thead>
              <tbody>
                {negozi.map((n) => (
                  <tr key={n.id}>
                    <td className="cella-nome cella-brand">
                      <span className="brand-dot" style={{ background: n.colore }} />
                      {n.brand}
                    </td>
                    <td>
                      <form action={cambiaColoreBrand} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <input type="color" name="colore" defaultValue={n.colore} aria-label={`Colore di ${n.brand}`} style={{ width: 34, height: 28, padding: 2, border: 0, background: "transparent", cursor: "pointer" }} />
                        <button className="btn btn-secondario small" type="submit">Salva</button>
                      </form>
                    </td>
                    <td>
                      <form action={cambiaBrandRicerca} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <input
                          name="brandRicerca"
                          defaultValue={n.brandRicerca ?? ""}
                          placeholder={n.brand}
                          aria-label={`Nome di ${n.brand} in Ricerca fornitori`}
                          style={{ font: "inherit", fontSize: 13, width: 150, padding: "6px 9px", borderRadius: "var(--radius-s)", background: "var(--fill)", border: "1px solid transparent" }}
                        />
                        <button className="btn btn-secondario small" type="submit">Salva</button>
                      </form>
                    </td>
                    <td>
                      <form action={impostaCategoriaNegozio} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <select
                          name="categoriaPredefinita"
                          defaultValue={n.categoriaPredefinita ?? ""}
                          aria-label={`Specialità di ${n.brand}`}
                          style={{ font: "inherit", fontSize: 13, padding: "6px 9px", borderRadius: "var(--radius-s)", background: "var(--fill)", border: "1px solid transparent" }}
                        >
                          <option value="">— nessuna: resta «non classificato» —</option>
                          {CATEGORIE.filter((c) => !c.servizio).map((c) => (
                            <option key={c.chiave} value={c.chiave}>{c.nome}</option>
                          ))}
                        </select>
                        <button className="btn btn-secondario small" type="submit">Salva</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- Aggiungi un negozio ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Aggiungi un negozio</div>
        <p className="testo-guida">
          Il <strong>brand</strong> è il nome con cui il negozio compare in tutta l&apos;app (elenco,
          colonne, analisi): scrivilo come vuoi vederlo. Il <strong>dominio</strong> è quello tecnico
          di Shopify, che finisce in <code className="inline">.myshopify.com</code> — se incolli
          l&apos;indirizzo dell&apos;admin (<code className="inline">admin.shopify.com/store/nome</code>)
          o il solo nome, lo si riconosce lo stesso.
        </p>
        <form action={salvaNegozio} className="modulo">
          <div className="campo-modulo">
            <label>Brand <span className="obbligatorio">*</span></label>
            <input name="brand" required placeholder="deluxyflowers.com" />
          </div>
          <div className="campo-modulo">
            <label>Dominio del negozio <span className="obbligatorio">*</span></label>
            <input name="dominio" required placeholder="fb72b1-2.myshopify.com" />
          </div>
          <div className="campo-modulo largo">
            <label>Token statico (shpat_…) — oppure Client ID e Secret qui sotto</label>
            <input name="token" placeholder="shpat_…" />
          </div>
          <div className="campo-modulo">
            <label>Client ID (Dev Dashboard)</label>
            <input name="clientId" placeholder="opzionale" />
          </div>
          <div className="campo-modulo">
            <label>Client Secret</label>
            <input name="clientSecret" placeholder="opzionale" />
          </div>
          <div className="azioni-modulo largo">
            <button className="btn" type="submit">Salva e prova il collegamento</button>
          </div>
        </form>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          Salvando, l&apos;app chiede subito a Shopify <strong>chi risponde</strong> e{" "}
          <strong>quanti ordini vede</strong>: se qualcosa non va lo dice adesso, non alla prima
          sincronizzazione. Il token e il segreto restano sul server e non vengono più mostrati.
          Scrivere di nuovo un brand che c&apos;è già <strong>aggiorna</strong> quel negozio.
        </p>
      </div>

      {/* ---------- Dove si prendono le credenziali ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Dove si prendono le credenziali</div>
        <p className="testo-guida">
          Due strade, e conviene la prima: <strong>app della Dev Dashboard</strong> (Client ID +
          Client Secret). L&apos;app si conia da sola un token buono ~24 ore, quindi non c&apos;è
          nessun <code className="inline">shpat_</code> che gira e non scade niente a tradimento.
          Il <strong>token statico</strong> è la seconda strada: più rapida, ma è una password
          permanente.
        </p>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          Nella Dev Dashboard di Shopify, sull&apos;app del negozio: <em>API credentials</em> per
          Client ID e Secret, <em>Configuration</em> → <em>Admin API access scopes</em> per i
          permessi. Serve <code className="inline">read_orders</code> per leggere gli ordini; per i
          link di pagamento di «Fatti pagare» serve anche{" "}
          <code className="inline">write_draft_orders</code>.
        </p>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          ⚠️ Senza <code className="inline">read_all_orders</code> Shopify mostra a un&apos;app solo
          gli <strong>ultimi 60 giorni</strong> di ordini: lo storico più vecchio non arriva, e non è
          un errore dell&apos;import. I negozi di casa condividono <strong>una sola app
          Shopify</strong> (stesso Client ID su domini diversi): un permesso aggiunto lì vale per
          tutti.
        </p>
      </div>
    </main>
  );
}
