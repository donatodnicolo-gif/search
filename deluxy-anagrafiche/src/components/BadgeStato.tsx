import {
  COLORE_STATO,
  COLORE_STATO_ANALISI,
  COLORE_STATO_FINANZIARIO,
  ETICHETTE_STATO,
  ETICHETTE_STATO_ANALISI,
  ETICHETTE_STATO_FINANZIARIO,
  isStato,
  isStatoAnalisi,
  isStatoFinanziario,
} from "@/lib/stati";

function Badge({ colore, etichetta }: { colore: string; etichetta: string }) {
  return (
    <span className="badge" style={{ color: colore }}>
      <span className="dot" />
      <span style={{ color: "var(--text)" }}>{etichetta}</span>
    </span>
  );
}

// Stato commerciale: ciclo di vita della relazione
export function BadgeStato({ stato }: { stato: string }) {
  const noto = isStato(stato);
  return (
    <Badge
      colore={noto ? COLORE_STATO[stato] : "var(--text-tertiary)"}
      etichetta={noto ? ETICHETTE_STATO[stato] : stato}
    />
  );
}

// Stato finanziario: come paga l'azienda
export function BadgeStatoFinanziario({ stato }: { stato: string }) {
  const noto = isStatoFinanziario(stato);
  return (
    <Badge
      colore={noto ? COLORE_STATO_FINANZIARIO[stato] : "var(--text-tertiary)"}
      etichetta={noto ? ETICHETTE_STATO_FINANZIARIO[stato] : stato}
    />
  );
}

// Stato analisi: perimetro dell'anno. Vuoto = non ancora analizzata.
export function BadgeStatoAnalisi({ stato }: { stato: string | null }) {
  if (!stato) return <Badge colore="var(--text-tertiary)" etichetta="Non analizzata" />;
  const noto = isStatoAnalisi(stato);
  return (
    <Badge
      colore={noto ? COLORE_STATO_ANALISI[stato] : "var(--text-tertiary)"}
      etichetta={noto ? ETICHETTE_STATO_ANALISI[stato] : stato}
    />
  );
}
