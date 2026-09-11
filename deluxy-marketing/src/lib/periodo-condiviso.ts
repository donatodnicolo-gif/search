import { prisma } from "./db";
import { risolviConfronto, risolviPeriodo, type Periodo, type PeriodoRisolto } from "./periodo";

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
// Il CONFRONTO si ricorda come il periodo, e per la stessa ragione: se si sta
// guardando «contro l'anno prima», cambiare pagina non deve riportare
// silenziosamente al periodo precedente — due letture a due minuti di distanza
// sembrerebbero confrontabili e non lo sarebbero.
const CHIAVE_CONFRONTO = "periodo.confronto";
const CHIAVE_CONF_DA = "periodo.confronto.da";
const CHIAVE_CONF_A = "periodo.confronto.a";

export type ParametriPeriodo = {
  preset?: string;
  da?: string;
  a?: string;
  /** precedente | anno | libero | nessuno */
  conf?: string;
  confDa?: string;
  confA?: string;
};

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
  /**
   * La finestra contro cui confrontare, oppure `null` quando il confronto è
   * «nessuno». ⚠️ `null` non vuol dire «non lo so»: vuol dire che qualcuno ha
   * scelto di non confrontare, e chi legge questo campo NON deve ripiegare sul
   * periodo precedente «per sicurezza» — sarebbe un confronto che nessuno ha
   * chiesto, mostrato come se fosse stato chiesto.
   */
  confronto: Periodo | null;
  /** precedente | anno | libero | nessuno */
  tipoConfronto: string;
  confDaStr?: string;
  confAStr?: string;
};

// `predefinito` è il periodo di partenza della pagina la primissima volta, se
// nessuno ha ancora scelto niente in tutta l'app.
export async function periodoApp(
  p: ParametriPeriodo,
  predefinito = "30g"
): Promise<PeriodoApp> {
  const esplicito = Boolean(p.preset || (p.da && p.a));
  // Il confronto è una scelta SUA: si può cambiare senza toccare il periodo
  // (ed è il caso normale — «lo stesso mese, ma contro l'anno prima»).
  const confEsplicito = Boolean(p.conf || (p.confDa && p.confA));

  if (confEsplicito) {
    const [tipo, cda, ca] = await Promise.all([
      leggi(CHIAVE_CONFRONTO),
      leggi(CHIAVE_CONF_DA),
      leggi(CHIAVE_CONF_A),
    ]);
    const nuovo = p.conf ?? (p.confDa && p.confA ? "libero" : "precedente");
    if (tipo !== nuovo || cda !== (p.confDa ?? undefined) || ca !== (p.confA ?? undefined)) {
      await Promise.all([
        scrivi(CHIAVE_CONFRONTO, nuovo),
        scrivi(CHIAVE_CONF_DA, p.confDa ?? null),
        scrivi(CHIAVE_CONF_A, p.confA ?? null),
      ]);
    }
  }

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
    const risolto = risolviPeriodo(p.preset, p.da, p.a);
    const conf = await confrontoDi(risolto, p, confEsplicito);
    return { ...risolto, ...conf, daStr: p.da, aStr: p.a, esplicito: true };
  }

  const [pre, da, a] = await Promise.all([leggi(CHIAVE_PRESET), leggi(CHIAVE_DA), leggi(CHIAVE_A)]);
  const risolto = risolviPeriodo(pre ?? predefinito, da, a);
  const conf = await confrontoDi(risolto, p, confEsplicito);
  return {
    ...risolto,
    ...conf,
    daStr: da,
    aStr: a,
    esplicito: false,
  };
}

// Il confronto: quello nell'indirizzo se c'è, altrimenti quello ricordato.
async function confrontoDi(
  risolto: PeriodoRisolto,
  p: ParametriPeriodo,
  confEsplicito: boolean
): Promise<{ confronto: Periodo | null; tipoConfronto: string; confDaStr?: string; confAStr?: string }> {
  const [tipo, cda, ca] = confEsplicito
    ? [p.conf, p.confDa, p.confA]
    : await Promise.all([leggi(CHIAVE_CONFRONTO), leggi(CHIAVE_CONF_DA), leggi(CHIAVE_CONF_A)]);
  const esito = risolviConfronto(risolto, tipo, cda, ca);
  return {
    confronto: esito.periodo,
    tipoConfronto: esito.tipo,
    confDaStr: esito.tipo === "libero" ? cda : undefined,
    confAStr: esito.tipo === "libero" ? ca : undefined,
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
  // ⚠️ Anche il confronto viaggia nel link: un indirizzo incollato a qualcuno
  // deve mostrare quello che mostrava a chi l'ha copiato — confronto compreso.
  // Senza, la stessa pagina letta da due persone poteva confrontare contro due
  // finestre diverse senza che niente lo dicesse.
  if (periodo.tipoConfronto === "libero" && periodo.confDaStr && periodo.confAStr) {
    q.set("confDa", periodo.confDaStr);
    q.set("confA", periodo.confAStr);
  } else if (periodo.tipoConfronto !== "precedente") {
    q.set("conf", periodo.tipoConfronto);
  }
  return q.toString();
}
