import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/Badge";
import { BarraMargine } from "@/components/BarraMargine";
import { prisma } from "@/lib/db";
import { aggiornaProdotto, aggiungiVariante, cambiaFase, eliminaVariante, segnaShopify } from "@/lib/azioni";
import { costruisciPayloadShopify, shopifyConfigurato } from "@/lib/shopify";
import {
  calcolaMargine,
  CATEGORIE,
  COLORE_FASE,
  COLORE_SHOPIFY,
  ETICHETTA_CATEGORIA,
  ETICHETTA_FASE,
  ETICHETTA_SHOPIFY,
  etichettaCategoria,
  euro,
  FASI_PLM,
  iso,
  percentuale,
  prezzoVariante,
  STATI_SHOPIFY,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

const TABS = [
  ["panoramica", "Panoramica"],
  ["sviluppo", "Sviluppo"],
  ["costi", "Costi & margini"],
  ["visual", "Visual"],
  ["shopify", "Shopify"],
] as const;

export default async function ProdottoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabRaw } = await searchParams;
  const tab = TABS.some(([t]) => t === tabRaw) ? tabRaw! : "panoramica";

  const [prodotto, collezioni] = await Promise.all([
    prisma.prodotto.findUnique({
      where: { id },
      include: {
        collezione: true,
        fornitore: true,
        varianti: { orderBy: { creataIl: "asc" } },
        tappe: { orderBy: { creataIl: "desc" } },
        vetrine: { include: { vetrina: true }, orderBy: { posizione: "asc" } },
      },
    }),
    prisma.collezione.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!prodotto) notFound();

  const m = calcolaMargine(prodotto.costoProduzione, prodotto.prezzoVendita);
  const target = prodotto.collezione?.margineTarget ?? null;
  const salva = aggiornaProdotto.bind(null, id);

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" collezioneAttiva={prodotto.collezioneId ?? undefined} />
      <main className="main">
        <a className="ritorno" href="/prodotti">← Prodotti</a>

        <div className="prodotto-hero">
          <div className="prodotto-foto">
            {prodotto.immagine ? <img src={prodotto.immagine} alt={prodotto.nome} /> : "❀"}
          </div>
          <div className="prodotto-intesta">
            <div className="prodotto-codice">{prodotto.codice}</div>
            <div className="prodotto-nome">{prodotto.nome}</div>
            <div className="prodotto-badges">
              <Badge testo={ETICHETTA_FASE[prodotto.fase]} colore={COLORE_FASE[prodotto.fase]} />
              <Badge testo={etichettaCategoria(prodotto.categoria)} colore="var(--text-tertiary)" />
              <Badge testo={ETICHETTA_SHOPIFY[prodotto.shopifyStato]} colore={COLORE_SHOPIFY[prodotto.shopifyStato]} />
              {prodotto.collezione && (
                <a className="badge" style={{ color: "var(--blue)" }} href={`/collezioni/${prodotto.collezioneId}`}>
                  {prodotto.collezione.nome}
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="tabs">
          {TABS.map(([t, label]) => (
            <a key={t} className={`tab${tab === t ? " attivo" : ""}`} href={`?tab=${t}`}>{label}</a>
          ))}
        </div>

        {/* ---------- Fase (visibile in Panoramica e Sviluppo) ---------- */}
        {(tab === "panoramica" || tab === "sviluppo") && (
          <div className="scheda">
            <div className="scheda-titolo">Fase del ciclo di vita</div>
            <div className="pill-scelta">
              {FASI_PLM.map((f) => {
                const attuale = prodotto.fase === f;
                return (
                  <form action={cambiaFase.bind(null, id, f)} key={f}>
                    <button type="submit" className={`pill-opt${attuale ? " attuale" : ""}`} disabled={attuale} style={{ color: attuale ? undefined : COLORE_FASE[f] }}>
                      <span className="dot" style={{ background: COLORE_FASE[f] }} />
                      {ETICHETTA_FASE[f]}
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- Panoramica ---------- */}
        {tab === "panoramica" && (
          <form action={salva}>
            <div className="scheda">
              <div className="scheda-titolo">Anagrafica</div>
              <div className="modulo">
                <div className="campo-modulo largo">
                  <label>Nome</label>
                  <input name="nome" defaultValue={prodotto.nome} />
                </div>
                <div className="campo-modulo">
                  <label>Collezione</label>
                  <select name="collezioneId" defaultValue={prodotto.collezioneId ?? ""}>
                    <option value="">— Nessuna —</option>
                    {collezioni.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo-modulo">
                  <label>Categoria</label>
                  <select name="categoria" defaultValue={prodotto.categoria}>
                    {CATEGORIE.map((c) => (
                      <option key={c} value={c}>{ETICHETTA_CATEGORIA[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="campo-modulo largo">
                  <label>Descrizione</label>
                  <textarea name="descrizione" rows={3} defaultValue={prodotto.descrizione ?? ""} />
                </div>
              </div>
              <div className="azioni-modulo">
                <button type="submit" className="btn">Salva</button>
              </div>
            </div>
          </form>
        )}

        {/* ---------- Sviluppo (PLM) ---------- */}
        {tab === "sviluppo" && (
          <div className="due-colonne">
            <form action={salva}>
              <div className="scheda">
                <div className="scheda-titolo">Scheda creativa</div>
                <div className="modulo">
                  <div className="campo-modulo largo">
                    <label>Brief</label>
                    <textarea name="brief" rows={3} defaultValue={prodotto.brief ?? ""} />
                  </div>
                  <div className="campo-modulo">
                    <label>Materiali / fiori</label>
                    <input name="materiali" defaultValue={prodotto.materiali ?? ""} />
                  </div>
                  <div className="campo-modulo">
                    <label>Palette</label>
                    <input name="palette" defaultValue={prodotto.palette ?? ""} />
                  </div>
                  <div className="campo-modulo largo">
                    <label>Note di sviluppo</label>
                    <textarea name="noteSviluppo" rows={3} defaultValue={prodotto.noteSviluppo ?? ""} />
                  </div>
                </div>
                <div className="azioni-modulo">
                  <button type="submit" className="btn">Salva</button>
                </div>
              </div>
            </form>
            <div className="scheda">
              <div className="scheda-titolo">Storico delle fasi</div>
              {prodotto.tappe.length === 0 ? (
                <div className="vuoto-mini">Nessun passaggio registrato.</div>
              ) : (
                <ul className="storia">
                  {prodotto.tappe.map((t) => (
                    <li key={t.id}>
                      <span className="storia-data">{iso(t.creataIl)}</span>
                      <span>{ETICHETTA_FASE[t.da] ?? t.da}</span>
                      <span className="storia-freccia">→</span>
                      <span>{ETICHETTA_FASE[t.a] ?? t.a}</span>
                      {t.nota && <span className="storia-nota">{t.nota}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {prodotto.fornitore && (
                <p className="page-sub" style={{ marginTop: 14 }}>
                  Fornitore: <b>{prodotto.fornitore.nome}</b>{prodotto.fornitore.citta ? ` · ${prodotto.fornitore.citta}` : ""}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ---------- Costi & margini ---------- */}
        {tab === "costi" && (
          <>
            <div className="due-colonne">
              <form action={salva}>
                <div className="scheda">
                  <div className="scheda-titolo">Costo e prezzo (base)</div>
                  <div className="modulo">
                    <div className="campo-modulo">
                      <label>Costo di produzione (€)</label>
                      <input name="costoProduzione" type="number" step="0.01" min="0" defaultValue={prodotto.costoProduzione} />
                    </div>
                    <div className="campo-modulo">
                      <label>Prezzo di vendita (€)</label>
                      <input name="prezzoVendita" type="number" step="0.01" min="0" defaultValue={prodotto.prezzoVendita} />
                    </div>
                  </div>
                  <div className="azioni-modulo">
                    <button type="submit" className="btn">Salva</button>
                  </div>
                </div>
              </form>
              <div className="scheda">
                <div className="scheda-titolo">Marginalità</div>
                <div className="griglia-campi">
                  <div className="campo"><dt>Costo</dt><dd>{euro(m.costo)}</dd></div>
                  <div className="campo"><dt>Prezzo</dt><dd>{euro(m.prezzo)}</dd></div>
                  <div className="campo"><dt>Guadagno unitario</dt><dd>{euro(m.guadagno)}</dd></div>
                  <div className="campo"><dt>Mark-up</dt><dd>{percentuale(m.ricaricoPct)}</dd></div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div className="scheda-titolo" style={{ marginBottom: 8 }}>Margine sul venduto{target != null ? ` · target ${target}%` : ""}</div>
                  <BarraMargine marginePct={m.marginePct} target={target} />
                </div>
              </div>
            </div>

            <div className="scheda">
              <div className="scheda-titolo">Varianti</div>
              {prodotto.varianti.length > 0 && (
                <div className="tabella-wrap" style={{ marginBottom: 14 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Variante</th><th>SKU</th><th className="num">Prezzo</th><th className="num">Costo</th>
                        <th>Margine</th><th className="num">Giacenza</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {prodotto.varianti.map((v) => {
                        const pv = prezzoVariante(prodotto, v);
                        const mv = calcolaMargine(pv.costo, pv.prezzo);
                        return (
                          <tr key={v.id}>
                            <td className="cella-nome">{v.nome}</td>
                            <td className="cella-muta">{v.sku ?? "—"}</td>
                            <td className="num">{euro(pv.prezzo)}</td>
                            <td className="num">{euro(pv.costo)}</td>
                            <td>{percentuale(mv.marginePct)}</td>
                            <td className="num">{v.giacenza}</td>
                            <td className="num">
                              <form action={eliminaVariante.bind(null, v.id, id)}>
                                <button className="icon-btn" title="Elimina variante" type="submit">✕</button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <form action={aggiungiVariante.bind(null, id)}>
                <div className="modulo" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
                  <div className="campo-modulo"><label>Nome</label><input name="nome" placeholder="Deluxe" required /></div>
                  <div className="campo-modulo"><label>SKU</label><input name="sku" placeholder="opz." /></div>
                  <div className="campo-modulo"><label>Δ prezzo (€)</label><input name="deltaPrezzo" type="number" step="0.01" defaultValue="0" /></div>
                  <div className="campo-modulo"><label>Δ costo (€)</label><input name="deltaCosto" type="number" step="0.01" defaultValue="0" /></div>
                  <div className="campo-modulo"><label>Giacenza</label><input name="giacenza" type="number" step="1" defaultValue="0" /></div>
                </div>
                <div className="azioni-modulo">
                  <button type="submit" className="btn btn-secondario">Aggiungi variante</button>
                </div>
              </form>
            </div>
          </>
        )}

        {/* ---------- Visual ---------- */}
        {tab === "visual" && (
          <div className="due-colonne">
            <form action={salva}>
              <div className="scheda">
                <div className="scheda-titolo">Immagine e priorità di esposizione</div>
                <div className="modulo">
                  <div className="campo-modulo largo">
                    <label>Immagine (URL)</label>
                    <input name="immagine" defaultValue={prodotto.immagine ?? ""} placeholder="https://…" />
                  </div>
                  <div className="campo-modulo">
                    <label>Priorità (0–10)</label>
                    <input name="priorita" type="number" min="0" max="10" step="1" defaultValue={prodotto.priorita} />
                  </div>
                </div>
                <div className="azioni-modulo">
                  <button type="submit" className="btn">Salva</button>
                </div>
              </div>
            </form>
            <div className="scheda">
              <div className="scheda-titolo">Presente negli allestimenti</div>
              {prodotto.vetrine.length === 0 ? (
                <div className="vuoto-mini">Non è in nessuna vetrina o lookbook. <a className="ritorno" style={{ margin: 0 }} href="/visual">Vai a Visual →</a></div>
              ) : (
                <ul className="storia">
                  {prodotto.vetrine.map((vp) => (
                    <li key={vp.id}>
                      <a href={`/visual/${vp.vetrinaId}`} className="cella-nome">{vp.vetrina.nome}</a>
                      <span className="storia-nota">posizione {vp.posizione + 1}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ---------- Shopify ---------- */}
        {tab === "shopify" && (
          <>
            <div className="nota-info">
              <span className="nota-icona">◆</span>
              <span>
                {shopifyConfigurato()
                  ? "Negozio Shopify collegato. La pubblicazione invierà il payload qui sotto all'Admin API."
                  : "Nessun negozio Shopify collegato (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_TOKEN non impostati). Puoi comunque preparare e segnare lo stato: il payload è pronto, la scrittura reale sul negozio si attiva collegando le credenziali."}
              </span>
            </div>
            <div className="scheda">
              <div className="scheda-titolo">Stato di pubblicazione</div>
              <div className="pill-scelta">
                {STATI_SHOPIFY.map((s) => {
                  const attuale = prodotto.shopifyStato === s;
                  return (
                    <form action={segnaShopify.bind(null, id, s)} key={s}>
                      <button type="submit" className={`pill-opt${attuale ? " attuale" : ""}`} disabled={attuale} style={{ color: attuale ? undefined : COLORE_SHOPIFY[s] }}>
                        <span className="dot" style={{ background: COLORE_SHOPIFY[s] }} />
                        {ETICHETTA_SHOPIFY[s]}
                      </button>
                    </form>
                  );
                })}
              </div>
              {prodotto.shopifySyncIl && (
                <p className="page-sub" style={{ marginTop: 12 }}>Ultima sincronizzazione: {iso(prodotto.shopifySyncIl)}{prodotto.shopifyId ? ` · ${prodotto.shopifyId}` : ""}</p>
              )}
            </div>
            <div className="scheda">
              <div className="scheda-titolo">Anteprima payload Shopify</div>
              <pre className="codice-blocco">{JSON.stringify(costruisciPayloadShopify(prodotto), null, 2)}</pre>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
