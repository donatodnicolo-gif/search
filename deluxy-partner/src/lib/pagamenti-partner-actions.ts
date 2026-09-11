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
import { condizioniVendorPartner } from "./condizioni-vendor";


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

const no = (messaggio: string): EsitoRichiesta => ({ ok: false, messaggio });

function torna(destinazione: string, chiave: string, valore: string): never {
  revalidatePath("/", "layout");
  redirect(`${destinazione}${destinazione.includes("?") ? "&" : "?"}${chiave}=${encodeURIComponent(valore)}`);
}

/**
 * L'esito della richiesta, invece di un redirect.
 *
 * ⭐ 09/09/2026 — un solo NUCLEO, due chiamanti. Il bottone della scheda e la
 * rotta che riceve il mese dalla piattaforma devono chiedere **la stessa cosa
 * nello stesso modo**: la regola su quanto si chiede (il mese, o il netto
 * dell'anno in compensazione) è già costata una richiesta da annullare a mano
 * il 04/09, e ricopiarla in un secondo punto è il modo sicuro di farla
 * divergere. Vedi la trappola «regola ricopiata in cinque posti».
 */
export type EsitoRichiesta =
  | { ok: true; periodo: string; mesi: number[] }
  | { ok: false; messaggio: string };

export async function chiediPagamento(
  partnerId: string,
  anno: number,
  mese: number,
  importo: number
): Promise<EsitoRichiesta> {
  const periodo = `${nomeMese(mese)} ${anno}`;
  if (!transactionsConfigurato()) {
    return no(`${periodo} — Transactions non è collegata: mancano TRANSACTIONS_API_KEY e TRANSACTIONS_HMAC_SECRET.`);
  }

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { nome: true, ragioneSociale: true, intestatarioConto: true, iban: true, compensazione: true },
  });
  if (!partner) return no("Partner non trovato.");

  // ⭐ 11/09/2026 — OGNI MESE SI PAGA A SÉ, ANCHE IN COMPENSAZIONE.
  // Regola dell'utente, che sostituisce quella del 04/09: «è sbagliato che in
  // compensazione si paga solo il netto dell'anno, ogni mese viene pagato a
  // sé». Dal 04/09 al 10/09 il bottone di un partner in compensazione mandava
  // a Transactions il NETTO dell'anno (crediti meno debiti di tutti i mesi) e
  // segnava «in corso» tutti i mesi coinvolti: su CASATI 14, febbraio da
  // bonificare 128,52 € faceva partire una richiesta da 4.090,14 €.
  // Adesso si chiede l'importo di QUEL mese, e il mese marcato è uno solo.
  // ⚠️ Conseguenza dichiarata: un mese in cui il partner deve a Deluxy non si
  // compensa più da solo con un mese a credito. Il debito resta visibile sulla
  // scheda (il residuo del mese e il badge «Da recuperare» del totale
  // dell'anno) e si recupera dove si è sempre fatto: con un extra in
  // detrazione sul mese, o chiedendo l'incasso.
  // Le richieste multi-mese partite prima di oggi restano valide: il webhook
  // continua a chiudere tutti i mesi che portano quel riferimento.
  const causale = `Saldo ${periodo} - ${partner.nome}`;
  const note = `Dovuto al partner per ${periodo}, richiesto da Deluxy Finance.`;
  const mesiCoinvolti = [mese];
  const dettaglioRegistro = periodo;
  if (!(importo >= 0.01)) return no(`${periodo} — importo non valido: non c'è niente da pagare.`);

  // L'IBAN lo possiede il REGISTRO Anagrafiche; qui c'è al più una copia, e
  // quasi sempre non c'è (18 partner su 119 ce l'hanno). Prima si guardava solo
  // la copia, e «Paga» rifiutava su partner che l'IBAN ce l'hanno eccome.
  const banca = await datiBancariPartner(partnerId);
  const iban = banca.iban;
  if (!iban) {
    // Meglio fermarsi qui che far arrivare a Transactions una richiesta che non
    // può essere pagata: là dentro diventerebbe una pratica ferma che qualcuno
    // deve rincorrere.
    return no(`${periodo} — ${perchePagamentoSenzaIban(banca, partner.nome)}`);
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

  return { ok: true, periodo, mesi: mesiCoinvolti };
}

/**
 * Il bottone «Paga» della scheda partner: stesso nucleo, ma finisce con un
 * redirect perché sta dentro un form.
 */
export async function richiediPagamento(
  partnerId: string,
  anno: number,
  mese: number,
  importo: number,
  destinazione = "/"
) {
  const esito = await chiediPagamento(partnerId, anno, mese, importo);
  if (!esito.ok) torna(destinazione, "errorePag", esito.messaggio);
  torna(destinazione, "richiesta", `invio|${esito.periodo}`);
}
