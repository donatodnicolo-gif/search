import { prisma } from "./db";
import { etichettaSistema, SISTEMA_UI } from "./sistemi";
import { emailiVisibili } from "./squadre";
import { STATI_CHIUSI } from "./stati";

// ── COSA È SUCCESSO DA QUANDO GUARDAVO L'ULTIMA VOLTA ──
//
// Sistema di notifiche in-app canonico Deluxy (Libro UX&UI §7); implementazione
// di riferimento: Customer Service (deluxy-messaging, src/lib/novita.ts).
//
// ⚠️⚠️ NON ESISTE UNA TABELLA DEGLI EVENTI, ED È VOLUTO. Le novità si ricavano
// dai fatti che sono già scritti (la task, con la sua `creataIl`): una
// tabella-copia degli eventi sarebbe un secondo racconto della stessa cosa,
// che va scritto in ogni punto dove succede qualcosa — cioè che prima o poi
// qualcuno dimentica. (Standard Deluxy §7: ogni dato ha una casa sola.)
//
// ⚠️ Sta in una libreria e non dentro le rotte perché è la parte che si può
// PROVARE: le rotte sono dietro alla sessione, e una prova che deve prima
// autenticarsi non la scrive nessuno.

/** Quante novità per giro, al massimo. Oltre, il client dice «più di N». */
const TETTO = 10;
/** «Urgente» = una scadenza entro TRE giorni: oltre non è più un allarme. */
const GIORNI_URGENTE = 3;

export type Novita = {
  /** Stabile: `task:id`. Serve al client per non mostrare due volte la stessa cosa. */
  id: string;
  titolo: string;
  dettaglio: string;
  quando: string;
  link: string;
  gravita: "info" | "attenzione";
  /** Email di chi ha originato la cosa, se nota: il client non ripete a uno ciò che ha fatto lui. */
  autore: string | null;
};

/** Chi sta guardando: decide quali task si vedono (stessa regola della pagina). */
export type Sguardo = { admin: boolean; email: string | null };

// La visibilità è la STESSA della schermata delle attività (src/app/page.tsx):
// l'admin vede tutto, gli altri sé e la propria squadra. Due regole diverse per
// la stessa domanda direbbero due cose diverse.
async function filtroVisibilita(sguardo: Sguardo): Promise<{ utenteEmail?: { in: string[] } }> {
  if (sguardo.admin || !sguardo.email) return {};
  return { utenteEmail: { in: await emailiVisibili(sguardo.email) } };
}

// ── L'OROLOGIO È QUELLO DEL DATABASE ──
//
// ⚠️⚠️ Non quello del browser e nemmeno quello di questa funzione: le date delle
// righe le scrive il database (`@default(now())`), e il segnaposto va confrontato
// con loro. Il client riceve `adesso` e lo rimanda alla chiamata dopo: così il
// confronto è sempre fra due letture dello stesso orologio.
async function oraDelDatabase(): Promise<Date> {
  try {
    const r = await prisma.$queryRaw<{ now: Date }[]>`select now()`;
    if (r?.[0]?.now) return new Date(r[0].now);
  } catch {
    // se il database non dice l'ora, quella di qui è meglio di niente
  }
  return new Date();
}

/**
 * Le attività ARRIVATE DALLE ALTRE APP fra `da` e adesso (per i riquadri in
 * basso a destra). Quelle nate qui dalla UI (`sistema = "tasks"`) non si
 * annunciano: chi ha premuto «Nuova attività» sa benissimo di averla creata.
 */
export async function novitaDa(
  da: Date | null,
  sguardo: Sguardo,
): Promise<{ adesso: string; novita: Novita[]; troncato: boolean }> {
  const adesso = await oraDelDatabase();

  // ⚠️⚠️ LA PRIMA CHIAMATA NON MOSTRA NIENTE: senza `da` si torna solo il
  // segnaposto. Sparare le novità delle ultime ore a ogni ricarica insegna in
  // due giorni che quei riquadri non vogliono dire niente.
  if (!da || Number.isNaN(da.getTime())) {
    return { adesso: adesso.toISOString(), novita: [], troncato: false };
  }

  // ⚠️ Finestra CHIUSA in cima (`lte: adesso`), con `adesso` letto PRIMA della
  // query: una riga scritta mentre questa gira non si perde e non si ripete —
  // esce al giro dopo, perché il prossimo `da` è proprio questo `adesso`.
  const arrivate = await prisma.task.findMany({
    where: {
      creataIl: { gt: da, lte: adesso },
      sistema: { not: SISTEMA_UI },
      attiva: true,
      ...(await filtroVisibilita(sguardo)),
    },
    select: {
      id: true,
      sistema: true,
      titolo: true,
      utenteNome: true,
      utenteEmail: true,
      priorita: true,
      creataIl: true,
      creataDa: true,
    },
    orderBy: { creataIl: "desc" },
    // ⚠️ Un tetto anche al passato: se una scheda resta in pausa per un giorno,
    // `da` è vecchissimo e senza questo si leggerebbero migliaia di righe.
    take: TETTO + 1,
  });

  const troncato = arrivate.length > TETTO;
  const breve = (t: string, n = 90) => {
    const pulito = (t || "").replace(/\s+/g, " ").trim();
    return pulito.length > n ? pulito.slice(0, n - 1) + "…" : pulito;
  };

  const novita: Novita[] = arrivate.slice(0, TETTO).map((t) => ({
    id: `task:${t.id}`,
    titolo: `Attività da ${etichettaSistema(t.sistema)}`,
    dettaglio:
      breve(t.titolo) + (t.utenteNome || t.utenteEmail ? ` · per ${t.utenteNome ?? t.utenteEmail}` : ""),
    quando: t.creataIl.toISOString(),
    link: "/",
    // ⚠️ In attenzione solo l'urgente: se sono arancioni tutte, non lo è nessuna.
    gravita: t.priorita === "urgente" ? "attenzione" : "info",
    autore: t.creataDa ?? null,
  }));

  return { adesso: adesso.toISOString(), novita, troncato };
}

export type SezioneMenu = {
  /** La data della cosa più recente che c'è. Stringa vuota = non c'è niente. */
  ultimo: string;
  /** Quanto lavoro aspetta in quella sezione. 0 = niente. */
  quanti: number;
  /** Qualcosa lì dentro ha una scadenza vicina. */
  urgente: boolean;
};

/**
 * Per la voce «Attività» del menu: la data dell'attività più recente (per il
 * pallino) e quante restano da fare (per il numero).
 *
 * ⚠️⚠️ I DUE SEGNALI DICONO COSE DIVERSE: il pallino è «è arrivato qualcosa da
 * quando hai guardato», il numero è «quanto lavoro c'è». Una sezione può avere
 * venti cose ferme da ieri (numero, niente pallino) o una novità che un collega
 * ha già chiuso (pallino, niente numero).
 *
 * ⚠️ Il conteggio è lo STESSO della vista di default della pagina (attiva, stato
 * non chiuso, la mia squadra se non sono admin): due modi di contare la stessa
 * cosa produrrebbero due numeri diversi sullo stesso schermo.
 */
export async function sezioniDelMenu(sguardo: Sguardo): Promise<Record<string, SezioneMenu>> {
  const visibilita = await filtroVisibilita(sguardo);
  const aperte = { attiva: true, stato: { notIn: [...STATI_CHIUSI] }, ...visibilita };
  // Una scadenza a tre giorni non è «una in più»: è la cosa da fare per prima.
  const fraTreGiorni = new Date(Date.now() + GIORNI_URGENTE * 24 * 3600 * 1000);

  const [ultima, quante, inScadenza] = await Promise.all([
    // ⚠️ La data più recente si legge sulle stesse righe che la pagina mostra
    // (aperte e attive): così chiudendo l'ultima arrivata il pallino non
    // segnala come «novità» qualcosa che è sparito dall'elenco.
    prisma.task.findFirst({ where: aperte, orderBy: { creataIl: "desc" }, select: { creataIl: true } }),
    prisma.task.count({ where: aperte }),
    prisma.task.count({ where: { ...aperte, scadenza: { not: null, lte: fraTreGiorni } } }),
  ]);

  return {
    "/": {
      ultimo: ultima ? ultima.creataIl.toISOString() : "",
      quanti: quante,
      urgente: inScadenza > 0,
    },
  };
}
