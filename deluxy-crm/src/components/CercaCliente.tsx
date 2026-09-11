"use client";

import { useEffect, useRef, useState } from "react";

// La ricerca viva del cliente: si scrive, compaiono i clienti del registro
// (da /api/interno/clienti), un click apre la pagina voluta. Il form GET
// classico resta sotto per chi preme Invio: questa è la corsia veloce.
type Voce = { cliente: string; nome: string; sotto: string };

export default function CercaCliente({
  destinazione,
  segnaposto = "Scrivi nome, email o telefono del cliente…",
}: {
  /** Dove porta il click: la chiave del cliente sostituisce `{cliente}`. */
  destinazione: string;
  segnaposto?: string;
}) {
  const [q, setQ] = useState("");
  const [voci, setVoci] = useState<Voce[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);
  const scatola = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setVoci([]);
      return;
    }
    const t = setTimeout(async () => {
      setInCorso(true);
      try {
        const res = await fetch(`/api/interno/clienti?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
        const d = (await res.json()) as { clienti?: Voce[]; errore?: string };
        if (!res.ok) setErrore(d.errore ?? `Errore ${res.status}`);
        else {
          setErrore(null);
          setVoci(d.clienti ?? []);
          setAperto(true);
        }
      } catch {
        setErrore("Rete assente: riprova.");
      } finally {
        setInCorso(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const chiudi = (e: MouseEvent) => {
      if (scatola.current && !scatola.current.contains(e.target as Node)) setAperto(false);
    };
    document.addEventListener("mousedown", chiudi);
    return () => document.removeEventListener("mousedown", chiudi);
  }, []);

  return (
    <div ref={scatola} className="cerca-cliente">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => voci.length && setAperto(true)}
        placeholder={segnaposto}
        aria-label="Cerca il cliente"
        autoComplete="off"
        autoFocus
      />
      {inCorso ? <span className="terziario piccolo cerca-cliente-stato">cerco…</span> : null}
      {errore ? <span className="piccolo cerca-cliente-stato" style={{ color: "var(--orange)" }}>{errore}</span> : null}
      {aperto && voci.length ? (
        <ul className="cerca-cliente-voci" role="listbox">
          {voci.map((v) => (
            <li key={v.cliente} role="option" aria-selected={false}>
              <a href={destinazione.replace("{cliente}", v.cliente)}>
                <span className="cella-principale">{v.nome}</span>
                <span className="cella-sotto">{v.sotto}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : aperto && q.trim().length >= 2 && !inCorso && !errore ? (
        <p className="terziario piccolo cerca-cliente-stato">Nessun cliente con «{q}»: premi Invio nel campo sotto per cercare a fondo, o scrivi l&apos;email di un cliente nuovo.</p>
      ) : null}
    </div>
  );
}
