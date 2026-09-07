import Link from "next/link";
import { notFound } from "next/navigation";
import { euro } from "@/lib/ordini";
import { brandConColore, mappaColori } from "@/lib/brand";
import { elencoClienti, ordinamentoValido, versoValido, totaliClienti } from "@/lib/clienti";
import { FAMIGLIE, LISTE, TIPOLOGIE, lista } from "@/lib/segmenti";
import { TabellaClienti } from "@/components/TabellaClienti";
import { FiltriTaglio } from "@/components/FiltriTaglio";
import { ZonaFiltri } from "@/components/ZonaFiltri";
import { TornaIndietro } from "@/components/TornaIndietro";
import { SelezioneClienti } from "@/components/SelezioneClienti";
import { confermaTipologiaInBlocco } from "@/app/actions";

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;
// Sulle liste per tipologia si lavora in blocco: si può allargare la pagina
// per confermare più clienti in un colpo. Valori chiusi: niente `per=100000`.
const PAGINE_LARGHE = [50, 100, 200] as const;

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
  const verso = versoValido(ordina, sp.verso);
  const pagina = Math.max(1, Number(sp.page ?? "1") || 1);

  // Le liste per tipologia si CONFERMANO in blocco (caselle + barra in basso):
  // è la coda «Probabili aziende» che l'ha chiesto, ma vale per tutte le sorelle
  // — anche una deduzione sbagliata si corregge da qui.
  const selezionabile = l.famiglia === "tipologia";
  const perPagina = selezionabile && (PAGINE_LARGHE as readonly number[]).includes(Number(sp.per))
    ? Number(sp.per)
    : PER_PAGINA;

  // Gli stessi due tagli del catalogo: per brand (taglia gli ordini) e per
  // categoria (sceglie i clienti). Arrivano nella query string e viaggiano con
  // ogni link della pagina, export CSV compreso.
  const taglio = { brand: sp.brand?.trim() || undefined, categoria: sp.categoria?.trim() || undefined };

  const [brand, totale, clienti] = await Promise.all([
    brandConColore(),
    totaliClienti(q, l.chiave, taglio),
    elencoClienti(q, ordina, (pagina - 1) * perPagina, perPagina, l.chiave, verso, taglio),
  ]);

  const colori = mappaColori(brand);
  const totalePagine = Math.max(1, Math.ceil(totale.clienti / perPagina));
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

  // Il link dell'intestazione di colonna: se e' gia' quella attiva inverte il
  // verso, altrimenti passa a quella colonna col verso che ha senso per lei.
  function ordinaPer(colonna: string): string {
    const inverso = ordina === colonna ? (verso === "asc" ? "desc" : "asc") : "";
    return conFiltro({ ordina: colonna, verso: inverso, page: "" });
  }

  // Il CSV esce con gli stessi filtri che si vedono a schermo: quello che
  // esporti e' quello che stai guardando, non una lista diversa.
  const parametriCsv = new URLSearchParams();
  if (q) parametriCsv.set("q", q);
  if (taglio.brand) parametriCsv.set("brand", taglio.brand);
  if (taglio.categoria) parametriCsv.set("categoria", taglio.categoria);
  const csv = `/liste/${l.chiave}/csv${parametriCsv.toString() ? `?${parametriCsv}` : ""}`;

  function conTaglio(chiave: "brand" | "categoria", valore: string): string {
    const p = new URLSearchParams(sp);
    if (valore) p.set(chiave, valore);
    else p.delete(chiave);
    p.delete("page");
    const qs = p.toString();
    return `/liste/${l!.chiave}${qs ? `?${qs}` : ""}`;
  }

  return (
    <main className="main">
      {/* «Il ritorno al punto esatto» (Libro UX&UI v1.5 §2) */}
      <TornaIndietro fallback="/liste" label="Tutte le liste" />

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

      {sp.esito && <div className="avviso-ok">{sp.esito}</div>}
      {sp.errore && <div className="avviso-errore">{sp.errore}</div>}

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

      {/* Sotto la soglia mobile i gruppi di pillole (famiglia + brand +
          categoria) vivono dietro «Filtri (N)» (Libro v1.2 §8) — prima il
          display:none globale di M7 li nascondeva del tutto sul telefono. */}
      <ZonaFiltri attivi={(taglio.brand ? 1 : 0) + (taglio.categoria ? 1 : 0)}>
        {/* Le altre liste della stessa famiglia: si passa dall'una all'altra.
            Su mobile il gruppo scorre su UNA riga (Libro §8.9). */}
        {famiglia && (
          <div className="filtri riga-chips-scorri">
            <span className="etichetta-ordina">{famiglia.nome}</span>
            {sorelle.map((s) => (
              <Link key={s.chiave} className={`stato-pill${s.chiave === l.chiave ? " attuale" : ""}`} href={`/liste/${s.chiave}`}>
                <span className="dot" style={{ background: s.colore }} />
                <span className="stato-label">{s.nome}</span>
              </Link>
            ))}
          </div>
        )}

        <FiltriTaglio
          brand={brand}
          brandScelto={taglio.brand}
          categoriaScelta={taglio.categoria}
          href={conTaglio}
        />
      </ZonaFiltri>

      <form className="ricerca" method="get">
        {sp.ordina && <input type="hidden" name="ordina" value={sp.ordina} />}
        {sp.brand && <input type="hidden" name="brand" value={sp.brand} />}
        {sp.categoria && <input type="hidden" name="categoria" value={sp.categoria} />}
        <span className="ricerca-icona" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 20 20" />
          </svg>
        </span>
        {sp.per && <input type="hidden" name="per" value={sp.per} />}
        <input type="search" name="q" placeholder="Cerca dentro la lista: nome, email, telefono, città…" defaultValue={sp.q ?? ""} />
        <button className="btn" type="submit">Cerca</button>
        {q && <Link className="btn btn-secondario" href={`/liste/${l.chiave}`}>Annulla</Link>}
      </form>

      {clienti.length === 0 ? (
        <div className="vuoto">
          {q ? `Nessun cliente per «${q}» in questa lista.` : "Nessun cliente in questa lista, per ora."}
        </div>
      ) : (
        <>
          {selezionabile ? (
            <SelezioneClienti
              action={confermaTipologiaInBlocco}
              lista={l.chiave}
              tipologie={TIPOLOGIE.map((t) => ({ chiave: t.chiave, nome: t.nome }))}
              tipoPredefinito={l.chiave === "probabili-aziende" ? "azienda" : undefined}
              ritorno={conFiltro({ esito: "", errore: "" })}
            >
              <TabellaClienti clienti={clienti} colori={colori} ordina={ordina} verso={verso} href={ordinaPer} selezionabile />
            </SelezioneClienti>
          ) : (
            <TabellaClienti clienti={clienti} colori={colori} ordina={ordina} verso={verso} href={ordinaPer} />
          )}
          <div className="paginazione">
            <span>
              {totale.clienti.toLocaleString("it-IT")} clienti · pagina {pagina} di {totalePagine}
              {selezionabile && (
                <>
                  {" · per pagina "}
                  {PAGINE_LARGHE.map((n, i) => (
                    <span key={n}>
                      {i > 0 && " / "}
                      {n === perPagina ? (
                        <strong>{n}</strong>
                      ) : (
                        <Link href={conFiltro({ per: n === PER_PAGINA ? "" : String(n), page: "" })}>{n}</Link>
                      )}
                    </span>
                  ))}
                </>
              )}
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
