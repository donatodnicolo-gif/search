import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  autentica,
  controllaIdempotenza,
  erroreApi,
  ipChiamante,
  memorizzaIdempotenza,
  rispostaApi,
} from "@/lib/api-auth";
import { creaRichiesta, type DatiRichiesta } from "@/lib/richieste";
import { ibanMascherato } from "@/lib/iban";

// POST /api/v1/richieste — un'app Deluxy chiede di pagare qualcuno.
// GET  /api/v1/richieste — le richieste create da quella stessa app.
//
// La chiamata deve essere firmata: vedi src/lib/api-auth.ts e docs/API.md.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await autentica(req, { scrittura: true });
  if (!auth.ok) return auth.risposta;
  const { cliente, corpo } = auth;

  const idem = await controllaIdempotenza(req, cliente.id, corpo);
  if (idem.tipo === "ripetuta") return idem.risposta;
  if (idem.tipo === "conflitto") return idem.risposta;

  // Il corpo arriva dal mondo: si tratta come dati grezzi e lo valida
  // creaRichiesta(), che è l'unico punto dove si decide cosa è accettabile.
  let dati: DatiRichiesta;
  try {
    dati = JSON.parse(corpo || "{}") as DatiRichiesta;
  } catch {
    return erroreApi(400, "Corpo JSON non valido.");
  }

  const esito = await creaRichiesta(dati, {
    origine: cliente.nome,
    chiaveApiId: cliente.id,
    tettoRichiesta: cliente.tettoRichiesta,
    tettoGiornaliero: cliente.tettoGiornaliero,
    attore: cliente.nome,
    ip: ipChiamante(req),
  });

  if (!esito.ok) return erroreApi(esito.stato, esito.errore);

  const risposta = {
    riferimento: esito.richiesta.riferimento,
    id: esito.richiesta.id,
    stato: esito.richiesta.stato,
    rischio: esito.richiesta.rischio,
    motiviRischio: esito.richiesta.motiviRischio,
    doppiaFirma: esito.richiesta.doppiaFirma,
    ripetuta: esito.ripetuta,
    // Promemoria per chi integra: da qui in poi decide una persona.
    nota: "Richiesta registrata. Nessun pagamento parte finché non è approvata da un operatore.",
  };
  await memorizzaIdempotenza(cliente.id, idem.chiave, corpo, risposta);
  return rispostaApi(risposta, esito.ripetuta ? 200 : 201);
}

export async function GET(req: NextRequest) {
  const auth = await autentica(req);
  if (!auth.ok) return auth.risposta;
  const { cliente } = auth;

  const url = new URL(req.url);
  const stato = url.searchParams.get("stato");
  const riferimentoEsterno = url.searchParams.get("riferimentoEsterno");
  // Pull di recupero (Standard §7.3.5): il webhook è un avviso, questo è il
  // canale con cui l'app di origine RITIRA i cambi che le sono sfuggiti —
  // «dammi tutto ciò che è cambiato da <istante>», annullate e rifiutate
  // comprese. Chi tiene uno specchio locale lo riconcilia da qui, nel cron.
  const aggiornateDaGrezzo = url.searchParams.get("aggiornateDa");
  let aggiornateDa: Date | null = null;
  if (aggiornateDaGrezzo) {
    aggiornateDa = new Date(aggiornateDaGrezzo);
    if (Number.isNaN(aggiornateDa.getTime())) {
      return erroreApi(400, "aggiornateDa non è una data valida (ISO 8601).");
    }
  }
  const limite = Math.min(200, Math.max(1, Number(url.searchParams.get("limite") ?? 50)));

  // Un'app vede solo le proprie richieste: nessuna può ispezionare quelle altrui.
  const richieste = await prisma.richiesta.findMany({
    where: {
      chiaveApiId: cliente.id,
      ...(stato ? { stato } : {}),
      ...(riferimentoEsterno ? { riferimentoEsterno } : {}),
      ...(aggiornateDa ? { aggiornataIl: { gt: aggiornateDa } } : {}),
    },
    // Col pull incrementale l'ordine è quello dei cambiamenti, dal più vecchio:
    // il chiamante avanza il suo segnalibro all'ultima riga ricevuta.
    orderBy: aggiornateDa ? { aggiornataIl: "asc" } : { creataIl: "desc" },
    take: limite,
  });

  return rispostaApi({
    totale: richieste.length,
    richieste: richieste.map((r) => ({
      id: r.id,
      riferimento: r.riferimento,
      riferimentoEsterno: r.riferimentoEsterno,
      stato: r.stato,
      importoCent: r.importoCent,
      valuta: r.valuta,
      beneficiario: r.beneficiario,
      metodo: r.metodo,
      // L'IBAN completo non torna indietro: l'app di origine l'ha già, e un
      // registro di risposte non deve diventare una lista di coordinate.
      iban: ibanMascherato(r.iban),
      causale: r.causale,
      rischio: r.rischio,
      pagatoCon: r.pagatoCon ?? null,
      creataIl: r.creataIl.toISOString(),
      aggiornataIl: r.aggiornataIl.toISOString(),
      decisaIl: r.decisaIl?.toISOString() ?? null,
      pagataIl: r.pagataIl?.toISOString() ?? null,
    })),
  });
}
