import { prisma } from "./db";

// Le fasce di prezzo del catalogo.
//
// Due scelte che vale la pena spiegare, perché cambiano cosa si legge a schermo:
//
// 1. **La fascia non si assegna a mano.** Un prodotto sta nella fascia in cui
//    cade il suo prezzo: se il prezzo cambia, la fascia lo segue. Assegnarla a
//    mano vorrebbe dire ritrovarsi prodotti da 300 € nella fascia «fino a 50 €»
//    perché nessuno ha aggiornato l'etichetta. Qui si decidono i **confini**, che
//    sono la vera scelta commerciale.
// 2. **Chi non ha prezzo non ha fascia.** I 3 prodotti con prezzo a zero non
//    sono «economici»: non hanno prezzo. Finiscono in «— senza prezzo —», che è
//    un buco da riempire, non uno scalino del listino.
//
// I confini di partenza non sono inventati: sono ricavati dai 2.168 prezzi veri
// del catalogo (mediana 100 €, 78% sotto 200 €, 94% sotto 500 €), arrotondati a
// numeri che un commerciale usa davvero. Il risultato divide sia i prodotti sia
// il venduto in pezzi confrontabili — nessuna fascia che tiene dentro metà
// catalogo, nessuna che sta lì vuota.
export const FASCE_INIZIALI = [
  {
    nome: "Pensiero",
    da: 0,
    a: 50,
    descrizione:
      "Fino a 50 €. Il regalo veloce e gli accessori: piccoli formati, complementi, aggiunte all'ordine. Volume alto, scontrino basso.",
  },
  {
    nome: "Regalo",
    da: 50,
    a: 100,
    descrizione:
      "Da 50 a 100 €. Il regalo pensato ma non impegnativo: compleanni, ringraziamenti, consegne di cortesia.",
  },
  {
    nome: "Cuore del catalogo",
    da: 100,
    a: 200,
    descrizione:
      "Da 100 a 200 €. La fascia su cui gira la casa: è dove sta il prezzo mediano e da dove arriva la fetta più grande del venduto.",
  },
  {
    nome: "Premium",
    da: 200,
    a: 400,
    descrizione: "Da 200 a 400 €. Occasioni importanti e ordini aziendali: si sceglie il prodotto, non il prezzo.",
  },
  {
    nome: "Luxury",
    da: 400,
    a: 1000,
    descrizione: "Da 400 a 1.000 €. Pezzi da vetrina e allestimenti: pochi prodotti, molto valore.",
  },
  {
    nome: "Eccezionale",
    da: 1000,
    a: null,
    descrizione:
      "Da 1.000 € in su. Su misura, eventi, grandi allestimenti. Pochi pezzi che pesano come una fascia intera.",
  },
];

export type Fascia = {
  id: string;
  nome: string;
  da: number;
  a: number | null;
  descrizione: string | null;
  colore: string | null;
  ordine: number;
  attiva: boolean;
};

export const SENZA_PREZZO = "— senza prezzo —";

/**
 * Le fasce attive, in ordine. Alla prima apertura scrive quelle di partenza:
 * meglio un listino già leggibile che una pagina vuota da riempire a mano.
 */
export async function elencoFasce(): Promise<Fascia[]> {
  const esistenti = await prisma.fasciaPrezzo.findMany({ orderBy: [{ ordine: "asc" }, { da: "asc" }] });
  if (esistenti.length > 0) return esistenti;

  await prisma.fasciaPrezzo.createMany({
    data: FASCE_INIZIALI.map((f, i) => ({ ...f, ordine: i })),
    skipDuplicates: true,
  });
  return prisma.fasciaPrezzo.findMany({ orderBy: [{ ordine: "asc" }, { da: "asc" }] });
}

/** La fascia in cui cade un prezzo, o `null` se il prezzo non c'è. */
export function fasciaDi(prezzo: number, fasce: Fascia[]): Fascia | null {
  if (!prezzo || prezzo <= 0) return null;
  return fasce.find((f) => prezzo >= f.da && (f.a === null || prezzo < f.a)) ?? null;
}

export function etichettaFascia(f: Fascia): string {
  return f.nome;
}

/** «100–200 €» / «da 1.000 €» / «fino a 50 €»: i confini scritti come si leggono. */
export function confini(f: Fascia): string {
  const n = (x: number) => x.toLocaleString("it-IT");
  if (f.da <= 0 && f.a !== null) return `fino a ${n(f.a)} €`;
  if (f.a === null) return `da ${n(f.da)} €`;
  return `${n(f.da)}–${n(f.a)} €`;
}

/** Il filtro Prisma sul prezzo per una fascia: `da` compreso, `a` escluso. */
export function filtroPrezzo(f: Fascia): Record<string, unknown> {
  return f.a === null ? { gte: f.da } : { gte: f.da, lt: f.a };
}

/**
 * I buchi e le sovrapposizioni fra le fasce. Le fasce le decide una persona, e
 * una persona può lasciare scoperto un pezzo di listino: meglio dirlo che
 * lasciare prodotti senza fascia senza spiegazione.
 */
export function problemi(fasce: Fascia[]): string[] {
  const avvisi: string[] = [];
  const ordinate = [...fasce].sort((x, y) => x.da - y.da);
  for (let i = 0; i < ordinate.length; i++) {
    const f = ordinate[i];
    if (f.a !== null && f.a <= f.da) avvisi.push(`«${f.nome}» finisce prima di cominciare (${f.da} → ${f.a}).`);
    const succ = ordinate[i + 1];
    if (!succ || f.a === null) continue;
    if (f.a < succ.da) avvisi.push(`Nessuna fascia copre da ${f.a} € a ${succ.da} €.`);
    if (f.a > succ.da) avvisi.push(`«${f.nome}» e «${succ.nome}» si accavallano fra ${succ.da} € e ${f.a} €.`);
  }
  return avvisi;
}
