// I **tipi e le costanti** dei premi, senza niente che tocchi il database.
//
// ⚠️ Sta in un file suo per una ragione precisa: `PremiEditor` è un componente
// **client**, e importando da `premi.ts` si tirava dietro `calc` → `struttura` →
// `finance` → `chiavi` → `node:crypto`, che nel bundle del browser non esiste.
// La build falliva con «Reading from "node:crypto" is not handled». È lo stesso
// motivo per cui esiste `persone.ts` separato da `calc.ts`.
//
// Regola: quello che serve **anche al browser** non deve stare nello stesso file
// di quello che parla col database.

export const AMBITI = [
  { key: "AZIENDA", nome: "Tutta l'azienda" },
  { key: "TEAM", nome: "Una squadra" },
  { key: "PERSONA", nome: "Una persona" },
] as const;

export const OBIETTIVI = [
  { key: "VENDITE_AZIENDA", nome: "Vendite dell'azienda", unita: "€", serveRif: false },
  { key: "VENDITE_MAISON", nome: "Vendite di un brand", unita: "€", serveRif: true },
  { key: "VENDITE_LINEA", nome: "Vendite di una linea commerciale", unita: "€", serveRif: true },
  { key: "EBITDA", nome: "EBITDA", unita: "€", serveRif: false },
  { key: "MANUALE", nome: "Non misurabile dall'app", unita: "", serveRif: false },
] as const;

export type Premio = {
  id: string;
  nome: string;
  ambito: string;
  teamId: string | null;
  dipendenteId: string | null;
  obiettivoTipo: string;
  obiettivoRif: string | null;
  soglia: number;
  dal: number;
  al: number;
  importo: number;
  note: string | null;
  riconosciuto: boolean | null;
};

export type PremioMisurato = Premio & {
  // Il risultato raggiunto nel periodo, o `null` se non si misura.
  risultato: number | null;
  // `true`/`false` quando c'è una misura, `null` quando non c'è.
  raggiunto: boolean | null;
  // Se il premio **pesa sul conto economico** di questo scenario.
  costa: boolean;
  // A chi va, in chiaro.
  destinatario: string;
};
