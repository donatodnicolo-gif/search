import { prisma } from "@/lib/db";
import { statiOrdinati } from "@/lib/stati";
import { dataBreve } from "@/lib/ordini";
import {
  creaNegozio, toggleNegozio, eliminaNegozio, cambiaColoreBrand, cambiaBrandRicerca,
  creaStato, aggiornaStato, eliminaStato,
  creaEtichetta, eliminaEtichetta,
  toggleChiave, sincronizza, importaFeedbackOrdini, impostaCategoriaNegozio, ricalcolaCategorieOrdini, riconciliaOrdini,
} from "@/app/actions";
import { configurazione, riepilogoFeedback } from "@/lib/feedback";
import { configurazioneFinance, riepilogoMovimenti } from "@/lib/movimenti";
import { quotaFornitore } from "@/lib/controllo";
import { importaMovimentiBanca, adottaDaFinance, abbinaPerNumero, salvaQuota } from "@/app/controllo/actions";
import { creaChiaveApi, rigeneraChiaveApi, eliminaChiaveApi } from "./chiavi-actions";
import { ChiaviApi } from "@/components/ChiaviApi";
import { CATEGORIE } from "@/lib/categorie";

export const dynamic = "force-dynamic";

export default async function Impostazioni({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const [negozi, stati, etichette, chiavi, feedback, movimenti, quota, conCosto] = await Promise.all([
    prisma.negozioShopify.findMany({ orderBy: { brand: "asc" } }),
    statiOrdinati(),
    prisma.etichetta.findMany({ orderBy: { nome: "asc" } }),
    prisma.apiKey.findMany({ orderBy: { creataIl: "desc" } }),
    riepilogoFeedback(),
    riepilogoMovimenti(),
    quotaFornitore(),
    prisma.ordine.count({ where: { costoFornitore: { not: null } } }),
  ]);
  const csConfigurato = configurazione() != null;
  const financeConfigurato = configurazioneFinance() != null;
  const controllo = { conCosto };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-sub">
            Negozi Shopify, pipeline degli stati, etichette, feedback del Customer Service e chiavi API.
          </p>
        </div>
        <form action={sincronizza}>
          <input type="hidden" name="giorni" value="90" />
          <button className="btn" type="submit" disabled={negozi.length === 0}>Sincronizza ora</button>
        </form>
      </div>

      {sp.esito && <div className="avviso-ok">{sp.esito}</div>}
      {sp.errore && <div className="avviso-errore">{sp.errore}</div>}

      {/* ---------- Categorie di prodotto ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Categorie dei prodotti</div>
        <p className="testo-guida">
          Le categorie (fiori, torte, colazioni…) si ricavano dal <strong>titolo dei prodotti</strong>
          {" "}delle righe d&apos;ordine: Shopify non ce le dà — il tipo di prodotto richiede uno scope
          che i token non hanno. Quello che il titolo non dice lo copre la <strong>specialità del
          negozio</strong> qui sopra; se non è impostata, il prodotto resta «non classificato» invece
          di essere messo a caso. Servono alle liste <em>Gusti</em>: chi ama una categoria sola e chi
          ne compra più d&apos;una.
        </p>
        <form action={ricalcolaCategorieOrdini} style={{ marginTop: 10 }}>
          <button className="btn" type="submit">Ricalcola le categorie</button>
        </form>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          Il ricalcolo legge le righe già salvate — non chiama Shopify — e riscrive solo gli ordini in
          cui il risultato cambia. Va lanciato dopo aver cambiato una specialità. Nella catena entrano
          anche i <strong>tag dell&apos;ordine</strong> («Fiori», «Torta»): valgono meno del titolo del
          prodotto, ma più della specialità del negozio.
        </p>
      </div>

      {/* ---------- Riconciliazione: la città che manca ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Riconciliazione: la città che manca</div>
        <p className="testo-guida">
          Migliaia di ordini non hanno la <strong>città di consegna</strong> nell&apos;indirizzo, ma la
          nominano da un&apos;altra parte: nei <strong>tag</strong> dell&apos;ordine («Roma», «Milano») o
          dentro il <strong>nome del prodotto</strong> («Colazione Alassio», «Torta per 10 Roma»). La
          riconciliazione la recupera e la mette in un campo <em>suo</em>, con scritto da dove viene.
        </p>
        <form action={riconciliaOrdini} style={{ marginTop: 10 }}>
          <button className="btn" type="submit">Riconcilia città e categorie</button>
        </form>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          <strong>Una città dedotta non diventa mai l&apos;indirizzo di consegna</strong>: un indirizzo
          è un impegno con un fattorino davanti, una deduzione è un&apos;ipotesi buona per contare e
          cercare. E quando la città sta nel nome del prodotto c&apos;è una{" "}
          <strong>controprova</strong>: quegli stessi prodotti, negli ordini che l&apos;indirizzo ce
          l&apos;hanno, dove sono andati davvero? «Bouquet Venezia» è finito 21 volte su 21 fuori
          Venezia — quindi Venezia, nei titoli, non è una destinazione, e non le si crede.
        </p>
      </div>

      {/* ---------- Feedback dal Customer Service ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Feedback degli ordini (Customer Service)</div>
        <p className="testo-guida">
          I <strong>reclami</strong> e i <strong>voti</strong> aperti nell&apos;app Customer Service
          (deluxy-messaging) su un ordine, importati qui e mostrati sulla scheda dell&apos;ordine.
          È una copia di sola lettura: si aprono e si chiudono là, dove c&apos;è chi ha parlato col
          cliente. L&apos;import gira ogni notte insieme alla sincronizzazione da Shopify.
        </p>

        {!csConfigurato ? (
          <p className="testo-guida" style={{ marginTop: 10 }}>
            Non configurato: servono <code className="inline">MESSAGGI_URL</code> e{" "}
            <code className="inline">MESSAGGI_API_KEY</code>. La chiave si crea nel Customer Service
            con <code className="inline">npm run chiave -- deluxy-orders</code>.
          </p>
        ) : (
          <>
            <div className="kpi-riga" style={{ marginTop: 12 }}>
              <div className="kpi">
                <div className="kpi-valore">{feedback.reclami.toLocaleString("it-IT")}</div>
                <div className="kpi-etichetta">Reclami importati</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{feedback.reclamiAperti.toLocaleString("it-IT")}</div>
                <div className="kpi-etichetta">Ancora aperti</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{feedback.voti.toLocaleString("it-IT")}</div>
                <div className="kpi-etichetta">Voti sugli ordini</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{feedback.scollegati.toLocaleString("it-IT")}</div>
                <div className="kpi-etichetta">Senza ordine riconosciuto</div>
              </div>
            </div>
            <p className="testo-guida">
              {feedback.ultimo
                ? `Ultimo import: ${dataBreve(feedback.ultimo)}.`
                : "Mai importato finora."}{" "}
              Un feedback resta «senza ordine riconosciuto» quando il numero non basta a capire di
              quale ordine si parla (lo stesso numero esiste su più negozi): meglio scollegato che
              attaccato all&apos;ordine sbagliato.
            </p>
            <form action={importaFeedbackOrdini} style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8 }}>
              <button className="btn" type="submit">Importa ora</button>
              <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" name="completo" /> rileggi tutto dall&apos;inizio
              </label>
            </form>
          </>
        )}
      </div>

      {/* ---------- Controllo dei soldi: Finance e quota del fornitore ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Controllo dei soldi (movimenti da Finance)</div>
        <p className="testo-guida">
          I <strong>movimenti bancari</strong> arrivano da Finance (deluxy-partner), che resta il padrone
          dell&apos;estratto conto: qui se ne tiene una copia di sola lettura per poter dire{" "}
          <strong>a quale ordine appartiene</strong> ciascun incasso e ciascun pagamento al fornitore. Da lì
          nascono i <strong>margini</strong>. L&apos;import e l&apos;abbinamento automatico girano ogni notte con la
          sincronizzazione da Shopify.
        </p>

        {!financeConfigurato ? (
          <p className="testo-guida" style={{ marginTop: 10 }}>
            Non configurato: servono <code className="inline">FINANCE_URL</code> e{" "}
            <code className="inline">FINANCE_API_KEY</code> (la chiave è quella delle API di verifica di
            deluxy-partner, in Impostazioni là).
          </p>
        ) : (
          <>
            <div className="kpi-riga" style={{ marginTop: 12 }}>
              <div className="kpi">
                <div className="kpi-valore">{movimenti.totale.toLocaleString("it-IT")}</div>
                <div className="kpi-etichetta">Movimenti copiati</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{movimenti.entrate.toLocaleString("it-IT")}</div>
                <div className="kpi-etichetta">Entrate (incassi)</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{movimenti.uscite.toLocaleString("it-IT")}</div>
                <div className="kpi-etichetta">Uscite (pagamenti)</div>
              </div>
              <div className="kpi">
                <div className="kpi-valore">{controllo.conCosto.toLocaleString("it-IT")}</div>
                <div className="kpi-etichetta">Ordini con un costo</div>
              </div>
            </div>
            <p className="testo-guida">
              {movimenti.ultimoImport ? `Ultimo scarico: ${dataBreve(movimenti.ultimoImport)}.` : "Mai scaricato finora."}{" "}
              {movimenti.primo && movimenti.ultimo
                ? `L'estratto copre dal ${dataBreve(movimenti.primo)} al ${dataBreve(movimenti.ultimo)}: gli ordini più vecchi non hanno un movimento da abbinare, e non è un errore.`
                : ""}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              <form action={importaMovimentiBanca} style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <button className="btn" type="submit">Scarica i movimenti</button>
                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" name="completo" value="si" /> rileggi tutto dall&apos;inizio
                </label>
              </form>
              <form action={adottaDaFinance}>
                <button
                  className="btn btn-secondario"
                  type="submit"
                  title="Prende da Finance lo stato dell'incasso e i costi già registrati là. Non sovrascrive quello che è stato deciso qui."
                >
                  Adotta il controllo fatto in Finance
                </button>
              </form>
              <form action={abbinaPerNumero}>
                <button className="btn btn-secondario" type="submit">⇄ Abbina per numero in causale</button>
              </form>
            </div>
          </>
        )}

        <form action={salvaQuota} className="modulo" style={{ marginTop: 14 }}>
          <div className="campo-modulo">
            <label htmlFor="quota">Quota attesa del fornitore (%)</label>
            <input id="quota" name="quota" inputMode="decimal" defaultValue={String(quota)} />
          </div>
          <div className="azioni-modulo campo-modulo">
            <button className="btn btn-secondario" type="submit">Salva la quota</button>
          </div>
        </form>
        <p className="testo-guida">
          È la parte del valore dell&apos;ordine che di norma paghiamo al fornitore: pagare <strong>sotto</strong> è
          bene, <strong>sopra</strong> è male. Non serve a calcolare un costo — quello si registra ordine per ordine
          — ma a segnalare gli scostamenti e a dare l&apos;ordine di grandezza del margine atteso.
        </p>
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
                <tr><th>Brand</th><th>Colore</th><th>Nome in Ricerca fornitori</th><th>Specialita'</th><th>Dominio</th><th>Auth</th><th>Ultima sync</th><th>Stato</th><th></th></tr>
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
                    <td>
                      <form action={cambiaBrandRicerca} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <input
                          name="brandRicerca"
                          defaultValue={n.brandRicerca ?? ""}
                          placeholder={n.brand}
                          style={{ font: "inherit", fontSize: 13, width: 150, padding: "6px 9px", borderRadius: "var(--radius-s)", background: "var(--fill)", border: "1px solid transparent" }}
                        />
                        <button className="btn btn-secondario small" type="submit">Salva</button>
                      </form>
                    </td>
                    <td>
                      {/* La specialità del negozio: si usa per classificare i
                          prodotti che dal titolo non si riconoscono. */}
                      <form action={impostaCategoriaNegozio} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="id" value={n.id} />
                        <select
                          name="categoriaPredefinita"
                          defaultValue={n.categoriaPredefinita ?? ""}
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
      <ChiaviApi
        chiavi={chiavi.map((k) => ({
          id: k.id,
          nome: k.nome,
          scrittura: k.scrittura,
          attiva: k.attiva,
          creata: dataBreve(k.creataIl),
          ultimoUso: k.ultimoUso ? dataBreve(k.ultimoUso) : null,
        }))}
        crea={creaChiaveApi}
        rigenera={rigeneraChiaveApi}
        elimina={eliminaChiaveApi}
        sospendi={toggleChiave}
      />
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
