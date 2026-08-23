import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { testoKeywordPulito } from "@/lib/dominio";
import { registra } from "@/lib/registro";

// POST /api/v1/operazioni/:id/esito — lo script riferisce com'è andata.
// Se l'operazione è riuscita, l'app registra la Modifica (che fa partire il
// blackout di 72h) e crea da sola le verifiche a +24h e +72h del doc 11.
// Body: { riuscita*: bool, dettaglio?, prima?, dopo? }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;
  const { id } = await ctx.params;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  const operazione = await prisma.operazioneAdv.findUnique({ where: { id } });
  if (!operazione) return erroreApi(404, "Operazione non trovata");
  if (operazione.stato === "eseguita") {
    return NextResponse.json({ operazione, nota: "già registrata come eseguita" });
  }

  const riuscita = body.riuscita === true;
  const aggiornata = await prisma.operazioneAdv.update({
    where: { id },
    data: {
      stato: riuscita ? "eseguita" : "fallita",
      eseguitaIl: new Date(),
      esito: body.dettaglio ?? (riuscita ? "eseguita" : "fallita"),
      prima: body.prima ?? operazione.prima,
    },
  });

  // Lo stato del gruppo sulla piattaforma segue l'esito: è l'unico modo che ha
  // l'app di sapere che quel gruppo adesso è davvero fermo.
  if (riuscita && operazione.gruppoId) {
    await prisma.gruppo
      .update({
        where: { id: operazione.gruppoId },
        data: {
          statoPiattaforma: operazione.tipo === "pausa_gruppo" ? "PAUSED" : "ENABLED",
          stato: operazione.tipo === "pausa_gruppo" ? "in_pausa" : "attivo",
        },
      })
      .catch(() => {});
  }

  // ⚠️ Lo stesso per le KEYWORD, che qui mancava del tutto: si aggiornavano
  // gruppo e campagna, non la parola. Risultato a schermo: «azione decisa: in
  // pausa», «su Google: in pausa» e nella colonna Stato ancora **Attiva** —
  // tre caselle sulla stessa riga che si contraddicevano.
  //
  // Non è la piattaforma che sovrascrive il nostro giudizio: la pausa **l'ho
  // chiesta io**, ed è stata eseguita. Registrare la nostra stessa decisione è
  // il contrario di farsela cancellare da un import.
  if (riuscita && (operazione.tipo === "pausa_keyword" || operazione.tipo === "attiva_keyword")) {
    const inPausa = operazione.tipo === "pausa_keyword";
    const dati = {
      stato: inPausa ? "in_pausa" : "attiva",
      statoPiattaforma: inPausa ? "PAUSED" : "ENABLED",
    };
    // Per id di piattaforma quando c'è: è l'unico aggancio che non sbaglia.
    // Altrimenti per testo ripulito dentro la stessa campagna — la stessa
    // parola può esistere con corrispondenze diverse, e vanno tutte.
    if (operazione.idEsterno) {
      await prisma.copyAnnuncio
        .updateMany({ where: { tipo: "keyword", idEsterno: operazione.idEsterno }, data: dati })
        .catch(() => {});
    } else if (operazione.campagnaId) {
      const c = await prisma.campagna.findUnique({
        where: { id: operazione.campagnaId },
        select: { nome: true },
      });
      const pulito = testoKeywordPulito(operazione.bersaglio);
      if (c && pulito) {
        await prisma.copyAnnuncio
          .updateMany({
            where: { tipo: "keyword", campagna: c.nome, testo: { startsWith: pulito } },
            data: dati,
          })
          .catch(() => {});
      }
    }
  }

  if (riuscita && operazione.campagnaId) {
    const campagna = await prisma.campagna.findUnique({ where: { id: operazione.campagnaId } });
    if (campagna) {
      // Paper-trail + blackout 72h: la modifica esiste solo se è avvenuta davvero.
      await prisma.modifica.create({
        data: {
          campagnaId: campagna.id,
          livello: operazione.livello,
          descrizione: `${operazione.tipo} su ${operazione.bersaglio} (eseguita da ${cliente.nome})`,
          prima: body.prima ?? operazione.prima,
          dopo: body.dopo ?? null,
          autore: cliente.nome,
        },
      });
      // Lo stato dell'app segue quello reale della piattaforma
      if (operazione.tipo === "nuova_campagna") {
        // Creata sulla piattaforma via bulk upload: nasce sempre in pausa
        await prisma.campagna.update({ where: { id: campagna.id }, data: { stato: "in_pausa" } });
      } else if (operazione.tipo === "pausa_campagna") {
        await prisma.campagna.update({ where: { id: campagna.id }, data: { stato: "in_pausa" } });
      } else if (operazione.tipo === "attiva_campagna") {
        await prisma.campagna.update({ where: { id: campagna.id }, data: { stato: "attiva" } });
      } else if (operazione.tipo === "budget") {
        const p = operazione.parametri ? JSON.parse(operazione.parametri) : {};
        if (p.budget != null) {
          await prisma.campagna.update({
            where: { id: campagna.id },
            data: { budgetGiornaliero: Number(p.budget) },
          });
        }
      }
      // ── L'ACCENSIONE SI METTE IN CODA DA SOLA ────────────────────────
      //
      // Il lancio finisce con la campagna IN PAUSA, ed è giusto: fra
      // «creata» e «accesa» c'è il momento in cui si guarda cosa è entrato
      // davvero. Su [Deluxyflowers] - WORLD - ENG quel momento è servito tre
      // volte — la campagna rifiutata in silenzio da Google, il gruppo che
      // l'app non trovava, l'annuncio col titolo doppio.
      //
      // Quello che mancava non era l'automatismo: era che l'ultimo passo
      // fosse VISIBILE. Bisognava sapere da soli che dopo il lancio restava
      // un interruttore, e cercarselo in un modulo in fondo alla scheda.
      // Adesso il completamento propone l'accensione: nasce **da
      // approvare**, come tutto il resto.
      //
      // ⚠️ IN CODA, NON ESEGUITA. Approvarla da sé vorrebbe dire far partire
      // la spesa senza che nessuno abbia guardato: è esattamente il cancello
      // che ha salvato questa campagna tre volte.
      if (operazione.tipo === "completa_campagna") {
        await proponiAccensione(campagna, operazione.esito ?? null);
      }

      for (const ore of [24, 72]) {
        await prisma.azione.create({
          data: {
            titolo: `Verifica +${ore}h dopo "${operazione.tipo}" su ${campagna.nome}`,
            descrizione: `Operazione eseguita sulla piattaforma il ${new Date().toLocaleString("it-IT")}. Controllare erogazione, costo per conversione e che non siano scattati alert.`,
            brand: campagna.brand,
            canale: campagna.canale,
            priorita: ore === 24 ? "alta" : "media",
            owner: "utente",
            scadenza: new Date(Date.now() + ore * 3600_000),
            campagnaId: campagna.id,
            eventi: {
              create: { tipo: "creazione", autore: "sistema", testo: `Verifica automatica dopo l'esecuzione (doc 11 §3.5)` },
            },
          },
        });
      }
    }
  }

  // Se l'operazione nasceva da un'azione del kanban, la si chiude col paper-trail.
  if (riuscita && operazione.azioneId) {
    await prisma.azione
      .update({
        where: { id: operazione.azioneId },
        data: {
          stato: "fatta",
          fattoIl: new Date(),
          dopo: body.dopo ?? null,
          eventi: {
            create: { tipo: "stato", da: "in_corso", a: "fatta", autore: cliente.nome, testo: "Eseguita sulla piattaforma dallo script" },
          },
        },
      })
      .catch(() => {});
  }

  await registra({
    autore: cliente.nome,
    tipo: "stato",
    entita: "operazione",
    entitaId: id,
    titolo: `${riuscita ? "Eseguita" : "FALLITA"}: ${operazione.tipo} su ${operazione.bersaglio}`,
    dettaglio: body.dettaglio ?? null,
  });
  return NextResponse.json({ operazione: aggiornata });
}

/**
 * Mette in coda l'accensione della campagna appena lanciata.
 *
 * Tre cose che NON fa, e sono il punto:
 *  · non approva (la spesa parte quando lo decide una persona);
 *  · non tocca lo stato dell'app (quello lo scrive Google quando accade);
 *  · non insiste: se una accensione è già in coda o la campagna su Google è
 *    già accesa, non fa niente.
 *
 * ⚠️ Gli avvisi viaggiano CON l'operazione, perché chi approva può essere
 * un'altra persona un altro giorno: le negative non ancora approvate e i
 * problemi lasciati indietro dal completamento sono esattamente quello che
 * bisogna sapere prima di accendere. Il 23/08/2026 la WORLD-ENG è stata accesa
 * con 5 negative ferme in coda dal 19: ha erogato senza quelle esclusioni.
 */
async function proponiAccensione(
  campagna: { id: string; nome: string; canale: string | null; account: string | null; idEsterno: string | null; statoPiattaforma: string | null },
  esitoCompletamento: string | null
) {
  // Già accesa su Google: non c'è niente da proporre.
  if (campagna.statoPiattaforma === "ENABLED") return;

  const gia = await prisma.operazioneAdv.findFirst({
    where: {
      campagnaId: campagna.id,
      tipo: "attiva_campagna",
      stato: { in: ["in_attesa", "approvata"] },
    },
  });
  if (gia) return;

  const negativeFerme = await prisma.operazioneAdv.count({
    where: { campagnaId: campagna.id, tipo: "negativa", stato: "in_attesa" },
  });

  const avvisi = [
    negativeFerme > 0
      ? `${negativeFerme} negative sono ancora da approvare: accendendo adesso la campagna eroga SENZA quelle esclusioni.`
      : null,
    esitoCompletamento && /ATTENZIONE|RIFIUTAT|non trovate|ambigu/i.test(esitoCompletamento)
      ? `Il completamento aveva lasciato qualcosa indietro: ${esitoCompletamento.slice(0, 200)}`
      : null,
  ].filter(Boolean).join(" · ");

  const op = await prisma.operazioneAdv.create({
    data: {
      tipo: "attiva_campagna",
      canale: campagna.canale ?? "google_ads",
      account: campagna.account,
      bersaglio: campagna.nome,
      idEsterno: campagna.idEsterno,
      campagnaId: campagna.id,
      parametri: JSON.stringify({}),
      motivo:
        "Proposta dall'app: il lancio è completo e la campagna è ancora in pausa. " +
        "Da approvare quando quello che è stato creato convince.",
      avvisi: avvisi || null,
      // ⚠️ L2: accendere una campagna fa partire la spesa. Non è una modifica
      // leggera solo perché è un interruttore.
      livello: "L2",
      prima: "in pausa",
      richiestaDa: "app",
      stato: "in_attesa",
    },
  });
  await registra({
    autore: "sistema",
    tipo: "creazione",
    entita: "operazione",
    entitaId: op.id,
    titolo: `In coda (da approvare): accendi «${campagna.nome}»`,
    dettaglio:
      "Il lancio è completo e la campagna è ancora in pausa. L'app propone l'accensione: " +
      "parte solo dopo l'approvazione." + (avvisi ? ` ⚠️ ${avvisi}` : ""),
  });
}
