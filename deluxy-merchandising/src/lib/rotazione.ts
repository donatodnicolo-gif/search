// Le **rotazioni periodiche**: ogni quanto l'ordine di una collezione si rifà da
// solo. Una vetrina identica per settimane smette di essere guardata.
//
// Come gira: un solo cron **giornaliero** (`/api/cron/rotazioni`) passa tutte le
// regole attive e fa scattare **solo quelle scadute**. Così giornaliera,
// settimanale e mensile convivono senza un cron per ciascuna — e se un giorno il
// cron salta, il giro dopo recupera invece di perdere il turno.

import { prisma } from "./db";
import {
  applicaRegoleACollezione,
  numeraPosizioni,
  parseRegole,
  type RegolaOrdinamento,
} from "./ordinamento-vetrina";

export const FREQUENZE = [
  { chiave: "giornaliera", nome: "Ogni giorno", giorni: 1 },
  { chiave: "settimanale", nome: "Ogni settimana", giorni: 7 },
  { chiave: "mensile", nome: "Ogni mese", giorni: 30 },
] as const;

export type Frequenza = (typeof FREQUENZE)[number]["chiave"];

export const MODI = [
  {
    chiave: "rinfresca",
    nome: "Rinfresca l'ordine",
    spiega: "Riapplica le regole d'ordine: chi vende di più oggi sale oggi.",
  },
  {
    chiave: "ruota",
    nome: "Ruota le posizioni",
    spiega: "I primi passano in fondo: a turno tutti i prodotti hanno il loro momento in cima.",
  },
] as const;

export type Modo = (typeof MODI)[number]["chiave"];

export function etichettaFrequenza(chiave: string | null | undefined): string {
  return FREQUENZE.find((f) => f.chiave === chiave)?.nome ?? "—";
}

export function etichettaModo(chiave: string | null | undefined): string {
  return MODI.find((m) => m.chiave === chiave)?.nome ?? "—";
}

export function isFrequenza(v: unknown): v is Frequenza {
  return typeof v === "string" && FREQUENZE.some((f) => f.chiave === v);
}

export function isModo(v: unknown): v is Modo {
  return typeof v === "string" && MODI.some((m) => m.chiave === v);
}

const giorniDi = (f: string): number => FREQUENZE.find((x) => x.chiave === f)?.giorni ?? 7;

/**
 * È ora di far scattare questa regola?
 *
 * Mai eseguita = sì (il primo giro parte subito, altrimenti si aspetterebbe un
 * periodo intero senza che succeda niente e sembrerebbe rotta). Poi si guarda
 * quanti giorni sono passati: si confrontano i **giorni**, non gli istanti, così
 * un cron che gira alle 5:00 e il giorno dopo alle 5:01 non salta il turno.
 */
export function eScaduta(
  regola: { frequenza: string; attiva: boolean; ultimaEsecuzioneIl: Date | null },
  adesso = new Date()
): boolean {
  if (!regola.attiva) return false;
  if (!regola.ultimaEsecuzioneIl) return true;
  const giorno = 24 * 60 * 60 * 1000;
  const passati = Math.floor((adesso.getTime() - regola.ultimaEsecuzioneIl.getTime()) / giorno);
  return passati >= giorniDi(regola.frequenza);
}

/** Quando toccherà la prossima volta (per dirlo in pagina). */
export function prossimaVolta(
  regola: { frequenza: string; attiva: boolean; ultimaEsecuzioneIl: Date | null },
  adesso = new Date()
): Date | null {
  if (!regola.attiva) return null;
  if (!regola.ultimaEsecuzioneIl) return adesso;
  const d = new Date(regola.ultimaEsecuzioneIl);
  d.setDate(d.getDate() + giorniDi(regola.frequenza));
  return d;
}

/**
 * Ruota le posizioni di una collezione: i primi `passo` prodotti passano in
 * fondo. Non tocca *quali* prodotti ci sono, solo il loro turno in cima.
 */
async function ruotaCollezione(collezioneId: string, passo: number): Promise<void> {
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId },
    orderBy: [{ posizione: "asc" }, { prodotto: { nome: "asc" } }],
    select: { prodottoId: true },
  });
  if (membri.length < 2) return; // con un prodotto solo ruotare non vuol dire niente
  const n = Math.max(1, Math.min(passo, membri.length - 1));
  const ids = membri.map((m) => m.prodottoId);
  const ordine = [...ids.slice(n), ...ids.slice(0, n)];
  await numeraPosizioni(collezioneId, ordine);
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { ordineModificatoIl: new Date() },
  });
}

export type EsitoRotazione = {
  regola: string;
  collezioni: number;
  spinte: number;
  errori: string[];
};

/**
 * Esegue una regola su tutte le collezioni iscritte.
 *
 * Le regole d'ordine da riapplicare sono quelle **della collezione**; se non ne
 * ha, quelle della sua tipologia. Se non ce ne sono da nessuna parte, la modalità
 * «rinfresca» non ha niente da rifare e la collezione si salta — meglio saltarla
 * che inventarle un ordine.
 */
export async function eseguiRegola(regolaId: string): Promise<EsitoRotazione> {
  const r = await prisma.regolaRotazione.findUnique({
    where: { id: regolaId },
    include: {
      collezioni: {
        select: {
          id: true,
          titolo: true,
          tipo: true,
          regolaOrdinamento: true,
          tipologia: { select: { regolaOrdinamento: true } },
        },
      },
    },
  });
  if (!r) return { regola: "(non trovata)", collezioni: 0, spinte: 0, errori: ["Regola non trovata."] };

  const esito: EsitoRotazione = { regola: r.nome, collezioni: 0, spinte: 0, errori: [] };

  for (const c of r.collezioni) {
    try {
      if (r.modo === "ruota") {
        await ruotaCollezione(c.id, r.passo);
        esito.collezioni++;
      } else {
        const regole: RegolaOrdinamento[] = parseRegole(c.regolaOrdinamento).length
          ? parseRegole(c.regolaOrdinamento)
          : parseRegole(c.tipologia?.regolaOrdinamento);
        if (regole.length === 0) continue; // niente da rinfrescare: si salta
        await applicaRegoleACollezione(c.id, regole);
        esito.collezioni++;
      }

      if (r.spingiSuShopify && c.tipo === "manuale") {
        const { spingiOrdineSuShopifySilenzioso } = await import("./azioni-vetrina-shopify");
        const ok = await spingiOrdineSuShopifySilenzioso(c.id);
        if (ok === true) esito.spinte++;
        else if (typeof ok === "string") esito.errori.push(`${c.titolo}: ${ok}`);
      }
    } catch (e) {
      esito.errori.push(`${c.titolo}: ${e instanceof Error ? e.message : "errore"}`);
    }
  }

  await prisma.regolaRotazione.update({
    where: { id: regolaId },
    data: {
      ultimaEsecuzioneIl: new Date(),
      ultimoEsito:
        `${esito.collezioni} collezioni` +
        (r.spingiSuShopify ? `, ${esito.spinte} mandate a Shopify` : "") +
        (esito.errori.length ? ` · ${esito.errori.length} errori: ${esito.errori.slice(0, 3).join(" · ")}` : ""),
    },
  });

  return esito;
}

/** Tutte le regole scadute, eseguite una per una. La usa il cron giornaliero. */
export async function eseguiRotazioniDovute(): Promise<{ eseguite: EsitoRotazione[]; saltate: number }> {
  const regole = await prisma.regolaRotazione.findMany({ where: { attiva: true } });
  const eseguite: EsitoRotazione[] = [];
  let saltate = 0;
  for (const r of regole) {
    if (!eScaduta(r)) {
      saltate++;
      continue;
    }
    eseguite.push(await eseguiRegola(r.id));
  }
  return { eseguite, saltate };
}
