import Link from "next/link";
import { prisma } from "@/lib/db";
import { whereOrdini, euro, dataBreve } from "@/lib/ordini";
import { statiOrdinati } from "@/lib/stati";
import { CATEGORIE_PAGAMENTO, APP_DESTINAZIONI, nomeApp } from "@/lib/classificazione";
import { CambiaStatoSelect } from "@/components/CambiaStatoSelect";
import { brandConColore, mappaColori, coloreBrand } from "@/lib/brand";
import { sincronizza } from "./actions";

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;
// Quanti ordini mostrare in ogni colonna della vista per brand
const PER_COLONNA = 40;

export default async function ElencoOrdini({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(sp);
  const where = whereOrdini(params);
  const pagina = Math.max(1, Number(sp.page ?? "1") || 1);
  // Due viste: elenco (tabella) e colonne per brand (una colonna per negozio).
  const vista = sp.vista === "brand" ? "brand" : "elenco";

  const [stati, brand, etichette, totale, somma, ordini] = await Promise.all([
    statiOrdinati(),
    brandConColore(),
    prisma.etichetta.findMany({ orderBy: { nome: "asc" } }),
    prisma.ordine.count({ where }),
    prisma.ordine.aggregate({ where, _sum: { totale: true } }),
    vista === "elenco"
      ? prisma.ordine.findMany({
          where,
          include: { stato: true, etichette: true, negozio: { select: { brand: true } } },
          orderBy: { data: "desc" },
          skip: (pagina - 1) * PER_PAGINA,
          take: PER_PAGINA,
        })
      : Promise.resolve([]),
  ]);

  // Vista a colonne: per ogni brand, i suoi ordini più recenti (con gli stessi
  // filtri e la stessa ricerca dell'elenco).
  const colonneBrand =
    vista === "brand"
      ? await Promise.all(
          brand.map(async (b) => {
            const dove = { AND: [where, { brand: b.nome }] };
            const [conta, somma, ordini] = await Promise.all([
              prisma.ordine.count({ where: dove }),
              prisma.ordine.aggregate({ where: dove, _sum: { totale: true } }),
              prisma.ordine.findMany({
                where: dove,
                include: { stato: true, etichette: true },
                orderBy: { data: "desc" },
                take: PER_COLONNA,
              }),
            ]);
            return { brand: b, conta, valore: somma._sum.totale ?? 0, ordini };
          }),
        )
      : [];

  const colori = mappaColori(brand);
  const totalePagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const statiOpt = stati.map((s) => ({ id: s.id, nome: s.nome }));
  const negozi = brand;
  const nessunNegozio = brand.length === 0;

  function conFiltro(extra: Record<string, string>): string {
    const q = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/?${q.toString()}`;
  }

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Ordini</h1>
          <p className="page-sub">Il registro di tutti gli ordini Shopify, riclassificabili a piacimento.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Selettore di vista: elenco oppure una colonna per brand */}
          <div className="scelta-vista" role="group" aria-label="Vista">
            <Link className={`vista-opz${vista === "elenco" ? " attiva" : ""}`} href={conFiltro({ vista: "" })}>
              Elenco
            </Link>
            <Link className={`vista-opz${vista === "brand" ? " attiva" : ""}`} href={conFiltro({ vista: "brand", page: "" })}>
              Colonne per brand
            </Link>
          </div>
          <form action={sincronizza}>
            <input type="hidden" name="giorni" value="90" />
            <button className="btn" type="submit" disabled={nessunNegozio}>
              Sincronizza da Shopify
            </button>
          </form>
        </div>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{totale.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Ordini nel filtro</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(somma._sum.totale ?? 0)}</div>
          <div className="kpi-etichetta">Valore totale</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{negozi.filter((n) => n.attivo).length}</div>
          <div className="kpi-etichetta">Negozi attivi</div>
        </div>
      </div>

      {/* Ricerca in evidenza: una sola casella che cerca ovunque */}
      <form className="ricerca" method="get">
        {/* conserva i filtri attivi mentre si cerca */}
        {["brand", "stato", "categoria", "app", "etichetta"].map((k) =>
          sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null,
        )}
        <span className="ricerca-icona" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 20 20" />
          </svg>
        </span>
        <input
          type="search"
          name="q"
          autoFocus={!sp.q}
          placeholder="Cerca un ordine: numero, cliente, email, telefono, indirizzo, prodotto, SKU, note…"
          defaultValue={sp.q ?? ""}
        />
        <button className="btn" type="submit">Cerca</button>
        {sp.q && (
          <Link className="btn btn-secondario" href={conFiltro({ q: "", page: "" })}>
            Annulla
          </Link>
        )}
      </form>

      {sp.q && (
        <p className="esito-ricerca">
          {totale === 0
            ? "Nessun ordine trovato"
            : totale === 1
              ? "1 ordine trovato"
              : `${totale.toLocaleString("it-IT")} ordini trovati`}{" "}
          per «{sp.q}»
        </p>
      )}

      {/* Filtri */}
      <form className="filtri" method="get">
        {sp.q && <input type="hidden" name="q" value={sp.q} />}
        {vista !== "elenco" && <input type="hidden" name="vista" value={vista} />}
        <select name="brand" defaultValue={sp.brand ?? ""}>
          <option value="">Tutti i brand</option>
          {negozi.map((n) => (
            <option key={n.id} value={n.nome}>{n.nome}</option>
          ))}
        </select>
        <select name="stato" defaultValue={sp.stato ?? ""}>
          <option value="">Tutti gli stati</option>
          {stati.map((s) => (
            <option key={s.id} value={s.chiave}>{s.nome}</option>
          ))}
        </select>
        <select name="categoria" defaultValue={sp.categoria ?? ""}>
          <option value="">Ogni pagamento</option>
          {CATEGORIE_PAGAMENTO.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select name="app" defaultValue={sp.app ?? ""}>
          <option value="">Ogni destinazione</option>
          {APP_DESTINAZIONI.map((a) => (
            <option key={a.id} value={a.id}>{a.nome}</option>
          ))}
        </select>
        <select name="etichetta" defaultValue={sp.etichetta ?? ""}>
          <option value="">Ogni etichetta</option>
          {etichette.map((e) => (
            <option key={e.id} value={e.nome}>{e.nome}</option>
          ))}
        </select>
        <button className="btn btn-secondario small" type="submit">Filtra</button>
        <Link className="btn btn-secondario small" href="/">Azzera</Link>
      </form>

      {/* ---------- Vista a colonne per brand ---------- */}
      {vista === "brand" &&
        (nessunNegozio ? (
          <div className="vuoto">
            Nessun negozio collegato. Vai in <Link href="/impostazioni" className="ritorno">Impostazioni</Link> per aggiungere un negozio Shopify.
          </div>
        ) : (
          <div className="colonne-brand">
            {colonneBrand.map(({ brand: b, conta, valore, ordini: suoi }) => (
              <div className="colonna" key={b.id} style={{ ["--brand" as string]: b.colore }}>
                <div className="colonna-testa colonna-testa-brand">
                  <span className="colonna-dot" style={{ background: b.colore }} />
                  <span className="colonna-nome">{b.nome}</span>
                  <span className="colonna-conta">{conta.toLocaleString("it-IT")}</span>
                </div>
                <div className="colonna-valore">{euro(valore)}</div>
                {suoi.length === 0 ? (
                  <div className="colonna-vuota">Nessun ordine</div>
                ) : (
                  suoi.map((o) => (
                    <div className="card-ordine card-brand" key={o.id}>
                      <div className="card-testa">
                        <Link href={`/ordini/${o.id}`} className="card-numero">{o.numero}</Link>
                        <span className="card-totale">{euro(o.totale, o.valuta)}</span>
                      </div>
                      <div className="card-cliente">
                        {o.clienteNome ?? o.spedizioneNome ?? "—"}
                        {o.citta ? ` · ${o.citta}` : ""}
                      </div>
                      <div className="card-meta">
                        <span className="card-data">{dataBreve(o.data)}</span>
                        <CambiaStatoSelect ordineId={o.id} statoAttualeId={o.statoId} stati={statiOpt} compatto />
                      </div>
                      {o.etichette.length > 0 && (
                        <div className="card-etichette">
                          {o.etichette.map((e) => (
                            <span key={e.id} className="tag" style={{ color: e.colore }}>
                              <span className="dot" /><span className="tag-label">{e.nome}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
                {conta > suoi.length && (
                  <Link className="colonna-vuota colonna-altri" href={conFiltro({ vista: "", brand: b.nome })}>
                    +{(conta - suoi.length).toLocaleString("it-IT")} altri — vedi tutti
                  </Link>
                )}
              </div>
            ))}
          </div>
        ))}

      {/* ---------- Vista elenco ---------- */}
      {vista === "elenco" &&
        (ordini.length === 0 ? (
        <div className="vuoto">
          {nessunNegozio ? (
            <>Nessun negozio collegato. Vai in <Link href="/impostazioni" className="ritorno">Impostazioni</Link> per aggiungere un negozio Shopify e sincronizzare gli ordini.</>
          ) : (
            <>Nessun ordine con questi filtri.</>
          )}
        </div>
      ) : (
        <>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordine</th>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th className="num">Totale</th>
                  <th>Pagamento</th>
                  <th>Stato</th>
                  <th>Destinazione</th>
                  <th>Etichette</th>
                </tr>
              </thead>
              <tbody>
                {ordini.map((o) => (
                  <tr key={o.id} className="riga-brand" style={{ ["--brand" as string]: coloreBrand(colori, o.brand) }}>
                    <td>
                      <Link href={`/ordini/${o.id}`} className="cella-nome">{o.numero}</Link>
                      <div className="cella-sub cella-brand">
                        <span className="brand-dot" />
                        {o.brand}
                      </div>
                    </td>
                    <td className="cella-muta">{dataBreve(o.data)}</td>
                    <td>
                      <div>{o.clienteNome ?? o.spedizioneNome ?? "—"}</div>
                      {o.citta && <div className="cella-sub">{o.citta}</div>}
                    </td>
                    <td className="cella-num">{euro(o.totale, o.valuta)}</td>
                    <td><span className="badge neutro">{o.categoriaPagamento}</span></td>
                    <td>
                      <CambiaStatoSelect ordineId={o.id} statoAttualeId={o.statoId} stati={statiOpt} compatto />
                    </td>
                    <td className="cella-muta">{nomeApp(o.assegnatoApp) ?? "—"}</td>
                    <td>
                      {o.etichette.length === 0 ? (
                        <span className="tag-vuoto">—</span>
                      ) : (
                        <span className="etichette">
                          {o.etichette.map((e) => (
                            <span key={e.id} className="tag" style={{ color: e.colore }}>
                              <span className="dot" /><span className="tag-label">{e.nome}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="paginazione">
            <span>{totale.toLocaleString("it-IT")} ordini · pagina {pagina} di {totalePagine}</span>
            <nav>
              {pagina > 1 && <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina - 1) })}>← Precedente</Link>}
              {pagina < totalePagine && <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina + 1) })}>Successiva →</Link>}
            </nav>
          </div>
        </>
      ))}
    </main>
  );
}
