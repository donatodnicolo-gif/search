import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

// I numeretti della sidebar, in UNA query sola e con una cache breve.
//
// Erano 19 query separate — la sidebar sta su ogni pagina, quindi 19 andate e
// ritorno al database prima ancora di disegnare il contenuto. Con
// `connection_limit=5` si mettevano pure in coda a gruppi di cinque.
//
// Due rimedi insieme:
//  1. una sola query con i conteggi come sotto-select: un round-trip invece di 19;
//  2. 60 secondi di cache. Sono contatori di navigazione, non numeri su cui si
//     decide: che dicano 41 invece di 42 per un minuto non cambia niente, e
//     l'alternativa è pagarli a ogni click su ogni pagina.
//
// Le pagine restano `force-dynamic`: qui si cachea il singolo dato, non la pagina.

export type ConteggiSidebar = {
  nAnalisi: number;
  nAudit: number;
  nAzioniAperte: number;
  nCampagneVive: number;
  nLanding: number;
  nTestAperti: number;
  nDocumenti: number;
  nPubblici: number;
  nOrdini: number;
  nErroriAperti: number;
  nIncongruenzeAperte: number;
  nOperazioni: number;
  nGruppi: number;
  nTermini: number;
  aperteBrand: Record<string, number>;
  aperteCanale: Record<string, number>;
  analisiCanale: Record<string, number>;
  auditCanale: Record<string, number>;
  campagneCanale: Record<string, number>;
};

const VUOTI: ConteggiSidebar = {
  nAnalisi: 0, nAudit: 0, nAzioniAperte: 0, nCampagneVive: 0, nLanding: 0,
  nTestAperti: 0, nDocumenti: 0, nPubblici: 0, nOrdini: 0, nErroriAperti: 0,
  nIncongruenzeAperte: 0, nOperazioni: 0, nGruppi: 0, nTermini: 0,
  aperteBrand: {}, aperteCanale: {}, analisiCanale: {}, auditCanale: {}, campagneCanale: {},
};

// Gli stati "vivi" stanno anche in dominio.ts, ma qui vanno dentro SQL: si
// scrivono espliciti per non costruire stringhe con valori che vengono da fuori.
const SQL = `
  SELECT
    (SELECT count(*) FROM "Analisi")                                                        AS "nAnalisi",
    (SELECT count(*) FROM "Analisi" WHERE tipo IN ('audit_google','audit_meta','revisione_creativi','revisione_landing')) AS "nAudit",
    (SELECT count(*) FROM "Azione" WHERE stato IN ('da_fare','in_corso','bloccata','fatta')) AS "nAzioniAperte",
    (SELECT count(*) FROM "Campagna" WHERE stato IN ('attiva','in_pausa','bozza','in_lancio','in_test')) AS "nCampagneVive",
    (SELECT count(*) FROM "LandingPage")                                                    AS "nLanding",
    (SELECT count(*) FROM "TestMeta" WHERE stato IN ('idea','pianificato','in_corso'))      AS "nTestAperti",
    (SELECT count(*) FROM "DocumentoDrive")                                                 AS "nDocumenti",
    (SELECT count(*) FROM "Pubblico")                                                       AS "nPubblici",
    (SELECT count(*) FROM "Ordine")                                                         AS "nOrdini",
    (SELECT count(*) FROM "Incidente" WHERE stato = 'aperto')                               AS "nErroriAperti",
    (SELECT count(*) FROM "Incongruenza" WHERE stato = 'aperta')                            AS "nIncongruenzeAperte",
    (SELECT count(*) FROM "OperazioneAdv" WHERE stato IN ('in_attesa','approvata'))         AS "nOperazioni",
    (SELECT count(*) FROM "Gruppo" WHERE stato <> 'defunto')                                AS "nGruppi",
    (SELECT count(*) FROM "TermineRicerca" WHERE spesa > 0 AND conversioni = 0)             AS "nTermini"
`;

const SQL_GRUPPI = `
  SELECT 'azioniBrand' AS q, brand AS k, count(*)::int AS n FROM "Azione"
    WHERE stato IN ('da_fare','in_corso','bloccata','fatta') GROUP BY brand
  UNION ALL
  SELECT 'azioniCanale', canale, count(*)::int FROM "Azione"
    WHERE stato IN ('da_fare','in_corso','bloccata','fatta') GROUP BY canale
  UNION ALL
  SELECT 'analisiCanale', canale, count(*)::int FROM "Analisi" GROUP BY canale
  UNION ALL
  SELECT 'auditCanale', canale, count(*)::int FROM "Analisi"
    WHERE tipo IN ('audit_google','audit_meta','revisione_creativi','revisione_landing') GROUP BY canale
  UNION ALL
  SELECT 'campagneCanale', canale, count(*)::int FROM "Campagna"
    WHERE stato IN ('attiva','in_pausa','bozza','in_lancio','in_test') GROUP BY canale
`;

async function leggi(): Promise<ConteggiSidebar> {
  try {
    const [totali, gruppi] = await Promise.all([
      prisma.$queryRawUnsafe<Record<string, bigint | number>[]>(SQL),
      prisma.$queryRawUnsafe<{ q: string; k: string | null; n: number }[]>(SQL_GRUPPI),
    ]);

    const t = totali[0] ?? {};
    const num = (v: unknown) => Number(v ?? 0);
    const perQuery = (nome: string) => {
      const out: Record<string, number> = {};
      for (const r of gruppi) if (r.q === nome && r.k) out[r.k] = r.n;
      return out;
    };

    return {
      nAnalisi: num(t.nAnalisi),
      nAudit: num(t.nAudit),
      nAzioniAperte: num(t.nAzioniAperte),
      nCampagneVive: num(t.nCampagneVive),
      nLanding: num(t.nLanding),
      nTestAperti: num(t.nTestAperti),
      nDocumenti: num(t.nDocumenti),
      nPubblici: num(t.nPubblici),
      nOrdini: num(t.nOrdini),
      nErroriAperti: num(t.nErroriAperti),
      nIncongruenzeAperte: num(t.nIncongruenzeAperte),
      nOperazioni: num(t.nOperazioni),
      nGruppi: num(t.nGruppi),
      nTermini: num(t.nTermini),
      aperteBrand: perQuery("azioniBrand"),
      aperteCanale: perQuery("azioniCanale"),
      analisiCanale: perQuery("analisiCanale"),
      auditCanale: perQuery("auditCanale"),
      campagneCanale: perQuery("campagneCanale"),
    };
  } catch {
    // Se il database non risponde la sidebar mostra zeri, ma la pagina si apre:
    // un contatore mancante non deve portarsi dietro tutta la navigazione.
    return VUOTI;
  }
}

export const conteggiSidebar = unstable_cache(leggi, ["conteggi-sidebar"], {
  revalidate: 60,
  tags: ["conteggi-sidebar"],
});
