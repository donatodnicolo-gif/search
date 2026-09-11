// Il «dove» con cui si legge un brand: l'AREA di consegna.
//
// ⚠️ IL «CHE COSA» NON STA QUI, E NON DEVE. La categoria di prodotto di una
// campagna ce l'ha già l'app, in `LegameCampagnaShopify`: dedotta dal nome da
// `deduciLegame()` (vendite-campagna.ts), correggibile a mano dalla scheda
// campagna, e una volta corretta non più sovrascritta. Riscriverla qui avrebbe
// dato due vocabolari per la stessa domanda — e quindi due tabelle che, sulla
// stessa campagna, avrebbero risposto in modo diverso.
//
// L'area invece non l'aveva nessuno: `deduciLegame` deduce una città dal NOME
// della campagna, che è un'altra cosa dal sapere dove sono andati gli ordini e
// dove è finita la spesa.

// ============================== AREE ==============================

/**
 * Le aree di consegna. Sono quelle di deluxy.it — Milano, Roma, Firenze e
 * tutto il resto — e valgono per tutti i brand: sono le città dove Deluxy
 * consegna con i propri presìdi.
 *
 * ⚠️ `nonNota` non è un'area: è l'ammissione che di quell'ordine non sappiamo
 * dove è andato. Tenerla separata da «altro» è il punto: «altro» vuol dire
 * «fuori dalle tre città», e metterci dentro gli sconosciuti trasformerebbe
 * un'ignoranza in una notizia.
 */
export const AREE = ["milano", "roma", "firenze", "altro"] as const;
export type Area = (typeof AREE)[number];

export const ETICHETTA_AREA: Record<string, string> = {
  milano: "Milano",
  roma: "Roma",
  firenze: "Firenze",
  altro: "Altre zone",
  nazionale: "Tutta Italia",
  nonNota: "Non nota",
};

// Le province delle tre città. Solo quelle: Monza (MB) non è Milano, e una
// consegna a Monza in riga «Milano» gonfierebbe l'incasso di un'area in cui
// non è avvenuta.
const PROVINCIA_AREA: Record<string, Area> = { MI: "milano", RM: "roma", FI: "firenze" };

// I nomi con cui i clienti scrivono le tre città al checkout. La forma si
// normalizza prima (minuscole, senza accenti, senza doppi spazi): "ROMA",
// "Rome" e "roma " sono la stessa città.
const CITTA_AREA: Record<string, Area> = {
  milano: "milano",
  milan: "milano",
  mailand: "milano",
  roma: "roma",
  rome: "roma",
  rom: "roma",
  firenze: "firenze",
  florence: "firenze",
  florenz: "firenze",
};

// Le vocali accentate che compaiono davvero nei nomi delle città italiane.
// Una classe di segni combinanti sarebbe più generale, ma qui il lavoro è
// riconoscere «Forlì» e «Cesenatico», non normalizzare il mondo.
const ACCENTI: Record<string, string> = {
  à: "a", á: "a", â: "a",
  è: "e", é: "e", ê: "e",
  ì: "i", í: "i", î: "i",
  ò: "o", ó: "o", ô: "o",
  ù: "u", ú: "u", û: "u",
};

const senzaAccenti = (s: string) =>
  s
    .toLowerCase()
    .replace(/[àáâèéêìíîòóôùúû]/g, (c) => ACCENTI[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();

/**
 * Dove è andato un ordine.
 *
 * L'ordine di lettura non è un dettaglio:
 *  1. **la provincia**, quando c'è: arriva da Deluxy Orders già normalizzata
 *     ed è l'unico raggruppamento geografico di cui fidarsi;
 *  2. **la città scritta al checkout**, come ripiego. Lo schema avverte che la
 *     scrive il cliente e diventa "Roma"/"Rome"/"ROMA" — ed è vero, per questo
 *     passa da una tabella di forme conosciute e non da un confronto diretto.
 *
 * ⚠️ Il ripiego NON è un lusso: misurato l'11/09/2026 su Gifts da agosto, la
 * provincia manca su **148 ordini su 238** (62%), e di quei 148 la città ce
 * l'hanno quasi tutti (Milano 54, Roma 34, Firenze 3). Con la sola provincia
 * la tabella per area avrebbe descritto un terzo del fatturato dichiarando di
 * descriverlo tutto.
 *
 * ⚠️ Un comune dell'hinterland (San Donato Milanese, Arese, Brugherio) finisce
 * in «altro», non in Milano: sono consegne fuori città, e l'elenco dei comuni
 * che appartengono a un presidio è una decisione di Orders, non una da
 * indovinare qui.
 */
export function areaDaOrdine(o: { provincia: string | null; citta: string | null }): Area | "nonNota" {
  const p = (o.provincia ?? "").trim().toUpperCase();
  if (p) return PROVINCIA_AREA[p] ?? "altro";
  const c = senzaAccenti(o.citta ?? "");
  if (!c) return "nonNota";
  return CITTA_AREA[c] ?? "altro";
}

// Come Google chiama le nostre tre città nel targeting (`LocalitaCampagna`).
// Città e provincia metropolitana valgono lo stesso: sono lo stesso mercato.
const LOCALITA_AREA: Array<[RegExp, Area | "nazionale"]> = [
  [/^metropolitan city of milan|^milan(o)?$|^province of monza/i, "milano"],
  [/rome capital|^rom(a|e)$/i, "roma"],
  [/city of florence|^floren(ce|z)|^firenze$/i, "firenze"],
  [/^italy$|^italia$/i, "nazionale"],
];

/**
 * L'area di una campagna Google, dedotta da **dove tira** (le sue località).
 *
 * ⚠️ Torna `null` quando le località portano a più di un'area: «Brand
 * Protection» tira su Milano, Roma e Firenze insieme, e spalmarne la spesa in
 * tre parti uguali sarebbe un numero inventato — un terzo a testa non è una
 * misura, è una divisione. Quella spesa va in una riga sua, dichiarata.
 */
export function areaDaLocalitaGoogle(nomi: string[]): Area | "nazionale" | null {
  const trovate = new Set<Area | "nazionale">();
  for (const n of nomi) {
    for (const [r, a] of LOCALITA_AREA) {
      if (r.test(n.trim())) {
        trovate.add(a);
        break;
      }
    }
  }
  if (trovate.size === 0) return null;
  if (trovate.size === 1) return [...trovate][0];
  // Milano+Roma+Firenze e nient'altro resta comunque non ripartibile: sono tre
  // mercati, e il fatto che siano i nostri tre non li rende uno.
  return null;
}

/**
 * L'area di una riga di spesa Meta, che arriva per **regione**.
 *
 * ⚠️⚠️ QUESTA È UN'APPROSSIMAZIONE, E VA DETTA A SCHERMO. Le insights di Meta
 * si possono spezzare per regione (Lombardia, Lazio, Toscana), non per città:
 * la Lombardia non è Milano. Leggere «Lombardia» come «area di Milano» è
 * ragionevole perché lì consegniamo solo in città, ma è una lettura nostra, non
 * un dato di Meta — e una tabella che non lo dichiara fa passare una stima per
 * una misura.
 */
const REGIONE_AREA: Record<string, Area> = {
  lombardy: "milano",
  lombardia: "milano",
  lazio: "roma",
  latium: "roma",
  tuscany: "firenze",
  toscana: "firenze",
};

export function areaDaRegioneMeta(regione: string): Area {
  return REGIONE_AREA[senzaAccenti(regione)] ?? "altro";
}

// ============================ ATTRIBUZIONE ============================

/**
 * Il canale a cui Shopify attribuisce un ordine, ridotto ai due che paghiamo.
 *
 * La fonte è `Ordine.origine`, che arriva da **Deluxy Orders** (`marketing.canale`):
 * è già la sua classificazione, e secondo lo Standard §7 la si legge, non la si
 * rifà. Qui si normalizza soltanto la forma, perché lo storico porta varianti
 * («Google», «direct», una volta perfino un indirizzo di tagassistant) e
 * `utmSource` scrive «adwords», «facebook», «Meta», «ig».
 *
 * Torna `null` per tutto il resto — ricerca organica, diretto, email, AI,
 * WhatsApp: non è «nessun canale», è **non a pagamento**, e sommarlo a Google
 * o a Meta gonfierebbe il ritorno di una pubblicità che non l'ha prodotto.
 */
export function canalePagatoDiOrdine(o: {
  origine: string | null;
  utmSource: string | null;
}): "google_ads" | "meta_ads" | null {
  const v = `${o.origine ?? ""} ${o.utmSource ?? ""}`.toLowerCase();
  if (/google|adwords|shopping/.test(v)) return "google_ads";
  if (/meta|facebook|instagram|\bfb\b|\big\b/.test(v)) return "meta_ads";
  return null;
}
