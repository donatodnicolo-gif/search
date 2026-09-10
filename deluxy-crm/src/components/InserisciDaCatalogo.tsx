"use client";

import { useEffect, useRef, useState } from "react";

// «Inserisci un prodotto o una collezione» nel testo di un messaggio: cerca in
// Merchandising (via /api/interno/catalogo, la chiave resta sul server) e
// scrive nel textarea del form la riga scelta, dove sta il cursore.
//
// Client component: deve toccare il textarea. Trova quello del form che lo
// contiene per `name` (corpo per le mail, testo per WhatsApp).

type Voce = { id: string; tipo: string; nome: string; sotto: string; prezzo: string | null; immagine: string | null; testo: string };

export default function InserisciDaCatalogo({ campo }: { campo: string }) {
  const [q, setQ] = useState("");
  const [cosa, setCosa] = useState<"prodotti" | "collezioni">("prodotti");
  const [voci, setVoci] = useState<Voce[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [inseriti, setInseriti] = useState(0);
  const contenitore = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setVoci([]);
      setErrore(null);
      return;
    }
    const t = setTimeout(async () => {
      setInCorso(true);
      try {
        const res = await fetch(`/api/interno/catalogo?cosa=${cosa}&q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
        const d = (await res.json()) as { voci?: Voce[]; errore?: string };
        if (!res.ok) {
          setErrore(d.errore ?? `Errore ${res.status}`);
          setVoci([]);
        } else {
          setErrore(null);
          setVoci(d.voci ?? []);
        }
      } catch {
        setErrore("Rete assente: riprova.");
      } finally {
        setInCorso(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, cosa]);

  function inserisci(v: Voce) {
    const form = contenitore.current?.closest("form");
    const ta = form?.querySelector<HTMLTextAreaElement>(`textarea[name="${campo}"]`);
    if (!ta) return;
    const inizio = ta.selectionStart ?? ta.value.length;
    const fine = ta.selectionEnd ?? ta.value.length;
    const prima = ta.value.slice(0, inizio);
    const dopo = ta.value.slice(fine);
    const riga = `${prima && !prima.endsWith("\n") ? "\n" : ""}• ${v.testo}\n`;
    ta.value = prima + riga + dopo;
    const pos = (prima + riga).length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    setInseriti((n) => n + 1);
  }

  return (
    <div ref={contenitore} className="catalogo-inserisci">
      <div className="form-riga" style={{ alignItems: "center", gap: 8 }}>
        <select value={cosa} onChange={(e) => setCosa(e.target.value as "prodotti" | "collezioni")} style={{ flex: "0 0 140px" }}>
          <option value="prodotti">Prodotti</option>
          <option value="collezioni">Collezioni</option>
        </select>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={cosa === "prodotti" ? "Cerca un prodotto da proporre…" : "Cerca una collezione…"}
          aria-label="Cerca nel catalogo"
        />
      </div>
      {inCorso ? <p className="terziario piccolo">Cerco in Merchandising…</p> : null}
      {errore ? <p className="piccolo" style={{ color: "var(--orange)" }}>{errore}</p> : null}
      {voci.length ? (
        <ul className="catalogo-voci">
          {voci.map((v) => (
            <li key={v.id}>
              {v.immagine ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="mini-foto" src={v.immagine} alt="" />
              ) : (
                <span className="mini-foto" style={{ background: "var(--fill)" }} />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="cella-principale">{v.nome}</span>
                <span className="cella-sotto">{[v.sotto, v.prezzo].filter(Boolean).join(" · ")}</span>
              </span>
              <button type="button" className="btn ghost mini" onClick={() => inserisci(v)}>
                Inserisci
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {inseriti ? <p className="terziario piccolo">{inseriti === 1 ? "1 riga inserita" : `${inseriti} righe inserite`} nel testo.</p> : null}
    </div>
  );
}
