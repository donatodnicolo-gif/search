// I LUOGHI DI UN ORDINE: dove arriva, e da dove parte.
//
// In un negozio di regali sono due cose diverse e tutte e due utili: la città
// di **consegna** è un problema operativo (chi consegna lì? in quanto tempo?),
// il paese del **mittente** è un fatto commerciale — un ordine da Kuwait verso
// Gardone Riviera racconta un cliente che qui non ci arriverà mai a piedi.
//
// I tag non si inventano: sono i valori veri di Shopify, ripuliti quanto basta
// perché «MILANO», «Milano» e « milano » siano lo stesso tag. Nient'altro: non
// si corregge la geografia dei clienti, non si indovinano le province mancanti.

// Le città arrivano in ogni forma: tutte maiuscole, tutte minuscole, con spazi
// doppi. Per raggrupparle serve una forma unica, ma la si mostra come si scrive
// davvero — «Reggio Emilia», non «REGGIO EMILIA» né «reggio emilia».
export function normalizzaCitta(citta: string | null | undefined): string | null {
  const pulita = (citta ?? "").replace(/\s+/g, " ").trim();
  if (!pulita) return null;
  return pulita
    .toLocaleLowerCase("it-IT")
    .split(" ")
    .map((parola) =>
      // Le parti attaccate da un trattino vanno maiuscole entrambe
      // («Cinisello-Balsamo»), e le particelle restano minuscole («Reggio nell'Emilia»).
      parola
        .split("-")
        .map((p) => (PARTICELLE.has(p) ? p : p.charAt(0).toLocaleUpperCase("it-IT") + p.slice(1)))
        .join("-"),
    )
    .join(" ");
}

const PARTICELLE = new Set(["di", "da", "del", "della", "dei", "degli", "delle", "in", "sul", "sulla", "a", "e"]);

// Il nome del paese in italiano dal codice ISO2. Quelli non in elenco escono
// col codice: meglio «KZ» che una traduzione inventata.
const PAESI: Record<string, string> = {
  IT: "Italia",
  GB: "Regno Unito",
  US: "Stati Uniti",
  FR: "Francia",
  DE: "Germania",
  ES: "Spagna",
  CH: "Svizzera",
  AT: "Austria",
  NL: "Paesi Bassi",
  BE: "Belgio",
  PT: "Portogallo",
  GR: "Grecia",
  IE: "Irlanda",
  SE: "Svezia",
  NO: "Norvegia",
  DK: "Danimarca",
  FI: "Finlandia",
  PL: "Polonia",
  CZ: "Repubblica Ceca",
  RO: "Romania",
  RU: "Russia",
  UA: "Ucraina",
  TR: "Turchia",
  AE: "Emirati Arabi Uniti",
  SA: "Arabia Saudita",
  QA: "Qatar",
  KW: "Kuwait",
  BH: "Bahrein",
  OM: "Oman",
  IL: "Israele",
  LB: "Libano",
  EG: "Egitto",
  MA: "Marocco",
  ZA: "Sudafrica",
  NG: "Nigeria",
  CA: "Canada",
  MX: "Messico",
  BR: "Brasile",
  AR: "Argentina",
  CL: "Cile",
  CO: "Colombia",
  PE: "Perù",
  VE: "Venezuela",
  CN: "Cina",
  HK: "Hong Kong",
  JP: "Giappone",
  KR: "Corea del Sud",
  IN: "India",
  SG: "Singapore",
  TH: "Thailandia",
  PH: "Filippine",
  ID: "Indonesia",
  MY: "Malesia",
  VN: "Vietnam",
  AU: "Australia",
  NZ: "Nuova Zelanda",
  KZ: "Kazakistan",
  AZ: "Azerbaigian",
  GE: "Georgia",
  AM: "Armenia",
  MT: "Malta",
  CY: "Cipro",
  LU: "Lussemburgo",
  MC: "Monaco",
  SM: "San Marino",
  HR: "Croazia",
  SI: "Slovenia",
  RS: "Serbia",
  AL: "Albania",
  BG: "Bulgaria",
  HU: "Ungheria",
  SK: "Slovacchia",
  LT: "Lituania",
  LV: "Lettonia",
  EE: "Estonia",
};

export function nomePaese(codice: string | null | undefined): string | null {
  const c = (codice ?? "").trim().toUpperCase();
  if (!c) return null;
  return PAESI[c] ?? c;
}

// La bandiera dal codice ISO2: due lettere diventano i due «regional indicator»
// che ogni sistema disegna come bandiera. Nessuna immagine da caricare.
export function bandiera(codice: string | null | undefined): string {
  const c = (codice ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((l) => 0x1f1e6 + l.charCodeAt(0) - 65));
}

export type Luogo = { citta: string | null; paese: string | null; bandiera: string };

export function luogoConsegna(o: { citta: string | null; paese: string | null }): Luogo {
  return { citta: normalizzaCitta(o.citta), paese: nomePaese(o.paese), bandiera: bandiera(o.paese) };
}

export function luogoMittente(o: { mittenteCitta: string | null; mittentePaese: string | null }): Luogo {
  return {
    citta: normalizzaCitta(o.mittenteCitta),
    paese: nomePaese(o.mittentePaese),
    bandiera: bandiera(o.mittentePaese),
  };
}

// Mittente e destinatario sono nello stesso posto? Quando NON lo sono, l'ordine
// è un regalo spedito da lontano — ed è l'informazione che spiega metà delle
// domande che arrivano al Customer Service.
export function daLontano(o: {
  paese: string | null;
  mittentePaese: string | null;
}): boolean {
  const a = (o.paese ?? "").trim().toUpperCase();
  const b = (o.mittentePaese ?? "").trim().toUpperCase();
  return Boolean(a && b && a !== b);
}
