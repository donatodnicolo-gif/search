// Le funzioni di Google dentro il testo di un annuncio — `{KeyWord:…}`,
// `{LOCATION(City)}`, `{COUNTDOWN(…)}`, `{CUSTOMIZER.…}` — e come si contano
// i caratteri quando ci sono.
//
// ⚠️ PERCHÉ UN FILE A PARTE. La stessa regola serviva in tre posti che non si
// parlavano: la scheda che mostra i testi già in asta, il dialogo in cui se ne
// scrive uno nuovo, e la validazione lato server prima di mettere in coda. Con
// tre copie, due erano sbagliate: il dialogo contava
// `{KeyWord:Fresh Flower Delivery}` come 31 caratteri e **bloccava il bottone**
// dicendo «troppo lungo», mentre Google di quel titolo ne mostra 21. Una regola
// che vive in tre posti è una regola che diverge, e diverge in silenzio.

/** Il testo contiene una funzione di Google? */
export function dinamico(testo: string): boolean {
  return /\{(keyword|customizer|countdown|location)/i.test(testo);
}

/** Tutte le funzioni presenti, nell'ordine in cui compaiono. */
export const REGEX_FUNZIONE = /\{(keyword|location|countdown|customizer)[^}]*\}/gi;

/**
 * Come si chiama, in italiano, quello che Google mette al posto delle graffe.
 * È l'etichetta della pastiglia che si vede dentro il testo.
 */
export function etichettaFunzione(graffa: string): string {
  const kw = graffa.match(/\{keyword\s*:\s*([^}]*)\}/i);
  if (kw) {
    const riserva = kw[1].trim();
    return riserva ? `parola cercata → ${riserva}` : "parola cercata";
  }
  const loc = graffa.match(/\{location\s*\(([^)]*)\)/i);
  if (loc) {
    const cosa = loc[1].trim().toLowerCase();
    return cosa === "city" ? "città" : cosa === "region" ? "regione" : cosa === "country" ? "paese" : "località";
  }
  if (/\{countdown/i.test(graffa)) return "conto alla rovescia";
  if (/\{customizer/i.test(graffa)) return "personalizzatore";
  return graffa;
}

/** Come funziona, in una frase, per chi la vede la prima volta. */
export function spiegaDinamico(testo: string): string | null {
  const kw = testo.match(/\{keyword\s*:\s*([^}]*)\}/i);
  if (kw) {
    const riserva = kw[1].trim();
    return `Google sostituisce le graffe con la parola che ha cercato la persona${
      riserva ? ` e, se non ci sta nei 30 caratteri, scrive «${riserva}»` : ""
    }.`;
  }
  const loc = testo.match(/\{location\s*\(([^)]*)\)/i);
  if (loc) {
    const cosa = loc[1].trim().toLowerCase();
    const parola =
      cosa === "city" ? "la città" : cosa === "region" ? "la regione" : cosa === "country" ? "il paese" : "la località";
    return `Google sostituisce le graffe con ${parola} da cui arriva chi cerca.`;
  }
  if (/\{countdown/i.test(testo)) return "Google sostituisce le graffe col tempo che manca alla data indicata.";
  if (/\{customizer/i.test(testo)) return "Google sostituisce le graffe con un valore preso dal tuo elenco di personalizzatori.";
  return null;
}

export type MisuraTesto = {
  /** I caratteri che Google conta davvero, per quanto si può sapere. */
  lunghezza: number;
  /** Falso quando c'è una funzione di cui non si può conoscere la resa. */
  certa: boolean;
  /** Il testo con le funzioni sostituite dal loro ripiego, dove esiste. */
  reso: string;
};

/**
 * Quanto è lungo DAVVERO un testo con le funzioni dentro.
 *
 * ⚠️ La regola di Google: in `{KeyWord:testo di riserva}` il limite dei 30
 * caratteri vale sul **testo di riserva**, non sulla stringa scritta — la
 * parola cercata la sostituisce solo se ci sta. Quindi
 * `{KeyWord:Fresh Flower Delivery}` sono 21 caratteri, non 31, e segnarlo come
 * troppo lungo manda a riscrivere un titolo perfetto (o, peggio, impedisce di
 * metterlo in coda).
 *
 * ⚠️ Per `LOCATION`, `COUNTDOWN` e `CUSTOMIZER` un ripiego dentro la stringa
 * non c'è: quanto sarà lungo dipende dalla città, dai giorni che mancano o dal
 * valore. Lì la lunghezza si dichiara **incerta** invece di inventarne una: si
 * conta il resto del testo e si dice che il pezzo dinamico non si può misurare.
 * Meglio «non lo so» che un numero preciso e falso.
 */
export function misuraTesto(testo: string): MisuraTesto {
  let certa = true;
  const reso = testo.replace(new RegExp(REGEX_FUNZIONE.source, "gi"), (graffa) => {
    const kw = graffa.match(/\{keyword\s*:\s*([^}]*)\}/i);
    if (kw && kw[1].trim()) return kw[1].trim();
    // Senza ripiego scritto non si può sapere: si toglie dal conteggio e si
    // dichiara l'incertezza.
    certa = false;
    return "";
  });
  return { lunghezza: reso.length, certa, reso };
}

/**
 * Il testo è oltre il limite? Solo quando lo si può affermare.
 *
 * Con una funzione non misurabile la risposta è **no**: un allarme che potrebbe
 * essere falso è peggio di un allarme mancato, perché fa riscrivere testi che
 * vanno bene e insegna a ignorare gli avvisi.
 */
export function oltreIlLimite(testo: string, limite: number): boolean {
  const m = misuraTesto(testo);
  return m.certa && m.lunghezza > limite;
}
