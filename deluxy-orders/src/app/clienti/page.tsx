import Link from "next/link";
import { euro } from "@/lib/ordini";
import { brandConColore, mappaColori } from "@/lib/brand";
import {
  elencoClienti,
  ordinamentoValido,
  versoValido,
  ordiniSenzaCliente,
  totaliClienti,
} from "@/lib/clienti";
import { LISTE, lista } from "@/lib/segmenti";
import { TabellaClienti } from "@/components/TabellaClienti";
import { FiltriTaglio } from "@/components/FiltriTaglio";
import { prisma } from "@/lib/db";
import { aiConfigurata } from "@/lib/ai";
import { riepilogaClientiMancantiAI } from "@/app/actions";

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
  const verso = versoValido(ordina, sp.verso);
  const pagina = Math.max(1, Number(sp.page ?? "1") || 1);
  // Filtro rapido per tag: sono le stesse liste del catalogo, applicate qui.
  const filtro = lista(sp.lista ?? "")?.chiave;
  const taglio = { brand: sp.brand?.trim() || undefined, categoria: sp.categoria?.trim() || undefined };

  const [brand, totale, clienti, senzaCliente, riepiloghi] = await Promise.all([
    brandConColore(),
    totaliClienti(q, filtro, taglio),
    elencoClienti(q, ordina, (pagina - 1) * PER_PAGINA, PER_PAGINA, filtro, verso, taglio),
    ordiniSenzaCliente(),
    prisma.riepilogoCliente.count(),
  ]);

  const colori = mappaColori(brand);
  const totalePagine = Math.max(1, Math.ceil(totale.clienti / PER_PAGINA));

  function conFiltro(extra: Record<string, string>): string {
    const p = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    return `/clienti${qs ? `?${qs}` : ""}`;
  }

  // Il link dell'intestazione di colonna: se è già quella attiva inverte il
  // verso, altrimenti passa a quella colonna col verso che ha senso per lei.
  function ordinaPer(colonna: string): string {
    const inverso = ordina === colonna ? (verso === "asc" ? "desc" : "asc") : "";
    return conFiltro({ ordina: colonna, verso: inverso, page: "" });
  }

  const perValore = LISTE.filter((l) => l.famiglia === "valore");
  const perTipologia = LISTE.filter((l) => l.famiglia === "tipologia" && l.chiave !== "probabili-aziende");
  const perPrivacy = LISTE.filter((l) => l.famiglia === "privacy");

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Clienti</h1>
          <p className="page-sub">
            Chi ha ordinato, ricavato dagli ordini: un cliente per email (o telefono, o nome), con
            tutti i suoi ordini in un posto solo, il suo segmento di valore e la sua tipologia.
          </p>
        </div>
        <div className="topbar-azioni">
          <Link className="btn btn-secondario" href="/clienti/rubrica">Rubrica Google</Link>
          <Link className="btn" href="/liste">Liste</Link>
        </div>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{totale.clienti.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">{q || filtro ? "Clienti trovati" : "Clienti totali"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(totale.speso)}</div>
          <div className="kpi-etichetta">Valore complessivo</div>
        </div>
        {senzaCliente > 0 && (
          <div className="kpi">
            <div className="kpi-valore">{senzaCliente.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Ordini senza dati cliente</div>
          </div>
        )}
      </div>

      {sp.esito && <div className="avviso-ok">{sp.esito}</div>}
      {sp.errore && <div className="avviso-errore">{sp.errore}</div>}

      {/* I riepiloghi in blocco: si parte dai clienti che valgono di più,
          perché ognuno è una chiamata a pagamento e 10.000 clienti non si
          riassumono per sbaglio. Il numero si sceglie e si vede. */}
      {aiConfigurata() && (
        <div className="scheda scheda-riepilogo">
          <div className="scheda-titolo">Riepiloghi scritti dall&apos;AI</div>
          <p className="testo-guida">
            Nella scheda di ogni cliente l&apos;AI scrive chi è, cosa compra e{" "}
            <strong>cosa gli piace</strong>, leggendo i suoi ordini veri. Fatti finora:{" "}
            <strong>{riepiloghi.toLocaleString("it-IT")}</strong> su{" "}
            {totale.clienti.toLocaleString("it-IT")} clienti. Qui se ne scrivono altri, partendo
            da chi ha speso di più.
          </p>
          <form action={riepilogaClientiMancantiAI} className="azioni-riga" style={{ marginTop: 10 }}>
            <select name="quanti" defaultValue="20" aria-label="Quanti riepiloghi scrivere">
              <option value="5">5 clienti</option>
              <option value="20">20 clienti</option>
              <option value="50">50 clienti</option>
              <option value="100">100 clienti</option>
            </select>
            <button className="btn" type="submit">Scrivi i riepiloghi mancanti</button>
          </form>
        </div>
      )}

      {/* Ricerca */}
      <form className="ricerca" method="get">
        {sp.ordina && <input type="hidden" name="ordina" value={sp.ordina} />}
        {sp.verso && <input type="hidden" name="verso" value={sp.verso} />}
        {sp.lista && <input type="hidden" name="lista" value={sp.lista} />}
        <span className="ricerca-icona" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 20 20" />
          </svg>
        </span>
        <input type="search" name="q" placeholder="Cerca un cliente: nome, email, telefono, città…" defaultValue={sp.q ?? ""} />
        <button className="btn" type="submit">Cerca</button>
        {q && <Link className="btn btn-secondario" href={conFiltro({ q: "" })}>Annulla</Link>}
      </form>

      <FiltriTaglio
        brand={brand}
        brandScelto={taglio.brand}
        categoriaScelta={taglio.categoria}
        href={(chiave, valore) => conFiltro({ [chiave]: valore, page: "" })}
      />

      {/* Tag: segmento di valore */}
      <div className="filtri">
        <span className="etichetta-ordina">Segmento</span>
        <Link className={`stato-pill${!filtro ? " attuale" : ""}`} href={conFiltro({ lista: "", page: "" })}>
          <span className="stato-label">Tutti</span>
        </Link>
        {perValore.map((l) => (
          <Link key={l.chiave} className={`stato-pill${filtro === l.chiave ? " attuale" : ""}`} href={conFiltro({ lista: l.chiave, page: "" })}>
            <span className="dot" style={{ background: l.colore }} />
            <span className="stato-label">{l.nome}</span>
          </Link>
        ))}
      </div>

      {/* Tag: tipologia di cliente */}
      <div className="filtri">
        <span className="etichetta-ordina">Tipologia</span>
        {perTipologia.map((l) => (
          <Link key={l.chiave} className={`stato-pill${filtro === l.chiave ? " attuale" : ""}`} href={conFiltro({ lista: l.chiave, page: "" })}>
            <span className="dot" style={{ background: l.colore }} />
            <span className="stato-label">{l.nome}</span>
          </Link>
        ))}
        <Link className={`stato-pill${filtro === "probabili-aziende" ? " attuale" : ""}`} href={conFiltro({ lista: "probabili-aziende", page: "" })}>
          <span className="stato-label">Probabili aziende da confermare</span>
        </Link>
      </div>

      {/* Privacy: chi si può contattare davvero */}
      <div className="filtri">
        <span className="etichetta-ordina">Privacy</span>
        {perPrivacy.map((l) => (
          <Link key={l.chiave} className={`stato-pill${filtro === l.chiave ? " attuale" : ""}`} href={conFiltro({ lista: l.chiave, page: "" })}>
            <span className="dot" style={{ background: l.colore }} />
            <span className="stato-label">{l.nome}</span>
          </Link>
        ))}
      </div>

      {filtro && (
        <p className="esito-ricerca">
          Lista <strong>{lista(filtro)!.nome}</strong>: {lista(filtro)!.criterio}{" "}
          <Link href={`/liste/${filtro}`}>Apri la lista →</Link>
        </p>
      )}

      {clienti.length === 0 ? (
        <div className="vuoto">{q ? `Nessun cliente per «${q}».` : "Nessun cliente: importa gli ordini."}</div>
      ) : (
        <>
          <TabellaClienti clienti={clienti} colori={colori} ordina={ordina} verso={verso} href={ordinaPer} />

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
