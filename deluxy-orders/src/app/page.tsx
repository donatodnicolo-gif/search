import Link from "next/link";
import { prisma } from "@/lib/db";
import { whereOrdini, euro, dataBreve } from "@/lib/ordini";
import { statiOrdinati } from "@/lib/stati";
import { CATEGORIE_PAGAMENTO, APP_DESTINAZIONI, nomeApp } from "@/lib/classificazione";
import { CambiaStatoSelect } from "@/components/CambiaStatoSelect";
import { sincronizza } from "./actions";

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;

export default async function ElencoOrdini({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(sp);
  const where = whereOrdini(params);
  const pagina = Math.max(1, Number(sp.page ?? "1") || 1);

  const [stati, negozi, etichette, totale, somma, ordini] = await Promise.all([
    statiOrdinati(),
    prisma.negozioShopify.findMany({ orderBy: { brand: "asc" } }),
    prisma.etichetta.findMany({ orderBy: { nome: "asc" } }),
    prisma.ordine.count({ where }),
    prisma.ordine.aggregate({ where, _sum: { totale: true } }),
    prisma.ordine.findMany({
      where,
      include: { stato: true, etichette: true, negozio: { select: { brand: true } } },
      orderBy: { data: "desc" },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
  ]);

  const totalePagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const statiOpt = stati.map((s) => ({ id: s.id, nome: s.nome }));
  const nessunNegozio = negozi.length === 0;

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
        <form action={sincronizza}>
          <input type="hidden" name="giorni" value="90" />
          <button className="btn" type="submit" disabled={nessunNegozio}>
            Sincronizza da Shopify
          </button>
        </form>
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
        <select name="brand" defaultValue={sp.brand ?? ""}>
          <option value="">Tutti i brand</option>
          {negozi.map((n) => (
            <option key={n.id} value={n.brand}>{n.brand}</option>
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

      {ordini.length === 0 ? (
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
                  <tr key={o.id}>
                    <td>
                      <Link href={`/ordini/${o.id}`} className="cella-nome">{o.numero}</Link>
                      <div className="cella-sub">{o.brand}</div>
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
      )}
    </main>
  );
}
