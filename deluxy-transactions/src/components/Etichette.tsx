import { ETICHETTE, TONI } from "@/lib/richieste";
import { livelloRischio } from "@/lib/rischio";

// Pillole di stato e di rischio: un posto solo, così lo stesso stato ha lo
// stesso colore in tutte le schermate.

// `pagatoCon` non è un dettaglio: «pagata» e «pagata fuori dall'app» sono lo
// stesso stato ma due cose diverse — della prima esiste il file mandato in
// banca o l'id del bonifico, della seconda solo la parola di chi l'ha
// registrata. In un elenco di pagamenti la differenza si deve vedere.
export function BadgeStato({ stato, pagatoCon }: { stato: string; pagatoCon?: string | null }) {
  const fuori = stato === "pagata" && pagatoCon === "fuori_app";
  const tono = fuori ? "neutro" : TONI[stato] ?? "neutro";
  return (
    <span className={`badge ${tono}`} title={fuori ? "Pagata da un'altra parte e registrata qui a mano" : undefined}>
      <span className="dot" />
      {fuori ? "pagata fuori" : ETICHETTE[stato] ?? stato}
    </span>
  );
}

export function BadgeRischio({ punteggio }: { punteggio: number }) {
  const l = livelloRischio(punteggio);
  return (
    <span className={`badge-rischio ${l.tono}`} title={`Punteggio di rischio: ${punteggio}/100`}>
      rischio {l.nome}
    </span>
  );
}

/** Pallini delle firme raccolte: 1 o 2 a seconda della doppia firma. */
export function Firme({ raccolte, necessarie }: { raccolte: number; necessarie: number }) {
  return (
    <span className="firme" title={`${raccolte} di ${necessarie} firme`}>
      {Array.from({ length: necessarie }, (_, i) => (
        <span key={i} className={`firme-punto${i < raccolte ? " fatta" : ""}`} />
      ))}
    </span>
  );
}

export function quando(data: Date | null): string {
  if (!data) return "—";
  return data.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
