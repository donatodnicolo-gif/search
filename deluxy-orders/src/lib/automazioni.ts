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

// I segnaposto che si possono scrivere nello script.
export const SEGNAPOSTO = [
  { chiave: "nome", spiega: "il nome del cliente (o «Gentile cliente» se non lo sappiamo)" },
  { chiave: "citta", spiega: "la città dell'ultima consegna" },
  { chiave: "brand", spiega: "il negozio da cui ha comprato l'ultima volta" },
  { chiave: "ultimo_ordine", spiega: "la data dell'ultimo ordine (es. 12 mar 26)" },
  { chiave: "giorni", spiega: "quanti giorni sono passati dall'ultimo ordine" },
  { chiave: "ordini", spiega: "quanti ordini ha fatto" },
  { chiave: "speso", spiega: "quanto ha speso in totale" },
] as const;

// Sostituisce i segnaposto con i dati di quel cliente. Un segnaposto che non
// esiste resta scritto com'è: meglio vederlo nell'anteprima che scoprire di
// aver mandato «Ciao {{nomee}}» a trecento persone.
export function componiMessaggio(script: string, c: Cliente): string {
  const valori: Record<string, string> = {
    nome: (c.nome ?? "").trim() || "Gentile cliente",
    citta: c.citta ?? "",
    brand: c.brand[0] ?? "",
    ultimo_ordine: dataBreve(c.ultimoOrdine),
    giorni: String(c.giorni),
    ordini: String(c.ordini),
    speso: euro(c.speso),
  };
  return script.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (intero, chiave: string) =>
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
  script: string;
  oggetto: string;
  giorniSilenzio: number;
  limiteGiro: number;
  soloConsenso: boolean;
};

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
  if (!a.script.trim()) {
    esito.errore = "Lo script è vuoto: non c'è niente da mandare.";
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
      testo: componiMessaggio(a.script, c),
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
        oggetto: a.oggetto,
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
