"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Campo «Partner» con la ricerca al posto della tendina.
//
// Con quasi novanta partner una `<select>` è un elenco da scorrere a occhio:
// per arrivare a «MONTENERO IN FIORE» si passa in rassegna mezzo alfabeto, e
// chi non ricorda com'è scritta l'insegna in anagrafica («AMIR» sta dentro «LA
// BOTTEGA DI CIOCCOLATO») non la trova affatto. Qui si scrive un pezzo di
// nome e i suggerimenti si stringono.
//
// A differenza del campo dei gruppi, qui il testo libero NON è un valore
// valido: una vendita si attacca a un partner che esiste. Il nome scritto
// serve solo a cercare, l'id scelto viaggia in un campo nascosto, e finché non
// se ne sceglie uno il form si blocca da sé (`setCustomValidity`) invece di
// far fallire la registrazione dopo l'invio.

export type PartnerScelta = { id: string; nome: string; feeBase: number };

function normalizza(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MAX_MOSTRATI = 60;

export function SceltaPartner({
  partners,
  valore: valoreEsterno,
  onScegli,
  valoreIniziale,
  obbligatorio = true,
  mostraFee = true,
  nomeCampo = "partnerId",
}: {
  partners: PartnerScelta[];
  /** Chi ha già lo stato del partner (il form della vendita) lo passa qui. */
  valore?: string;
  onScegli?: (id: string) => void;
  /** Chi non ha stato (i form semplici) usa questo e lascia fare al componente. */
  valoreIniziale?: string;
  obbligatorio?: boolean;
  mostraFee?: boolean;
  /** Nome del campo inviato: le azioni più vecchie leggono `partner`. */
  nomeCampo?: string;
}) {
  const [valoreInterno, setValoreInterno] = useState(valoreIniziale ?? "");
  const controllato = valoreEsterno !== undefined;
  const valore = controllato ? valoreEsterno : valoreInterno;
  const cambia = (id: string) => {
    if (!controllato) setValoreInterno(id);
    onScegli?.(id);
  };
  const scelto = partners.find((p) => p.id === valore) ?? null;
  const [testo, setTesto] = useState(scelto?.nome ?? "");
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  // Il messaggio del browser al posto di un errore dopo l'invio: «Registra
  // vendita» con la casella riempita a metà non deve passare.
  useEffect(() => {
    campo.current?.setCustomValidity(
      valore || !obbligatorio ? "" : "Scegli un partner dall'elenco dei suggerimenti."
    );
  }, [valore, obbligatorio]);

  const trovati = useMemo(() => {
    const q = normalizza(testo);
    // se il testo è esattamente il partner scelto si mostra tutto l'elenco:
    // altrimenti riaprendo il campo si vedrebbe solo quello già scelto
    if (!q || (scelto && normalizza(scelto.nome) === q)) return partners.slice(0, MAX_MOSTRATI);
    const parole = q.split(" ");
    return partners
      .filter((p) => {
        const t = normalizza(p.nome);
        return parole.every((x) => t.includes(x));
      })
      .slice(0, MAX_MOSTRATI);
  }, [testo, partners, scelto]);

  function scegli(p: PartnerScelta) {
    cambia(p.id);
    setTesto(p.nome);
    setAperto(false);
    campo.current?.focus();
  }

  return (
    <div style={{ position: "relative" }}>
      <input type="hidden" name="partnerId" value={valore} />
      <div style={{ position: "relative" }}>
        <input
          ref={campo}
          type="text"
          required={obbligatorio}
          value={testo}
          autoComplete="off"
          placeholder="Cerca il partner — «amir», «montenero», «chanel»…"
          style={{ paddingRight: 34 }}
          onChange={(e) => {
            setTesto(e.target.value);
            // scrivendo si abbandona la scelta precedente: il campo e l'id
            // devono dire la stessa cosa
            if (valore) cambia("");
            setAperto(true);
            setAttivo(0);
          }}
          onFocus={() => setAperto(true)}
          // senza il ritardo il clic su una voce chiude l'elenco prima di arrivare
          onBlur={() => setTimeout(() => setAperto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") return setAperto(false);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAperto(true);
              setAttivo((i) => Math.min(i + 1, trovati.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setAttivo((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" && aperto && trovati[attivo]) {
              e.preventDefault(); // il primo Invio sceglie, non salva il form
              scegli(trovati[attivo]);
            }
          }}
        />
        <button
          type="button"
          aria-label="Mostra i partner"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setAperto((v) => !v);
            campo.current?.focus();
          }}
          style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            border: 0, background: "transparent", cursor: "pointer", padding: "2px 6px",
            color: "var(--text-secondary)", fontSize: 11, lineHeight: 1,
          }}
        >
          ▾
        </button>
      </div>

      {aperto && (
        <div
          style={{
            position: "absolute", zIndex: 20, left: 0, right: 0, top: "calc(100% + 4px)",
            maxHeight: 300, overflowY: "auto", background: "var(--surface)",
            border: "1px solid var(--hairline)", borderRadius: "var(--radius-m)",
            boxShadow: "var(--shadow-float)",
          }}
        >
          {trovati.length === 0 ? (
            <div className="muted" style={{ padding: "12px 14px", fontSize: 12.5 }}>
              Nessun partner con questo nome. In anagrafica l&apos;insegna può essere scritta
              diversamente: prova con una parola sola.
            </div>
          ) : (
            trovati.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => scegli(p)}
                onMouseEnter={() => setAttivo(i)}
                style={{
                  display: "flex", width: "100%", justifyContent: "space-between", gap: 12,
                  alignItems: "baseline", textAlign: "left", cursor: "pointer",
                  padding: "8px 14px", border: 0, borderTop: i === 0 ? 0 : "1px solid var(--hairline)",
                  background: p.id === valore ? "var(--bg)" : i === attivo ? "var(--bg)" : "transparent",
                  font: "inherit",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{p.nome}</span>
                {mostraFee && (
                  <span className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                    {p.feeBase ? `fee ${String(p.feeBase).replace(".", ",")}%` : "senza fee"}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
