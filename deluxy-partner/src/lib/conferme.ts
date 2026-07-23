// Conferma a due passaggi dei pagamenti.
//
// Ogni registrazione di un'USCITA di denaro non parte subito: l'app congela
// l'operazione, manda un codice di 6 cifre via email al responsabile e la esegue
// solo quando quel codice viene digitato. Serve a evitare che un clic solo (o
// una sessione lasciata aperta) registri un pagamento per sbaglio.
//
// Regole:
//   - il codice vale 15 minuti e una volta sola;
//   - dopo 5 tentativi sbagliati la richiesta si brucia e va rifatta;
//   - in chiaro il codice non viene mai salvato (solo lo SHA-256);
//   - se l'email non parte, il pagamento NON si registra: il controllo fallisce
//     "chiuso", altrimenti non sarebbe un controllo.

import { createHash, randomInt } from "crypto";
import { prisma } from "./db";
import { euro } from "./format";
import { inviaEmail, smtpConfigurato } from "./mail";
import { attoreCorrente, registra } from "./registro";
import { eseguiBonificoMese, eseguiPagamentoDiretto } from "./pagamenti-core";

/** Destinatario dei codici. Si cambia in Impostazioni (chiave `conferme.email`). */
export const EMAIL_CONFERME_DEFAULT = "nicolo.donato@deluxy.it";
export const CHIAVE_EMAIL_CONFERME = "conferme.email";

export const VALIDITA_MINUTI = 15;
export const TENTATIVI_MASSIMI = 5;

export async function emailConferme(): Promise<string> {
  const r = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE_EMAIL_CONFERME } });
  return r?.valore?.trim() || EMAIL_CONFERME_DEFAULT;
}

const hash = (codice: string) => createHash("sha256").update(`deluxy-conferma::${codice}`).digest("hex");

// ---------- Operazioni che richiedono conferma ----------
// La chiave identifica l'operazione; `payload` ne porta i parametri. Il dispatcher
// più sotto è l'UNICO punto da cui queste operazioni partono davvero.

export type AzioneConferma =
  | { tipo: "bonifico_mese"; partnerId: string; anno: number; mese: number; importo: number; dataIso?: string; origine: string }
  | { tipo: "pagamento_diretto"; id: string; dataIso?: string };

export type EsitoRichiesta =
  | { ok: true; id: string }
  | { ok: false; errore: string };

// Crea la richiesta e manda il codice. Non esegue niente.
export async function richiediConferma(opts: {
  azione: AzioneConferma;
  descrizione: string;
  importo?: number;
  ritornoUrl?: string;
}): Promise<EsitoRichiesta> {
  const email = await emailConferme();

  // Fallire "chiuso": senza email funzionante non si registra nessun pagamento.
  if (!(await smtpConfigurato())) {
    return {
      ok: false,
      errore:
        "Impossibile mandare il codice di conferma: SMTP non configurato (mancano password e mittente in Impostazioni → Email solleciti). Finché non è configurato i pagamenti restano bloccati.",
    };
  }

  const codice = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const attore = await attoreCorrente();
  const richiesta = await prisma.confermaPagamento.create({
    data: {
      azione: opts.azione.tipo,
      payload: JSON.stringify(opts.azione),
      descrizione: opts.descrizione,
      importo: opts.importo ?? null,
      email,
      codiceHash: hash(codice),
      scadeIl: new Date(Date.now() + VALIDITA_MINUTI * 60_000),
      richiestaDa: attore.utente,
      ritornoUrl: opts.ritornoUrl ?? null,
    },
  });

  try {
    await inviaEmail({
      to: email,
      subject: `Codice di conferma pagamento: ${codice}`,
      text: [
        "È stata richiesta la registrazione di un pagamento su Deluxy Partner.",
        "",
        `Operazione: ${opts.descrizione}`,
        opts.importo != null ? `Importo: ${euro(opts.importo)}` : "",
        `Richiesta da: ${attore.utente}`,
        "",
        `CODICE DI CONFERMA: ${codice}`,
        "",
        `Il codice vale ${VALIDITA_MINUTI} minuti e una volta sola.`,
        "Se non sei stato tu, ignora questa email: senza il codice il pagamento non viene registrato.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (e) {
    // niente email = niente pagamento: si annulla subito la richiesta
    await prisma.confermaPagamento.update({
      where: { id: richiesta.id },
      data: { annullatoIl: new Date() },
    });
    return { ok: false, errore: `Invio del codice fallito: ${(e as Error).message}` };
  }

  await registra({
    azione: `Richiesto codice di conferma per un pagamento (${opts.descrizione})`,
    categoria: "pagamenti",
    dettaglio: `Codice inviato a ${email}`,
  });
  return { ok: true, id: richiesta.id };
}

export type EsitoConferma =
  | { ok: true; ritornoUrl: string | null }
  | { ok: false; errore: string; tentativiRimasti?: number };

// Verifica il codice ed esegue l'operazione. Unico punto da cui parte davvero.
export async function confermaEsegui(id: string, codice: string): Promise<EsitoConferma> {
  const r = await prisma.confermaPagamento.findUnique({ where: { id } });
  if (!r) return { ok: false, errore: "Richiesta non trovata." };
  if (r.confermatoIl) return { ok: false, errore: "Questa richiesta è già stata confermata: il pagamento è già registrato." };
  if (r.annullatoIl) return { ok: false, errore: "Richiesta annullata: rifai il pagamento dall'inizio." };
  if (r.scadeIl < new Date()) return { ok: false, errore: `Codice scaduto (valeva ${VALIDITA_MINUTI} minuti): rifai il pagamento dall'inizio.` };
  if (r.tentativi >= TENTATIVI_MASSIMI) {
    return { ok: false, errore: "Troppi tentativi sbagliati: questa richiesta è stata bloccata, rifai il pagamento dall'inizio." };
  }

  const pulito = codice.replace(/\D/g, "");
  if (pulito.length !== 6 || hash(pulito) !== r.codiceHash) {
    const agg = await prisma.confermaPagamento.update({
      where: { id },
      data: { tentativi: { increment: 1 }, ...(r.tentativi + 1 >= TENTATIVI_MASSIMI ? { annullatoIl: new Date() } : {}) },
    });
    const rimasti = Math.max(0, TENTATIVI_MASSIMI - agg.tentativi);
    await registra({
      azione: `Codice di conferma errato (${r.descrizione})`,
      categoria: "pagamenti",
      dettaglio: rimasti ? `${rimasti} tentativi rimasti` : "richiesta bloccata dopo troppi tentativi",
    });
    return {
      ok: false,
      errore: rimasti
        ? `Codice errato. Restano ${rimasti} tentativi.`
        : "Codice errato. Richiesta bloccata dopo troppi tentativi: rifai il pagamento dall'inizio.",
      tentativiRimasti: rimasti,
    };
  }

  // Marca PRIMA di eseguire: così un doppio invio non registra il pagamento due volte.
  const preso = await prisma.confermaPagamento.updateMany({
    where: { id, confermatoIl: null, annullatoIl: null },
    data: { confermatoIl: new Date() },
  });
  if (preso.count === 0) return { ok: false, errore: "Questa richiesta è già stata usata." };

  const azione = JSON.parse(r.payload) as AzioneConferma;
  await esegui(azione);
  await registra({
    azione: `Pagamento confermato via codice email: ${r.descrizione}`,
    categoria: "pagamenti",
    dettaglio: r.importo != null ? euro(r.importo) : null,
  });
  return { ok: true, ritornoUrl: r.ritornoUrl };
}

// Dispatcher: traduce l'azione congelata nella funzione che la esegue.
async function esegui(a: AzioneConferma): Promise<void> {
  switch (a.tipo) {
    case "bonifico_mese":
      await eseguiBonificoMese({
        partnerId: a.partnerId,
        anno: a.anno,
        mese: a.mese,
        importo: a.importo,
        data: a.dataIso ? new Date(a.dataIso) : undefined,
        origine: a.origine,
      });
      return;
    case "pagamento_diretto":
      await eseguiPagamentoDiretto(a.id, a.dataIso ? new Date(a.dataIso) : undefined);
      return;
  }
}

export async function annullaConferma(id: string): Promise<void> {
  const r = await prisma.confermaPagamento.findUnique({ where: { id } });
  if (!r || r.confermatoIl) return;
  await prisma.confermaPagamento.update({ where: { id }, data: { annullatoIl: new Date() } });
  await registra({ azione: `Pagamento annullato prima della conferma (${r.descrizione})`, categoria: "pagamenti" });
}
