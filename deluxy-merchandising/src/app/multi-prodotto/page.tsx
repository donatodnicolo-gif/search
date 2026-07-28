import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { creaCompostoAzione } from "@/lib/azioni-composti";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { elencoCategorie } from "@/lib/classificazione";
import {
  CAMPI_COMPONENTE,
  conti,
  elencoComposti,
  leggiScelti,
  righeDaScelti,
  scriviScelti,
} from "@/lib/composti";
import { prisma } from "@/lib/db";
import { calcolaMargine, euro, percentuale } from "@/lib/dominio";

export const dynamic = "force-dynamic";

const PER_RICERCA = 30;

// **Multi prodotto**: si mettono insieme più prodotti del catalogo e ne esce un
// prodotto nuovo — il cesto, la composizione, il kit.
//
// Mentre si compone, la scelta vive nell'indirizzo e non nel database: si
// provano accostamenti, si guardano costi e margine, si cambia idea, e il
// catalogo non si riempie di prodotti vuoti. Il prodotto nasce quando si
// conferma.
export default async function MultiProdottoPage({
  searchParams,
}: {
  searchParams: Promise<{ cerca?: string; scelti?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();

  const scelti = leggiScelti(sp.scelti);
  const cerca = (sp.cerca ?? "").trim();

  const [righe, trovati, composti, categorie] = await Promise.all([
    righeDaScelti(scelti),
    cerca.length >= 2
      ? prisma.prodotto.findMany({
          where: {
            ...filtroProdotti(brand),
            unitoAId: null,
            OR: [
              { nome: { contains: cerca, mode: "insensitive" } },
              { codice: { contains: cerca, mode: "insensitive" } },
            ],
          },
          orderBy: { nome: "asc" },
          take: PER_RICERCA,
          select: CAMPI_COMPONENTE,
        })
      : Promise.resolve([]),
    elencoComposti(),
    elencoCategorie(),
  ]);

  const c = conti(righe);
  const m = c.costoCompleto && c.sommaListini > 0 ? calcolaMargine(c.costo, c.sommaListini) : null;

  const conScelti = (nuovi: { id: string; quantita: number }[], altro?: Record<string, string>) => {
    const q = new URLSearchParams();
    if (cerca) q.set("cerca", cerca);
    const s = scriviScelti(nuovi);
    if (s) q.set("scelti", s);
    for (const [k, v] of Object.entries(altro ?? {})) q.set(k, v);
    const t = q.toString();
    return t ? `/multi-prodotto?${t}` : "/multi-prodotto";
  };
  const aggiungi = (id: string) => conScelti([...scelti, { id, quantita: 1 }]);
  const togli = (id: string) => conScelti(scelti.filter((s) => s.id !== id));
  const cambia = (id: string, d: number) =>
    conScelti(
      scelti.map((s) => (s.id === id ? { ...s, quantita: Math.max(1, Math.min(999, s.quantita + d)) } : s)),
    );

  const giaScelto = new Set(scelti.map((s) => s.id));

  return (
    <div className="layout">
      <Sidebar attiva="multi-prodotto" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Multi prodotto{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Più prodotti del catalogo messi insieme diventano un prodotto nuovo — un cesto, una composizione,
              un kit. Costo e prezzo <strong>non si riscrivono</strong>: si leggono dai componenti ogni volta,
              così se domani cambia il costo di un pezzo cambia da solo quello di tutti i composti che lo
              contengono.
            </p>
          </div>
        </div>

        {sp.errore && <div className="avviso avviso-errore">{sp.errore}</div>}

        {/* ---------- La composizione in corso ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Composizione in corso</div>
          {righe.length === 0 ? (
            <div className="vuoto-mini">
              Nessun componente scelto. Cercali qui sotto e aggiungili: i conti si aggiornano man mano.
            </div>
          ) : (
            <>
              <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Componente</th>
                      <th className="num">Costo unitario</th>
                      <th className="num">Listino unitario</th>
                      <th className="num">Quantità</th>
                      <th className="num">Costo riga</th>
                      <th className="num">Listino riga</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {c.righe.map((r) => (
                      <tr key={r.componente.id}>
                        <td>
                          <Link href={`/prodotti/${r.componente.id}`} className="cella-nome">
                            {r.componente.nome}
                          </Link>
                          <div className="cella-sub">
                            {r.componente.codice}
                            {r.componente.vendorShopify ? ` · ${r.componente.vendorShopify}` : ""}
                          </div>
                        </td>
                        <td className="num" style={{ color: r.costoRiga === null ? "var(--orange)" : undefined }}>
                          {r.componente.costoProduzione > 0 ? euro(r.componente.costoProduzione) : "non lo sappiamo"}
                        </td>
                        <td className="num">
                          {r.componente.prezzoVendita > 0 ? euro(r.componente.prezzoVendita) : "—"}
                        </td>
                        <td className="num">
                          <a className="btn small btn-secondario" href={cambia(r.componente.id, -1)}>
                            −
                          </a>{" "}
                          <strong>{r.quantita}</strong>{" "}
                          <a className="btn small btn-secondario" href={cambia(r.componente.id, +1)}>
                            +
                          </a>
                        </td>
                        <td className="num">{r.costoRiga === null ? "—" : euro(r.costoRiga)}</td>
                        <td className="num">{r.prezzoRiga === null ? "—" : euro(r.prezzoRiga)}</td>
                        <td>
                          <a className="btn small btn-secondario" href={togli(r.componente.id)}>
                            Togli
                          </a>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td>
                        <span className="cella-nome">Totale</span>
                        <div className="cella-sub">{c.pezzi} pezzi</div>
                      </td>
                      <td />
                      <td />
                      <td />
                      <td className="num">
                        <strong>{euro(c.costo)}</strong>
                        {!c.costoCompleto && (
                          <div className="cella-sub" style={{ color: "var(--orange)" }}>
                            parziale
                          </div>
                        )}
                      </td>
                      <td className="num">
                        <strong>{euro(c.sommaListini)}</strong>
                        {!c.listiniCompleti && <div className="cella-sub">parziale</div>}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Il punto della pagina: che cosa si può dire dei conti, e cosa no. */}
              {!c.costoCompleto ? (
                <div className="avviso avviso-attenzione" style={{ marginTop: 14 }}>
                  {c.senzaCosto} {c.senzaCosto === 1 ? "componente non ha" : "componenti non hanno"} un costo di
                  produzione: il costo qui sopra è <strong>parziale</strong> e il margine non si può calcolare.
                  Un margine costruito su costi incompleti sembra vero, e questo lo rende peggiore di un margine
                  assente.
                </div>
              ) : (
                <p className="page-sub" style={{ marginTop: 14 }}>
                  Comprando i componenti separati si spenderebbero <strong>{euro(c.sommaListini)}</strong>; il
                  costo di produzione è <strong>{euro(c.costo)}</strong>. Vendendo il composto alla somma dei
                  listini il margine sarebbe <strong>{m ? percentuale(m.marginePct) : "—"}</strong> (
                  {m ? euro(m.guadagno) : "—"} a pezzo).
                </p>
              )}
            </>
          )}
        </div>

        {/* ---------- Il form che crea il prodotto ---------- */}
        {righe.length >= 2 && (
          <form action={creaCompostoAzione}>
            <input type="hidden" name="scelti" value={scriviScelti(scelti)} />
            <div className="scheda">
              <div className="scheda-titolo">Il prodotto nuovo</div>
              <div className="modulo">
                <div className="campo-modulo largo">
                  <label>
                    Nome <span className="obbligatorio">*</span>
                  </label>
                  <input name="nome" placeholder="es. Cesto Ora Blu" required />
                </div>
                <div className="campo-modulo">
                  <label>Codice</label>
                  <input name="codice" placeholder="lo genero dal nome se lo lasci vuoto" />
                </div>
                <div className="campo-modulo">
                  <label>Categoria</label>
                  <select name="categoria" defaultValue="DA_CLASSIFICARE">
                    {categorie.map((x) => (
                      <option key={x.chiave} value={x.chiave}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="campo-modulo">
                  <label>Prezzo di vendita</label>
                  <input
                    name="prezzoVendita"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={c.listiniCompleti ? String(c.sommaListini.toFixed(2)) : "da decidere"}
                  />
                </div>
                <div className="campo-modulo largo">
                  <label>Descrizione</label>
                  <textarea name="descrizione" rows={2} />
                </div>
              </div>
              <p className="page-sub" style={{ margin: "4px 0 0" }}>
                Il <strong>costo non si scrive</strong>: resta la somma dei componenti, e si aggiorna con loro.
                Il prezzo invece lo decidi tu; lasciandolo vuoto parto dalla somma dei listini
                {c.listiniCompleti ? ` (${euro(c.sommaListini)})` : ", ma solo se i listini ci sono tutti"}.
              </p>
              <div className="azioni-modulo">
                <button className="btn" type="submit">
                  Crea il prodotto composto
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ---------- La ricerca dei componenti ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Aggancia i prodotti</div>
          <form method="get" className="filtri" style={{ marginBottom: 12 }}>
            <input type="hidden" name="scelti" value={scriviScelti(scelti)} />
            <input type="search" name="cerca" placeholder="Cerca per nome o codice…" defaultValue={cerca} />
            <button className="btn btn-secondario" type="submit">
              Cerca
            </button>
          </form>

          {cerca.length < 2 ? (
            <div className="vuoto-mini">Scrivi almeno due lettere per cercare nel catalogo.</div>
          ) : trovati.length === 0 ? (
            <div className="vuoto-mini">Nessun prodotto trovato per «{cerca}».</div>
          ) : (
            <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
              <table>
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th>Fornitore</th>
                    <th className="num">Costo</th>
                    <th className="num">Listino</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {trovati.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/prodotti/${p.id}`} className="cella-nome">
                          {p.nome}
                        </Link>
                        <div className="cella-sub">{p.codice}</div>
                      </td>
                      <td className="cella-muta">{p.vendorShopify ?? "—"}</td>
                      <td className="num" style={{ color: p.costoProduzione > 0 ? undefined : "var(--orange)" }}>
                        {p.costoProduzione > 0 ? euro(p.costoProduzione) : "—"}
                      </td>
                      <td className="num">{p.prezzoVendita > 0 ? euro(p.prezzoVendita) : "—"}</td>
                      <td>
                        {giaScelto.has(p.id) ? (
                          <span className="cella-muta">già dentro</span>
                        ) : (
                          <a className="btn small btn-secondario" href={aggiungi(p.id)}>
                            Aggancia
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {trovati.length === PER_RICERCA && (
            <p className="page-sub" style={{ marginBottom: 0 }}>
              Mostro i primi {PER_RICERCA}: se il tuo non c&apos;è, restringi la ricerca.
            </p>
          )}
        </div>

        {/* ---------- I composti che esistono già ---------- */}
        <h2 className="sezione-titolo" style={{ marginTop: 28 }}>
          Prodotti composti ({composti.length})
        </h2>
        {composti.length === 0 ? (
          <div className="vuoto">Nessun prodotto composto: il primo si crea qui sopra.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prodotto</th>
                  <th className="num">Componenti</th>
                  <th className="num">Costo dai componenti</th>
                  <th className="num">Somma listini</th>
                  <th className="num">Prezzo</th>
                  <th className="num">Margine</th>
                </tr>
              </thead>
              <tbody>
                {composti.map((x) => {
                  const mg =
                    x.conti.costoCompleto && x.prezzoVendita > 0
                      ? calcolaMargine(x.conti.costo, x.prezzoVendita)
                      : null;
                  return (
                    <tr key={x.id} className="riga-cliccabile">
                      <td>
                        <Link href={`/prodotti/${x.id}?tab=composizione`} className="cella-nome link-riga">
                          {x.nome}
                        </Link>
                        <div className="cella-sub">{x.codice}</div>
                      </td>
                      <td className="num">{x.componenti.length}</td>
                      <td className="num">
                        {euro(x.conti.costo)}
                        {!x.conti.costoCompleto && (
                          <div className="cella-sub" style={{ color: "var(--orange)" }}>
                            parziale · {x.conti.senzaCosto} senza costo
                          </div>
                        )}
                      </td>
                      <td className="num">{euro(x.conti.sommaListini)}</td>
                      <td className="num">{x.prezzoVendita > 0 ? euro(x.prezzoVendita) : "—"}</td>
                      <td className="num">
                        {mg ? percentuale(mg.marginePct) : <span className="cella-muta">da valutare</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
