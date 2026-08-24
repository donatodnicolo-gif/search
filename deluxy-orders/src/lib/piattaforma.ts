import { prisma } from "./db";

// IL RITORNO DEL GIRO DELL'ORDINE dalla piattaforma consegne (Standard §7.4).
//
// La piattaforma pesca gli ordini da qui (il suo orders-sync), li smista ai
// partner (vendite `Sale`: proposta → accettata/non_accettata) e, quando il
// partner accetta, nasce la consegna. Questo modulo RITIRA quello stato dal
// canale app-to-app (`GET /api/v1/app/vendite?source=deluxy-orders&…`) e lo
// scrive sull'ordine: evasione, costo del fornitore (l'importo meno lo sconto
// cristallizzato sulla vendita), consegnato quando e da chi. È l'ingrediente
// del margine — che si calcola SOLO qui (margineOrdine in controllo.ts).
//
// Convenzione nomi: standard §4.4 (`PLATFORM_URL`, `PLATFORM_API_KEY`); la
// chiave si genera nella piattaforma con `api/scripts/crea-chiave-app.mjs`.
// Pull incrementale su `aggiornateDa` (cursore in Impostazione): una chiamata
// a giro di cron, non una per ordine — e rileggere non fa danni.

const CHIAVE_CURSORE = "piattaforma.ritiroDa";

export type Configurazione = { url: string; chiave: string };

export function configurazionePiattaforma(): Configurazione | null {
  const url = (process.env.PLATFORM_URL ?? "https://deluxy-delivery.vercel.app")
    .trim()
    .replace(/\/$/, "");
  const chiave = (process.env.PLATFORM_API_KEY ?? "").trim().replace(/^﻿/, "");
  if (!chiave) return null;
  return { url, chiave };
}

type VoceVendita = {
  vendita: {
    id: string;
    riferimentoEsterno: string | null;
    stato: string; // da_gestire | proposta | accettata | non_accettata | annullata
    importo: number;
    scontoPercento: number;
    costoPartner: number;
    partner: { id: string; insegna: string | null } | null;
    aggiornataIl: string;
  };
  consegna: {
    stato: string;
    data: string | null;
    conValet: boolean;
  } | null;
};

export type EsitoRitiro = {
  lette: number;
  evasioniSegnate: number;
  costiAdottati: number;
  consegnateSegnate: number;
  errore?: string;
};

export async function ritiraVenditePiattaforma(): Promise<EsitoRitiro> {
  const esito: EsitoRitiro = { lette: 0, evasioniSegnate: 0, costiAdottati: 0, consegnateSegnate: 0 };
  const conf = configurazionePiattaforma();
  if (!conf) {
    esito.errore =
      "Piattaforma non configurata: servono PLATFORM_URL e PLATFORM_API_KEY (chiave da api/scripts/crea-chiave-app.mjs della piattaforma).";
    return esito;
  }

  // Da quando riprendere: il cursore salvato, meno un minuto di sovrapposizione
  // (le scritture sono idempotenti: rileggere non fa danni, perdersi un
  // aggiornamento sì).
  const salvato = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE_CURSORE } });
  let da = salvato?.valore || undefined;
  if (da) da = new Date(new Date(da).getTime() - 60_000).toISOString();

  try {
    let ultimaVista: string | undefined;
    for (let giro = 0; giro < 10; giro++) {
      const p = new URLSearchParams({ source: "deluxy-orders", limit: "200" });
      if (da) p.set("aggiornateDa", da);
      const res = await fetch(`${conf.url}/api/v1/app/vendite?${p}`, {
        headers: { "x-api-key": conf.chiave },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        const testo = await res.text().catch(() => "");
        throw new Error(`La piattaforma ha risposto ${res.status}${testo ? `: ${testo.slice(0, 160)}` : ""}`);
      }
      const corpo = (await res.json()) as { totale: number; vendite: VoceVendita[] };
      const voci = corpo.vendite ?? [];
      if (voci.length === 0) break;

      for (const v of voci) {
        esito.lette++;
        ultimaVista = v.vendita.aggiornataIl;
        const ordineId = v.vendita.riferimentoEsterno;
        if (!ordineId) continue;
        const ordine = await prisma.ordine.findUnique({
          where: { id: ordineId },
          select: {
            id: true,
            evasione: true,
            costoFornitore: true,
            costoDa: true,
            consegnataIl: true,
          },
        });
        if (!ordine) continue;

        const dati: Record<string, unknown> = {};

        // EVASIONE: l'ordine è in mano alla piattaforma. Un'annullata torna
        // libera ("") solo se era stata marcata piattaforma e non c'è altro.
        if (v.vendita.stato !== "annullata" && ordine.evasione !== "piattaforma") {
          dati.evasione = "piattaforma";
          esito.evasioniSegnate++;
        }

        // COSTO: si adotta SOLO quando il partner ha accettato, e solo se qui
        // nessuno ha già deciso (la mano batte il ritiro, come per l'adozione
        // da Finance).
        if (v.vendita.stato === "accettata" && ordine.costoFornitore == null) {
          dati.costoFornitore = v.vendita.costoPartner;
          dati.costoFornitoreNome = v.vendita.partner?.insegna ?? null;
          dati.costoIl = new Date();
          dati.costoDa = "piattaforma";
          esito.costiAdottati++;
        }

        // CONSEGNA: quando la piattaforma dice che è consegnata.
        const statoConsegna = v.consegna?.stato?.toLowerCase() ?? "";
        const consegnata = statoConsegna === "delivered" || /consegnat/.test(statoConsegna);
        if (consegnata && !ordine.consegnataIl) {
          dati.consegnataIl = v.consegna?.data ? new Date(v.consegna.data) : new Date();
          dati.consegnataDa = v.consegna?.conValet ? "valet" : "fornitore";
          esito.consegnateSegnate++;
        }

        if (Object.keys(dati).length > 0) {
          await prisma.ordine.update({ where: { id: ordine.id }, data: dati });
          if (dati.evasione) {
            await prisma.eventoOrdine.create({
              data: {
                ordineId: ordine.id,
                tipo: "sync",
                descrizione: `Smistato dalla piattaforma consegne${v.vendita.partner?.insegna ? ` → ${v.vendita.partner.insegna}` : ""} (vendita ${v.vendita.stato})`,
                autore: "piattaforma",
              },
            });
          }
        }
      }

      if (voci.length < 200) break;
      da = ultimaVista; // pagina successiva: dal punto in cui siamo arrivati
    }

    if (ultimaVista) {
      await prisma.impostazione.upsert({
        where: { chiave: CHIAVE_CURSORE },
        create: { chiave: CHIAVE_CURSORE, valore: ultimaVista },
        update: { valore: ultimaVista },
      });
    }
  } catch (e) {
    esito.errore = (e as Error).message;
  }

  return esito;
}
