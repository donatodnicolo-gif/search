// Il contratto fra il bottone di ogni riga (stampato dal SERVER) e l'unico
// dialogo della pagina (componente client): quattro attributi sul bottone.
//
// ⚠️ Sta qui e non dentro `components/PortaKeyword.tsx` perché quel file è
// `"use client"`: chiamarne una funzione dal server non dà errore di tipi, dà
// un errore a pagina aperta — «Attempted to call attributiPortaKeyword() from
// the server but attributiPortaKeyword is on the client». Un helper condiviso
// fra server e client non può vivere in un modulo client.
export const ATTR = {
  keyword: "data-porta-keyword",
  corrispondenza: "data-porta-corrispondenza",
  escludi: "data-porta-escludi",
  classificata: "data-porta-classificata",
} as const;

export function attributiPortaKeyword(dati: {
  testo: string;
  corrispondenza: string;
  // Campagne su cui la keyword c'è già: si tolgono dall'elenco del dialogo
  giaSu: string[];
  classificata: boolean;
}) {
  return {
    [ATTR.keyword]: dati.testo,
    [ATTR.corrispondenza]: dati.corrispondenza,
    [ATTR.escludi]: dati.giaSu.join("\n"),
    [ATTR.classificata]: dati.classificata ? "si" : "no",
  };
}
