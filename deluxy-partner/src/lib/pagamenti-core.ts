// Esecuzione VERA dei pagamenti (registrazione in app di un'uscita di denaro).
//
// Sta in un modulo separato — e volutamente NON marcato "use server" — perché è
// il codice che gira solo DOPO la conferma via email: se stesse fra le server
// action sarebbe esposto come endpoint e il controllo a due passaggi si potrebbe
// scavalcare chiamandolo direttamente. Qui ci arrivano solo:
//   - il dispatcher delle conferme (src/lib/conferme.ts), a codice confermato;
//   - le azioni che NON sono uscite di denaro (incassi ricevuti).

import { prisma } from "./db";
import { nomeMese } from "./calc";
import { euro } from "./format";
import { registraPagamento, rimuoviPagamento } from "./pagamenti-rif";
import { registra } from "./registro";
import type { SaldoMensile } from "@prisma/client";

// Riflette il bonifico di un mese-partner nel registro pagamenti: crea/aggiorna
// il riferimento se c'è un bonifico, lo rimuove se azzerato. bonificoImporto>0 =
// inviato al partner (out); <0 = ricevuto dal partner (in).
export async function aggiornaPagamentoDaSaldo(saldo: SaldoMensile) {
  if (!saldo.bonificoImporto || Math.abs(saldo.bonificoImporto) < 0.005) {
    await rimuoviPagamento("bonifico_partner", saldo.id);
    return;
  }
  const partner = await prisma.partner.findUnique({ where: { id: saldo.partnerId }, select: { nome: true } });
  const uscita = saldo.bonificoImporto > 0;
  await registraPagamento({
    tipo: "bonifico_partner",
    direzione: uscita ? "out" : "in",
    importo: Math.abs(saldo.bonificoImporto),
    data: saldo.bonificoData ?? saldo.dataPagamento ?? new Date(),
    origineId: saldo.id,
    controparte: partner?.nome ?? null,
    partnerId: saldo.partnerId,
    descrizione: `${uscita ? "Bonifico a" : "Incasso da"} ${partner?.nome ?? "partner"} — ${nomeMese(saldo.mese)} ${saldo.anno}`,
  });
}

async function nomePartner(partnerId: string): Promise<string | null> {
  return (await prisma.partner.findUnique({ where: { id: partnerId }, select: { nome: true } }))?.nome ?? null;
}

// Somma un bonifico al mese indicato. `importo` con segno secondo la convenzione
// interna: > 0 inviato al partner (uscita), < 0 ricevuto dal partner (entrata).
export async function eseguiBonificoMese(opts: {
  partnerId: string;
  anno: number;
  mese: number;
  importo: number;
  data?: Date;
  origine: string; // testo per il registro modifiche ("Paga rapido", "scheda partner"…)
}) {
  const { partnerId, anno, mese, importo, origine } = opts;
  const data = opts.data ?? new Date();
  const esistente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
  });
  const saldo = await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, bonificoImporto: importo, bonificoData: data, dataPagamento: data },
    update: {
      bonificoImporto: (esistente?.bonificoImporto ?? 0) + importo,
      bonificoData: data,
      dataPagamento: esistente?.dataPagamento ?? data,
    },
  });
  await aggiornaPagamentoDaSaldo(saldo);
  await registra({
    azione: `Registrato ${importo > 0 ? "bonifico al partner" : "incasso dal partner"} ${euro(Math.abs(importo))} (${nomeMese(mese)} ${anno}) — ${origine}`,
    categoria: "pagamenti",
    entita: "partner",
    entitaId: partnerId,
    partner: await nomePartner(partnerId),
  });
}

// Segna eseguito un pagamento diretto a fornitore (dopo il bonifico autorizzato
// in banca): il denaro è già uscito, qui se ne prende atto.
export async function eseguiPagamentoDiretto(id: string, data?: Date) {
  const quando = data && !isNaN(data.getTime()) ? data : new Date();
  const p = await prisma.pagamentoDiretto.update({
    where: { id },
    data: { stato: "pagato", dataPagamento: quando },
  });
  await registraPagamento({
    tipo: "pagamento_diretto",
    direzione: "out",
    importo: p.importo,
    data: p.dataPagamento ?? new Date(),
    origineId: p.id,
    controparte: p.beneficiario,
    descrizione: `Pagamento diretto a ${p.beneficiario}${p.fornitore ? ` (${p.fornitore})` : ""}`,
  });
  await registra({
    azione: `Pagamento diretto a ${p.beneficiario} segnato eseguito (${euro(p.importo)})`,
    categoria: "pagamenti",
    entita: "pagamento_diretto",
    entitaId: p.id,
  });
}
