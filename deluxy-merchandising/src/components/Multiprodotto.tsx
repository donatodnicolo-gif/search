"use client";

// **La sezione «Multiprodotto» del modulo prodotto** (10/09/2026, richiesta
// dell'utente: «una sezione opzionale che lo aggancia ad altri prodotti
// esistenti o che si possono creare velocemente»).
//
// Un multiprodotto è un prodotto fatto di altri prodotti del catalogo — il
// cesto con la torta e lo champagne, il kit regalo. Qui si scelgono i pezzi
// (cercandoli, o creandoli al volo) e la quantità; il legame vero lo scrive il
// salvataggio del modulo in `ComponenteProdotto`, la stessa tabella di
// `/multi-prodotto` e della scheda prodotto (tab Composizione).
//
// Le regole di casa dei composti (`src/lib/composti.ts`) valgono anche qui:
// **costo e prezzo si leggono dai componenti**, e **un costo che manca non vale
// zero** — la somma si dichiara parziale. I due bottoni «Usa …» propongono il
// numero nei campi del modulo; non lo impongono.

import { useEffect, useRef, useState } from "react";
import { euro } from "@/lib/dominio";

export type ComponenteForm = {
  id: string;
  nome: string;
  codice: string;
  prezzoVendita: number;
  costoProduzione: number;
  quantita: number;
};

type Trovato = Omit<ComponenteForm, "quantita"> & { categoria: string; statoShopify: string | null; negozioNome: string | null };

const ETICHETTA_STATO: Record<string, string> = { ACTIVE: "attivo", DRAFT: "bozza", ARCHIVED: "archiviato" };

export function Multiprodotto({
  componenti,
  onChange,
  categorie,
  escludiId,
  nomeProdotto,
  onProponi,
}: {
  componenti: ComponenteForm[];
  onChange: (c: ComponenteForm[]) => void;
  categorie: { chiave: string; nome: string }[];
  /** Il prodotto stesso, in modifica: non può essere componente di sé. */
  escludiId?: string;
  nomeProdotto: string;
  /** Scrive un numero in un campo del modulo (prezzo o costo). */
  onProponi: (campo: "prezzoVendita" | "costoProduzione", valore: number) => void;
}) {
  const [attivo, setAttivo] = useState(componenti.length > 0);
  const [cerca, setCerca] = useState("");
  const [trovati, setTrovati] = useState<Trovato[]>([]);
  const [cercando, setCercando] = useState(false);
  const [apertaLista, setApertaLista] = useState(false);
  const [creaAperto, setCreaAperto] = useState(false);
  const [nuovo, setNuovo] = useState({ nome: "", categoria: "", prezzo: "", costo: "" });
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const attesa = useRef<ReturnType<typeof setTimeout> | null>(null);

  // La ricerca: dopo una pausa di battitura, non a ogni tasto — il Postgres è
  // condiviso e la tendina non ha bisogno di più di venti righe.
  useEffect(() => {
    if (attesa.current) clearTimeout(attesa.current);
    const q = cerca.trim();
    if (q.length < 2) { setTrovati([]); return; }
    attesa.current = setTimeout(async () => {
      setCercando(true);
      try {
        const r = await fetch(`/api/prodotti/cerca?q=${encodeURIComponent(q)}${escludiId ? `&escludi=${encodeURIComponent(escludiId)}` : ""}`).then((x) => x.json());
        setTrovati(Array.isArray(r.prodotti) ? r.prodotti : []);
        setApertaLista(true);
      } catch {
        setTrovati([]);
      } finally {
        setCercando(false);
      }
    }, 250);
    return () => { if (attesa.current) clearTimeout(attesa.current); };
  }, [cerca, escludiId]);

  const giaDentro = new Set(componenti.map((c) => c.id));
  const aggiungi = (t: Trovato) => {
    if (giaDentro.has(t.id)) return;
    onChange([...componenti, { id: t.id, nome: t.nome, codice: t.codice, prezzoVendita: t.prezzoVendita, costoProduzione: t.costoProduzione, quantita: 1 }]);
    setCerca("");
    setTrovati([]);
    setApertaLista(false);
  };
  const cambiaQuantita = (id: string, q: number) => onChange(componenti.map((c) => (c.id === id ? { ...c, quantita: Math.max(1, Math.min(999, Math.round(q) || 1)) } : c)));
  const togli = (id: string) => onChange(componenti.filter((c) => c.id !== id));

  async function creaAlVolo() {
    setErrore(null);
    if (nuovo.nome.trim().length < 3) { setErrore("Il nome del componente ha almeno tre lettere."); return; }
    setCreando(true);
    try {
      const r = await fetch("/api/prodotti/rapido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nuovo.nome.trim(), categoria: nuovo.categoria, prezzoVendita: nuovo.prezzo, costoProduzione: nuovo.costo, perNome: nomeProdotto }),
      }).then((x) => x.json());
      if (!r.ok) { setErrore(r.errore ?? "Il componente non è stato creato."); return; }
      aggiungi(r.prodotto as Trovato);
      setNuovo({ nome: "", categoria: "", prezzo: "", costo: "" });
      setCreaAperto(false);
    } catch {
      setErrore("Il componente non è stato creato: il server non ha risposto.");
    } finally {
      setCreando(false);
    }
  }

  // I conti, con la regola di casa: quello che manca non vale zero.
  const pezzi = componenti.reduce((a, c) => a + c.quantita, 0);
  const senzaCosto = componenti.filter((c) => !(c.costoProduzione > 0)).length;
  const senzaPrezzo = componenti.filter((c) => !(c.prezzoVendita > 0)).length;
  const costo = componenti.reduce((a, c) => a + (c.costoProduzione > 0 ? c.costoProduzione * c.quantita : 0), 0);
  const sommaListini = componenti.reduce((a, c) => a + (c.prezzoVendita > 0 ? c.prezzoVendita * c.quantita : 0), 0);

  return (
    <div className="scheda">
      <div className="scheda-titolo">Multiprodotto</div>
      <p className="page-sub" style={{ marginBottom: 10 }}>
        Facoltativo. Se questo prodotto è fatto di altri prodotti del catalogo — il cesto con la torta e lo champagne, il kit — qui si dice di quali e in che quantità. Costo e prezzo si leggono dai pezzi.
      </p>
      <label className="pill-opt" style={{ cursor: "pointer", width: "fit-content" }}>
        <input
          type="checkbox"
          checked={attivo}
          onChange={(e) => {
            setAttivo(e.target.checked);
            if (!e.target.checked) onChange([]);
          }}
        />
        È un multiprodotto: contiene altri prodotti
      </label>

      {attivo && (
        <>
          <div className="mp-ricerca" style={{ marginTop: 14 }}>
            <input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              onFocus={() => trovati.length && setApertaLista(true)}
              onBlur={() => setTimeout(() => setApertaLista(false), 150)}
              placeholder="Cerca un prodotto del catalogo per nome o SKU…"
              aria-label="Cerca un componente"
              style={{ font: "inherit", padding: "8px 12px", borderRadius: "var(--radius-m)", border: "1px solid transparent", background: "var(--fill)", width: "100%", maxWidth: 520 }}
            />
            {cercando && <span className="cella-sub">Cerco…</span>}
            {apertaLista && trovati.length > 0 && (
              <div className="mp-lista" role="listbox">
                {trovati.map((t) => (
                  <button key={t.id} type="button" role="option" aria-selected={false} disabled={giaDentro.has(t.id)} onMouseDown={(e) => e.preventDefault()} onClick={() => aggiungi(t)}>
                    <span className="mp-nome">{t.nome}</span>
                    <span className="cella-sub">
                      {t.codice}
                      {t.negozioNome ? ` · ${t.negozioNome}` : ""}
                      {t.statoShopify ? ` · ${ETICHETTA_STATO[t.statoShopify] ?? t.statoShopify}` : " · solo qui"}
                      {t.prezzoVendita > 0 ? ` · ${euro(t.prezzoVendita)}` : ""}
                      {giaDentro.has(t.id) ? " · già dentro" : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {apertaLista && !cercando && cerca.trim().length >= 2 && trovati.length === 0 && (
              <span className="cella-sub">Nessun prodotto con «{cerca.trim()}»: puoi crearlo al volo qui sotto.</span>
            )}
          </div>

          {componenti.length > 0 && (
            <div className="tabella-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th>SKU</th>
                    <th className="num">Listino</th>
                    <th className="num">Costo</th>
                    <th className="num">Quantità</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {componenti.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nome}</td>
                      <td><code>{c.codice}</code></td>
                      <td className="num">{c.prezzoVendita > 0 ? euro(c.prezzoVendita) : <span className="cella-sub">—</span>}</td>
                      <td className="num">{c.costoProduzione > 0 ? euro(c.costoProduzione) : <span className="cella-sub" title="Senza costo: la somma è parziale">manca</span>}</td>
                      <td className="num">
                        <input type="number" min={1} max={999} value={c.quantita} onChange={(e) => cambiaQuantita(c.id, Number(e.target.value))} className="num" style={{ width: 72 }} aria-label={`Quantità di ${c.nome}`} />
                      </td>
                      <td>
                        <button type="button" className="icon-btn" title={`Togli ${c.nome}`} onClick={() => togli(c.id)}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {componenti.length > 0 && (
            <div className="riga-ai" style={{ marginTop: 10 }}>
              <span className="cella-sub">
                {pezzi} {pezzi === 1 ? "pezzo" : "pezzi"} · comprati separati <b>{euro(sommaListini)}</b>{senzaPrezzo > 0 ? ` (${senzaPrezzo} senza listino)` : ""} · costo dai componenti <b>{euro(costo)}</b>{senzaCosto > 0 ? ` — parziale: ${senzaCosto} ${senzaCosto === 1 ? "componente non ha" : "componenti non hanno"} un costo` : ""}
              </span>
              {sommaListini > 0 && (
                <button type="button" className="btn btn-secondario small" onClick={() => onProponi("prezzoVendita", sommaListini)}>Usa {euro(sommaListini)} come prezzo</button>
              )}
              {costo > 0 && senzaCosto === 0 && (
                <button type="button" className="btn btn-secondario small" onClick={() => onProponi("costoProduzione", costo)}>Usa {euro(costo)} come costo</button>
              )}
            </div>
          )}
          {componenti.length === 1 && <span className="cella-sub" style={{ display: "block", marginTop: 6 }}>Un multiprodotto ha almeno due componenti: con uno solo è il prodotto stesso.</span>}

          <details className="altri-campi" open={creaAperto} onToggle={(e) => setCreaAperto((e.target as HTMLDetailsElement).open)}>
            <summary className="pill-opt">+ Crea un componente al volo</summary>
            <p className="cella-sub" style={{ margin: "8px 0 10px" }}>
              Nasce un prodotto vero in fase Concept, con nome, categoria, prezzo e costo: lo completi dopo col modulo. Il suo costo vale per tutti i multiprodotti che lo useranno.
            </p>
            <div className="modulo">
              <div className="campo-modulo">
                <label htmlFor="mp-nuovo-nome">Nome</label>
                <input id="mp-nuovo-nome" value={nuovo.nome} onChange={(e) => setNuovo((n) => ({ ...n, nome: e.target.value }))} placeholder="es. Bottiglia Champagne Brut 75 cl" />
              </div>
              <div className="campo-modulo">
                <label htmlFor="mp-nuovo-categoria">Categoria</label>
                <select id="mp-nuovo-categoria" value={nuovo.categoria} onChange={(e) => setNuovo((n) => ({ ...n, categoria: e.target.value }))}>
                  <option value="">— Da classificare —</option>
                  {categorie.map((c) => (
                    <option key={c.chiave} value={c.chiave}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo">
                <label htmlFor="mp-nuovo-prezzo">Prezzo di listino (€)</label>
                <input id="mp-nuovo-prezzo" inputMode="decimal" value={nuovo.prezzo} onChange={(e) => setNuovo((n) => ({ ...n, prezzo: e.target.value }))} placeholder="0" />
              </div>
              <div className="campo-modulo">
                <label htmlFor="mp-nuovo-costo">Costo (€)</label>
                <input id="mp-nuovo-costo" inputMode="decimal" value={nuovo.costo} onChange={(e) => setNuovo((n) => ({ ...n, costo: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="riga-ai" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-secondario small" onClick={creaAlVolo} disabled={creando}>
                {creando ? "Creo…" : "Crea e aggiungi"}
              </button>
              {errore && <span className="cella-sub" style={{ color: "var(--orange)" }}>{errore}</span>}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
