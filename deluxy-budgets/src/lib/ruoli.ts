// I ruoli e il tipo dell'utente, senza niente di Node dentro: li legge anche il
// **componente client** della pagina Accesso, e un file che importa
// `node:crypto` nel browser non si compila. Stessa separazione di
// `bilancio-voci.ts`, e per la stessa ragione.

export const RUOLI = [
  {
    key: "admin",
    label: "Amministratore",
    aiuto: "Vede tutto e modifica tutto: budget, dipendenti, categorie, chiavi.",
  },
  {
    key: "lettura",
    label: "Sola lettura (commercialista)",
    aiuto:
      "Vede tutte le pagine e non può cambiare niente: ogni tentativo di scrittura viene rifiutato dal server, non solo nascosto.",
  },
  {
    key: "proposte",
    label: "Responsabile (solo proposte)",
    aiuto: "Vede solo /proposte: manda il proprio budget e rivede i propri invii. Non vede stipendi né margini.",
  },
] as const;

export type RuoloUtente = (typeof RUOLI)[number]["key"];

export function ruoloValido(v: unknown): v is RuoloUtente {
  return RUOLI.some((r) => r.key === v);
}

export type UtenteEsposto = {
  id: string;
  email: string;
  nome: string;
  ruolo: string;
  attivo: boolean;
  ultimoAccesso: Date | null;
};
