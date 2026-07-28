"use client";

import { useMemo, useRef, useState } from "react";

// Scelta del cliente con RICERCA, al posto della tendina.
//
// Perché: fra partner Deluxy, rubrica di Fatture in Cloud e intestatari delle
// fatture passate le voci sono oltre centoquaranta, con lo stesso soggetto che
// compare due volte sotto due nomi diversi («GRUÈ» e «GRUE' S.R.L.»). In una
// tendina si scorre a vuoto e si sceglie la voce sbagliata — che è esattamente
// come è nata la fattura bloccata: scelto il partner senza dati fiscali invece
// dell'intestatario che li aveva.
//
// Il valore vero viaggia in un campo nascosto: il form lato server continua a
// ricevere `clienteId` con lo stesso formato di prima (partner:… / id:… /
// nome:…), quindi nessuna azione cambia.

export type OpzioneCliente = {
  valore: string;
  etichetta: string;
  dettaglio?: string; // P.IVA, «da fatture passate»…
  gruppo: string;
};

function normalizza(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\u0300-\u036f]", "g"), "") // GRUÈ -> grue: si cerca senza accenti
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MAX_MOSTRATI = 40;

export function SceltaCliente({
  name,
  opzioni,
  placeholder = "Scrivi il nome del cliente…",
}: {
  name: string;
  opzioni: OpzioneCliente[];
  placeholder?: string;
}) {
  const [testo, setTesto] = useState("");
  const [scelto, setScelto] = useState<OpzioneCliente | null>(null);
  const [aperto, setAperto] = useState(false);
  const contenitore = useRef<HTMLDivElement>(null);

  const trovati = useMemo(() => {
    const q = normalizza(testo);
    if (!q) return opzioni.slice(0, MAX_MOSTRATI);
    // tutte le parole digitate devono comparire: cercando «grue srl» si trova
    // «GRUE' S.R.L.» ma non un omonimo qualsiasi.
    const parole = q.split(" ");
    return opzioni
      .filter((o) => {
        const testoOpzione = normalizza(`${o.etichetta} ${o.dettaglio ?? ""} ${o.gruppo}`);
        return parole.every((p) => testoOpzione.includes(p));
      })
      .slice(0, MAX_MOSTRATI);
  }, [testo, opzioni]);

  function scegli(o: OpzioneCliente) {
    setScelto(o);
    setTesto("");
    setAperto(false);
  }

  if (scelto) {
    return (
      <div>
        <input type="hidden" name={name} value={scelto.valore} />
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between",
            border: "1px solid var(--hairline)", borderRadius: "var(--radius-m)", padding: "9px 12px",
            background: "var(--surface)",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 500, fontSize: 13.5 }}>{scelto.etichetta}</span>
            {scelto.dettaglio && (
              <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{scelto.dettaglio}</span>
            )}
            <div className="muted" style={{ fontSize: 11.5 }}>{scelto.gruppo}</div>
          </span>
          <button type="button" className="btn small secondary" onClick={() => setScelto(null)}>
            Cambia
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={contenitore} style={{ position: "relative" }}>
      {/* campo vuoto = «cliente nuovo»: il form lato server lo gestisce già */}
      <input type="hidden" name={name} value="" />
      <input
        type="text"
        value={testo}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setTesto(e.target.value);
          setAperto(true);
        }}
        onFocus={() => setAperto(true)}
        // Il ritardo serve: senza, il clic su un risultato chiude l'elenco
        // prima che il clic arrivi, e non si riesce a scegliere niente.
        onBlur={() => setTimeout(() => setAperto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAperto(false);
          if (e.key === "Enter" && aperto && trovati.length > 0) {
            e.preventDefault(); // non inviare il form: il primo Invio sceglie
            scegli(trovati[0]);
          }
        }}
      />
      {aperto && (
        <div
          style={{
            position: "absolute", zIndex: 20, left: 0, right: 0, top: "calc(100% + 4px)",
            maxHeight: 320, overflowY: "auto", background: "var(--surface)",
            border: "1px solid var(--hairline)", borderRadius: "var(--radius-m)",
            boxShadow: "var(--shadow-float)",
          }}
        >
          {trovati.length === 0 ? (
            <div className="muted" style={{ padding: "12px 14px", fontSize: 12.5 }}>
              Nessun cliente trovato. Lascia il campo vuoto e compila «Cliente nuovo» qui sotto.
            </div>
          ) : (
            trovati.map((o) => (
              <button
                key={o.valore}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => scegli(o)}
                style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  padding: "8px 14px", border: 0, borderTop: "1px solid var(--hairline)",
                  background: "transparent", font: "inherit",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{o.etichetta}</span>
                {o.dettaglio && <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{o.dettaglio}</span>}
                <div className="muted" style={{ fontSize: 11.5 }}>{o.gruppo}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
