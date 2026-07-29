"use client";

import { useMemo, useRef, useState } from "react";
import type { SuggerimentoGruppo } from "@/lib/gruppi";

// Campo «Gruppo di pagamento» con i suggerimenti a vista.
//
// Prima era un `<input list=…>`: il browser non mostra niente finche' non
// scrivi la lettera giusta, quindi chi compilava non sapeva ne' quali gruppi
// esistono ne' come sono scritti — ed e' cosi' che nascono «CHANEL» e
// «Chanel», due gruppi diversi che nello scadenzario non si sommano.
//
// Qui l'elenco si apre col bottone (o col fuoco sul campo), si cerca senza
// accenti ne' maiuscole, e ogni voce dice QUALI SCHEDE tira dentro: i
// candidati dedotti dall'insegna vanno giudicati, non applicati a scatola
// chiusa (cinque «PASTICCERIA …» sono cinque aziende diverse).
//
// Il valore resta testo libero nel campo `name`: la server action non cambia.

function normalizza(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MAX_MOSTRATI = 40;

export function SceltaGruppo({
  name,
  valore,
  suggerimenti,
  nomePartner,
}: {
  name: string;
  valore: string;
  suggerimenti: SuggerimentoGruppo[];
  /** Nome della scheda in modifica: i suggerimenti che la riguardano vanno in cima. */
  nomePartner?: string;
}) {
  const [testo, setTesto] = useState(valore);
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  // I suggerimenti che contengono gia' questa scheda vengono per primi:
  // modificando «CHANEL FIRENZE» il gruppo giusto e' il primo della lista.
  const ordinati = useMemo(() => {
    if (!nomePartner) return suggerimenti;
    return [...suggerimenti].sort(
      (a, b) => Number(b.membri.includes(nomePartner)) - Number(a.membri.includes(nomePartner)),
    );
  }, [suggerimenti, nomePartner]);

  const trovati = useMemo(() => {
    const q = normalizza(testo);
    // A campo vuoto si mostrano solo i gruppi veri e i candidati: l'elenco di
    // tutte le schede a vista sarebbe un muro, e si cerca proprio scrivendo.
    if (!q) return ordinati.filter((s) => s.tipo !== "scheda").slice(0, MAX_MOSTRATI);
    const parole = q.split(" ");
    // si cerca anche fra le schede del gruppo: scrivendo «firenze» esce CHANEL.
    return ordinati
      .filter((s) => {
        const testoVoce = normalizza(`${s.nome} ${s.membri.join(" ")}`);
        return parole.every((p) => testoVoce.includes(p));
      })
      .slice(0, MAX_MOSTRATI);
  }, [testo, ordinati]);

  // Il gruppo scritto adesso: se esiste gia', si dice con chi si finisce.
  const corrente = useMemo(() => {
    const k = normalizza(testo);
    if (!k) return null;
    return suggerimenti.find((s) => normalizza(s.nome) === k) ?? null;
  }, [testo, suggerimenti]);

  function scegli(s: SuggerimentoGruppo) {
    setTesto(s.nome);
    setAperto(false);
    campo.current?.focus();
  }

  const compagni = corrente ? corrente.membri.filter((m) => m !== nomePartner) : [];

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          ref={campo}
          type="text"
          name={name}
          value={testo}
          autoComplete="off"
          placeholder="es. CHANEL — cerca o scrivi un nome nuovo"
          title="Se piu schede vengono saldate da un unica amministrazione, scrivi qui lo stesso nome su tutte: nello scadenzario si sollecitano insieme."
          style={{ paddingRight: 34 }}
          onChange={(e) => {
            setTesto(e.target.value);
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
          aria-label="Mostra i gruppi"
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

      {corrente?.tipo === "uso" && compagni.length > 0 ? (
        <span className="muted" style={{ fontSize: 11.5 }}>
          Nello scadenzario insieme a {compagni.slice(0, 3).join(", ")}
          {compagni.length > 3 ? ` e altre ${compagni.length - 3}` : ""}.
        </span>
      ) : corrente?.tipo === "candidato" && compagni.length > 0 ? (
        <span className="muted" style={{ fontSize: 11.5 }}>
          Gruppo nuovo: perche si sommi, lo stesso nome va scritto anche su{" "}
          {compagni.slice(0, 3).join(", ")}
          {compagni.length > 3 ? ` e altre ${compagni.length - 3}` : ""}.
        </span>
      ) : (
        <span className="muted" style={{ fontSize: 11.5 }}>
          Stesso nome su piu partner = nello scadenzario si vedono insieme.
        </span>
      )}

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
              Nessun gruppo con questo nome. Va bene lo stesso: scrivendolo ne crei uno nuovo,
              e comparira' qui quando lo userai su un altra scheda.
            </div>
          ) : (
            trovati.map((s, i) => {
              const suoi = s.membri.filter((m) => m !== nomePartner);
              return (
                <button
                  key={`${s.tipo}-${s.nome}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => scegli(s)}
                  onMouseEnter={() => setAttivo(i)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                    padding: "8px 14px", border: 0, borderTop: i === 0 ? 0 : "1px solid var(--hairline)",
                    background: i === attivo ? "var(--bg)" : "transparent", font: "inherit",
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{s.nome}</span>
                  <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>
                    {s.tipo === "uso"
                      ? `gruppo attivo · ${s.membri.length} schede`
                      : s.tipo === "candidato"
                        ? `da confermare · stessa insegna su ${s.membri.length} schede`
                        : "altra scheda · nessun gruppo"}
                  </span>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {suoi.length > 0 ? suoi.join(" · ") : "solo questa scheda"}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
