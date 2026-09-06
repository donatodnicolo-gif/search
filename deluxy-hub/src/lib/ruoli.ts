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

// Dal 06/09/2026 in /utenti il ruolo NON si sceglie da una tendina: la
// funzione di una persona (Maison, Commerciale, Operation…) arriva da
// Personale e qui non si tocca. Restano due privilegi del portale, come spunte:
// «Amministratore» (gestisce utenti, vede tutto) ed «Esterno / partner» (chi
// non sta in Personale: vede la propria scheda in Finance). Nessuna spunta =
// persona del team (ruolo interno «commerciale», che oggi vale come base).
// Il campo `ruolo` a database resta lo stesso: cambia solo come si compila.
export function ruoloDaModulo(fd: FormData): Ruolo {
  if (fd.get("amministratore") === "on") return "admin";
  if (fd.get("esterno") === "on") return "partner";
  return "commerciale";
}
