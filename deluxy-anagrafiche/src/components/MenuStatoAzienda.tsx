"use client";

import { useOptimistic, useRef, useState } from "react";
import { cambiaLivello, cambiaStatoAnalisi, cambiaStatoFinanziario } from "@/lib/azioni";
import { BadgeLivello, BadgeStatoAnalisi, BadgeStatoFinanziario } from "./BadgeStato";
import type { DimensioneAzienda } from "./SelettoreStatoAzienda";
import {
  COLORE_LIVELLO,
  COLORE_STATO_ANALISI,
  COLORE_STATO_FINANZIARIO,
  DESCRIZIONI_STATO_ANALISI,
  ETICHETTE_LIVELLO,
  ETICHETTE_STATO_FINANZIARIO,
  LIVELLI,
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
  dimensione: DimensioneAzienda;
  stato: string | null;
  disabilitato?: boolean;
}) {
  const ancora = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // ⚠️ PRESTAZIONI PERCEPITE: vedi MenuStato — il badge cambia al click, la
  // rivalidazione della pagina arriva dopo.
  const [statoMostrato, setStatoMostrato] = useOptimistic(stato ?? "");

  const azione =
    dimensione === "finanziario"
      ? cambiaStatoFinanziario
      : dimensione === "analisi"
        ? cambiaStatoAnalisi
        : cambiaLivello;
  const campo =
    dimensione === "finanziario" ? "statoFinanziario" : dimensione === "analisi" ? "statoAnalisi" : "livello";
  const voci: Voce[] =
    dimensione === "finanziario"
      ? STATI_FINANZIARI.map((s) => ({
          valore: s as string,
          etichetta: ETICHETTE_STATO_FINANZIARIO[s],
          colore: COLORE_STATO_FINANZIARIO[s],
        }))
      : dimensione === "analisi"
        ? [
            ...STATI_ANALISI.map((s) => ({
              valore: s as string,
              etichetta: DESCRIZIONI_STATO_ANALISI[s],
              colore: COLORE_STATO_ANALISI[s],
            })),
            { valore: "", etichetta: "Non analizzata", colore: "var(--text-tertiary)" },
          ]
        : [
            ...LIVELLI.map((l) => ({
              valore: l as string,
              etichetta: ETICHETTE_LIVELLO[l],
              colore: COLORE_LIVELLO[l],
            })),
            { valore: "", etichetta: "Non indicato", colore: "var(--text-tertiary)" },
          ];

  const badge =
    dimensione === "finanziario" ? (
      <BadgeStatoFinanziario stato={statoMostrato} />
    ) : dimensione === "analisi" ? (
      <BadgeStatoAnalisi stato={statoMostrato || null} />
    ) : (
      <BadgeLivello livello={statoMostrato || null} />
    );

  if (disabilitato) return badge;

  return (
    // key: al cambio di stato il menu si smonta e si richiude da solo
    <details
      className="menu-stato"
      key={statoMostrato || "vuoto"}
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
        <form
          action={async (fd) => {
            setStatoMostrato(String(fd.get(campo) ?? ""));
            await azione(partnerId, fd);
          }}
        >
          {voci
            .filter((v) => v.valore !== statoMostrato)
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
