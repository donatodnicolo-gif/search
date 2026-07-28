import { prisma } from "./db";
import { risolviPeriodo, type PeriodoRisolto } from "./periodo";

// Il periodo di analisi, **uno solo per tutta l'app**.
//
// Prima ogni pagina si teneva il suo: si sceglieva "mese scorso" sulla
// dashboard, si apriva la scheda di un brand e si era di nuovo a 30 giorni,
// senza che niente lo dicesse. Due numeri letti a due minuti di distanza
// sembravano confrontabili e non lo erano.
//
// Ora la scelta si ricorda: appena una pagina riceve un periodo esplicito
// nell'indirizzo, quello diventa il periodo dell'app; le pagine aperte senza
// parametri partono da lì.
//
// **Condiviso, non per utente** — come le viste salvate. Se si sta guardando
// il mese scorso, lo si sta guardando in due.
//
// Gli indirizzi restano completi (`?preset=mese-scorso`): un link incollato a
// qualcuno mostra quello che mostrava a chi l'ha copiato, non il periodo che
// quella persona aveva in memoria.

const CHIAVE_PRESET = "periodo.preset";
const CHIAVE_DA = "periodo.da";
const CHIAVE_A = "periodo.a";

export type ParametriPeriodo = { preset?: string; da?: string; a?: string };

async function leggi(chiave: string): Promise<string | undefined> {
  const r = await prisma.impostazione.findUnique({ where: { chiave } }).catch(() => null);
  return r?.valore || undefined;
}

async function scrivi(chiave: string, valore: string | null) {
  if (valore) {
    await prisma.impostazione
      .upsert({ where: { chiave }, create: { chiave, valore }, update: { valore } })
      .catch(() => {});
  } else {
    await prisma.impostazione.deleteMany({ where: { chiave } }).catch(() => {});
  }
}

export type PeriodoApp = PeriodoRisolto & {
  // Le stringhe da rimettere nei link, così ogni indirizzo resta completo.
  daStr?: string;
  aStr?: string;
  // true = il periodo arrivava dall'indirizzo; false = ripreso dalla memoria
  esplicito: boolean;
};

// `predefinito` è il periodo di partenza della pagina la primissima volta, se
// nessuno ha ancora scelto niente in tutta l'app.
export async function periodoApp(
  p: ParametriPeriodo,
  predefinito = "30g"
): Promise<PeriodoApp> {
  const esplicito = Boolean(p.preset || (p.da && p.a));

  if (esplicito) {
    // La scelta appena fatta diventa quella dell'app. Si scrive solo se è
    // cambiata davvero: senza questo controllo ogni caricamento di ogni pagina
    // sarebbe una scrittura sul database condiviso.
    const [pre, da, a] = await Promise.all([leggi(CHIAVE_PRESET), leggi(CHIAVE_DA), leggi(CHIAVE_A)]);
    const nuovoPreset = p.preset ?? (p.da && p.a ? "libero" : predefinito);
    if (pre !== nuovoPreset || da !== (p.da ?? undefined) || a !== (p.a ?? undefined)) {
      await Promise.all([
        scrivi(CHIAVE_PRESET, nuovoPreset),
        scrivi(CHIAVE_DA, p.da ?? null),
        scrivi(CHIAVE_A, p.a ?? null),
      ]);
    }
    return { ...risolviPeriodo(p.preset, p.da, p.a), daStr: p.da, aStr: p.a, esplicito: true };
  }

  const [pre, da, a] = await Promise.all([leggi(CHIAVE_PRESET), leggi(CHIAVE_DA), leggi(CHIAVE_A)]);
  return {
    ...risolviPeriodo(pre ?? predefinito, da, a),
    daStr: da,
    aStr: a,
    esplicito: false,
  };
}

// I parametri del periodo da riattaccare a un link, così passando da una pagina
// all'altra il periodo si vede nell'indirizzo invece di essere solo ricordato.
export function parametriPeriodo(periodo: PeriodoApp): string {
  const q = new URLSearchParams();
  if (periodo.preset === "libero" && periodo.daStr && periodo.aStr) {
    q.set("da", periodo.daStr);
    q.set("a", periodo.aStr);
  } else {
    q.set("preset", periodo.preset);
  }
  return q.toString();
}
