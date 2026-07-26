import { canale, titoloCanale } from "@/lib/marketing";
import type { Ordinale } from "@/lib/repeater";

// I due segni che raccontano un ordine prima ancora di aprirlo: **da dove
// arriva** (il canale di marketing, un simbolo solo) e **chi lo fa** (prima
// volta o cliente che torna).
//
// Se la provenienza non si sa, non esce niente: nessun simbolo, nessun «?». Un
// posto vuoto si legge come «non lo sappiamo», un simbolo inventato no.

export function SegnoCanale({
  ordine,
  conNome = false,
}: {
  ordine: {
    canaleMarketing: string;
    utmCampaign?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    visitaSorgente?: string | null;
  };
  conNome?: boolean;
}) {
  const c = canale(ordine.canaleMarketing);
  if (!c) return null;
  return (
    <span className={`segno-canale${c.pagato ? " pagato" : ""}`} title={titoloCanale(ordine)}>
      <span aria-hidden>{c.simbolo}</span>
      <span className={conNome ? "" : "solo-lettori"}>{c.nome}</span>
    </span>
  );
}

// «1º ordine» o «Repeater · 4º». Assente quando l'ordine non ha un cliente
// riconoscibile: lì non si sa se sia un ritorno, e non si tira a indovinare.
export function PillRepeater({ ordinale }: { ordinale: Ordinale | undefined }) {
  if (!ordinale) return null;
  return (
    <span
      className={`pill-repeater${ordinale.repeater ? " repeater" : ""}`}
      title={
        ordinale.repeater
          ? `Cliente che torna: prima di questo aveva già fatto ${ordinale.precedenti} ${
              ordinale.precedenti === 1 ? "ordine" : "ordini"
            } (annullati esclusi).`
          : "Prima volta: nessun ordine valido prima di questo."
      }
    >
      {ordinale.repeater ? `Repeater · ${ordinale.numero}º` : "1º ordine"}
    </span>
  );
}
