import { prisma } from "./db";
import { elencoClienti, type Cliente } from "./clienti";
import { CANALI, lista, nomeCanale } from "./segmenti";
import { euro, dataBreve } from "./ordini";

// AUTOMAZIONI — messaggi ai clienti di una lista, scritti da uno script.
//
// Cosa fa un'automazione: prende una **lista** (le stesse del catalogo), la
// passa al setaccio dei **consensi** e delle regole di buon senso, e prepara un
// messaggio per ogni persona rimasta, già compilato coi suoi dati.
//
// Cosa NON fa: inviare da sola nel mondo. L'invio resta un gesto con un
// responsabile davanti — oggi si esporta o si manda dal Customer Service, che è
// l'app che parla con WhatsApp. È una scelta, non un pezzo mancante: un errore
// su una lista da 2.000 persone non si corregge dopo, e un'automazione che
// scrive da sola a chi non voleva è un danno che nessun risparmio di tempo
// ripaga.
//
// I quattro setacci, nell'ordine in cui si applicano:
//  1. **consenso** per quel canale (si può disattivare solo per i messaggi di
//     servizio, mai per il marketing);
//  2. **recapito** presente (email o telefono, secondo il canale);
//  3. **silenzio**: nessun altro messaggio, di nessuna automazione, negli
//     ultimi N giorni — il modo più veloce per farsi bloccare è scrivere due
//     volte in una settimana;
//  4. **limite del giro**: quante persone al massimo in una volta.

// ---------------------------------------------------------------------------
// VARIABILI DI UNO SCRIPT
//
// Nel testo si scrivono fra doppie graffe. Sono di due specie:
//  - **automatiche** (`VARIABILI_AUTOMATICHE`): le riempie l'app coi dati di
//    quel cliente. Ci sono sempre, non si dichiarano;
//  - **dichiarate** dallo script (`VariabileScript`): sconto, data, nome di una
//    collezione. Ogni automazione che usa quello script sceglie il suo valore,
//    così lo stesso testo serve a gennaio e a febbraio senza riscriverlo.
//
// Una variabile **obbligatoria** senza valore blocca la preparazione: meglio
// un'automazione ferma che cinquecento messaggi con scritto «{{sconto}}».
export type VariabileScript = {
  chiave: string; // come si scrive nel testo: {{sconto}}
  etichetta: string; // come si chiama per chi la compila
  valore: string; // valore predefinito
  obbligatoria: boolean;
};

// Le variabili dichiarate da uno script, lette dal campo Json senza fidarsi
// della forma: un Json scritto a mano può contenere di tutto.
export function variabiliScript(json: unknown): VariabileScript[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => ({
      chiave: String(v.chiave ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      etichetta: String(v.etichetta ?? "").trim(),
      valore: String(v.valore ?? ""),
      obbligatoria: Boolean(v.obbligatoria),
    }))
    .filter((v) => v.chiave !== "");
}

// I valori scelti da un'automazione, nella stessa logica prudente.
export function valoriAutomazione(json: unknown): Record<string, string> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (v != null && String(v).trim() !== "") out[k.toLowerCase()] = String(v);
  }
  return out;
}

// Tutte le variabili citate in un testo, nell'ordine in cui compaiono.
export function variabiliCitate(testo: string): string[] {
  const trovate = [...testo.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(trovate)];
}

// Le variabili citate che nessuno riempirà: né automatiche né dichiarate.
// Servono a vederle PRIMA di mandare, non dopo.
export function variabiliSconosciute(testo: string, dichiarate: VariabileScript[]): string[] {
  const note = new Set<string>([
    ...VARIABILI_AUTOMATICHE.map((s) => s.chiave),
    ...dichiarate.map((d) => d.chiave),
  ]);
  return variabiliCitate(testo).filter((v) => !note.has(v));
}

// Le variabili obbligatorie rimaste senza valore (né scelto né predefinito).
export function variabiliMancanti(
  dichiarate: VariabileScript[],
  valori: Record<string, string>,
): VariabileScript[] {
  return dichiarate.filter((d) => d.obbligatoria && !(valori[d.chiave] ?? d.valore).trim());
}

// Le variabili automatiche che si possono scrivere in ogni script.
export const VARIABILI_AUTOMATICHE = [
  { chiave: "nome", spiega: "il nome del cliente (o «Gentile cliente» se non lo sappiamo)" },
  { chiave: "citta", spiega: "la città dell'ultima consegna" },
  { chiave: "brand", spiega: "il negozio da cui ha comprato l'ultima volta" },
  { chiave: "ultimo_ordine", spiega: "la data dell'ultimo ordine (es. 12 mar 26)" },
  { chiave: "giorni", spiega: "quanti giorni sono passati dall'ultimo ordine" },
  { chiave: "ordini", spiega: "quanti ordini ha fatto" },
  { chiave: "speso", spiega: "quanto ha speso in totale" },
] as const;

// Sostituisce le variabili con i dati di quel cliente e coi valori scelti.
// Ordine: prima le automatiche (i dati del cliente vincono sempre: nessuno può
// sovrascrivere il nome di una persona con una costante), poi quelle dichiarate.
//
// Una variabile che nessuno riempie **resta scritta com'è**: meglio vederla
// nell'anteprima che scoprire di aver mandato «Ciao {{nomee}}» a trecento
// persone.
export function componiMessaggio(
  testo: string,
  c: Cliente,
  scelti: Record<string, string> = {},
  dichiarate: VariabileScript[] = [],
): string {
  const valori: Record<string, string> = {};
  // le dichiarate per prime, così le automatiche non si possono scavalcare
  for (const d of dichiarate) valori[d.chiave] = scelti[d.chiave] ?? d.valore;
  for (const [k, v] of Object.entries(scelti)) if (!(k in valori)) valori[k] = v;

  Object.assign(valori, {
    nome: (c.nome ?? "").trim() || "Gentile cliente",
    citta: c.citta ?? "",
    brand: c.brand[0] ?? "",
    ultimo_ordine: dataBreve(c.ultimoOrdine),
    giorni: String(c.giorni),
    ordini: String(c.ordini),
    speso: euro(c.speso),
  });

  return testo.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (intero, chiave: string) =>
    chiave.toLowerCase() in valori ? valori[chiave.toLowerCase()] : intero,
  );
}

// Il recapito giusto per il canale, e se il consenso c'è.
function recapitoE(canale: string, c: Cliente): { recapito: string | null; consenso: boolean } {
  switch (canale) {
    case "email":
      return { recapito: c.email, consenso: c.contattabileEmail };
    case "telefono":
      return { recapito: c.telefono, consenso: c.contattabileTelefono };
    default: // whatsapp
      return { recapito: c.telefono, consenso: c.contattabileSms };
  }
}

export type EsitoGiro = {
  preparati: number;
  saltati: { motivo: string; quanti: number }[];
  esaminati: number;
  errore?: string;
};

type Automazione = {
  id: string;
  lista: string;
  canale: string;
  script: string; // testo scritto direttamente sull'automazione (ripiego)
  oggetto: string;
  giorniSilenzio: number;
  limiteGiro: number;
  soloConsenso: boolean;
  valori?: unknown; // valori scelti per le variabili dello script
  scriptUsato?: { testo: string; oggetto: string; variabili: unknown } | null;
};

// Che cosa si manda davvero: il testo dello script collegato, se c'è,
// altrimenti quello scritto sull'automazione. Insieme al testo tornano le
// variabili dichiarate e i valori scelti, perché servono sempre insieme.
export function testoDaMandare(a: Automazione): {
  testo: string;
  oggetto: string;
  dichiarate: VariabileScript[];
  valori: Record<string, string>;
} {
  const dichiarate = variabiliScript(a.scriptUsato?.variabili);
  return {
    testo: a.scriptUsato ? a.scriptUsato.testo : a.script,
    oggetto: a.scriptUsato?.oggetto || a.oggetto,
    dichiarate,
    valori: valoriAutomazione(a.valori),
  };
}

// Prepara un giro di messaggi. `anteprima` fa lo stesso lavoro senza scrivere
// niente: è la prova a vuoto, e va guardata prima di ogni invio.
export async function preparaGiro(
  a: Automazione,
  anteprima = false,
): Promise<EsitoGiro & { messaggi: { chiave: string; nome: string; recapito: string; testo: string }[] }> {
  const esito: EsitoGiro & { messaggi: { chiave: string; nome: string; recapito: string; testo: string }[] } = {
    preparati: 0,
    saltati: [],
    esaminati: 0,
    messaggi: [],
  };

  if (!lista(a.lista)) {
    esito.errore = `La lista «${a.lista}» non esiste più: scegline un'altra.`;
    return esito;
  }

  const { testo, dichiarate, valori } = testoDaMandare(a);
  if (!testo.trim()) {
    esito.errore = a.scriptUsato
      ? "Lo script collegato è vuoto: scrivi il testo prima di preparare i messaggi."
      : "Non c'è niente da mandare: scegli uno script o scrivi il testo qui.";
    return esito;
  }

  // Variabili obbligatorie senza valore: si ferma tutto. Un messaggio con
  // «{{sconto}}» scritto dentro, moltiplicato per cinquecento, è peggio di
  // un'automazione che non parte.
  const mancanti = variabiliMancanti(dichiarate, valori);
  if (mancanti.length > 0) {
    esito.errore = `Manca il valore di ${mancanti.length === 1 ? "una variabile obbligatoria" : "alcune variabili obbligatorie"}: ${mancanti
      .map((m) => `«${m.etichetta || m.chiave}»`)
      .join(", ")}. Compilala qui sotto prima di preparare i messaggi.`;
    return esito;
  }

  const salta = (motivo: string) => {
    const voce = esito.saltati.find((s) => s.motivo === motivo);
    if (voce) voce.quanti++;
    else esito.saltati.push({ motivo, quanti: 1 });
  };

  // Si guardano più clienti di quanti se ne prepareranno: i setacci ne tolgono
  // molti, e fermarsi al limite darebbe giri quasi vuoti.
  const candidati = await elencoClienti(undefined, "recenti", 0, Math.min(2000, a.limiteGiro * 10), a.lista);
  esito.esaminati = candidati.length;

  const dal = new Date(Date.now() - a.giorniSilenzio * 86_400_000);
  const scrittiDiRecente = new Set(
    (
      await prisma.messaggioAutomazione.findMany({
        where: {
          chiave: { in: candidati.map((c) => c.chiave) },
          stato: { in: ["pronto", "inviato"] },
          preparatoIl: { gte: dal },
        },
        select: { chiave: true },
      })
    ).map((m) => m.chiave),
  );
  // Chi ha già un messaggio di QUESTA automazione non ne riceve un altro,
  // qualunque sia la finestra di silenzio.
  const giaInQuesta = new Set(
    (
      await prisma.messaggioAutomazione.findMany({
        where: { automazioneId: a.id, chiave: { in: candidati.map((c) => c.chiave) }, stato: { in: ["pronto", "inviato"] } },
        select: { chiave: true },
      })
    ).map((m) => m.chiave),
  );

  const daScrivere: { chiave: string; nome: string; destinatario: string; testo: string }[] = [];

  for (const c of candidati) {
    if (daScrivere.length >= a.limiteGiro) break;
    const { recapito, consenso } = recapitoE(a.canale, c);

    if (c.bloccato) {
      salta("bloccato: non contattare");
      continue;
    }
    if (a.soloConsenso && !consenso) {
      salta(`nessun consenso per ${nomeCanale(a.canale)}`);
      continue;
    }
    if (!recapito) {
      salta(`nessun recapito per ${nomeCanale(a.canale)}`);
      continue;
    }
    if (giaInQuesta.has(c.chiave)) {
      salta("già in questa automazione");
      continue;
    }
    if (scrittiDiRecente.has(c.chiave)) {
      salta(`scritto da meno di ${a.giorniSilenzio} giorni`);
      continue;
    }

    daScrivere.push({
      chiave: c.chiave,
      nome: c.nome ?? "",
      destinatario: recapito,
      testo: componiMessaggio(testo, c, valori, dichiarate),
    });
  }

  esito.preparati = daScrivere.length;
  esito.messaggi = daScrivere.map((m) => ({ chiave: m.chiave, nome: m.nome, recapito: m.destinatario, testo: m.testo }));

  if (!anteprima && daScrivere.length > 0) {
    await prisma.messaggioAutomazione.createMany({
      data: daScrivere.map((m) => ({
        automazioneId: a.id,
        chiave: m.chiave,
        nome: m.nome,
        destinatario: m.destinatario,
        testo: m.testo,
        oggetto: testoDaMandare(a).oggetto,
        stato: "pronto",
      })),
    });
    await prisma.automazione.update({ where: { id: a.id }, data: { ultimoGiro: new Date() } });
  }

  return esito;
}

// Riepilogo di un'automazione per l'elenco.
export async function riepilogoAutomazione(id: string): Promise<{ pronti: number; inviati: number }> {
  const [pronti, inviati] = await Promise.all([
    prisma.messaggioAutomazione.count({ where: { automazioneId: id, stato: "pronto" } }),
    prisma.messaggioAutomazione.count({ where: { automazioneId: id, stato: "inviato" } }),
  ]);
  return { pronti, inviati };
}

export function nomeCanaleAutomazione(canale: string): string {
  return CANALI.find((c) => c.chiave === canale)?.nome ?? canale;
}
