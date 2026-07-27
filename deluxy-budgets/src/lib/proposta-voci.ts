// Tipi e costanti della proposta, **senza niente di server dentro**.
//
// Stanno separati perché il pannello della proposta è un componente client: se
// importasse dal file che parla con Finance si tirerebbe dietro tutta la catena
// fino a node:crypto, che nel browser non esiste — ed è esattamente l errore
// che ha fatto esplodere la pagina la prima volta.

export type Proposta = { codice: string; importo: number; fonte: string };
export type NonProponibile = { codice: string; nome: string; perche: string };

// Le voci che l'app non può proporre, con il motivo. Sono la parte più utile
// della schermata: dicono cosa manca e perché il gestionale non torna col
// bilancio.
export const NON_PROPONIBILI: NonProponibile[] = [
  { codice: "B6", nome: "Materie prime e merci", perche: "dalla banca si vede a chi si è pagato, non se era merce o servizio: separare B6 da B7 lo può fare solo chi tiene la contabilità." },
  { codice: "B8", nome: "Godimento di beni di terzi", perche: "affitti e noleggi stanno mescolati alle altre uscite di struttura: servirebbe una categoria dedicata nel CFO." },
  { codice: "B10", nome: "Ammortamenti", perche: "non passano dalla banca. È il motivo principale per cui il conto gestionale non torna col bilancio." },
  { codice: "B11", nome: "Variazione delle rimanenze", perche: "l'app non tiene il magazzino: nessuna delle fonti sa quanto c'era in giacenza." },
  { codice: "C16", nome: "Proventi finanziari", perche: "gli incassi finanziari non arrivano da Finance, che passa solo le uscite di banca." },
  { codice: "C17", nome: "Oneri finanziari", perche: "in banca stanno in categorie escluse dal P&L (commissioni, interessi): andrebbero prima classificate nel CFO." },
  { codice: "IMPOSTE", nome: "Imposte sul reddito", perche: "quello che si vede in banca sono i versamenti, non le imposte di competenza dell'esercizio." },
];
