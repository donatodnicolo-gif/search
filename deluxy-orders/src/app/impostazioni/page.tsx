import { prisma } from "@/lib/db";
import { statiOrdinati } from "@/lib/stati";
import { dataBreve } from "@/lib/ordini";
import {
  creaNegozio, toggleNegozio, eliminaNegozio, cambiaColoreBrand,
  creaStato, aggiornaStato, eliminaStato,
  creaEtichetta, eliminaEtichetta,
  toggleChiave, sincronizza,
} from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Impostazioni() {
  const [negozi, stati, etichette, chiavi] = await Promise.all([
    prisma.negozioShopify.findMany({ orderBy: { brand: "asc" } }),
    statiOrdinati(),
    prisma.etichetta.findMany({ orderBy: { nome: "asc" } }),
    prisma.apiKey.findMany({ orderBy: { creataIl: "desc" } }),
  ]);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-sub">Negozi Shopify, pipeline degli stati, etichette e chiavi API.</p>
        </div>
        <form action={sincronizza}>
          <input type="hidden" name="giorni" value="90" />
          <button className="btn" type="submit" disabled={negozi.length === 0}>Sincronizza ora</button>
        </form>
      </div>

      {/* ---------- Negozi Shopify ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Negozi Shopify</div>
        {negozi.length === 0 ? (
          <p className="testo-guida">Nessun negozio. Aggiungine uno qui sotto per iniziare a importare gli ordini.</p>
        ) : (
          <div className="tabella-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr><th>Brand</th><th>Colore</th><th>Dominio</th><th>Auth</th><th>Ultima sync</th><th>Stato</th><th></th></tr>
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
                        <input type="color" name="colore" defaultValue={n.colore} style={{ width: 34, height: 28, padding: 2, border: 0, background: "transparent", cursor: "pointer" }} />
                        <button className="btn btn-secondario small" type="submit">Salva</button>
                      </form>
                    </td>
                    <td className="cella-muta">{n.dominio}</td>
                    <td className="cella-muta">{n.clientId ? "Client credentials" : n.token ? "Token statico" : "—"}</td>
                    <td className="cella-muta">{n.ultimaSync ? dataBreve(n.ultimaSync) : "mai"}</td>
                    <td>
                      <form action={toggleNegozio} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <button className={`badge${n.attivo ? "" : " neutro"}`} style={{ border: 0, cursor: "pointer", color: n.attivo ? "var(--green)" : "var(--text-tertiary)" }}>
                          <span className="dot" />{n.attivo ? "attivo" : "sospeso"}
                        </button>
                      </form>
                    </td>
                    <td style={{ textAlign: "right" }}>
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
        <form action={creaNegozio} className="modulo">
          <div className="campo-modulo"><label>Brand <span className="obbligatorio">*</span></label><input name="brand" required placeholder="deluxyflowers.com" /></div>
          <div className="campo-modulo"><label>Dominio myshopify <span className="obbligatorio">*</span></label><input name="dominio" required placeholder="fb72b1-2.myshopify.com" /></div>
          <div className="campo-modulo largo"><label>Token statico (shpat_…) — oppure Client ID/Secret sotto</label><input name="token" placeholder="shpat_…" /></div>
          <div className="campo-modulo"><label>Client ID (Dev Dashboard)</label><input name="clientId" placeholder="opzionale" /></div>
          <div className="campo-modulo"><label>Client Secret</label><input name="clientSecret" placeholder="opzionale" /></div>
          <div className="azioni-modulo largo"><button className="btn" type="submit">Salva negozio</button></div>
        </form>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          Sola lettura ordini (<code className="inline">read_orders</code>). Il token/segreto resta sul server, non viene mai mostrato.
        </p>
      </div>

      {/* ---------- Pipeline / stati ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Pipeline degli stati</div>
        <div className="tabella-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr><th>Ord.</th><th>Nome</th><th>Colore</th><th>Predefinito</th><th>Terminale</th><th></th></tr>
            </thead>
            <tbody>
              {stati.map((s) => (
                <tr key={s.id}>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <form action={aggiornaStato} style={{ display: "grid", gridTemplateColumns: "56px 1fr 90px 110px 100px auto", gap: 10, alignItems: "center", padding: "8px 16px" }}>
                      <input type="hidden" name="id" value={s.id} />
                      <input name="ordine" type="number" defaultValue={s.ordine} style={campoInline} />
                      <input name="nome" defaultValue={s.nome} style={campoInline} />
                      <input name="colore" type="color" defaultValue={s.colore} style={{ ...campoInline, padding: 2, height: 32 }} />
                      <label style={etichettaCheck}><input type="checkbox" name="predefinito" defaultChecked={s.predefinito} /> predef.</label>
                      <label style={etichettaCheck}><input type="checkbox" name="terminale" defaultChecked={s.terminale} /> chiusura</label>
                      <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-secondario small" type="submit">Salva</button>
                      </span>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <form action={creaStato} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div className="campo-modulo"><label>Nuovo stato</label><input name="nome" placeholder="Nome stato" required /></div>
            <div className="campo-modulo"><label>Colore</label><input name="colore" type="color" defaultValue="#6e6e73" style={{ height: 40, padding: 2 }} /></div>
            <label style={etichettaCheck}><input type="checkbox" name="terminale" /> chiusura</label>
            <button className="btn" type="submit">Aggiungi</button>
          </form>
        </div>
        <p className="testo-guida" style={{ marginTop: 8 }}>Eliminare uno stato non cancella gli ordini: li lascia “senza stato”.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {stati.map((s) => (
            <form action={eliminaStato} key={s.id}>
              <input type="hidden" name="id" value={s.id} />
              <button className="btn btn-secondario small" type="submit">Elimina “{s.nome}”</button>
            </form>
          ))}
        </div>
      </div>

      {/* ---------- Etichette ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Etichette</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {etichette.length === 0 && <span className="tag-vuoto">Nessuna etichetta.</span>}
          {etichette.map((e) => (
            <form action={eliminaEtichetta} key={e.id} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={e.id} />
              <button className="tag" style={{ color: e.colore, border: 0, cursor: "pointer" }} title="Elimina">
                <span className="dot" /><span className="tag-label">{e.nome}</span> ✕
              </button>
            </form>
          ))}
        </div>
        <form action={creaEtichetta} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div className="campo-modulo"><label>Nuova etichetta</label><input name="nome" placeholder="es. urgente, VIP…" required /></div>
          <div className="campo-modulo"><label>Colore</label><input name="colore" type="color" defaultValue="#0071e3" style={{ height: 40, padding: 2 }} /></div>
          <button className="btn" type="submit">Aggiungi</button>
        </form>
      </div>

      {/* ---------- Chiavi API ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Chiavi API (per le altre app)</div>
        {chiavi.length === 0 ? (
          <p className="testo-guida">Nessuna chiave. Creane una dalla riga di comando (vedi sotto).</p>
        ) : (
          <div className="tabella-wrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Nome app</th><th>Permesso</th><th>Creata</th><th>Ultimo uso</th><th>Stato</th></tr></thead>
              <tbody>
                {chiavi.map((k) => (
                  <tr key={k.id}>
                    <td className="cella-nome">{k.nome}</td>
                    <td className="cella-muta">{k.scrittura ? "lettura + scrittura" : "sola lettura"}</td>
                    <td className="cella-muta">{dataBreve(k.creataIl)}</td>
                    <td className="cella-muta">{k.ultimoUso ? dataBreve(k.ultimoUso) : "mai"}</td>
                    <td>
                      <form action={toggleChiave} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={k.id} />
                        <button className={`badge${k.attiva ? "" : " neutro"}`} style={{ border: 0, cursor: "pointer", color: k.attiva ? "var(--green)" : "var(--text-tertiary)" }}>
                          <span className="dot" />{k.attiva ? "attiva" : "sospesa"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="testo-guida">
          Le chiavi si creano dalla riga di comando (la chiave in chiaro si vede una sola volta):
        </p>
        <p className="testo-guida"><code className="inline">npm run chiave -- deluxy-search</code> (sola lettura) · <code className="inline">npm run chiave -- deluxy-partner --scrittura</code></p>
      </div>
    </main>
  );
}

const campoInline: React.CSSProperties = {
  font: "inherit", fontSize: 13.5, color: "var(--text)", background: "var(--fill)",
  border: "1px solid transparent", borderRadius: "var(--radius-s)", padding: "6px 10px", outline: "none",
};
const etichettaCheck: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-secondary)",
};
