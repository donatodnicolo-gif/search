import { prisma } from "./db";
import { registra, sigilloDellaRiga, sigilloRichiestaV2 } from "./audit";
import { ibanValido, normalizzaIban, normalizzaNome, bicValido } from "./iban";
import { aCentesimi } from "./denaro";
import { valutaRischio } from "./rischio";
import { leggiRegole, type Regole } from "./impostazioni";
import { METODI_FUORI } from "./metodi-fuori";
import { metodoAutomatizzabile, numeroDiCartaNelTesto, validaMetodo } from "./metodi";

// Creazione e cambi di stato delle richieste di pagamento.
//
// Ciclo di vita:
//   in_attesa ──approva──▶ approvata ──in lotto──▶ in_lotto ──▶ pagata
//       │  ╰──rifiuta──▶ rifiutata
//       │  ╰──sospendi─▶ sospesa ──riprendi──▶ in_attesa
//       ╰──annulla (dall'app di origine)──▶ annullata
//
// E una scorciatoia che viene da fuori, non da qui: da qualunque stato ancora
// aperto un operatore può dire «questa l'ho già pagata da un'altra parte»
// (▶ pagata, `pagatoCon = "fuori_app"`) oppure «annullala». Vedi
// `chiudiFuoriDallApp` più sotto: è registrazione di denaro già uscito, non una
// seconda porta da cui farlo uscire.
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
  metodo?: unknown;
  iban?: unknown;
  bic?: unknown;
  riferimentoPagamento?: unknown;
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

  // Metodo: "iban" è il default e l'unico automatizzabile; gli altri (link,
  // paypal, carta, altro) sono richieste che si chiudono a mano. Le regole
  // (Luhn anti-carta, link https, riferimento obbligatorio) vivono QUI, sul
  // server: valgono per la UI e per qualunque chiamante API allo stesso modo.
  const metodo = testo(dati.metodo) || "iban";
  const riferimentoPagamento = testo(dati.riferimentoPagamento);
  const iban = normalizzaIban(testo(dati.iban));
  const erroreMetodo = validaMetodo(metodo, { iban, riferimentoPagamento });
  if (erroreMetodo) return { ok: false, stato: 400, errore: erroreMetodo };

  if (metodo === "iban" && !ibanValido(iban)) {
    return { ok: false, stato: 400, errore: "IBAN non valido: il controllo di checksum non torna." };
  }
  // Con un metodo diverso dal bonifico l'IBAN non c'entra: si scarta quello che
  // arriva, non si conserva un dato che nessun percorso userà.
  const ibanFinale = metodo === "iban" ? iban : "";

  const bic = testo(dati.bic).replace(/\s/g, "").toUpperCase();
  if (bic && !bicValido(bic)) return { ok: false, stato: 400, errore: "BIC non valido." };

  const causale = testo(dati.causale);
  if (!causale) return { ok: false, stato: 400, errore: "Causale obbligatoria: senza non si ricostruisce il pagamento." };
  if (causale.length > 140) {
    return { ok: false, stato: 400, errore: "Causale troppo lunga: il limite SEPA è 140 caratteri." };
  }
  // Un numero di carta non deve stare da nessuna parte, nemmeno nelle note.
  if (numeroDiCartaNelTesto(testo(dati.note)) || numeroDiCartaNelTesto(causale)) {
    return { ok: false, stato: 400, errore: "Nel testo c'è quello che sembra un numero di carta: non si registra mai." };
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
    { importoCent, iban: ibanFinale, metodo, beneficiario, causale, origine: contesto.origine },
    regole,
  );

  const doppiaFirma =
    (regole.sogliaDoppiaFirma > 0 && importoCent >= regole.sogliaDoppiaFirma) ||
    valutazione.punteggio >= regole.sogliaRischioDoppiaFirma;

  // Webhook: l'override per-richiesta è ammesso solo verso lo STESSO host
  // dell'indirizzo di default della chiave — il corpo di una POST non deve
  // poter dirottare gli esiti (con dentro importi e beneficiari) verso un
  // dominio scelto da chi ha rubato una chiave.
  let urlNotifica = testo(dati.urlNotifica) || null;
  if (urlNotifica) {
    if (!/^https:\/\//i.test(urlNotifica)) {
      return { ok: false, stato: 400, errore: "urlNotifica deve cominciare con https://." };
    }
    if (contesto.chiaveApiId) {
      const chiave = await prisma.chiaveApi.findUnique({
        where: { id: contesto.chiaveApiId },
        select: { urlNotifica: true },
      });
      if (chiave?.urlNotifica) {
        try {
          if (new URL(urlNotifica).host !== new URL(chiave.urlNotifica).host) {
            return {
              ok: false,
              stato: 400,
              errore: "urlNotifica deve stare sullo stesso host dell'indirizzo di notifica registrato per questa chiave.",
            };
          }
        } catch {
          return { ok: false, stato: 400, errore: "urlNotifica non è un indirizzo valido." };
        }
      }
    }
  }

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
      metodo,
      iban: ibanFinale,
      bic: bic || null,
      riferimentoPagamento: riferimentoPagamento || null,
      causale,
      note: testo(dati.note) || null,
      categoria: testo(dati.categoria) || null,
      scadenza: scadenza && !Number.isNaN(scadenza.getTime()) ? scadenza : null,
      stato: "in_attesa",
      rischio: valutazione.punteggio,
      motiviRischio: valutazione.motivi.join("|"),
      doppiaFirma,
      urlNotifica,
      sigillo: sigilloRichiestaV2({
        riferimento,
        importoCent,
        valuta: "EUR",
        iban: ibanFinale,
        beneficiario,
        causale,
        metodo,
        riferimentoPagamento: riferimentoPagamento || null,
      }),
      sigilloV: 2,
    },
  });

  // La rubrica impara: il beneficiario entra come «non verificato». La spunta
  // la mette una persona, non l'app. Solo per i bonifici: la rubrica è di IBAN.
  if (metodo === "iban") {
    await prisma.beneficiario
      .upsert({
        where: { nomeNorm_iban: { nomeNorm: normalizzaNome(beneficiario), iban: ibanFinale } },
        update: {},
        create: {
          nome: beneficiario,
          nomeNorm: normalizzaNome(beneficiario),
          iban: ibanFinale,
          bic: bic || null,
          paese: ibanFinale.slice(0, 2),
        },
      })
      .catch(() => {});
  }

  await registra(
    "richiesta.creata",
    contesto.attore,
    { riferimento, importoCent, beneficiario, metodo, rischio: valutazione.punteggio, doppiaFirma },
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

  // Il sigillo: se importo, IBAN o riferimento di pagamento sono cambiati
  // fuori dall'app, si blocca tutto.
  const atteso = sigilloDellaRiga(r);
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

// ---------------------------------------------------------------------------
// Chiusura fuori dall'app: «l'ho già pagata da un'altra parte» / «annullala»
// ---------------------------------------------------------------------------

// Perché serve: il mondo non passa sempre da qui. Un bonifico può essere partito
// dal portale della banca, un fornitore può essere stato pagato in contanti, una
// fattura può essere stata compensata con un credito. Senza questa strada la
// richiesta resterebbe in coda per sempre, e — peggio — verrebbe pagata una
// seconda volta il giorno che qualcuno la mette in distinta.
//
// ATTENZIONE, e va detto chiaro: da qui NON esce un euro. Non è un secondo
// cancello accanto a quello del pagatore (codice via email + PIN): è una
// *registrazione* di denaro già uscito altrove. Per questo non chiede il PIN.
// Chiede però il secondo fattore (in actions.ts), un motivo scritto, e lascia
// il suo evento nel registro: l'abuso possibile non è rubare — è far sparire
// dalla coda una richiesta che nessuno ha pagato davvero, e contro quello serve
// che si veda chi l'ha detto e quando.
//
// L'effetto collaterale che conta di più: la richiesta esce dalla distinta in
// cui si trovava. È la difesa contro il doppio pagamento.

export type EsitoChiusura = { ok: true; messaggio: string; riferimento: string } | { ok: false; errore: string };

/** Stati da cui una richiesta si può ancora chiudere a mano. */
const CHIUDIBILI = ["in_attesa", "sospesa", "approvata", "in_lotto"];

/** Lo stesso elenco, per la pagina che decide se disegnare il modulo. */
export function chiudibileAMano(stato: string): boolean {
  return CHIUDIBILI.includes(stato);
}

export async function chiudiFuoriDallApp(
  richiestaId: string,
  operatore: { id: string; email: string; ruolo: string },
  dati: { esito: "pagata_fuori" | "annullata"; metodo?: string; motivo: string; dataPagamento?: string },
  ip?: string | null,
): Promise<EsitoChiusura> {
  if (operatore.ruolo === "osservatore") return { ok: false, errore: "Il ruolo osservatore non può chiudere richieste." };
  return chiudiRichiestaDichiarata(richiestaId, operatore.email, dati, ip);
}

/** La stessa chiusura, dichiarata dall'APP DI ORIGINE via API (05/09/2026):
 *  il Customer Service segna «pagata» un fornitore che ha pagato dal portale
 *  della banca, e la richiesta qui non deve restare in coda — pagarla da qui
 *  la pagherebbe due volte (successo con 7 richieste di Finance, 4.794 €).
 *  Non è una porta in più per far uscire denaro (SICUREZZA.md §0-ter): è la
 *  stessa registrazione di denaro già uscito, con l'attore = nome dell'app e
 *  `dichiaratoDa` nell'evento, così si distingue dalla chiusura di un
 *  operatore. Vale solo per le richieste di quella chiave (lo controlla la
 *  rotta). */
export async function chiudiDichiarataDallOrigine(
  richiestaId: string,
  app: string,
  dati: { metodo?: string; motivo: string; dataPagamento?: string },
  ip?: string | null,
): Promise<EsitoChiusura> {
  // Stesso perimetro dell'annullo via API (revisione ostile 05/09): finché
  // nessuno qui ha firmato. Una richiesta approvata o in distinta la chiude
  // solo un operatore di Transactions — altrimenti un login qualsiasi
  // dell'app di origine potrebbe far sparire una decisione presa da due
  // persone e spegnere uno sblocco in corso.
  const r = await prisma.richiesta.findUnique({ where: { id: richiestaId }, select: { stato: true } });
  if (!r) return { ok: false, errore: "Richiesta inesistente." };
  if (!["in_attesa", "sospesa"].includes(r.stato)) {
    return {
      ok: false,
      errore:
        r.stato === "pagata"
          ? "Questa richiesta risulta già pagata da Transactions."
          : `La richiesta è «${ETICHETTE[r.stato] ?? r.stato}»: dopo l'approvazione la chiude solo un operatore dentro Transactions.`,
    };
  }
  return chiudiRichiestaDichiarata(richiestaId, app, { ...dati, esito: "pagata_fuori", dichiaratoDa: app }, ip);
}

async function chiudiRichiestaDichiarata(
  richiestaId: string,
  attore: string,
  dati: { esito: "pagata_fuori" | "annullata"; metodo?: string; motivo: string; dataPagamento?: string; dichiaratoDa?: string },
  ip?: string | null,
): Promise<EsitoChiusura> {
  const r = await prisma.richiesta.findUnique({ where: { id: richiestaId }, include: { lotto: true } });
  if (!r) return { ok: false, errore: "Richiesta inesistente." };

  if (!CHIUDIBILI.includes(r.stato)) {
    return {
      ok: false,
      errore:
        r.stato === "pagata"
          ? "Questa richiesta risulta già pagata: non si chiude una seconda volta."
          : `La richiesta è «${ETICHETTE[r.stato] ?? r.stato}»: è già una partita chiusa.`,
    };
  }

  // Il sigillo vale qui come sull'approvazione: se importo o IBAN sono stati
  // toccati fuori dall'app, non si scrive «pagata» su niente.
  if (sigilloDellaRiga(r) !== r.sigillo) {
    await registra(
      "sicurezza.allarme",
      attore,
      { messaggio: "sigillo non corrispondente in chiusura manuale", riferimento: r.riferimento },
      { richiestaId: r.id, ip },
    );
    return { ok: false, errore: "I dati della richiesta non corrispondono al sigillo: bloccata per sicurezza." };
  }

  const motivo = testo(dati.motivo);
  if (motivo.length < 3) {
    return {
      ok: false,
      errore:
        dati.esito === "pagata_fuori"
          ? "Scrivi dove e quando è stata pagata (numero dell'operazione, conto, chi l'ha fatta): fra sei mesi è l'unica traccia."
          : "Scrivi perché la annulli: resta nel registro al posto del pagamento.",
    };
  }

  // Una richiesta dentro una distinta già consegnata alla banca non si chiude da
  // qui: il file è fuori, e dire «pagata a mano» nasconderebbe che sta per
  // essere pagata anche da lì.
  if (r.lotto && r.lotto.stato !== "aperto") {
    return {
      ok: false,
      errore: `Questa richiesta è nella distinta ${r.lotto.riferimento}, che è già «${r.lotto.stato}». Chiudi prima la distinta: se il bonifico è partito da lì, si segna pagata la distinta.`,
    };
  }

  let quandoPagata: Date | null = null;
  let metodo = "";
  if (dati.esito === "pagata_fuori") {
    metodo = testo(dati.metodo);
    if (!METODI_FUORI[metodo]) return { ok: false, errore: "Scegli come è stata pagata." };

    const giorno = testo(dati.dataPagamento);
    if (giorno) {
      // Mezzogiorno, non mezzanotte: una data scritta a mano non deve scivolare
      // al giorno prima per via del fuso.
      const d = new Date(`${giorno}T12:00:00`);
      if (Number.isNaN(d.getTime())) return { ok: false, errore: "La data del pagamento non è valida." };
      const oggi = new Date();
      const stessoGiorno = d.toDateString() === oggi.toDateString();
      if (d.getTime() > oggi.getTime() && !stessoGiorno) {
        return { ok: false, errore: "La data del pagamento è nel futuro: si registra quello che è già uscito, non quello che uscirà." };
      }
      quandoPagata = stessoGiorno ? oggi : d;
    } else {
      quandoPagata = new Date();
    }
  }

  const adesso = new Date();
  const lottoLasciato = r.lotto?.riferimento ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.richiesta.update({
      where: { id: r.id },
      data:
        dati.esito === "pagata_fuori"
          ? {
              stato: "pagata",
              // «fuori_app» non è un dettaglio estetico: è ciò che distingue un
              // pagamento di cui questa app ha la prova (id del bonifico, file
              // SEPA) da uno di cui ha solo il racconto di una persona.
              pagatoCon: "fuori_app",
              pagataIl: quandoPagata,
              decisaIl: r.decisaIl ?? adesso,
              lottoId: null,
            }
          : { stato: "annullata", decisaIl: adesso, lottoId: null },
    });

    // Togliere una riga cambia la distinta, e uno sblocco vale per la distinta
    // *com'era*: se ce n'è uno aperto va spento, altrimenti si firmerebbe un
    // totale e se ne pagherebbe un altro.
    if (r.lottoId) {
      await tx.lotto.updateMany({
        where: { id: r.lottoId, sbloccoScadeIl: { gt: adesso } },
        data: { sbloccatoDa: null, sbloccatoIl: null, sbloccoScadeIl: null },
      });
      await tx.sbloccoPagamento.updateMany({
        where: { lottoId: r.lottoId, usatoIl: null, annullatoIl: null },
        data: { annullatoIl: adesso },
      });
    }
  });

  if (dati.esito === "pagata_fuori") {
    await registra(
      "richiesta.pagata_fuori",
      attore,
      {
        riferimento: r.riferimento,
        importoCent: r.importoCent,
        beneficiario: r.beneficiario,
        metodo,
        metodoTesto: METODI_FUORI[metodo],
        motivo,
        // Presente solo quando a dichiararla è l'app di origine via API: la
        // prova non ce l'ha nessuno qui, e chi legge il registro deve vederlo.
        ...(dati.dichiaratoDa ? { dichiaratoDa: dati.dichiaratoDa } : {}),
        pagataIl: quandoPagata?.toISOString() ?? null,
        uscitaDaDistinta: lottoLasciato,
      },
      { richiestaId: r.id, ip },
    );
    return {
      ok: true,
      riferimento: r.riferimento,
      messaggio: `${r.riferimento} segnata pagata fuori dall'app (${METODI_FUORI[metodo]}).${
        lottoLasciato ? ` Tolta dalla distinta ${lottoLasciato}: non verrà pagata una seconda volta.` : ""
      }`,
    };
  }

  await registra(
    "richiesta.annullata",
    attore,
    { riferimento: r.riferimento, importoCent: r.importoCent, motivo, aMano: true, uscitaDaDistinta: lottoLasciato },
    { richiestaId: r.id, ip },
  );
  return {
    ok: true,
    riferimento: r.riferimento,
    messaggio: `${r.riferimento} annullata.${lottoLasciato ? ` Tolta dalla distinta ${lottoLasciato}.` : ""}`,
  };
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
