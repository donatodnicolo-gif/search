import Link from "next/link";
import { notFound } from "next/navigation";
import { euro } from "@/lib/ordini";
import { brandConColore, mappaColori } from "@/lib/brand";
import { elencoClienti, ordinamentoValido, totaliClienti } from "@/lib/clienti";
import { FAMIGLIE, LISTE, lista } from "@/lib/segmenti";
import { TabellaClienti } from "@/components/TabellaClienti";

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;

// Il dettaglio di una lista: chi c'è dentro, con lo stesso tavolo dei clienti,
// più l'export CSV — che è il motivo per cui una lista esiste (Customer Match,
// pubblici Meta, rubrica di chi deve telefonare).
export default async function DettaglioLista({
  params,
  searchParams,
}: {
  params: Promise<{ chiave: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { chiave } = await params;
  const l = lista(chiave);
  if (!l) notFound();

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const ordina = ordinamentoValido(sp.ordina);
  const pagina = Math.max(1, Number(sp.page ?? "1") || 1);

  const [brand, totale, clienti] = await Promise.all([
    brandConColore(),
    totaliClienti(q, l.chiave),
    elencoClienti(q, ordina, (pagina - 1) * PER_PAGINA, PER_PAGINA, l.chiave),
  ]);

  const colori = mappaColori(brand);
  const totalePagine = Math.max(1, Math.ceil(totale.clienti / PER_PAGINA));
  const famiglia = FAMIGLIE.find((f) => f.chiave === l.famiglia);
  const sorelle = LISTE.filter((x) => x.famiglia === l.famiglia);

  function conFiltro(extra: Record<string, string>): string {
    const p = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    return `/liste/${l!.chiave}${qs ? `?${qs}` : ""}`;
  }

  const ordinamenti = [
    { chiave: "speso", nome: "Più spesa" },
    { chiave: "ordini", nome: "Più ordini" },
    { chiave: "recenti", nome: "Più recenti" },
    { chiave: "nome", nome: "Nome" },
  ];

  const csv = `/liste/${l.chiave}/csv${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    <main className="main">
      <Link href="/liste" className="ritorno">← Tutte le liste</Link>

      <div className="page-head">
        <div>
          <h1 className="page-title">{l.nome}</h1>
          <p className="page-sub">{l.criterio}</p>
        </div>
        <a className="btn" href={csv} download>
          Esporta CSV
        </a>
      </div>

      <div className="consiglio" style={{ ["--lista" as string]: l.colore }}>
        <span className="consiglio-titolo">Cosa farci</span>
        {l.consiglio}
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{totale.clienti.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">{q ? "Clienti trovati" : "Clienti nella lista"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(totale.speso)}</div>
          <div className="kpi-etichetta">Valore complessivo</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{totale.ordini.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Ordini validi</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(totale.clienti ? totale.speso / totale.clienti : 0)}</div>
          <div className="kpi-etichetta">Valore medio</div>
        </div>
      </div>

      {/* Le altre liste della stessa famiglia: si passa dall'una all'altra */}
      {famiglia && (
        <div className="filtri">
          <span className="etichetta-ordina">{famiglia.nome}</span>
          {sorelle.map((s) => (
            <Link key={s.chiave} className={`stato-pill${s.chiave === l.chiave ? " attuale" : ""}`} href={`/liste/${s.chiave}`}>
              <span className="dot" style={{ background: s.colore }} />
              <span className="stato-label">{s.nome}</span>
            </Link>
          ))}
        </div>
      )}

      <form className="ricerca" method="get">
        {sp.ordina && <input type="hidden" name="ordina" value={sp.ordina} />}
        <span className="ricerca-icona" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 20 20" />
          </svg>
        </span>
        <input type="search" name="q" placeholder="Cerca dentro la lista: nome, email, telefono, città…" defaultValue={sp.q ?? ""} />
        <button className="btn" type="submit">Cerca</button>
        {q && <Link className="btn btn-secondario" href={`/liste/${l.chiave}`}>Annulla</Link>}
      </form>

      <div className="filtri">
        <span className="etichetta-ordina">Ordina per</span>
        {ordinamenti.map((o) => (
          <Link key={o.chiave} className={`stato-pill${ordina === o.chiave ? " attuale" : ""}`} href={conFiltro({ ordina: o.chiave, page: "" })}>
            <span className="stato-label">{o.nome}</span>
          </Link>
        ))}
      </div>

      {clienti.length === 0 ? (
        <div className="vuoto">
          {q ? `Nessun cliente per «${q}» in questa lista.` : "Nessun cliente in questa lista, per ora."}
        </div>
      ) : (
        <>
          <TabellaClienti clienti={clienti} colori={colori} />
          <div className="paginazione">
            <span>
              {totale.clienti.toLocaleString("it-IT")} clienti · pagina {pagina} di {totalePagine}
            </span>
            <nav>
              {pagina > 1 && (
                <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina - 1) })}>← Precedente</Link>
              )}
              {pagina < totalePagine && (
                <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina + 1) })}>Successiva →</Link>
              )}
            </nav>
          </div>
        </>
      )}
    </main>
  );
}
