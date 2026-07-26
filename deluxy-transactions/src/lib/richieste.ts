import { prisma } from "./db";
import { registra, sigilloRichiesta } from "./audit";
import { ibanValido, normalizzaIban, normalizzaNome, bicValido } from "./iban";
import { aCentesimi } from "./denaro";
import { valutaRischio } from "./rischio";
import { leggiRegole, type Regole } from "./impostazioni";

// Creazione e cambi di stato delle richieste di pagamento.
//
// Ciclo di vita:
//   in_attesa ──approva──▶ approvata ──in lotto──▶ in_lotto ──▶ pagata
//       │  ╰──rifiuta──▶ rifiutata
//       │  ╰──sospendi─▶ sospesa ──riprendi──▶ in_attesa
//       ╰──annulla (dall'app di origine)──▶ annullata
//
// Regole non negoziabili:
//   • una richiesta non si modifica dopo l'approvazione (importo e IBAN sono
//     congelati: è il momento in cui il denaro diventa reale);
//   • chi approva non può essere chi ha creato la richiesta a mano;
//   • sopra soglia servono DUE approvatori diversi.

export const STATI = [
  "in_attesa",
  "approvata",
  "rifiutata",
  "sospesa",
  "in_lotto",
  "pagata",
  "annullata",
] as const;
export type Stato = (typeof STATI)[number];

export const ETICHETTE: Record<string, string> = {
  in_attesa: "in attesa",
  approvata: "approvata",
  rifiutata: "rifiutata",
  sospesa: "sospesa",
  in_lotto: "in distinta",
  pagata: "pagata",
  annullata: "annullata",
};

export const TONI: Record<string, "neutro" | "ok" | "attenzione" | "grave"> = {
  in_attesa: "attenzione",
  approvata: "ok",
  rifiutata: "grave",
  sospesa: "attenzione",
  in_lotto: "neutro",
  pagata: "ok",
  annullata: "neutro",
};

/** Riferimento leggibile e stabile: TRX-2026-000123. */
async function prossimoRiferimento(): Promise<string> {
  const anno = new Date().getFullYear();
  const prefisso = `TRX-${anno}-`;
  const ultima = await prisma.richiesta.findFirst({
    where: { riferimento: { startsWith: prefisso } },
    orderBy: { riferimento: "desc" },
    select: { riferimento: true },
  });
  const n = ultima ? Number(ultima.riferimento.slice(prefisso.length)) + 1 : 1;
  return `${prefisso}${String(n).padStart(6, "0")}`;
}

export type DatiRichiesta = {
  importo: unknown;
  beneficiario?: unknown;
  iban?: unknown;
  bic?: unknown;
  causale?: unknown;
  note?: unknown;
  categoria?: unknown;
  scadenza?: unknown;
  riferimentoEsterno?: unknown;
  urlNotifica?: unknown;
};

export type EsitoCreazione =
  | { ok: true; richiesta: { id: string; riferimento: string; stato: string; rischio: number; motiviRischio: string[]; doppiaFirma: boolean }; ripetuta: boolean }
  | { ok: false; stato: number; errore: string };

const testo = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * Crea una richiesta di pagamento. È il punto in cui entra tutto: API delle
 * altre app e modulo manuale della UI passano entrambi da qui, così i controlli
 * non possono divergere.
 */
export async function creaRichiesta(
  dati: DatiRichiesta,
  contesto: {
    origine: string;
    chiaveApiId?: string | null;
    tettoRichiesta?: number;
    tettoGiornaliero?: number;
    attore: string;
    ip?: string | null;
  },
): Promise<EsitoCreazione> {
  const regole = await leggiRegole();

  const importoCent = aCentesimi(dati.importo);
  if (importoCent == null) {
    return { ok: false, stato: 400, errore: "Importo mancante o non valido: atteso un numero positivo in euro." };
  }

  const beneficiario = testo(dati.beneficiario);
  if (beneficiario.length < 2) {
    return { ok: false, stato: 400, errore: "Beneficiario obbligatorio." };
  }

  const iban = normalizzaIban(testo(dati.iban));
  if (!iban) return { ok: false, stato: 400, errore: "IBAN obbligatorio." };
  if (!ibanValido(iban)) {
    return { ok: false, stato: 400, errore: "IBAN non valido: il controllo di checksum non torna." };
  }

  const bic = testo(dati.bic).replace(/\s/g, "").toUpperCase();
  if (bic && !bicValido(bic)) return { ok: false, stato: 400, errore: "BIC non valido." };

  const causale = testo(dati.causale);
  if (!causale) return { ok: false, stato: 400, errore: "Causale obbligatoria: senza non si ricostruisce il pagamento." };
  if (causale.length > 140) {
    return { ok: false, stato: 400, errore: "Causale troppo lunga: il limite SEPA è 140 caratteri." };
  }

  // Tetti: prima quello della chiave, poi quello assoluto dell'azienda.
  if (contesto.tettoRichiesta && contesto.tettoRichiesta > 0 && importoCent > contesto.tettoRichiesta) {
    return { ok: false, stato: 403, errore: "Importo oltre il tetto consentito a questa app." };
  }
  if (regole.tettoAssoluto > 0 && importoCent > regole.tettoAssoluto) {
    return { ok: false, stato: 403, errore: "Importo oltre il tetto assoluto dell'azienda: va gestito fuori dall'app." };
  }
  if (contesto.chiaveApiId && contesto.tettoGiornaliero && contesto.tettoGiornaliero > 0) {
    const inizio = new Date();
    inizio.setHours(0, 0, 0, 0);
    const somma = await prisma.richiesta.aggregate({
      where: { chiaveApiId: contesto.chiaveApiId, creataIl: { gte: inizio }, stato: { notIn: ["rifiutata", "annullata"] } },
      _sum: { importoCent: true },
    });
    if ((somma._sum.importoCent ?? 0) + importoCent > contesto.tettoGiornaliero) {
      return { ok: false, stato: 403, errore: "Tetto giornaliero di questa app superato." };
    }
  }

  // Idempotenza applicativa: stessa origine + stesso riferimento esterno.
  const riferimentoEsterno = testo(dati.riferimentoEsterno) || null;
  if (riferimentoEsterno) {
    const esistente = await prisma.richiesta.findUnique({
      where: { origine_riferimentoEsterno: { origine: contesto.origine, riferimentoEsterno } },
    });
    if (esistente) {
      return {
        ok: true,
        ripetuta: true,
        richiesta: {
          id: esistente.id,
          riferimento: esistente.riferimento,
          stato: esistente.stato,
          rischio: esistente.rischio,
          motiviRischio: esistente.motiviRischio ? esistente.motiviRischio.split("|") : [],
          doppiaFirma: esistente.doppiaFirma,
        },
      };
    }
  }

  const valutazione = await valutaRischio(
    { importoCent, iban, beneficiario, causale, origine: contesto.origine },
    regole,
  );

  const doppiaFirma =
    (regole.sogliaDoppiaFirma > 0 && importoCent >= regole.sogliaDoppiaFirma) ||
    valutazione.punteggio >= regole.sogliaRischioDoppiaFirma;

  const riferimento = await prossimoRiferimento();
  const scadenza = dati.scadenza ? new Date(String(dati.scadenza)) : null;

  const richiesta = await prisma.richiesta.create({
    data: {
      riferimento,
      chiaveApiId: contesto.chiaveApiId ?? null,
      origine: contesto.origine,
      riferimentoEsterno,
      importoCent,
      valuta: "EUR",
      beneficiario,
      beneficiarioNorm: normalizzaNome(beneficiario),
      iban,
      bic: bic || null,
      causale,
      note: testo(dati.note) || null,
      categoria: testo(dati.categoria) || null,
      scadenza: scadenza && !Number.isNaN(scadenza.getTime()) ? scadenza : null,
      stato: "in_attesa",
      rischio: valutazione.punteggio,
      motiviRischio: valutazione.motivi.join("|"),
      doppiaFirma,
      urlNotifica: testo(dati.urlNotifica) || null,
      sigillo: sigilloRichiesta({ riferimento, importoCent, valuta: "EUR", iban, beneficiario, causale }),
    },
  });

  // La rubrica impara: il beneficiario entra come «non verificato». La spunta
  // la mette una persona, non l'app.
  await prisma.beneficiario
    .upsert({
      where: { nomeNorm_iban: { nomeNorm: normalizzaNome(beneficiario), iban } },
      update: {},
      create: {
        nome: beneficiario,
        nomeNorm: normalizzaNome(beneficiario),
        iban,
        bic: bic || null,
        paese: iban.slice(0, 2),
      },
    })
    .catch(() => {});

  await registra(
    "richiesta.creata",
    contesto.attore,
    { riferimento, importoCent, beneficiario, rischio: valutazione.punteggio, doppiaFirma },
    { richiestaId: richiesta.id, ip: contesto.ip },
  );

  return {
    ok: true,
    ripetuta: false,
    richiesta: {
      id: richiesta.id,
      riferimento,
      stato: richiesta.stato,
      rischio: valutazione.punteggio,
      motiviRischio: valutazione.motivi,
      doppiaFirma,
    },
  };
}

// ---------------------------------------------------------------------------
// Decisioni
// ---------------------------------------------------------------------------

export type EsitoDecisione = { ok: true; stato: string; messaggio: string } | { ok: false; errore: string };

/**
 * Registra il voto di un operatore. Ritorna lo stato in cui si trova la
 * richiesta dopo il voto: con la doppia firma, la prima approvazione lascia la
 * richiesta in attesa e aspetta la seconda persona.
 */
export async function decidi(
  richiestaId: string,
  operatore: { id: string; email: string; ruolo: string; tettoApprovazione: number },
  esito: "approvata" | "rifiutata" | "sospesa",
  motivo: string,
  ip?: string | null,
): Promise<EsitoDecisione> {
  const r = await prisma.richiesta.findUnique({ where: { id: richiestaId }, include: { approvazioni: true } });
  if (!r) return { ok: false, errore: "Richiesta inesistente." };
  if (operatore.ruolo === "osservatore") return { ok: false, errore: "Il ruolo osservatore non può decidere." };

  if (r.stato !== "in_attesa" && !(r.stato === "sospesa" && esito !== "sospesa")) {
    return { ok: false, errore: `La richiesta è «${ETICHETTE[r.stato] ?? r.stato}»: non si decide più.` };
  }

  // Il sigillo: se importo o IBAN sono cambiati fuori dall'app, si blocca tutto.
  const atteso = sigilloRichiesta(r);
  if (atteso !== r.sigillo) {
    await registra("sicurezza.allarme", operatore.email, { messaggio: "sigillo non corrispondente", riferimento: r.riferimento }, { richiestaId: r.id, ip });
    return { ok: false, errore: "I dati della richiesta non corrispondono al sigillo: bloccata per sicurezza." };
  }

  const regole = await leggiRegole();

  if (esito === "approvata") {
    if (regole.tettoAssoluto > 0 && r.importoCent > regole.tettoAssoluto) {
      return { ok: false, errore: "Importo oltre il tetto assoluto: nessuno può approvarla dall'app." };
    }
    if (operatore.tettoApprovazione > 0 && r.importoCent > operatore.tettoApprovazione) {
      return { ok: false, errore: "Importo oltre il tuo tetto personale di approvazione." };
    }
    // Chi ha creato la richiesta a mano non la approva: è la separazione dei ruoli.
    if (r.origine === "manuale") {
      const creazione = await prisma.evento.findFirst({
        where: { richiestaId: r.id, tipo: "richiesta.creata" },
        select: { attore: true },
      });
      if (creazione?.attore === operatore.email) {
        return { ok: false, errore: "Non puoi approvare una richiesta che hai creato tu." };
      }
    }
  }

  const giaVotato = r.approvazioni.some((a) => a.operatoreId === operatore.id);
  if (giaVotato) return { ok: false, errore: "Hai già espresso una decisione su questa richiesta." };

  await prisma.approvazione.create({
    data: { richiestaId: r.id, operatoreId: operatore.id, esito, motivo: motivo || null, ip: ip ?? null },
  });

  if (esito === "rifiutata") {
    await prisma.richiesta.update({ where: { id: r.id }, data: { stato: "rifiutata", decisaIl: new Date() } });
    await registra("richiesta.rifiutata", operatore.email, { riferimento: r.riferimento, motivo }, { richiestaId: r.id, ip });
    return { ok: true, stato: "rifiutata", messaggio: "Richiesta rifiutata." };
  }

  if (esito === "sospesa") {
    await prisma.richiesta.update({ where: { id: r.id }, data: { stato: "sospesa" } });
    await registra("richiesta.sospesa", operatore.email, { riferimento: r.riferimento, motivo }, { richiestaId: r.id, ip });
    return { ok: true, stato: "sospesa", messaggio: "Richiesta sospesa: serve un chiarimento prima di decidere." };
  }

  const approvazioni = await prisma.approvazione.count({ where: { richiestaId: r.id, esito: "approvata" } });
  const servono = r.doppiaFirma ? 2 : 1;
  if (approvazioni < servono) {
    if (r.stato === "sospesa") await prisma.richiesta.update({ where: { id: r.id }, data: { stato: "in_attesa" } });
    await registra("richiesta.approvata", operatore.email, { riferimento: r.riferimento, parziale: true, approvazioni, servono }, { richiestaId: r.id, ip });
    return { ok: true, stato: "in_attesa", messaggio: `Prima firma registrata: serve l'approvazione di un secondo operatore (${approvazioni}/${servono}).` };
  }

  await prisma.richiesta.update({ where: { id: r.id }, data: { stato: "approvata", decisaIl: new Date() } });
  await registra("richiesta.approvata", operatore.email, { riferimento: r.riferimento, parziale: false, approvazioni }, { richiestaId: r.id, ip });
  return { ok: true, stato: "approvata", messaggio: "Richiesta approvata: pronta per la distinta." };
}

/** Annullamento chiesto dall'app di origine (solo se non è ancora approvata). */
export async function annulla(richiestaId: string, attore: string, motivo: string, ip?: string | null): Promise<EsitoDecisione> {
  const r = await prisma.richiesta.findUnique({ where: { id: richiestaId } });
  if (!r) return { ok: false, errore: "Richiesta inesistente." };
  if (!["in_attesa", "sospesa"].includes(r.stato)) {
    return { ok: false, errore: `La richiesta è «${ETICHETTE[r.stato] ?? r.stato}»: non si annulla più.` };
  }
  await prisma.richiesta.update({ where: { id: r.id }, data: { stato: "annullata", decisaIl: new Date() } });
  await registra("richiesta.annullata", attore, { riferimento: r.riferimento, motivo }, { richiestaId: r.id, ip });
  return { ok: true, stato: "annullata", messaggio: "Richiesta annullata." };
}

export function motiviDa(testoMotivi: string): string[] {
  return testoMotivi ? testoMotivi.split("|").filter(Boolean) : [];
}

export type { Regole };
