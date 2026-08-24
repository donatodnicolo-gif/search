import { prisma, SCHEMA } from "./db";
import { gestioneIniziale, normalizzaControllo } from "./controllo";

// Blocchi di N: le scritture verso Supabase si fanno in gruppo, mai una riga per
// volta (e mai 200 in parallelo: il pool ha 5 connessioni).
function aBlocchi<T>(righe: T[], quante: number): T[][] {
  const gruppi: T[][] = [];
  for (let i = 0; i < righe.length; i += quante) gruppi.push(righe.slice(i, i + quante));
  return gruppi;
}

// I MOVIMENTI BANCARI arrivano da Finance (deluxy-partner), che resta il padrone
// dell'estratto conto: qui si tiene uno specchio di sola lettura per poter
// cercare, filtrare e abbinare senza dipendere dalla sua velocità.
//
// Due import, con due scopi diversi:
//  1. `importaMovimenti()` — l'estratto conto, incrementale e idempotente
//     (`hash`). Gira nel cron notturno e dal pulsante.
//  2. `adottaControlloDaFinance()` — UNA VOLTA: prende il controllo già fatto in
//     Finance (stato dell'incasso e costo del fornitore, 249 ordini con un costo
//     al 30/07/2026) e lo porta qui. Senza, spostare il controllo avrebbe voluto
//     dire rifare a mano mesi di abbinamenti. **Non sovrascrive mai** quello che
//     è già stato deciso qui: adotta solo dove qui non c'è niente.
//
// Convenzione dei nomi delle variabili: standard Deluxy §4.4 (`<APP>_URL`,
// `<APP>_API_KEY`). La chiave è quella delle API di verifica di Finance.

export type Configurazione = { url: string; chiave: string };

export function configurazioneFinance(): Configurazione | null {
  // `.replace` del BOM e degli spazi: una chiave incollata da una chat porta
  // dentro caratteri invisibili e `fetch` muore con un errore che non nomina
  // nemmeno la variabile (trappola già pagata in deluxy-partner).
  const url = (process.env.FINANCE_URL ?? "").trim().replace(/^﻿/, "").replace(/\/$/, "");
  const chiave = (process.env.FINANCE_API_KEY ?? "").trim().replace(/^﻿/, "");
  if (!url || !chiave) return null;
  return { url, chiave };
}

async function leggi<T>(conf: Configurazione, percorso: string): Promise<T> {
  const res = await fetch(`${conf.url}${percorso}`, {
    headers: { "x-api-key": conf.chiave, "x-app": "deluxy-orders" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const testo = await res.text().catch(() => "");
    throw new Error(`Finance ha risposto ${res.status}${testo ? `: ${testo.slice(0, 200)}` : ""}`);
  }
  // Se la rotta è dietro il login, Finance risponde con una PAGINA e stato 200:
  // senza questo controllo l'errore sarebbe «Unexpected token '<'», che non dice
  // niente a nessuno.
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) {
    throw new Error(
      `Finance ha risposto con una pagina invece che con dati: di solito ${percorso.split("?")[0]} non è ancora pubblicato su ${conf.url}, ` +
        "oppure il middleware lo manda al login.",
    );
  }
  return (await res.json()) as T;
}

// ---- 1. L'estratto conto ----------------------------------------------------

export type EsitoImportMovimenti = {
  letti: number;
  nuovi: number;
  aggiornati: number;
  errore?: string;
};

type MovimentoApi = {
  id: string;
  hash: string;
  data: string;
  importo: number;
  divisa: string;
  descrizione: string;
  controparte: string | null;
  fonte: string | null;
  stato: string;
  importatoIl: string;
};

// Da quando riprendere: l'ultimo movimento già copiato, meno un minuto di
// sovrapposizione. L'upsert è idempotente, quindi rileggere non fa danno;
// perdersi un movimento sì.
async function daQuando(): Promise<string | undefined> {
  const ultimo = await prisma.movimentoBanca.findFirst({
    orderBy: { importatoIl: "desc" },
    select: { importatoIl: true },
  });
  if (!ultimo) return undefined;
  return new Date(ultimo.importatoIl.getTime() - 60_000).toISOString();
}

export async function importaMovimenti(completo = false): Promise<EsitoImportMovimenti> {
  const esito: EsitoImportMovimenti = { letti: 0, nuovi: 0, aggiornati: 0 };
  const conf = configurazioneFinance();
  if (!conf) {
    esito.errore =
      "Finance non configurato: servono FINANCE_URL e FINANCE_API_KEY (la chiave è quella delle API di verifica di deluxy-partner).";
    return esito;
  }

  const da = completo ? undefined : await daQuando();

  try {
    let page = 1;
    let pagine = 1;
    do {
      const q = new URLSearchParams({ page: String(page), limit: "500" });
      if (da) q.set("daImport", da);
      const risposta = await leggi<{ pagine: number; movimenti: MovimentoApi[] }>(conf, `/api/v1/movimenti?${q}`);
      pagine = risposta.pagine ?? 1;
      const arrivati = risposta.movimenti ?? [];
      if (arrivati.length === 0) break;

      // ⚠️ A BLOCCHI, non una riga per volta. Un upsert per movimento sono due
      // viaggi verso Supabase (~135 ms l'uno): su 11.000 movimenti farebbe mezz'ora
      // e il primo import non finirebbe mai dentro una server action. È la stessa
      // trappola già pagata col backfill della provenienza.
      const perHash = new Map(arrivati.map((m) => [m.hash, m]));
      const esistenti = await prisma.movimentoBanca.findMany({
        where: { hash: { in: [...perHash.keys()] } },
        select: { hash: true, importo: true, descrizione: true, controparte: true, statoFinance: true },
      });
      const giaQui = new Map(esistenti.map((e) => [e.hash, e]));

      const nuovi = arrivati.filter((m) => !giaQui.has(m.hash));
      if (nuovi.length > 0) {
        await prisma.movimentoBanca.createMany({
          data: nuovi.map((m) => ({
            hash: m.hash,
            idFinance: m.id,
            data: new Date(m.data),
            importo: m.importo,
            divisa: m.divisa || "EUR",
            descrizione: m.descrizione ?? "",
            controparte: m.controparte,
            fonte: m.fonte,
            statoFinance: m.stato || "nuova",
            importatoIl: new Date(m.importatoIl),
          })),
          skipDuplicates: true,
        });
      }

      // Si riscrive solo ciò che è DAVVERO cambiato (di norma: lo stato in
      // Finance). Riscrivere tutto a ogni giro sarebbe la stessa fatica inutile
      // che il confronto `cambiato()` evita nella sync degli ordini.
      const daAggiornare = arrivati.filter((m) => {
        const e = giaQui.get(m.hash);
        if (!e) return false;
        return (
          Math.abs(e.importo - m.importo) > 0.0001 ||
          e.descrizione !== (m.descrizione ?? "") ||
          (e.controparte ?? null) !== (m.controparte ?? null) ||
          e.statoFinance !== (m.stato || "nuova")
        );
      });
      for (const gruppo of aBlocchi(daAggiornare, 100)) {
        const valori: string[] = [];
        const parametri: unknown[] = [];
        gruppo.forEach((m, i) => {
          const b = i * 5;
          valori.push(`($${b + 1}, $${b + 2}::float8, $${b + 3}, $${b + 4}, $${b + 5})`);
          parametri.push(m.hash, m.importo, m.descrizione ?? "", m.controparte, m.stato || "nuova");
        });
        await prisma.$executeRawUnsafe(
          `UPDATE "${SCHEMA}"."MovimentoBanca" AS t
              SET "importo" = v.importo,
                  "descrizione" = v.descrizione,
                  "controparte" = v.controparte,
                  "statoFinance" = v.stato,
                  "aggiornatoIl" = NOW()
             FROM (VALUES ${valori.join(", ")}) AS v(hash, importo, descrizione, controparte, stato)
            WHERE t."hash" = v.hash`,
          ...parametri,
        );
      }

      esito.letti += arrivati.length;
      esito.nuovi += nuovi.length;
      esito.aggiornati += daAggiornare.length;
      page++;
    } while (page <= pagine && page <= 60); // 60 × 500 = 30.000 movimenti
  } catch (e) {
    esito.errore = (e as Error).message;
  }

  return esito;
}

// ---- 2. Il controllo già fatto in Finance (una volta) -----------------------

export type EsitoAdozione = {
  letti: number;
  incassiAdottati: number;
  costiAdottati: number;
  gestioniAdottate: number;
  nonTrovati: number; // ordini che in Finance ci sono e qui no (non deve capitare)
  giaDeciso: number; // qui c'era già una decisione: non si tocca
  errore?: string;
};

type ControlloApi = {
  brand: string;
  orderId: string;
  numero: string;
  gestione: string;
  incasso: { stato: string; movimentoId: string | null; riconciliatoIl: string | null };
  costo: { importo: number | null; fornitore: string | null; movimentoId: string | null; pagatoIl: string | null };
};

export async function adottaControlloDaFinance(): Promise<EsitoAdozione> {
  const esito: EsitoAdozione = { letti: 0, incassiAdottati: 0, costiAdottati: 0, gestioniAdottate: 0, nonTrovati: 0, giaDeciso: 0 };
  const conf = configurazioneFinance();
  if (!conf) {
    esito.errore = "Finance non configurato: servono FINANCE_URL e FINANCE_API_KEY.";
    return esito;
  }

  // Prima si porta l'archivio al punto di partenza giusto (carte già incassate
  // sul gateway, ordini di deluxy.it nel conto del partner): altrimenti
  // l'adozione qui sotto vedrebbe valori «già decisi» che invece sono solo il
  // default dello schema, e non adotterebbe niente.
  await normalizzaControllo();

  // Da id-Finance a id-locale del movimento: senza questa mappa i riferimenti
  // adottati punterebbero a righe che qui non esistono.
  const mappaMovimenti = new Map(
    (await prisma.movimentoBanca.findMany({ select: { id: true, idFinance: true } })).map((m) => [m.idFinance, m.id]),
  );

  try {
    // 1. Tutto quello che Finance ha da dire, prima di scrivere niente.
    const daFinance: ControlloApi[] = [];
    let page = 1;
    let pagine = 1;
    do {
      const risposta = await leggi<{ pagine: number; ordini: ControlloApi[] }>(
        conf,
        `/api/v1/ordini-controllo?page=${page}&limit=500`,
      );
      pagine = risposta.pagine ?? 1;
      const arrivati = risposta.ordini ?? [];
      if (arrivati.length === 0) break;
      daFinance.push(...arrivati);
      page++;
    } while (page <= pagine && page <= 60);

    // 2. L'indice degli ordini di qui, in UNA query: brand + orderId → stato.
    //    Cercarli uno per uno voleva dire 1.484 viaggi verso Supabase, cioè
    //    minuti — e una server action su Vercel viene uccisa prima.
    const nostri = new Map(
      (
        await prisma.ordine.findMany({
          select: {
            id: true,
            brand: true,
            orderId: true,
            statoIncasso: true,
            costoFornitore: true,
            gestioneIncasso: true,
            movimentoIncassoId: true,
          },
        })
      ).map((o) => [`${o.brand} ${o.orderId}`, o]),
    );

    // 3. Le scritture, calcolate tutte e poi mandate a blocchi.
    const scritture: ReturnType<typeof prisma.ordine.update>[] = [];
    for (const c of daFinance) {
      esito.letti++;
      const ordine = nostri.get(`${c.brand} ${c.orderId}`);
      if (!ordine) {
        esito.nonTrovati++;
        continue;
      }

      const dati: Record<string, unknown> = {};

      // INCASSO: si adotta solo se qui è ancora al valore di partenza. Se
      // qualcuno ha già deciso in Orders, la sua decisione vince.
      if (ordine.statoIncasso === "da_riconciliare" && !ordine.movimentoIncassoId && c.incasso.stato !== "da_riconciliare") {
        dati.statoIncasso = c.incasso.stato;
        dati.movimentoIncassoId = c.incasso.movimentoId ? mappaMovimenti.get(c.incasso.movimentoId) ?? null : null;
        dati.incassatoIl = c.incasso.riconciliatoIl ? new Date(c.incasso.riconciliatoIl) : null;
        esito.incassiAdottati++;
      } else if (c.incasso.stato !== "da_riconciliare" && ordine.statoIncasso !== "da_riconciliare") {
        esito.giaDeciso++;
      }

      // COSTO: idem. Marcato `costoDa = finance`, così si sa che non l'ha
      // scritto nessuno qui dentro.
      if (ordine.costoFornitore == null && c.costo.importo != null) {
        dati.costoFornitore = c.costo.importo;
        dati.costoFornitoreNome = c.costo.fornitore;
        dati.costoMovimentoId = c.costo.movimentoId ? mappaMovimenti.get(c.costo.movimentoId) ?? null : null;
        dati.costoIl = c.costo.pagatoIl ? new Date(c.costo.pagatoIl) : null;
        dati.costoDa = "finance";
        esito.costiAdottati++;
      }

      // COME si incassa: si adotta solo se qui è ancora quella iniziale del
      // brand, cioè nessuno l'ha cambiata a mano.
      if (c.gestione && c.gestione !== ordine.gestioneIncasso && ordine.gestioneIncasso === gestioneIniziale(ordine.brand)) {
        dati.gestioneIncasso = c.gestione;
        esito.gestioniAdottate++;
      }

      if (Object.keys(dati).length > 0) {
        scritture.push(prisma.ordine.update({ where: { id: ordine.id }, data: dati }));
      }
    }

    // A blocchi di 50 dentro una transazione: un viaggio ogni cinquanta ordini
    // invece di uno per ordine.
    for (const gruppo of aBlocchi(scritture, 50)) {
      await prisma.$transaction(gruppo);
    }
  } catch (e) {
    esito.errore = (e as Error).message;
  }

  return esito;
}

// Quanti movimenti dichiara Finance in tutto. Serve al riepilogo per MISURARE
// la completezza dello specchio: l'ultima data non tradisce i buchi in mezzo
// (trappola già pagata proprio sull'archivio banca). `null` = non verificabile
// adesso (Finance non configurato o non raggiungibile), che è diverso da zero.
async function totaleDichiaratoDaFinance(): Promise<number | null> {
  const conf = configurazioneFinance();
  if (!conf) return null;
  try {
    const res = await fetch(`${conf.url}/api/v1/movimenti?page=1&limit=1`, {
      headers: { "x-api-key": conf.chiave, "x-app": "deluxy-orders" },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000), // è una riga di riepilogo: meglio «n.d.» che una pagina appesa
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) return null;
    const dati = (await res.json()) as { totale?: number };
    return typeof dati.totale === "number" ? dati.totale : null;
  } catch {
    return null;
  }
}

// Riepilogo per la pagina Impostazioni: com'è fatto lo specchio, e quanto è
// COMPLETO rispetto al proprietario (totale qui contro totale in Finance).
export async function riepilogoMovimenti(): Promise<{
  totale: number;
  entrate: number;
  uscite: number;
  primo: Date | null;
  ultimo: Date | null;
  ultimoImport: Date | null;
  totaleFinance: number | null; // null = non verificabile adesso
}> {
  const [totale, entrate, primo, ultimo, ultimoImport, totaleFinance] = await Promise.all([
    prisma.movimentoBanca.count(),
    prisma.movimentoBanca.count({ where: { importo: { gt: 0 } } }),
    prisma.movimentoBanca.findFirst({ orderBy: { data: "asc" }, select: { data: true } }),
    prisma.movimentoBanca.findFirst({ orderBy: { data: "desc" }, select: { data: true } }),
    prisma.movimentoBanca.findFirst({ orderBy: { importatoIl: "desc" }, select: { importatoIl: true } }),
    totaleDichiaratoDaFinance(),
  ]);
  return {
    totale,
    entrate,
    uscite: totale - entrate,
    primo: primo?.data ?? null,
    ultimo: ultimo?.data ?? null,
    ultimoImport: ultimoImport?.importatoIl ?? null,
    totaleFinance,
  };
}
