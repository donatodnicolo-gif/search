"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { registra } from "./registro";
import { euro } from "./format";
import { nomeMese } from "./calc";
import { richiediPagamentoPartner, transactionsConfigurato } from "./transactions";

// «Richiedi pagamento»: manda a **deluxy-transactions** la richiesta di pagare
// il dovuto del mese a un partner.
//
// Cosa NON fa, di proposito: non segna il mese come pagato. Il denaro non è
// ancora uscito — uscirà solo se una persona approva dentro Transactions. Se
// qui scrivessimo subito il bonifico, il registro direbbe «pagato» mentre in
// banca non è successo niente, ed è esattamente il tipo di bugia che poi
// nessuno riesce più a smontare. Il bonifico si scrive quando Transactions
// notifica lo stato `pagata` (vedi /api/pagamenti/notifica), o a mano con
// «Annota pagato».

function torna(destinazione: string, chiave: string, valore: string): never {
  revalidatePath("/", "layout");
  redirect(`${destinazione}${destinazione.includes("?") ? "&" : "?"}${chiave}=${encodeURIComponent(valore)}`);
}

export async function richiediPagamento(
  partnerId: string,
  anno: number,
  mese: number,
  importo: number,
  destinazione = "/"
) {
  if (!transactionsConfigurato()) {
    torna(destinazione, "errorePag", "Transactions non è collegata: mancano TRANSACTIONS_API_KEY e TRANSACTIONS_HMAC_SECRET.");
  }
  if (!(importo >= 0.01)) torna(destinazione, "errorePag", "Importo non valido: non c'è niente da pagare.");

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { nome: true, ragioneSociale: true, iban: true },
  });
  if (!partner) torna(destinazione, "errorePag", "Partner non trovato.");
  const iban = (partner.iban ?? "").replace(/\s+/g, "");
  if (!iban) {
    // Meglio fermarsi qui che far arrivare a Transactions una richiesta che non
    // può essere pagata: là dentro diventerebbe una pratica ferma che qualcuno
    // deve rincorrere.
    torna(destinazione, "errorePag", `${partner.nome} non ha un IBAN in anagrafica: aggiungilo prima di chiedere il pagamento.`);
  }

  const precedente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    select: { richiestaTentativi: true },
  });
  const tentativo = (precedente?.richiestaTentativi ?? 0) + 1;

  const beneficiario = partner.ragioneSociale?.trim() || partner.nome;
  const esito = await richiediPagamentoPartner({
    partnerId,
    beneficiario,
    iban,
    importo,
    anno,
    mese,
    causale: `Saldo ${nomeMese(mese)} ${anno} - ${partner.nome}`,
    note: `Dovuto al partner per ${nomeMese(mese)} ${anno}, richiesto da Deluxy Finance.`,
    tentativo,
  });

  if (!esito.ok) torna(destinazione, "errorePag", esito.errore);

  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    update: { richiestaRif: esito.riferimento, richiestaStato: esito.stato, richiestaIl: new Date(), richiestaTentativi: tentativo },
    create: { partnerId, anno, mese, richiestaRif: esito.riferimento, richiestaStato: esito.stato, richiestaIl: new Date(), richiestaTentativi: tentativo },
  });

  await registra({
    azione: `Richiesto a Transactions il pagamento di ${euro(importo)} a ${partner.nome}`,
    categoria: "pagamenti",
    entita: "saldo",
    entitaId: `${partnerId}:${anno}:${mese}`,
    partner: partner.nome,
    dettaglio: `${esito.riferimento} · ${nomeMese(mese)} ${anno}${esito.ripetuta ? " · richiesta già esistente, non duplicata" : ""}`,
  });

  torna(destinazione, "richiesta", `${esito.riferimento}|${esito.ripetuta ? "gia" : "nuova"}`);
}
