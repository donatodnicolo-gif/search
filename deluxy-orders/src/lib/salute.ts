// LA SALUTE DELL'ORDINE — una parola sola che dice se la vendita è buona.
//
// Regola dell'utente (04/09/2026): ogni ordine del registro ha uno di cinque
// valori, e uno solo.
//
//   conforme    ordine senza problemi (pagato, nessun rischio; che sia già
//               evaso o ancora in attesa di evasione non cambia nulla)
//   a rischio   Shopify segnala un rischio di frode da guardare a mano
//   non pagato  il denaro non è (ancora) arrivato — es. il bonifico
//   cancellato  annullato o rimborsato per una DECISIONE NOSTRA (Customer
//               Service o admin): il fornitore non si è trovato, la merce non
//               c'era, il pagamento è stato rifiutato
//   nullo       annullato o rimborsato SU RICHIESTA DEL CLIENTE (ha sbagliato
//               a ordinare)
//
// ⚠️ NON è la pipeline Deluxy (`StatoOrdine`: nuovo, da smistare, assegnato…)
// e NON è la lavorazione del Customer Service (`csGestione`). Sono tre
// tassonomie diverse sullo stesso record e vanno tenute separate a vista: la
// pipeline dice A CHE PUNTO siamo, il CS dice CHI ci sta lavorando, la salute
// dice SE la vendita vale. Per questo si chiama «salute» e non «stato».
//
// ⚠️ La salute NON è una colonna del database: si calcola dai campi che Orders
// già possiede (annullamento, motivo, pagamento, rischio). Nessuna copia da
// tenere allineata, nessun backfill: cambia da sola quando cambia il dato. La
// conseguenza è che va calcolata nella QUERY quando si filtra un elenco
// paginato — vedi `whereSalute` — perché filtrare l'array già estratto
// filtrerebbe soltanto la pagina che si sta guardando.

import { Prisma } from "@prisma/client";

export const SALUTI = ["conforme", "a_rischio", "non_pagato", "cancellato", "nullo"] as const;
export type Salute = (typeof SALUTI)[number];

// I campi che servono per decidere: chi chiama può passare l'ordine intero.
export type OrdineDaValutare = {
  annullatoIl: Date | null;
  motivoAnnullamento: string | null;
  financialStatus: string | null;
  rischioLivello: string | null;
  rischioRaccomandazione: string | null;
};

// Pagamenti che contano come «il denaro è arrivato». `PARTIALLY_REFUNDED` è
// qui per decisione dell'utente (04/09): l'ordine è avvenuto ed è stato
// pagato, il rimborso parziale è un'altra dimensione e ha già la sua coda
// (`problema=aperti`, vedi `motiviProblema`). Tutto ciò che non è in questa
// lista finisce in «non pagato», compreso un codice Shopify che oggi non
// conosciamo: meglio un ordine in una coda di lavoro che uno dichiarato sano
// senza sapere se è stato pagato.
const PAGAMENTI_BUONI = ["PAID", "PARTIALLY_REFUNDED"];

// LE REGOLE, IN ORDINE DI PRECEDENZA — scritte UNA volta sola.
//
// Ogni regola porta insieme il suo test in memoria (`vale`) e il suo filtro
// Prisma (`dove`): sono due linguaggi per la stessa frase, e tenerli attaccati
// è l'unico modo perché non divergano. `scripts/verifica-salute.ts` conta il
// registro in tutti e due i modi e si lamenta se un solo ordine non coincide.
//
// L'ordine conta: un ordine può essere insieme annullato e sospetto, e la
// prima regola che si applica vince. Prima si chiude la partita (annullato o
// rimborsato: il denaro è tornato, il resto non serve più), poi si guarda il
// rischio, e solo alla fine il pagamento.
const REGOLE: Array<{
  chiave: Salute;
  vale: (o: OrdineDaValutare) => boolean;
  dove: Prisma.OrdineWhereInput;
}> = [
  {
    // NULLO — l'ha voluto il cliente.
    // Due casi: l'annullamento con motivo `CUSTOMER` (Shopify lo chiama «at
    // customer's request») e il rimborso emesso SENZA annullare l'ordine.
    // ⚠️ Il secondo caso è una DECISIONE dell'utente del 04/09/2026, non un
    // dato: su quei 171 ordini Shopify non registra nessun motivo, quindi non
    // si sa chi abbia chiesto il rimborso. Si può smettere di indovinare —
    // Shopify espone la nota del rimborso e chi l'ha emesso, e la sync oggi
    // non legge i rimborsi affatto.
    // ⚠️ `annullatoIl: null` nel secondo ramo è indispensabile: senza, un
    // ordine annullato dal magazzino e poi rimborsato (22 casi veri:
    // INVENTORY, STAFF, OTHER, DECLINED insieme a REFUNDED) risulterebbe
    // «nullo», cioè colpa del cliente, quando la decisione è stata nostra.
    chiave: "nullo",
    vale: (o) =>
      (o.annullatoIl !== null && o.motivoAnnullamento === "CUSTOMER") ||
      (o.annullatoIl === null && o.financialStatus === "REFUNDED"),
    dove: {
      OR: [
        { annullatoIl: { not: null }, motivoAnnullamento: "CUSTOMER" },
        { annullatoIl: null, financialStatus: "REFUNDED" },
      ],
    },
  },
  {
    // CANCELLATO — l'abbiamo deciso noi. Qui arrivano tutti gli annullamenti
    // che non sono del cliente: STAFF, INVENTORY, DECLINED, FRAUD, OTHER. Non
    // serve elencarli: la regola precedente ha già tolto i `CUSTOMER`.
    chiave: "cancellato",
    vale: (o) => o.annullatoIl !== null,
    dove: { annullatoIl: { not: null } },
  },
  {
    // A RISCHIO — la valutazione antifrode di Shopify chiede un occhio umano.
    // Si guardano tutte e due le colonne: il livello (MEDIUM/HIGH) e la
    // raccomandazione (INVESTIGATE/CANCEL). Non sono ridondanti — Shopify può
    // aggiornare il verdetto senza toccare il livello — e prendendone una sola
    // si perderebbe qualche ordine da controllare.
    // «Basso» e «nessuno» NON sono un rischio: sono la norma di 14.432 ordini
    // su 14.563, e segnalarli vorrebbe dire non segnalare più niente.
    chiave: "a_rischio",
    vale: (o) =>
      o.rischioRaccomandazione === "CANCEL" ||
      o.rischioRaccomandazione === "INVESTIGATE" ||
      o.rischioLivello === "HIGH" ||
      o.rischioLivello === "MEDIUM",
    dove: {
      OR: [
        { rischioRaccomandazione: { in: ["CANCEL", "INVESTIGATE"] } },
        { rischioLivello: { in: ["HIGH", "MEDIUM"] } },
      ],
    },
  },
  {
    // CONFORME — pagato e senza rischio. È scritta in positivo di proposito:
    // per essere dichiarato sano un ordine deve avere un pagamento che
    // riconosciamo, non semplicemente non avere nulla che non va.
    chiave: "conforme",
    vale: (o) => o.financialStatus !== null && PAGAMENTI_BUONI.includes(o.financialStatus),
    dove: { financialStatus: { in: PAGAMENTI_BUONI } },
  },
  {
    // NON PAGATO — tutto il resto: PENDING (il bonifico che non è arrivato),
    // PARTIALLY_PAID, VOIDED senza annullamento, e qualunque codice nuovo che
    // Shopify dovesse introdurre. È l'ultima regola e non ha condizioni: è il
    // ripiego, e deve essere questo e non «conforme».
    chiave: "non_pagato",
    vale: () => true,
    dove: {},
  },
];

/** La salute di un ordine già in mano (nessuna query). */
export function saluteOrdine(o: OrdineDaValutare): Salute {
  for (const r of REGOLE) if (r.vale(o)) return r.chiave;
  // Irraggiungibile: l'ultima regola prende tutto. Sta qui perché TypeScript
  // non lo sa, e perché se un giorno qualcuno cambia l'ordine delle regole è
  // meglio un valore onesto che un errore.
  return "non_pagato";
}

/**
 * Il filtro Prisma per una salute — da usare SEMPRE quando l'elenco è
 * paginato. È costruito dalla stessa lista `REGOLE`: «la mia condizione, E
 * nessuna di quelle che vengono prima». Così la precedenza è scritta in un
 * posto solo e non può divergere fra la memoria e il database.
 */
export function whereSalute(s: Salute): Prisma.OrdineWhereInput {
  const i = REGOLE.findIndex((r) => r.chiave === s);
  if (i < 0) return {};
  const prima = REGOLE.slice(0, i).map((r) => r.dove);
  if (!prima.length) return REGOLE[i].dove;
  return { AND: [REGOLE[i].dove, { NOT: { OR: prima } }] };
}

// Come si mostra: nome, colore (token del Design System) e una riga che
// spiega, per il tooltip.
export const ETICHETTE_SALUTE: Record<Salute, { nome: string; colore: string; spiega: string }> = {
  conforme: {
    nome: "Conforme",
    colore: "var(--green)",
    spiega: "Pagato e senza rischio. Che sia già evaso o ancora in attesa di evasione non cambia nulla.",
  },
  a_rischio: {
    nome: "A rischio",
    colore: "var(--red)",
    spiega: "Shopify segnala un rischio di frode medio o alto: va guardato a mano.",
  },
  non_pagato: {
    nome: "Non pagato",
    colore: "var(--orange)",
    spiega: "Il denaro non è ancora arrivato — tipicamente un bonifico in attesa.",
  },
  cancellato: {
    nome: "Cancellato",
    colore: "var(--text-secondary)",
    spiega:
      "Annullato o rimborsato per una nostra decisione: fornitore non trovato, merce assente, pagamento rifiutato.",
  },
  nullo: {
    nome: "Nullo",
    colore: "var(--text-secondary)",
    spiega: "Annullato o rimborsato su richiesta del cliente (ha sbagliato a ordinare).",
  },
};

/** L'ordine in cui si mostrano nei conti e nel menu del filtro: prima il buono, poi le code, in fondo il chiuso. */
export const SALUTI_IN_ORDINE: Salute[] = ["conforme", "a_rischio", "non_pagato", "cancellato", "nullo"];

/** Vero se la stringa che arriva dall'indirizzo è una salute che conosciamo. */
export function saluteValida(s: string | null | undefined): s is Salute {
  return !!s && (SALUTI as readonly string[]).includes(s);
}
