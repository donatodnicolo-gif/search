import type { SchedaCliente } from "./orders";
import { dataIt, euro, segmento } from "./etichette";

// Le variabili dei template mail: {{nome}}, {{citta}}, {{evento}}…
// La sostituzione avviene sul server al momento della composizione, così
// l'operatore vede e RILEGGE il testo finale prima di premere invia: una mail
// personalizzata sbagliata è peggio di una generica.

export type Evento = {
  titolo: string;
  dataInizio: Date;
  luogo: string;
  dressCode: string;
};

export const VARIABILI_DISPONIBILI = [
  { chiave: "nome", descrizione: "Nome del cliente (come negli ordini)" },
  { chiave: "citta", descrizione: "Città del cliente" },
  { chiave: "segmento", descrizione: "Segmento (VIP, Fedele…)" },
  { chiave: "ordini", descrizione: "Numero di ordini" },
  { chiave: "speso", descrizione: "Totale speso" },
  { chiave: "ultimoOrdine", descrizione: "Data dell'ultimo ordine" },
  { chiave: "evento", descrizione: "Titolo dell'evento (se si scrive per un evento)" },
  { chiave: "dataEvento", descrizione: "Data e ora dell'evento" },
  { chiave: "luogoEvento", descrizione: "Luogo dell'evento" },
  { chiave: "dressCode", descrizione: "Dress code dell'evento" },
] as const;

export function primoNome(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome.trim().split(/\s+/)[0] ?? "";
}

export function sostituisciVariabili(
  testo: string,
  cliente: SchedaCliente | null,
  evento: Evento | null,
): string {
  const valori: Record<string, string> = {
    nome: primoNome(cliente?.nome) || cliente?.nome || "",
    nomeCompleto: cliente?.nome ?? "",
    citta: cliente?.citta ?? "",
    segmento: cliente ? segmento(cliente.segmento).nome : "",
    ordini: cliente ? String(cliente.ordini) : "",
    speso: cliente ? euro(cliente.speso) : "",
    ultimoOrdine: cliente ? dataIt(cliente.ultimoOrdine) : "",
    evento: evento?.titolo ?? "",
    dataEvento: evento ? dataIt(evento.dataInizio, true) : "",
    luogoEvento: evento?.luogo ?? "",
    dressCode: evento?.dressCode ?? "",
  };
  return testo.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (intera, chiave: string) => {
    return chiave in valori ? valori[chiave] : intera;
  });
}
