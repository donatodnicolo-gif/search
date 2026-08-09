// Le regole con cui una parola cercata finisce fra le negative.
//
// ⚠️ **Deterministico dove è un fatto, AI dove è un giudizio.** Che
// «купить цветы в милане» non sia inglese non è un'opinione: si legge
// dall'alfabeto, e chiedere un parere a un modello su una cosa certa aggiunge
// costo e incertezza a zero informazione. Il giudizio serve invece per i
// concorrenti — «flora queen milano» è un'insegna solo se sai che esiste.
//
// ⚠️ **Nessuna regola esclude da sola.** Tutto passa dalla coda e
// dall'approvazione a mano, con scritto da dove viene la proposta: una regola
// che spegne traffico senza che nessuno la guardi è il modo di perdere
// ricerche buone e accorgersene dal fatturato.

export const CHIAVE_REGOLE = "esclusioni.regole";
export const CHIAVE_CONCORRENTI = "esclusioni.concorrenti";

export type IdRegola = "alfabeto" | "lingua" | "concorrenti";

export const REGOLE: {
  id: IdRegola;
  nome: string;
  come: "fatto" | "giudizio";
  cosaFa: string;
  perche: string;
  // Le regole che nascono spente: quelle che tolgono traffico che potrebbe
  // essere voluto.
  attivaDiDefault: boolean;
}[] = [
  {
    id: "alfabeto",
    nome: "Alfabeto diverso dal nostro",
    come: "fatto",
    cosaFa:
      "La ricerca è scritta in un alfabeto che nessuna nostra campagna usa (cirillico, greco, arabo, cinese, ebraico).",
    perche:
      "Non è una questione di lingua ma di scrittura: chi cerca in cirillico non leggerà mai un annuncio in italiano o inglese. È il caso più sicuro che esista.",
    attivaDiDefault: true,
  },
  {
    id: "lingua",
    nome: "Lingua diversa da quella della campagna",
    come: "fatto",
    cosaFa:
      "La ricerca è chiaramente in italiano su una campagna che parla inglese, o viceversa. Si decide sulle parole funzione (a, di, per / the, in, to), non sul senso.",
    perche:
      "Una campagna ENG serve i clienti stranieri: intercettare chi scrive in italiano vuol dire pagare un clic per un annuncio che parla un'altra lingua. ⚠️ Le ricerche MISTE («flowers delivery milano», «milan italy flower delivery») non contano come italiano: sono inglese con un nome di posto dentro, e sono il traffico giusto.",
    attivaDiDefault: true,
  },
  {
    id: "concorrenti",
    nome: "Concorrenti diretti",
    come: "giudizio",
    cosaFa: "La ricerca nomina l'insegna di un concorrente presente nell'elenco qui sotto.",
    perche:
      "⚠️ Questa toglie traffico che molti comprano apposta: chi cerca un concorrente sta comprando quello che vendiamo noi. Nasce SPENTA e si accende solo se è una scelta voluta.",
    attivaDiDefault: false,
  },
];

// ——— Alfabeti che non sono il nostro ———
const ALFABETI: [string, RegExp][] = [
  ["cirillico", /[Ѐ-ӿ]/],
  ["greco", /[Ͱ-Ͽ]/],
  ["arabo", /[؀-ۿ]/],
  ["ebraico", /[֐-׿]/],
  ["cinese o giapponese", /[぀-ヿ一-鿿]/],
];

export function alfabetoEstraneo(testo: string): string | null {
  for (const [nome, re] of ALFABETI) if (re.test(testo)) return nome;
  return null;
}

// ——— Lingua: si decide sulle parole FUNZIONE, non sul senso ———
//
// ⚠️ Solo parole che in una lingua ci sono e nell'altra no, e che non sono
// nomi di posti o di prodotti. «milano» non dice niente sulla lingua: compare
// in «fiori a domicilio milano» come in «flower delivery milano».
const SPIA_ITA = [
  "a", "di", "da", "per", "con", "il", "lo", "la", "le", "gli", "un", "una",
  "consegna", "consegnare", "spedire", "domicilio", "vicino", "economici",
  "prezzi", "quanto", "costa", "come", "dove", "miglior", "migliore", "oggi",
  "subito", "giornata", "ordinare", "mandare", "inviare", "regalare",
];
const SPIA_ENG = [
  "the", "in", "to", "for", "with", "of", "and", "near", "me", "best",
  "cheap", "how", "much", "where", "buy", "send", "order", "delivery",
  "shop", "online", "same", "day", "next", "service",
];

export type EsitoLingua = { lingua: "ita" | "eng" | null; spie: string[] };

/**
 * La lingua in cui è scritta una ricerca, se si può dire.
 *
 * `null` quando le spie non bastano o si contraddicono: una ricerca di due
 * parole senza parole funzione («fiori milano») non ha una lingua accertabile,
 * e tirarla a indovinare escluderebbe traffico buono.
 */
export function linguaDiRicerca(testo: string): EsitoLingua {
  const parole = String(testo || "").toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const ita = parole.filter((p) => SPIA_ITA.includes(p));
  const eng = parole.filter((p) => SPIA_ENG.includes(p));
  // ⚠️ Serve un vantaggio NETTO, non uno di misura: «flowers delivery milano»
  // ha una spia inglese e zero italiane, ed è giusto che risulti inglese;
  // «consegna flowers milano» ha una spia per parte e resta senza lingua.
  if (ita.length > eng.length) return { lingua: "ita", spie: ita };
  if (eng.length > ita.length) return { lingua: "eng", spie: eng };
  return { lingua: null, spie: [] };
}

export type Verdetto = {
  regola: IdRegola;
  motivo: string;
};

/**
 * Cosa dicono le regole di questa ricerca. `null` = non la tocca nessuna.
 *
 * Non decide niente da sé: chi chiama mette in coda, e in coda ci vuole
 * l'approvazione di una persona.
 */
export function valutaRicerca(
  testo: string,
  opzioni: {
    linguaCampagna: string | null;
    attive: IdRegola[];
    concorrenti: string[];
  }
): Verdetto | null {
  const { linguaCampagna, attive, concorrenti } = opzioni;

  if (attive.includes("alfabeto")) {
    const alfa = alfabetoEstraneo(testo);
    if (alfa) {
      return {
        regola: "alfabeto",
        motivo: `Scritta in ${alfa}: nessuna nostra campagna parla quella scrittura, l'annuncio non sarebbe leggibile.`,
      };
    }
  }

  if (attive.includes("concorrenti") && concorrenti.length > 0) {
    const t = ` ${String(testo).toLowerCase()} `;
    const trovato = concorrenti.find((c) => {
      const n = c.trim().toLowerCase();
      return n.length >= 3 && t.includes(` ${n} `);
    });
    if (trovato) {
      return {
        regola: "concorrenti",
        motivo: `Nomina «${trovato}», un concorrente nel nostro elenco.`,
      };
    }
  }

  if (attive.includes("lingua") && (linguaCampagna === "ita" || linguaCampagna === "eng")) {
    const { lingua, spie } = linguaDiRicerca(testo);
    if (lingua && lingua !== linguaCampagna) {
      return {
        regola: "lingua",
        motivo: `Scritta in ${lingua === "ita" ? "italiano" : "inglese"} (${spie
          .slice(0, 3)
          .join(", ")}) su una campagna che parla ${linguaCampagna === "ita" ? "italiano" : "inglese"}.`,
      };
    }
  }

  return null;
}

/** Le regole accese, lette dall'impostazione condivisa. */
export function regoleAttiveDa(valore: string | null | undefined): IdRegola[] {
  if (valore == null || valore === "") {
    return REGOLE.filter((r) => r.attivaDiDefault).map((r) => r.id);
  }
  const scelte = valore.split(",").map((x) => x.trim());
  return REGOLE.filter((r) => scelte.includes(r.id)).map((r) => r.id);
}

export function concorrentiDa(valore: string | null | undefined): string[] {
  return String(valore ?? "")
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);
}
