"use client";

import { useRef, useState } from "react";
import { cambiaStatoAnalisi, cambiaStatoFinanziario } from "@/lib/azioni";
import { BadgeStatoAnalisi, BadgeStatoFinanziario } from "./BadgeStato";
import {
  COLORE_STATO_ANALISI,
  COLORE_STATO_FINANZIARIO,
  DESCRIZIONI_STATO_ANALISI,
  ETICHETTE_STATO_FINANZIARIO,
  STATI_ANALISI,
  STATI_FINANZIARI,
} from "@/lib/stati";

type Voce = { valore: string; etichetta: string; colore: string };

// Badge cliccabile per lo stato finanziario o per lo stato analisi nelle righe
// dell'elenco: stessa meccanica di MenuStato (menu "fixed" per non farsi
// ritagliare dallo scorrimento orizzontale della tabella), ma senza archivio —
// quello resta un'azione della sola dimensione commerciale.
export function MenuStatoAzienda({
  partnerId,
  dimensione,
  stato,
  disabilitato = false,
}: {
  partnerId: string;
  dimensione: "finanziario" | "analisi";
  stato: string | null;
  disabilitato?: boolean;
}) {
  const ancora = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const finanziario = dimensione === "finanziario";
  const azione = finanziario ? cambiaStatoFinanziario : cambiaStatoAnalisi;
  const campo = finanziario ? "statoFinanziario" : "statoAnalisi";
  const voci: Voce[] = finanziario
    ? STATI_FINANZIARI.map((s) => ({
        valore: s,
        etichetta: ETICHETTE_STATO_FINANZIARIO[s],
        colore: COLORE_STATO_FINANZIARIO[s],
      }))
    : [
        ...STATI_ANALISI.map((s) => ({
          valore: s,
          etichetta: DESCRIZIONI_STATO_ANALISI[s],
          colore: COLORE_STATO_ANALISI[s],
        })),
        { valore: "", etichetta: "Non analizzata", colore: "var(--text-tertiary)" },
      ];

  const badge = finanziario ? (
    <BadgeStatoFinanziario stato={stato ?? ""} />
  ) : (
    <BadgeStatoAnalisi stato={stato} />
  );

  if (disabilitato) return badge;

  return (
    // key: al cambio di stato il menu si smonta e si richiude da solo
    <details
      className="menu-stato"
      key={stato ?? "vuoto"}
      onToggle={(e) => {
        if (e.currentTarget.open && ancora.current) {
          const r = ancora.current.getBoundingClientRect();
          setPos({ top: r.bottom + 6, left: r.left });
        }
      }}
    >
      <summary ref={(el) => { ancora.current = el; }}>
        {badge}
        <span className="menu-freccia">▾</span>
      </summary>
      <div
        className="menu-stato-lista"
        style={pos ? { position: "fixed", top: pos.top, left: pos.left } : undefined}
      >
        <form action={azione.bind(null, partnerId)}>
          {voci
            .filter((v) => v.valore !== (stato ?? ""))
            .map((v) => (
              <button
                key={v.valore || "vuoto"}
                type="submit"
                name={campo}
                value={v.valore}
                className="menu-stato-voce"
                style={{ color: v.colore }}
              >
                <span className="dot" />
                <span className="stato-label">{v.etichetta}</span>
              </button>
            ))}
        </form>
      </div>
    </details>
  );
}
