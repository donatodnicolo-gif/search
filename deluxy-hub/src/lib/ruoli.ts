// Tipologie di utente del portale. L'elenco è chiuso: aggiungere un ruolo qui
// significa anche decidere quali app vede, in src/lib/apps.ts.

export const RUOLI = ["admin", "partner", "commerciale"] as const;

export type Ruolo = (typeof RUOLI)[number];

type DescrizioneRuolo = { etichetta: string; descrizione: string };

export const RUOLO_INFO: Record<Ruolo, DescrizioneRuolo> = {
  admin: {
    etichetta: "Amministratore",
    descrizione: "Accesso a tutte le app e alla gestione degli utenti.",
  },
  partner: {
    etichetta: "Partner",
    descrizione: "Accesso alla propria scheda finanziaria su Deluxy Partner.",
  },
  commerciale: {
    etichetta: "Commerciale",
    descrizione: "Prospezione sul territorio e ricerca partner.",
  },
};

export function isRuolo(valore: string): valore is Ruolo {
  return (RUOLI as readonly string[]).includes(valore);
}
