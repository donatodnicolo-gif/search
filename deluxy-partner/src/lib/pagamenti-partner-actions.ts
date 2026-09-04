"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "./db";
import { registra } from "./registro";
import { euro } from "./format";
import { nomeMese } from "./calc";
import { richiediPagamentoPartner, riferimentoSaldo, transactionsConfigurato } from "./transactions";
import { datiBancariPartner, perchePagamentoSenzaIban } from "./dati-bancari";
import { partiteAperte, partiteDaChiedere, nettoDaChiedere, descriviPartite } from "./saldo-netto";

// «Richiedi pagamento»: manda a **deluxy-transactions** la richiesta di pagare
// il dovuto di un partner.
//
// Cosa NON fa, di proposito: non segna il mese come pagato. Il denaro non è
// ancora uscito — uscirà solo se una persona approva dentro Transactions. Se
// qui scrivessimo subito il bonifico, il registro direbbe «pagato» mentre in
// banca non è successo niente, ed è esattamente il tipo di bugia che poi
// nessuno riesce più a smontare. Il bonifico si scrive quando Transactions
// notifica lo stato `pagata` (vedi /api/pagamenti/notifica), o a mano con
// «Annota pagato».
//
// QUANTO si chiede (04/09/2026). Per un partner SENZA compensazione si chiede
// il dovuto del mese premuto. Per un partner IN COMPENSAZIONE si chiede il
// NETTO dell'anno: i mesi a credito del partner meno i mesi a suo debito — la
// stessa cifra che la scheda mostra nel totale dell'anno. L'importo che arriva
// dal bottone (`importo`) vale solo nel primo caso: nel secondo lo decide il
// server, perché il bottone sta su un mese e il netto sta sull'anno. Il caso
// che ha fatto nascere la regola: ANTOFLOWERS, agosto 2026, 185,22 € mandati
// contro 48,30 € netti (aprile e maggio a debito del partner per 405,30 €).
// Tutti i mesi coinvolti ricevono lo stesso riferimento di richiesta: così
// nessuno di loro mostra più «Paga» finché quella non ha un esito, e il webhook
// alla `pagata` li chiude tutti insieme.
//
// I controlli LOCALI (importo, partner, IBAN) rispondono subito; la chiamata a
// Transactions — che a freddo può impiegare secondi, timeout 15 s — parte DOPO
// la risposta (`after`): l'operatore non paga quell'attesa guardando «Invio…».
// Lo stato transitorio «invio» prenota i mesi finché l'esito vero non è
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

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { nome: true, ragioneSociale: true, intestatarioConto: true, iban: true, compensazione: true },
  });
  if (!partner) torna(destinazione, "errorePag", "Partner non trovato.");

  // Cosa si chiede davvero: il mese, oppure il netto dell'anno.
  let causale = `Saldo ${periodo} - ${partner.nome}`;
  let note = `Dovuto al partner per ${periodo}, richiesto da Deluxy Finance.`;
  let mesiCoinvolti = [mese];
  let dettaglioRegistro = periodo;
  if (partner.compensazione) {
    // I mesi che hanno GIÀ una richiesta in corso non entrano nel netto: la
    // loro cifra è già in coda su Transactions, contarla di nuovo la
    // chiederebbe due volte (verificato il 04/09 su 7 partner con luglio già
    // in attesa e agosto nuovo). Restano i mesi mai richiesti, a credito e a
    // debito, e quelli la cui richiesta è stata annullata o rifiutata.
    const tutte = await partiteAperte(partnerId, anno);
    const partite = partiteDaChiedere(tutte.partite, mese);
    const netto = nettoDaChiedere(tutte.partite, mese);
    if (netto < 0.01) {
      torna(
        destinazione,
        "errorePag",
        `${periodo} — in compensazione il partner deve ancora ${euro(-netto)} a Deluxy (${descriviPartite(partite)}): non c'è niente da bonificare.`
      );
    }
    importo = netto;
    mesiCoinvolti = partite.map((p) => p.mese);
    const spiegazione = descriviPartite(partite);
    causale = `Saldo netto ${anno} - ${partner.nome}`;
    note = `Netto in compensazione ${anno}: ${spiegazione} = ${euro(netto)}. Richiesto da Deluxy Finance (dal mese di ${periodo}).`;
    dettaglioRegistro = `netto ${anno} (${spiegazione})`;
  }
  if (!(importo >= 0.01)) torna(destinazione, "errorePag", `${periodo} — importo non valido: non c'è niente da pagare.`);

  // L'IBAN lo possiede il REGISTRO Anagrafiche; qui c'è al più una copia, e
  // quasi sempre non c'è (18 partner su 119 ce l'hanno). Prima si guardava solo
  // la copia, e «Paga» rifiutava su partner che l'IBAN ce l'hanno eccome.
  const banca = await datiBancariPartner(partnerId);
  const iban = banca.iban;
  if (!iban) {
    // Meglio fermarsi qui che far arrivare a Transactions una richiesta che non
    // può essere pagata: là dentro diventerebbe una pratica ferma che qualcuno
    // deve rincorrere.
    torna(destinazione, "errorePag", `${periodo} — ${perchePagamentoSenzaIban(banca, partner.nome)}`);
  }

  const precedente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    select: { richiestaTentativi: true },
  });
  const tentativo = (precedente?.richiestaTentativi ?? 0) + 1;
  const riferimento = riferimentoSaldo(partnerId, anno, mese, tentativo);
  const adesso = new Date();

  // Il mese premuto conta il tentativo; gli altri mesi coinvolti nel netto
  // ricevono solo il riferimento e lo stato, così mostrano «in corso» invece
  // del bottone e una seconda richiesta non può partire da lì.
  await prisma.$transaction(
    mesiCoinvolti.map((m) =>
      prisma.saldoMensile.upsert({
        where: { partnerId_anno_mese: { partnerId, anno, mese: m } },
        update: {
          richiestaRif: riferimento,
          richiestaStato: "invio",
          richiestaIl: adesso,
          ...(m === mese ? { richiestaTentativi: tentativo } : {}),
        },
        create: {
          partnerId,
          anno,
          mese: m,
          richiestaRif: riferimento,
          richiestaStato: "invio",
          richiestaIl: adesso,
          richiestaTentativi: m === mese ? tentativo : 0,
        },
      })
    )
  );
  const doveScrivere = { partnerId, anno, mese: { in: mesiCoinvolti } };
  const importoDefinitivo = importo;

  after(async () => {
    // Il beneficiario è il nome a cui esce il bonifico: prima l'intestatario del
    // conto (la banca rifiuta se non combacia con l'IBAN), poi la ragione
    // sociale, per ultima l'insegna.
    const beneficiario = banca.intestatario?.trim() || partner.ragioneSociale?.trim() || partner.nome;
    try {
      const esito = await richiediPagamentoPartner({
        partnerId,
        beneficiario,
        iban,
        importo: importoDefinitivo,
        anno,
        mese,
        causale,
        note,
        tentativo,
      });

      if (esito.ok) {
        await prisma.saldoMensile.updateMany({
          where: doveScrivere,
          data: { richiestaRif: esito.riferimento, richiestaStato: esito.stato },
        });
        await registra({
          azione: `Richiesto a Transactions il pagamento di ${euro(importoDefinitivo)} a ${partner.nome}`,
          categoria: "pagamenti",
          entita: "saldo",
          entitaId: `${partnerId}:${anno}:${mese}`,
          partner: partner.nome,
          dettaglio: `${esito.riferimento} · ${dettaglioRegistro}${esito.ripetuta ? " · richiesta già esistente, non duplicata" : ""}`,
        });
      } else {
        // Il badge sul mese dice che non è riuscito; il MOTIVO vero sta qui nel
        // registro, perché sul saldo non c'è un campo dove conservarlo.
        await prisma.saldoMensile.updateMany({ where: doveScrivere, data: { richiestaStato: "invio_fallito" } });
        await registra({
          azione: `Richiesta a Transactions NON riuscita per ${partner.nome}`,
          categoria: "pagamenti",
          entita: "saldo",
          entitaId: `${partnerId}:${anno}:${mese}`,
          partner: partner.nome,
          dettaglio: `${dettaglioRegistro} · ${euro(importoDefinitivo)} · ${esito.errore}`,
        });
      }
    } catch (e) {
      // Anche un crash imprevisto deve lasciare i mesi sbloccabili.
      console.warn("[pagamenti] invio a Transactions morto:", (e as Error).message);
      await prisma.saldoMensile
        .updateMany({ where: doveScrivere, data: { richiestaStato: "invio_fallito" } })
        .catch(() => undefined);
    }
  });

  torna(destinazione, "richiesta", `invio|${periodo}`);
}
