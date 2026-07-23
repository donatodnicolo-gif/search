import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
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
