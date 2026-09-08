// **Il vocabolario della scheda**: le parole ammesse, in forma canonica.
//
// Perché esiste (08/09/2026, dall'architettura in `docs/ARCHITETTURA-MODULO-DESCRIZIONE.md`):
// i quattro negozi scrivono le stesse cose in modi diversi — «Compleanno» e
// «Compleanni», «Rosa» e «Pink» — e ogni variante spezza in due un filtro, un
// tag e una collezione automatica. Qui la forma è **una sola**, e il modulo la
// impone scegliendo da liste chiuse invece di far scrivere a mano.

/** Allergeni, come li dichiara la legge e come li scrivono le pasticcerie. */
export const ALLERGENI = [
  "Glutine",
  "Lattosio",
  "Uova",
  "Frutta a guscio",
  "Arachidi",
  "Soia",
  "Sesamo",
  "Solfiti",
] as const;

/** Chi riceve il regalo: da qui escono tag e badge. */
export const DESTINATARI = ["Per lei", "Per lui", "Bambini", "Adulti"] as const;

/**
 * Le occasioni. ⚠️ Ogni negozio ha la sua chiave metafield (`custom.occasioni`
 * su alcuni, `custom.occasione` su altri: vedi `chiavi-negozio.ts`) e Business
 * ha un elenco suo, B2B: qui stanno le parole, lì la chiave dove scriverle.
 */
export const OCCASIONI_D2C = [
  "Compleanno",
  "Anniversario",
  "Laurea",
  "Matrimonio",
  "Nascita",
  "San Valentino",
  "Festa della Mamma",
  "Festa del Papà",
  "Natale",
  "Pasqua",
  "Condoglianze",
  "Congratulazioni",
  "Dire grazie",
  "Solo perché",
] as const;

export const OCCASIONI_B2B = [
  "Inaugurazione",
  "Evento aziendale",
  "Regalo ai dipendenti",
  "Regalo ai clienti",
  "Catering ed eventi",
  "Ricorrenza aziendale",
  "Fine anno",
] as const;

/** I colori dominanti, in italiano e al singolare. */
export const COLORI = [
  "Rosso",
  "Rosa",
  "Bianco",
  "Giallo",
  "Arancione",
  "Blu",
  "Viola",
  "Verde",
  "Misto",
] as const;

/**
 * I nomi ammessi per l'opzione delle varianti.
 *
 * Lista chiusa perché il nome dell'opzione finisce **nel negozio**, sotto il
 * prezzo, e lì «Dimensione», «Dimensioni» e «Misura» sembrano tre cose diverse
 * a chi compra e sono tre filtri diversi per il tema.
 */
export const NOMI_OPZIONE = [
  "Dimensione",
  "Porzioni",
  "Numero di persone",
  "Numero di rose",
  "Colore",
  "Formato",
] as const;

/** La frase di chiusura, uguale per tutti: è la firma della casa. */
export const CHIUSURA_D2C = "Regala con Deluxy";
export const CHIUSURA_B2B = "Perfetto per";

export type Allergene = (typeof ALLERGENI)[number];
export type Destinatario = (typeof DESTINATARI)[number];
export type Colore = (typeof COLORI)[number];
export type NomeOpzione = (typeof NOMI_OPZIONE)[number];

/**
 * Il tag come lo scrive Shopify: minuscolo, senza accenti, parole unite.
 * I negozi hanno tag scritti in sei modi diversi per la stessa cosa; qui la
 * forma è una, e i doppioni smettono di nascere.
 */
export function tagCanonico(parola: string): string {
  return parola
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
