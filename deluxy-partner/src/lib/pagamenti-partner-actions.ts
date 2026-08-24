"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "./db";
import { registra } from "./registro";
import { euro } from "./format";
import { nomeMese } from "./calc";
import { richiediPagamentoPartner, riferimentoSaldo, transactionsConfigurato } from "./transactions";

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
//
// I controlli LOCALI (importo, partner, IBAN) rispondono subito; la chiamata a
// Transactions — che a freddo può impiegare secondi, timeout 15 s — parte DOPO
// la risposta (`after`): l'operatore non paga quell'attesa guardando «Invio…».
// Lo stato transitorio «invio» prenota il mese finché l'esito vero non è
// scritto; se l'invio fallisce, lo stato diventa «invio_fallito», il motivo
// finisce nel registro modifiche e il bottone torna disponibile.

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
  const periodo = `${nomeMese(mese)} ${anno}`;
  if (!transactionsConfigurato()) {
    torna(destinazione, "errorePag", `${periodo} — Transactions non è collegata: mancano TRANSACTIONS_API_KEY e TRANSACTIONS_HMAC_SECRET.`);
  }
  if (!(importo >= 0.01)) torna(destinazione, "errorePag", `${periodo} — importo non valido: non c'è niente da pagare.`);

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { nome: true, ragioneSociale: true, intestatarioConto: true, iban: true },
  });
  if (!partner) torna(destinazione, "errorePag", "Partner non trovato.");
  const iban = (partner.iban ?? "").replace(/\s+/g, "");
  if (!iban) {
    // Meglio fermarsi qui che far arrivare a Transactions una richiesta che non
    // può essere pagata: là dentro diventerebbe una pratica ferma che qualcuno
    // deve rincorrere.
    torna(destinazione, "errorePag", `${periodo} — ${partner.nome} non ha un IBAN in anagrafica: aggiungilo dalla scheda (Modifica, sezione dati bancari) e ripremi Paga.`);
  }

  const precedente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    select: { richiestaTentativi: true },
  });
  const tentativo = (precedente?.richiestaTentativi ?? 0) + 1;
  const riferimento = riferimentoSaldo(partnerId, anno, mese, tentativo);
  const chiaveMese = { partnerId_anno_mese: { partnerId, anno, mese } };

  await prisma.saldoMensile.upsert({
    where: chiaveMese,
    update: { richiestaRif: riferimento, richiestaStato: "invio", richiestaIl: new Date(), richiestaTentativi: tentativo },
    create: { partnerId, anno, mese, richiestaRif: riferimento, richiestaStato: "invio", richiestaIl: new Date(), richiestaTentativi: tentativo },
  });

  after(async () => {
    // Il beneficiario è il nome a cui esce il bonifico: prima l'intestatario del
    // conto (la banca rifiuta se non combacia con l'IBAN), poi la ragione
    // sociale, per ultima l'insegna.
    const beneficiario = partner.intestatarioConto?.trim() || partner.ragioneSociale?.trim() || partner.nome;
    try {
      const esito = await richiediPagamentoPartner({
        partnerId,
        beneficiario,
        iban,
        importo,
        anno,
        mese,
        causale: `Saldo ${periodo} - ${partner.nome}`,
        note: `Dovuto al partner per ${periodo}, richiesto da Deluxy Finance.`,
        tentativo,
      });

      if (esito.ok) {
        await prisma.saldoMensile.update({
          where: chiaveMese,
          data: { richiestaRif: esito.riferimento, richiestaStato: esito.stato },
        });
        await registra({
          azione: `Richiesto a Transactions il pagamento di ${euro(importo)} a ${partner.nome}`,
          categoria: "pagamenti",
          entita: "saldo",
          entitaId: `${partnerId}:${anno}:${mese}`,
          partner: partner.nome,
          dettaglio: `${esito.riferimento} · ${periodo}${esito.ripetuta ? " · richiesta già esistente, non duplicata" : ""}`,
        });
      } else {
        // Il badge sul mese dice che non è riuscito; il MOTIVO vero sta qui nel
        // registro, perché sul saldo non c'è un campo dove conservarlo.
        await prisma.saldoMensile.update({ where: chiaveMese, data: { richiestaStato: "invio_fallito" } });
        await registra({
          azione: `Richiesta a Transactions NON riuscita per ${partner.nome}`,
          categoria: "pagamenti",
          entita: "saldo",
          entitaId: `${partnerId}:${anno}:${mese}`,
          partner: partner.nome,
          dettaglio: `${periodo} · ${euro(importo)} · ${esito.errore}`,
        });
      }
    } catch (e) {
      // Anche un crash imprevisto deve lasciare il mese sbloccabile.
      console.warn("[pagamenti] invio a Transactions morto:", (e as Error).message);
      await prisma.saldoMensile
        .update({ where: chiaveMese, data: { richiestaStato: "invio_fallito" } })
        .catch(() => undefined);
    }
  });

  torna(destinazione, "richiesta", `invio|${periodo}`);
}
