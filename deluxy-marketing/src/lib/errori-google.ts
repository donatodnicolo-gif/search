// Gli errori che Google rimanda allo script, detti in italiano.
//
// ⚠️ PERCHÉ SERVE. Quando l'API rifiuta una scrittura, l'esito che finisce
// nell'app è il JSON grezzo dell'errore. Quello vero, del 21/08/2026:
//
//   Error: Assets are duplicated across operations.
//   ({"errorCode":{"assetError":"DUPLICATE_ASSET"},"message":"Assets are
//   duplicated across operations.","location":{"fieldPathElements":[…,
//   {"fieldName":"headlines","index":9}]}})
//
// Dentro c'è tutto quello che serve — il titolo numero 10 è un doppione — ma
// per leggerlo bisogna sapere che `headlines` sono i titoli, che l'indice parte
// da zero e che `DUPLICATE_ASSET` vuol dire che Google non scarta la riga di
// troppo ma butta l'annuncio intero. Chi apre l'app vede quattro righe di
// parentesi e chiude la pagina.
//
// ⚠️ La spiegazione si AGGIUNGE, non sostituisce: il testo originale resta,
// perché è quello che si cerca su Google quando la traduzione non basta e
// perché una traduzione sbagliata su un errore nascosto è peggio del JSON.

type Regola = {
  /** Cosa cercare nel testo dell'errore. */
  segno: RegExp;
  /** La spiegazione. `campo` e `indice`, quando ci sono, vengono sostituiti. */
  spiega: (campo: string | null, indice: number | null) => string;
};

/** «headlines» → «titolo», per chi non parla l'API di Google. */
function inItaliano(campo: string | null): string | null {
  if (!campo) return null;
  if (/headline/i.test(campo)) return "titolo";
  if (/description/i.test(campo)) return "descrizione";
  if (/final_url|finalUrl/i.test(campo)) return "destinazione";
  if (/path/i.test(campo)) return "percorso del link";
  return null;
}

const REGOLE: Regola[] = [
  {
    segno: /DUPLICATE_ASSET|duplicated across operations/i,
    spiega: (campo, indice) => {
      const che = inItaliano(campo);
      // ⚠️ L'indice di Google parte da ZERO: il suo 9 è il decimo della lista,
      // e dirlo sbagliato manda a correggere la riga che non c'entra.
      const dove = che && indice != null ? ` Il ${che} numero ${indice + 1} è uguale a uno più in alto.` : "";
      return (
        "Due testi identici nello stesso annuncio." + dove +
        " Google non scarta la riga di troppo: rifiuta l'annuncio INTERO. Cambia o togli quello ripetuto e rimettilo in coda."
      );
    },
  },
  {
    segno: /DESTINATION_NOT_WORKING/i,
    spiega: () =>
      "La pagina di destinazione non ha risposto a Google. È un problema della pagina, non del testo: " +
      "controlla che l'indirizzo si apra davvero (anche dall'estero e da telefono) e che non rimandi a un errore.",
  },
  {
    segno: /TOO_LONG|LINE_TOO_WIDE/i,
    spiega: (campo, indice) => {
      const che = inItaliano(campo);
      const dove = che && indice != null ? ` Il ${che} numero ${indice + 1} supera il limite.` : "";
      return "Un testo è più lungo di quanto Google accetta (30 caratteri i titoli, 90 le descrizioni)." + dove;
    },
  },
  {
    segno: /POLICY_FINDING|policy_summary|DISAPPROVED/i,
    spiega: () =>
      "Google ha trovato qualcosa che non rispetta le sue norme. Il motivo per esteso sta in Google Ads, " +
      "colonna «Stato» dell'annuncio.",
  },
  {
    segno: /DUPLICATE_ADS/i,
    spiega: () => "Nel gruppo c'è già un annuncio identico a questo: Google non ne accetta due uguali.",
  },
];

/**
 * La spiegazione in italiano di un esito di errore, se la si sa dare.
 *
 * Torna `null` quando l'errore non è fra quelli conosciuti: meglio il testo
 * originale che una frase generica che finge di aver capito.
 */
export function spiegaErroreGoogle(esito: string | null | undefined): string | null {
  const t = String(esito ?? "");
  if (!t) return null;

  // Dove ha sbagliato: l'ULTIMO `fieldName` con un indice è quello preciso
  // (`mutate_operations` → `ad` → `responsive_search_ad` → `headlines[9]`).
  let campo: string | null = null;
  let indice: number | null = null;
  const pezzi = [...t.matchAll(/"fieldName"\s*:\s*"([^"]+)"(?:\s*,\s*"index"\s*:\s*(\d+))?/g)];
  for (const p of pezzi) {
    if (p[2] != null) {
      campo = p[1];
      indice = Number(p[2]);
    }
  }

  for (const r of REGOLE) {
    if (r.segno.test(t)) return r.spiega(campo, indice);
  }
  return null;
}
