// Che COSA è questo luogo dentro l'azienda: la sede o un negozio.
//
// È una dimensione diversa dal gruppo. Il gruppo dice *di chi è* un'anagrafica
// (l'insegna); questo dice *che ruolo ha* quel luogo. Le tre «Dr. Vranjes»
// sono la stessa azienda — stessa P.IVA — ma una è la sede amministrativa a
// Bagno a Ripoli e le altre due sono le boutique di Milano e Roma: senza
// questo campo il registro non sa dire quale sia quale, e chi deve mandare
// una consegna o una fattura tira a indovinare.
//
// Vuoto = non indicato. Non si deduce dall'indirizzo né dal fatto di essere
// capogruppo: la sede legale può benissimo non essere l'anagrafica madre.

export const TIPI_LUOGO = ["sede", "negozio", "showroom", "magazzino", "altro"] as const;

export type TipoLuogo = (typeof TIPI_LUOGO)[number];

export const ETICHETTE_TIPO_LUOGO: Record<TipoLuogo, string> = {
  sede: "Sede",
  negozio: "Negozio",
  showroom: "Showroom",
  magazzino: "Magazzino",
  altro: "Altro",
};

// Cosa vuol dire, detto a chi compila: le etichette da sole si confondono
// (una boutique è «la sede di Milano»? no, è un negozio).
export const DESCRIZIONI_TIPO_LUOGO: Record<TipoLuogo, string> = {
  sede: "Sede legale o amministrativa: gli uffici dell'azienda, dove si fattura",
  negozio: "Punto vendita aperto al pubblico",
  showroom: "Spazio di esposizione, non vendita al dettaglio",
  magazzino: "Deposito, logistica",
  altro: "Un luogo che non rientra negli altri",
};

export const COLORE_TIPO_LUOGO: Record<TipoLuogo, string> = {
  sede: "var(--purple)",
  negozio: "var(--green)",
  showroom: "var(--blue)",
  magazzino: "var(--orange)",
  altro: "var(--text-secondary)",
};

export function isTipoLuogo(v: string): v is TipoLuogo {
  return (TIPI_LUOGO as readonly string[]).includes(v);
}

export function etichettaTipoLuogo(v: string | null | undefined): string | null {
  if (!v) return null;
  return isTipoLuogo(v) ? ETICHETTE_TIPO_LUOGO[v] : v;
}
