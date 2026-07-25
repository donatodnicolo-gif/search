import Link from "next/link";
import { euro, dataBreve } from "@/lib/ordini";
import { brandConColore, mappaColori, coloreBrand } from "@/lib/brand";
import {
  elencoClienti,
  contaClienti,
  ordinamentoValido,
  codificaChiave,
  ordiniSenzaCliente,
} from "@/lib/clienti";

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;

export default async function Clienti({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const ordina = ordinamentoValido(sp.ordina);
  const pagina = Math.max(1, Number(sp.page ?? "1") || 1);

  const [brand, totale, clienti, senzaCliente] = await Promise.all([
    brandConColore(),
    contaClienti(q),
    elencoClienti(q, ordina, (pagina - 1) * PER_PAGINA, PER_PAGINA),
    ordiniSenzaCliente(),
  ]);

  const colori = mappaColori(brand);
  const totalePagine = Math.max(1, Math.ceil(totale / PER_PAGINA));

  function conFiltro(extra: Record<string, string>): string {
    const p = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/clienti?${p.toString()}`;
  }

  const ordinamenti: { chiave: string; nome: string }[] = [
    { chiave: "speso", nome: "Più spesa" },
    { chiave: "ordini", nome: "Più ordini" },
    { chiave: "recenti", nome: "Più recenti" },
    { chiave: "nome", nome: "Nome" },
  ];

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Clienti</h1>
          <p className="page-sub">
            Chi ha ordinato, ricavato dagli ordini: un cliente per email (o telefono, o nome), con tutti i suoi ordini in un posto solo.
          </p>
        </div>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{totale.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">{q ? "Clienti trovati" : "Clienti totali"}</div>
        </div>
        {senzaCliente > 0 && (
          <div className="kpi">
            <div className="kpi-valore">{senzaCliente.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Ordini senza dati cliente</div>
          </div>
        )}
      </div>

      {/* Ricerca */}
      <form className="ricerca" method="get">
        {sp.ordina && <input type="hidden" name="ordina" value={sp.ordina} />}
        <span className="ricerca-icona" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 20 20" />
          </svg>
        </span>
        <input
          type="search"
          name="q"
          placeholder="Cerca un cliente: nome, email, telefono, città…"
          defaultValue={sp.q ?? ""}
        />
        <button className="btn" type="submit">Cerca</button>
        {q && <Link className="btn btn-secondario" href="/clienti">Annulla</Link>}
      </form>

      {/* Ordinamento */}
      <div className="filtri">
        <span className="etichetta-ordina">Ordina per</span>
        {ordinamenti.map((o) => (
          <Link
            key={o.chiave}
            className={`stato-pill${ordina === o.chiave ? " attuale" : ""}`}
            href={conFiltro({ ordina: o.chiave, page: "" })}
          >
            <span className="stato-label">{o.nome}</span>
          </Link>
        ))}
      </div>

      {clienti.length === 0 ? (
        <div className="vuoto">{q ? `Nessun cliente per «${q}».` : "Nessun cliente: importa gli ordini."}</div>
      ) : (
        <>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contatti</th>
                  <th>Brand</th>
                  <th className="num">Ordini</th>
                  <th className="num">Speso</th>
                  <th>Primo</th>
                  <th>Ultimo</th>
                </tr>
              </thead>
              <tbody>
                {clienti.map((c) => (
                  <tr key={c.chiave}>
                    <td>
                      <Link href={`/clienti/${codificaChiave(c.chiave)}`} className="cella-nome">
                        {c.nome ?? c.email ?? c.telefono ?? "—"}
                      </Link>
                      {c.citta && <div className="cella-sub">{c.citta}</div>}
                    </td>
                    <td className="cella-muta">
                      {c.email && <div>{c.email}</div>}
                      {c.telefono && <div className="cella-sub">{c.telefono}</div>}
                      {!c.email && !c.telefono && "—"}
                    </td>
                    <td>
                      <span className="etichette">
                        {c.brand.map((b) => (
                          <span key={b} className="tag" style={{ color: coloreBrand(colori, b) }}>
                            <span className="dot" /><span className="tag-label">{b}</span>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="cella-num">{c.ordini.toLocaleString("it-IT")}</td>
                    <td className="cella-num">{euro(c.speso)}</td>
                    <td className="cella-muta">{dataBreve(c.primoOrdine)}</td>
                    <td className="cella-muta">{dataBreve(c.ultimoOrdine)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="paginazione">
            <span>
              {totale.toLocaleString("it-IT")} clienti · pagina {pagina} di {totalePagine}
            </span>
            <nav>
              {pagina > 1 && (
                <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina - 1) })}>
                  ← Precedente
                </Link>
              )}
              {pagina < totalePagine && (
                <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina + 1) })}>
                  Successiva →
                </Link>
              )}
            </nav>
          </div>
        </>
      )}
    </main>
  );
}
