// STATO ANALISI del cliente: P.P. (partner in portafoglio) · Nuovo · Dismesso.
//
// Nel FINANCE questo stato è un campo scritto a mano sulla scheda partner
// (`Partner.clienteAnno`, ereditato da PARTNER.xlsx). Qui accanto viene
// calcolato lo stato che risulterebbe **dai movimenti reali** applicando le
// regole configurabili in Impostazioni → Regole degli stati:
//
//   • Nuovo    → il primo movimento (fattura servizi o vendita vendor) è più
//                recente di `mesiNuovo`;
//   • Dismesso → nessun movimento da almeno `mesiDismesso`;
//   • P.P.     → tutto il resto, cioè un cliente attivo e non nuovo;
//   • null     → nessun movimento registrato: non c'è niente da classificare.
//
// Il calcolo NON sovrascrive il campo scritto a mano: le due cose convivono e la
// pagina delle regole mostra dove non coincidono, così si correggono a ragion
// veduta. È il valore manuale a restare la fonte di verità finché non si decide
// diversamente.

import { prisma } from "./db";
import { leggiRegole, REGOLE_ANALISI_DEFAULT, type RegoleAnalisi } from "./regole-stati";

export type StatoAnalisi = "P.P." | "Nuovo" | "Dismesso";

export type SchedaAnalisi = {
  calcolato: StatoAnalisi | null;
  manuale: string | null;
  /** true se il campo scritto a mano dice qualcosa di diverso dal calcolo. */
  discordante: boolean;
  primoMovimento: Date | null;
  ultimoMovimento: Date | null;
  mesiDaUltimoMovimento: number | null;
  movimenti: number;
  motivo: string;
};

const mesiTra = (da: Date, a: Date) =>
  (a.getFullYear() - da.getFullYear()) * 12 + (a.getMonth() - da.getMonth());

/** Data convenzionale di un movimento mensile (anno+mese del ledger). */
const dataMese = (anno: number, mese: number) => new Date(Date.UTC(anno, mese - 1, 1));

export function statoAnalisi(
  movimenti: Date[],
  manuale: string | null,
  oggi = new Date(),
  regole: RegoleAnalisi = REGOLE_ANALISI_DEFAULT
): SchedaAnalisi {
  if (movimenti.length === 0) {
    return {
      calcolato: null, manuale, discordante: false,
      primoMovimento: null, ultimoMovimento: null, mesiDaUltimoMovimento: null,
      movimenti: 0, motivo: "Nessun movimento registrato.",
    };
  }
  const ordinati = [...movimenti].sort((a, b) => a.getTime() - b.getTime());
  const primo = ordinati[0];
  const ultimo = ordinati[ordinati.length - 1];
  const daUltimo = mesiTra(ultimo, oggi);
  const daPrimo = mesiTra(primo, oggi);

  let calcolato: StatoAnalisi;
  let motivo: string;
  if (daUltimo >= regole.mesiDismesso) {
    calcolato = "Dismesso";
    motivo = `Nessun movimento da ${daUltimo} mesi (soglia ${regole.mesiDismesso}).`;
  } else if (daPrimo < regole.mesiNuovo) {
    calcolato = "Nuovo";
    motivo = `Primo movimento ${daPrimo} mesi fa (è nuovo entro ${regole.mesiNuovo} mesi).`;
  } else {
    calcolato = "P.P.";
    motivo = `Cliente attivo: ${movimenti.length} movimenti, l'ultimo ${daUltimo === 0 ? "questo mese" : `${daUltimo} mesi fa`}.`;
  }
  const norm = (s: string | null) => (s ?? "").trim().toUpperCase().replace(/\./g, "");
  return {
    calcolato,
    manuale,
    discordante: !!manuale && norm(manuale) !== norm(calcolato),
    primoMovimento: primo,
    ultimoMovimento: ultimo,
    mesiDaUltimoMovimento: daUltimo,
    movimenti: movimenti.length,
    motivo,
  };
}

/** Stato analisi calcolato per tutti i partner (una sola lettura del ledger). */
export async function analisiTutti(
  opts?: { oggi?: Date; regole?: RegoleAnalisi }
): Promise<Map<string, SchedaAnalisi>> {
  const oggi = opts?.oggi ?? new Date();
  const regole = opts?.regole ?? (await leggiRegole()).analisi;
  const [partners, fatture, vendite] = await Promise.all([
    prisma.partner.findMany({ select: { id: true, clienteAnno: true } }),
    prisma.fatturaServizio.findMany({ where: { imponibile: { gt: 0 } }, select: { partnerId: true, anno: true, mese: true } }),
    prisma.venditaVendor.findMany({ select: { partnerId: true, anno: true, mese: true } }),
  ]);
  const perPartner = new Map<string, Date[]>();
  for (const m of [...fatture, ...vendite]) {
    const d = dataMese(m.anno, m.mese);
    const arr = perPartner.get(m.partnerId);
    if (arr) arr.push(d);
    else perPartner.set(m.partnerId, [d]);
  }
  return new Map(
    partners.map((p) => [p.id, statoAnalisi(perPartner.get(p.id) ?? [], p.clienteAnno, oggi, regole)])
  );
}

/** Stato analisi calcolato per un singolo partner. */
export async function analisiPartner(
  partnerId: string,
  opts?: { oggi?: Date; regole?: RegoleAnalisi }
): Promise<SchedaAnalisi> {
  const oggi = opts?.oggi ?? new Date();
  const regole = opts?.regole ?? (await leggiRegole()).analisi;
  const [partner, fatture, vendite] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { clienteAnno: true } }),
    prisma.fatturaServizio.findMany({ where: { partnerId, imponibile: { gt: 0 } }, select: { anno: true, mese: true } }),
    prisma.venditaVendor.findMany({ where: { partnerId }, select: { anno: true, mese: true } }),
  ]);
  const movimenti = [...fatture, ...vendite].map((m) => dataMese(m.anno, m.mese));
  return statoAnalisi(movimenti, partner?.clienteAnno ?? null, oggi, regole);
}
