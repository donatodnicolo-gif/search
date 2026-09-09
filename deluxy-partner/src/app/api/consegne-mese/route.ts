import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine } from "@/lib/apiauth";
import { matchPartner } from "@/lib/riconciliazione";
import { registra } from "@/lib/registro";
import {
  ficStato,
  ficClientiFatturabili,
  ficCreaFattura,
  ficEntityUltimaFattura,
  ficSegnaFatturaPagata,
  ficInviaAlloSdi,
  invioSdiAutomatico,
  type FicEntity,
} from "@/lib/fic";
import { suggerisciClienteFic } from "@/lib/fic-cliente";
import { nomeMese } from "@/lib/calc";
import { riepilogoPartner } from "@/lib/queries";
import { condizioniVendorPartner } from "@/lib/condizioni-vendor";
import { chiediPagamento } from "@/lib/pagamenti-partner-actions";

// IL MESE DELLE CONSEGNE, MANDATO DALLA PIATTAFORMA (09/09/2026).
//
// La piattaforma consegne genera la fattura interna del mese e, subito dopo,
// manda qui il CONTO: quanto ha venduto il partner come vendor e quanta
// commissione ne è nata. Finance ne ricava il dovuto con la sua formula, che è
// già la stessa:
//     Finance      dovutoVendita = incassoLordo − commissione × (1 + IVA)
//     Piattaforma  dovuto        = venduto      − quota       × (1 + IVA)
//
// ⚠️⚠️ LA COMMISSIONE NON DIVENTA UNA FATTURA SERVIZI. La specifica chiedeva di
// creare una `FatturaServizio` «già saldata»: non si può, e non perché sia
// brutto — perché conta il denaro due volte.
// La commissione è GIÀ DENTRO `dovutoVendita`: è trattenuta dall'incasso, non
// incassata dal partner. Aggiungerla anche come fattura la sottrae una seconda
// volta. Misurato sui numeri del collaudo (FABBRICA DELLE FESTE, agosto 2026,
// venduto 243,40 · commissioni 48,68 · IVA 22%):
//     dovuto vendite = 243,40 − 59,39 = 184,01   ← la commissione è già qui
//     con la fattura servizi «pagata»: 59,39 − 184,01 → da bonificare 124,62 ❌
//     senza:                                     → da bonificare 184,01 ✅
// 59,39 € tolti due volte. È lo stesso difetto che il 09/09 ha portato a
// togliere 41 fatture commissioni dai servizi (17.146,15 € contati doppio) e a
// mettere un vincolo UNIQUE sul numero di fattura.
//
// In Finance il documento della commissione si registra dove gli compete: sul
// MESE, come `commFattEmessa` + `commFattNumero`. Il mese smette di dire
// «commissioni da fatturare» e mostra il riferimento — che è, in sostanza,
// «saldata»: sulle vendite non c'è niente da incassare dal partner.
//
// COSA SCRIVE, e cosa NON tocca:
//   · `VenditaVendor` del mese (incassoLordo = venduto, feePercent dedotta dal
//     rapporto commissioni/venduto: è ciò che il rapporto dice, non un
//     parametro a parte);
//   · `SaldoMensile`: lo crea se manca e vi aggancia il numero della fattura.
//     ⛔ `bonificoImporto`, `bonificoData`, `dataPagamento` e `chiuso` non si
//     toccano MAI: sono decisioni di chi paga, e un reinvio non deve
//     cancellarle.
//
// IDEMPOTENZA. Il `riferimento` (numero della fattura interna della
// piattaforma) viaggia nella descrizione della vendita come `[consegne <rif>]`.
// Un reinvio dello stesso mese AGGIORNA quella riga invece di aggiungerne una:
// senza, rimandare agosto raddoppierebbe il dovuto. La coppia (partner, anno,
// mese) da sola non basterebbe — un partner può avere vendite di altra origine
// nello stesso mese, e sovrascriverle sarebbe peggio del doppione.
// Si è scelto il marcatore invece di una colonna nuova perché lo schema di
// Finance non è della piattaforma: se un domani serve una colonna vera si
// aggiunge, ma il contratto qui non cambia.
export const dynamic = "force-dynamic";

const MARCATORE = (rif: string) => `[consegne ${rif.trim()}]`;

export async function POST(req: NextRequest) {
  // ⚠️ Scope SCRITTURA, non il default. Questa rotta crea vendite e tocca il
  // saldo di un mese: una chiave di sola lettura non deve poterlo fare.
  if (!(await chiaveApiValida(req, "scrittura"))) {
    return NextResponse.json({ errore: "Chiave non valida o senza permesso di scrittura." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }

  const partnerRif = String(body.partner ?? "").trim();
  const anno = Number(body.anno);
  const mese = Number(body.mese);
  const venduto = Number(body.venduto);
  const commissioni = Number(body.commissioni);
  const aliquotaIva = body.aliquotaIva == null ? 22 : Number(body.aliquotaIva);
  const riferimento = String(body.riferimento ?? "").trim();
  const descrizione = String(body.descrizione ?? "").trim();

  const mancano: string[] = [];
  if (!partnerRif) mancano.push("partner");
  if (!Number.isInteger(anno) || anno < 2000) mancano.push("anno");
  if (!Number.isInteger(mese) || mese < 1 || mese > 12) mancano.push("mese");
  if (!Number.isFinite(venduto) || venduto <= 0) mancano.push("venduto");
  if (!Number.isFinite(commissioni) || commissioni < 0) mancano.push("commissioni");
  if (!riferimento) mancano.push("riferimento");
  if (mancano.length) {
    return NextResponse.json({ errore: `Campi mancanti o non validi: ${mancano.join(", ")}.` }, { status: 400 });
  }
  // Una commissione più grande del venduto non è un caso limite: è un errore di
  // chi manda, e accettarla produrrebbe un dovuto negativo che nessuno legge.
  if (commissioni > venduto) {
    return NextResponse.json(
      { errore: `Le commissioni (${commissioni}) superano il venduto (${venduto}): non le registro.` },
      { status: 400 }
    );
  }

  // IL PARTNER. Prima per id (certo), poi per nome con la regola del motore —
  // la stessa che la riconciliazione usa sui movimenti, con le parole del
  // mestiere ignorate. Se non è UNO, non si sceglie: si dice chi sono.
  let partner = await prisma.partner.findUnique({ where: { id: partnerRif } });
  if (!partner) {
    const tutti = await prisma.partner.findMany();
    partner = matchPartner(partnerRif, tutti);
    if (!partner) {
      return NextResponse.json(
        { errore: `Nessun partner riconosciuto da «${partnerRif}». Manda l'id, oppure il nome come sta in Finance.` },
        { status: 404 }
      );
    }
  }

  // La fee si DEDUCE: è quello che il rapporto dice, non un dato a parte che
  // potrebbe contraddirlo.
  const feePercent = +((commissioni / venduto) * 100).toFixed(4);
  const testo = `${descrizione || "Consegne dalla piattaforma"} ${MARCATORE(riferimento)}`;

  // La riga di questo invio, riconosciuta dal marcatore.
  const esistente = await prisma.venditaVendor.findFirst({
    where: { partnerId: partner.id, anno, mese, descrizione: { contains: MARCATORE(riferimento) } },
  });

  const vendita = esistente
    ? await prisma.venditaVendor.update({
        where: { id: esistente.id },
        data: { incassoLordo: venduto, feePercent, descrizione: testo },
      })
    : await prisma.venditaVendor.create({
        data: { partnerId: partner.id, anno, mese, incassoLordo: venduto, feePercent, descrizione: testo },
      });

  // IL SALDO DEL MESE. Si crea se manca; se c'è, si tocca SOLO il riferimento
  // della fattura commissioni, e solo se il mese non ne ha già uno vero.
  const saldo = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId: partner.id, anno, mese } },
  });
  const haGiaNumero = /\d/.test((saldo?.commFattNumero ?? "").trim());
  if (!saldo) {
    await prisma.saldoMensile.create({
      data: { partnerId: partner.id, anno, mese, commFattEmessa: true, commFattNumero: riferimento },
    });
  } else if (!haGiaNumero) {
    await prisma.saldoMensile.update({
      where: { id: saldo.id },
      data: { commFattEmessa: true, commFattNumero: riferimento },
    });
  }

  const dovuto = +(venduto - commissioni * (1 + aliquotaIva / 100)).toFixed(2);

  // ⭐ 09/09/2026 (richiesta dell'utente: «quando ti arrivano da app delivery
  // crea subito la fattura su FIC e invia»).
  //
  // Il documento fiscale della commissione lo emette Finance, appena il mese
  // arriva. Con tre porte chiuse a chiave, perché qui uno sbaglio non è un bug
  // ma una fattura vera intestata a qualcuno:
  //   1. si emette SOLO se il mese non ha già un numero di Fatture in Cloud
  //      (il riferimento interno della piattaforma non conta come documento);
  //   2. si emette SOLO se il cliente su FIC è un FATTO — riconciliazione
  //      confermata, o intestatario delle fatture commissioni già emesse a
  //      questo partner. Se il nome è stato indovinato per somiglianza, no:
  //      decide una persona. È la stessa regola di `emettiCommissioniRapido`;
  //   3. l'INVIO ALLO SDI parte (decisione dell'utente, confermata il 09/09:
  //      «manda comunque allo SDI se lo ricevi da app delivery»). È
  //      irreversibile — per disfarlo serve una nota di credito — quindi resta
  //      un FRENO: `fic.inviaSdiAutomatico = "0"` lo ferma senza toccare il
  //      codice. Le due porte qui sopra restano chiuse a chiave proprio perché
  //      questa è aperta.
  // Se qualcosa non riesce, il mese resta scritto e l'esito lo dice: una
  // fattura non emessa è un lavoro da fare, non un errore da nascondere.
  const emissione: Record<string, unknown> = { tentata: false };
  const numeroVero = /^\s*\d+([-/]\d+)*\s*\/?\s*\d{0,4}\s*$/.test((saldo?.commFattNumero ?? "").trim());
  if (commissioni > 0.005 && !numeroVero) {
    emissione.tentata = true;
    try {
      const stato = await ficStato();
      if (!stato.collegato) throw new Error("Fatture in Cloud non è collegato.");
      const clienti = await ficClientiFatturabili();
      const scelta = await suggerisciClienteFic(partner, clienti);
      if ((scelta.da !== "riconciliazione" && scelta.da !== "storico") || !scelta.cliente) {
        emissione.esito = "cliente non certo";
        emissione.perche =
          "Su Fatture in Cloud non risulta a chi intestarla con certezza: la emette una persona da «Emetti su Fatture in Cloud».";
      } else {
        let clienteId: number | undefined;
        let entity: FicEntity | undefined;
        if (scelta.cliente.valore.startsWith("id:")) {
          clienteId = parseInt(scelta.cliente.valore.slice(3)) || undefined;
        } else {
          const nome = scelta.cliente.valore.slice(5);
          entity = (await ficEntityUltimaFattura(nome)) ?? ({ name: nome } as FicEntity);
        }
        const res = await ficCreaFattura({
          clienteId,
          entity,
          descrizione: `Commissioni su vendite ${nomeMese(mese)} ${anno}`,
          imponibile: +commissioni.toFixed(2),
          visibleSubject: `Commissioni ${nomeMese(mese)} ${anno}`,
        });
        emissione.numero = res.numero;
        // Sulle vendite la commissione non si incassa dal partner: si trattiene
        // dall'incasso. Lasciarla «da incassare» la farebbe comparire nei
        // solleciti e in un credito che nessuno deve versare.
        await ficSegnaFatturaPagata(res.id, true).catch(() => null);
        // Il numero VERO prende il posto del riferimento interno.
        await prisma.saldoMensile.updateMany({
          where: { partnerId: partner.id, anno, mese },
          data: { commFattEmessa: true, commFattNumero: res.numero },
        });
        emissione.esito = "creata e segnata saldata";
        if (await invioSdiAutomatico()) {
          const inv = await ficInviaAlloSdi(res.id);
          emissione.sdi = inv.ok ? "inviata" : `NON inviata: ${inv.errore}`;
        } else {
          emissione.sdi = "invio FERMATO dal freno (fic.inviaSdiAutomatico=0): la fattura è creata, va inviata da Fatture in Cloud";
        }
      }
    } catch (e) {
      emissione.esito = "non creata";
      emissione.errore = (e as Error).message;
    }
  } else if (numeroVero) {
    emissione.esito = `il mese ha già la fattura ${saldo?.commFattNumero}`;
  }

  // ⭐ 09/09/2026 (richiesta dell'utente: «puoi inviare poi in automatico la
  // richiesta di pagamento a transactions?»).
  //
  // Sì, e non esce denaro: a Transactions arriva una RICHIESTA, che una persona
  // deve autorizzare con secondo fattore e, sopra soglia, doppia firma. È il
  // motivo per cui questo passo si può automatizzare mentre l'invio allo SDI ha
  // avuto bisogno di una conferma esplicita: là il gesto è definitivo, qui no.
  //
  // ⚠️ NON si ricopia la regola su QUANTO chiedere: si chiama lo stesso nucleo
  // del bottone «Paga» (`chiediPagamento`). In compensazione l'importo è il
  // netto dell'anno, non il residuo del mese — averlo scritto in due posti è
  // già costato la richiesta TRX-2026-000049, annullata a mano il 04/09.
  //
  // Tre porte:
  //   · si chiede solo se c'è qualcosa da bonificare per quel mese;
  //   · non si chiede se quel mese ha già una richiesta viva (il nucleo lo
  //     ricontrolla, ma chiedere due volte non deve nemmeno partire);
  //   · un fallimento non annulla il resto: il mese resta scritto e l'esito lo
  //     dice.
  const pagamento: Record<string, unknown> = { tentato: false };
  try {
    const saldoOra = await prisma.saldoMensile.findUnique({
      where: { partnerId_anno_mese: { partnerId: partner.id, anno, mese } },
      select: { richiestaRif: true, richiestaStato: true, bonificoImporto: true },
    });
    const inCorso =
      Boolean(saldoOra?.richiestaRif) &&
      !["rifiutata", "annullata", "invio_fallito"].includes(saldoOra?.richiestaStato ?? "");
    if (inCorso) {
      pagamento.esito = `già richiesto (${saldoOra?.richiestaRif} · ${saldoOra?.richiestaStato})`;
    } else {
      const cond = await condizioniVendorPartner(partner.id);
      const riep = await riepilogoPartner(partner.id, anno, cond.condizioni?.compensazioneIncassi ?? null);
      const daBonificare = riep.mesi[mese - 1]?.riepilogo.daBonificare ?? 0;
      if (daBonificare < 0.01) {
        pagamento.esito = "niente da bonificare per questo mese";
      } else {
        pagamento.tentato = true;
        const esito = await chiediPagamento(partner.id, anno, mese, +daBonificare.toFixed(2));
        pagamento.esito = esito.ok
          ? `richiesta partita per ${esito.periodo} (mesi ${esito.mesi.join(", ")}) — va autorizzata su Transactions`
          : `non richiesto: ${esito.messaggio}`;
        pagamento.importo = +daBonificare.toFixed(2);
      }
    }
  } catch (e) {
    pagamento.esito = `non richiesto: ${(e as Error).message}`;
  }

  await registra({
    azione: `Mese consegne ricevuto dalla piattaforma: ${mese}/${anno}`,
    categoria: "vendite",
    entita: "vendita",
    entitaId: vendita.id,
    partner: partner.nome,
    dettaglio:
      `${riferimento} · venduto ${venduto.toFixed(2)} € · commissioni ${commissioni.toFixed(2)} € ` +
      `(fee ${feePercent}%) · dovuto al partner ${dovuto.toFixed(2)} € · ` +
      `${esistente ? "riga aggiornata (reinvio)" : "riga creata"}` +
      `${haGiaNumero ? ` · il mese aveva già la fattura commissioni «${saldo?.commFattNumero}», non l'ho toccata` : ""}` +
      ` · da ${appOrigine(req) ?? "piattaforma"}` +
      (emissione.tentata ? ` · fattura FIC: ${emissione.esito ?? "?"}${emissione.numero ? ` (${emissione.numero})` : ""}${emissione.sdi ? ` · SDI: ${emissione.sdi}` : ""}` : "") +
      (pagamento.esito ? ` · pagamento: ${pagamento.esito}` : ""),
  });

  return NextResponse.json({
    ok: true,
    partner: { id: partner.id, nome: partner.nome },
    anno,
    mese,
    venduto,
    commissioni,
    feePercent,
    dovutoAlPartner: dovuto,
    fatturaCommissioni: emissione.numero ?? (haGiaNumero ? (saldo?.commFattNumero ?? riferimento) : riferimento),
    emissioneFic: emissione,
    richiestaPagamento: pagamento,
    aggiornata: Boolean(esistente),
    // Detto esplicitamente perché la specifica chiedeva il contrario: chi
    // integra deve sapere che la commissione non diventa un credito.
    nota:
      "La commissione è già dedotta dal dovuto (trattenuta sull'incasso): non viene creata " +
      "una fattura servizi, che la conterebbe due volte. Il documento è agganciato al mese.",
  });
}
