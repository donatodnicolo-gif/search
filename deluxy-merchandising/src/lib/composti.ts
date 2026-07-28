import { prisma } from "./db";

// **Prodotti composti**: un prodotto originale fatto di altri prodotti del
// catalogo — il cesto con la torta e lo champagne, la composizione con più
// mazzi, il kit regalo.
//
// La regola che tiene in piedi tutto: **costo e prezzo non si riscrivono a
// mano**. Si leggono dai componenti, uno per uno, ogni volta. Se domani cambia
// il costo di una rosa, cambia da solo il costo di tutti i cesti che la
// contengono — mentre un numero copiato resterebbe fermo per sempre, e nessuno
// si accorgerebbe che il margine non è più quello.
//
// Seconda regola, la stessa di tutta l'app: **un costo che manca non vale
// zero**. Se anche un solo componente non ha costo, il costo del composto è
// dichiarato **parziale** e il margine non si scrive: un margine calcolato su
// costi incompleti è più pericoloso di un margine assente, perché sembra vero.

export type Componente = {
  id: string;
  nome: string;
  codice: string;
  prezzoVendita: number;
  costoProduzione: number;
  vendorShopify: string | null;
  tipoShopify: string | null;
};

export type RigaComposizione = {
  componente: Componente;
  quantita: number;
  /** `null` quando il componente non ha costo: non è zero, è ignoto. */
  costoRiga: number | null;
  prezzoRiga: number | null;
};

export type Conti = {
  righe: RigaComposizione[];
  pezzi: number;
  /** Somma dei costi **noti**. Da leggere insieme a `costoCompleto`. */
  costo: number;
  costoCompleto: boolean;
  senzaCosto: number;
  /** Somma dei listini dei componenti: quanto costerebbero comprati separati. */
  sommaListini: number;
  listiniCompleti: boolean;
  senzaPrezzo: number;
};

export function conti(righe: RigaComposizione[]): Conti {
  let costo = 0;
  let sommaListini = 0;
  let senzaCosto = 0;
  let senzaPrezzo = 0;
  let pezzi = 0;
  for (const r of righe) {
    pezzi += r.quantita;
    if (r.costoRiga === null) senzaCosto += 1;
    else costo += r.costoRiga;
    if (r.prezzoRiga === null) senzaPrezzo += 1;
    else sommaListini += r.prezzoRiga;
  }
  return {
    righe,
    pezzi,
    costo,
    costoCompleto: senzaCosto === 0 && righe.length > 0,
    senzaCosto,
    sommaListini,
    listiniCompleti: senzaPrezzo === 0 && righe.length > 0,
    senzaPrezzo,
  };
}

export function riga(componente: Componente, quantita: number): RigaComposizione {
  return {
    componente,
    quantita,
    costoRiga: componente.costoProduzione > 0 ? componente.costoProduzione * quantita : null,
    prezzoRiga: componente.prezzoVendita > 0 ? componente.prezzoVendita * quantita : null,
  };
}

// ---------- La bozza, che vive nell'indirizzo ----------
//
// Mentre si compone, la scelta sta nella query string (`scelti=id x quantità`)
// invece che in un prodotto già creato: così si possono provare accostamenti,
// vedere costi e margine, e cambiare idea **senza lasciare in giro prodotti
// vuoti** nel catalogo. Il prodotto nasce solo quando si conferma.

export function leggiScelti(param: string | undefined): { id: string; quantita: number }[] {
  if (!param) return [];
  const visti = new Set<string>();
  const fuori: { id: string; quantita: number }[] = [];
  for (const pezzo of param.split(",")) {
    const [id, q] = pezzo.split("x");
    if (!id || visti.has(id)) continue;
    visti.add(id);
    const quantita = Math.max(1, Math.min(999, parseInt(q ?? "1", 10) || 1));
    fuori.push({ id, quantita });
  }
  return fuori;
}

export function scriviScelti(scelti: { id: string; quantita: number }[]): string {
  return scelti.map((s) => `${s.id}x${s.quantita}`).join(",");
}

export const CAMPI_COMPONENTE = {
  id: true,
  nome: true,
  codice: true,
  prezzoVendita: true,
  costoProduzione: true,
  vendorShopify: true,
  tipoShopify: true,
} as const;

/** Le righe di una bozza, nell'ordine in cui sono state scelte. */
export async function righeDaScelti(scelti: { id: string; quantita: number }[]): Promise<RigaComposizione[]> {
  if (scelti.length === 0) return [];
  const prodotti = await prisma.prodotto.findMany({
    where: { id: { in: scelti.map((s) => s.id) } },
    select: CAMPI_COMPONENTE,
  });
  const per = new Map(prodotti.map((p) => [p.id, p]));
  return scelti
    .map((s) => {
      const p = per.get(s.id);
      return p ? riga(p, s.quantita) : null;
    })
    .filter((r): r is RigaComposizione => r !== null);
}

/** I prodotti composti esistenti, coi loro conti già fatti. */
export async function elencoComposti() {
  const composti = await prisma.prodotto.findMany({
    where: { componenti: { some: {} } },
    orderBy: { creatoIl: "desc" },
    select: {
      id: true,
      nome: true,
      codice: true,
      prezzoVendita: true,
      fase: true,
      componenti: {
        orderBy: { creatoIl: "asc" },
        select: { quantita: true, componente: { select: CAMPI_COMPONENTE } },
      },
    },
  });
  return composti.map((c) => ({
    ...c,
    conti: conti(c.componenti.map((x) => riga(x.componente, x.quantita))),
  }));
}
