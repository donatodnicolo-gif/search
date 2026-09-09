import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine } from "@/lib/apiauth";
import { matchPartner } from "@/lib/riconciliazione";
import { registra } from "@/lib/registro";

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
      ` · da ${appOrigine(req) ?? "piattaforma"}`,
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
    fatturaCommissioni: haGiaNumero ? (saldo?.commFattNumero ?? riferimento) : riferimento,
    aggiornata: Boolean(esistente),
    // Detto esplicitamente perché la specifica chiedeva il contrario: chi
    // integra deve sapere che la commissione non diventa un credito.
    nota:
      "La commissione è già dedotta dal dovuto (trattenuta sull'incasso): non viene creata " +
      "una fattura servizi, che la conterebbe due volte. Il documento è agganciato al mese.",
  });
}
