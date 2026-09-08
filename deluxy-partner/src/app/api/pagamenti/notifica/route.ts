import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notificaAutentica } from "@/lib/transactions";
import { registra } from "@/lib/registro";
import { partiteAperte, descriviPartite } from "@/lib/saldo-netto";
import { nomeMese } from "@/lib/calc";
import { euro } from "@/lib/format";

// POST /api/pagamenti/notifica — Deluxy Transactions avvisa che una richiesta
// ha cambiato stato.
//
// La firma si verifica SEMPRE prima di guardare il contenuto: senza, chiunque
// conoscesse questo indirizzo potrebbe raccontare a Finance che un pagamento è
// stato eseguito, e Finance scriverebbe un bonifico che non esiste.
//
// Quando lo stato diventa `pagata`, e solo allora, il mese viene annotato come
// bonificato: è il momento in cui il denaro è davvero uscito.
//
// Richieste «netto» (04/09/2026, partner in compensazione): la stessa
// richiesta copre PIÙ mesi — quelli a credito del partner e quelli a suo
// debito — e tutti portano lo stesso `richiestaRif`. Alla `pagata` si chiudono
// insieme: a ogni mese si annota il proprio delta (positivo = bonificato al
// partner, negativo = compensato con quello che il partner doveva), e la somma
// dei delta è il netto uscito dalla banca. Senza questo, i 48,30 € pagati
// finirebbero tutti sul mese premuto e gli altri quattro resterebbero aperti.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const corpo = await req.text();
  const ok = notificaAutentica(
    corpo,
    req.headers.get("x-deluxy-timestamp") ?? "",
    req.headers.get("x-deluxy-signature") ?? ""
  );
  if (!ok) return NextResponse.json({ errore: "Firma non valida." }, { status: 401 });

  let dati: {
    riferimento?: string;
    riferimentoEsterno?: string;
    stato?: string;
    importoCent?: number;
    pagataIl?: string;
    // Come è uscito il denaro: "distinta", "qonto", oppure "fuori_app" — pagato
    // altrove (portale della banca, contanti, compensazione) e registrato a mano
    // dentro Transactions. Il mese si chiude comunque, ma nel registro deve
    // restare scritto che la prova del pagamento non ce l'ha l'app.
    pagatoCon?: string;
    motivo?: string;
  };
  try {
    dati = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ errore: "Corpo non leggibile." }, { status: 400 });
  }

  // Coda del messaggio da scrivere nel registro: il perché di un annullamento e
  // il «pagata fuori» sono le due cose che, senza, costringono ad aprire
  // Transactions per capire cosa è successo.
  const fuoriApp = dati.pagatoCon === "fuori_app";
  const contorno = [fuoriApp ? "pagata fuori dall'app" : null, dati.motivo ? `motivo: ${dati.motivo}` : null]
    .filter(Boolean)
    .join(" · ");

  // `riferimentoEsterno` è "saldo-<partnerId>-<anno>-<mese>": l'abbiamo scelto
  // noi quando abbiamo chiesto il pagamento, quindi da lì si risale al mese
  // senza doversi fidare di altro.
  const riferimentoEsterno = dati.riferimentoEsterno ?? "";

  // Richieste LIBERE (sezione «Richiedi pagamento»): il riferimento è
  // `libera-<id>`. Senza questo ramo resterebbero per sempre «in attesa» in
  // pagina, anche dopo essere state pagate davvero.
  const libera = /^libera-(.+)$/.exec(riferimentoEsterno);
  if (libera) {
    const richiesta = await prisma.richiestaPagamento.findUnique({ where: { id: libera[1] } });
    if (!richiesta) return NextResponse.json({ ok: true, nota: "Richiesta non trovata: ignorata." });
    await prisma.richiestaPagamento.update({
      where: { id: richiesta.id },
      data: { stato: String(dati.stato ?? richiesta.stato) },
    });
    await registra({
      azione: `Transactions: richiesta ${dati.riferimento ?? ""} → ${dati.stato ?? ""}`,
      categoria: "pagamenti",
      entita: "richiesta",
      entitaId: richiesta.id,
      partner: richiesta.partnerNome,
      dettaglio: [`${richiesta.beneficiario} · ${richiesta.causale}`, contorno].filter(Boolean).join(" · "),
    });
    return NextResponse.json({ ok: true });
  }

  // `-rN` è il numero di tentativo: una richiesta rifiutata e rifatta ha lo
  // stesso mese ma un riferimento diverso, e va comunque riconosciuta.
  const m = /^saldo-(.+)-(\d{4})-(\d{2})(?:-r\d+)?$/.exec(riferimentoEsterno);
  if (!m) return NextResponse.json({ ok: true, nota: "Riferimento non nostro: ignorata." });
  const [, partnerId, annoS, meseS] = m;
  const anno = Number(annoS);
  const mese = Number(meseS);
  const stato = String(dati.stato ?? "");
  const riferimento = String(dati.riferimento ?? "");

  // I mesi di questa richiesta: tutti quelli che portano il suo riferimento
  // (più d'uno per una richiesta «netto»), altrimenti il mese del riferimento
  // esterno — è il caso delle richieste nate prima del 04/09 e di quelle il
  // cui invio non ha ancora scritto il riferimento definitivo.
  let saldi = riferimento
    ? await prisma.saldoMensile.findMany({
        where: { partnerId, anno, richiestaRif: riferimento },
        select: { id: true, mese: true, bonificoImporto: true, richiestaStato: true },
        orderBy: { mese: "asc" },
      })
    : [];
  if (saldi.length === 0) {
    const uno = await prisma.saldoMensile.findUnique({
      where: { partnerId_anno_mese: { partnerId, anno, mese } },
      select: { id: true, mese: true, bonificoImporto: true, richiestaStato: true },
    });
    if (!uno) return NextResponse.json({ ok: true, nota: "Mese non trovato: ignorata." });
    saldi = [uno];
  }

  const pagata = stato === "pagata";
  const importo = typeof dati.importoCent === "number" ? dati.importoCent / 100 : null;
  const quando = dati.pagataIl ? new Date(dati.pagataIl) : new Date();
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { nome: true } });
  const righeRegistro: string[] = [];

  if (pagata && saldi.length > 1) {
    // Richiesta «netto»: ogni mese chiude col proprio delta, calcolato ADESSO
    // sui dati veri (se nel frattempo un mese è cambiato, la somma non torna
    // col pagato: si scrive lo stesso, e la differenza va nel registro).
    const { partite } = await partiteAperte(partnerId, anno);
    const perMese = new Map(partite.map((p) => [p.mese, p.delta]));
    let sommaDelta = 0;
    await prisma.$transaction(
      saldi.map((s) => {
        const delta = perMese.get(s.mese) ?? 0;
        sommaDelta += delta;
        return prisma.saldoMensile.update({
          where: { id: s.id },
          data: {
            richiestaStato: stato,
            bonificoImporto: Math.round(((s.bonificoImporto ?? 0) + delta) * 100) / 100,
            bonificoData: quando,
          },
        });
      })
    );
    righeRegistro.push(
      `compensazione ${anno} chiusa su ${saldi.length} mesi (${descriviPartite(partite.filter((p) => saldi.some((s) => s.mese === p.mese)))})`
    );
    if (importo != null && Math.abs(sommaDelta - importo) >= 0.01) {
      righeRegistro.push(
        `⚠️ pagato ${euro(importo)} ma i mesi oggi sommano ${euro(sommaDelta)}: qualcosa è cambiato dopo la richiesta, da guardare a mano`
      );
    } else if (importo != null) {
      righeRegistro.push(`bonifico netto ${euro(importo)}`);
    }
  } else {
    // 🔴 CORRETTO L'08/09/2026 — «pagato da Transactions ma il debito è rimasto».
    //
    // Caso vero: MASTROFIORAIO, giugno 2026. Alle 13:14 era stato registrato un
    // INCASSO dal partner di 549 € (`bonificoImporto = −549`: in questa colonna
    // il positivo è «mandato al partner», il negativo «ricevuto dal partner»).
    // Alle 13:24 Transactions conferma il pagamento di 171,18 €, e la vecchia
    // guardia — `s.bonificoImporto == null` — legge «c'è già un valore» e salta
    // la scrittura. Ma quel valore non era un bonifico annotato a mano: era un
    // incasso. Risultato: la scheda continuava a chiedere 171,18 € già pagati.
    // Luglio, stesso partner e stesso giro, funzionava solo perché la sua
    // colonna era vuota.
    //
    // ⚠️⚠️ E NON SI RIPARA SOMMANDO. Provato l'08/09 sul caso vero, e ANNULLATO
    // subito: sommare 171,18 a −549 dà −377,82, che è un NETTO. Ma per un
    // partner SENZA compensazione il motore (`calc.ts`) divide questa colonna
    // per SEGNO — `daIncassare = fatture − parte negativa`,
    // `daBonificare = dovuto − parte positiva` — quindi il netto ha fatto
    // scendere la parte «ricevuta» da 549 a 377,82 e «Da incassare» è passato
    // da 0 a 171,18 €. Da un numero sbagliato a due.
    // **Il limite è del modello, non di questa funzione**: per un partner senza
    // compensazione servono DUE numeri (mandato / ricevuto) e la colonna è una.
    //
    // Quindi qui si fa l'unica cosa onesta finché il modello non cambia:
    //   1. richiesta GIÀ «pagata» → riconsegna del webhook, non si tocca niente;
    //   2. colonna con un'USCITA che copre l'importo → annotata a mano, vince lei;
    //   3. colonna VUOTA o già un'uscita minore → si somma: qui il segno non è
    //      ambiguo e il risultato resta una parte «inviata» corretta;
    //   4. colonna con un INCASSO (negativa) → **non si scrive**, perché
    //      qualunque cifra scritta lì sarebbe letta male dal motore. Non si
    //      resta però in silenzio come prima: il registro lo dichiara con
    //      l'importo, così il pagamento si può sistemare a mano.
    const esito = new Map<string, "sommato" | "gia_pagata" | "gia_a_mano" | "collide_incasso" | "niente">();
    await prisma.$transaction(
      saldi.map((s) => {
        const gia = s.bonificoImporto ?? 0;
        const daScrivere =
          pagata && importo != null
            ? s.richiestaStato === "pagata"
              ? "gia_pagata"
              : gia > 0 && gia >= importo - 0.005
                ? "gia_a_mano"
                : gia < -0.005
                  ? "collide_incasso"
                  : "sommato"
            : "niente";
        esito.set(s.id, daScrivere);
        return prisma.saldoMensile.update({
          where: { id: s.id },
          data: {
            richiestaStato: stato,
            ...(daScrivere === "sommato"
              ? {
                  bonificoImporto: Math.round((gia + importo!) * 100) / 100,
                  bonificoData: quando,
                }
              : {}),
          },
        });
      })
    );
    // ⚠️ IL REGISTRO DICE QUELLO CHE È SUCCESSO DAVVERO. Prima questa riga
    // scriveva «bonifico annotato: …» ogni volta che lo stato era «pagata»,
    // anche quando la scrittura era stata saltata: il registro modifiche — cioè
    // il posto dove si va a controllare — dichiarava un'annotazione che non
    // c'era. È il motivo per cui il caso di giugno è passato inosservato.
    if (pagata) {
      const q = (v: string) => saldi.filter((s) => esito.get(s.id) === v).length;
      if (importo == null) righeRegistro.push("pagata, ma Transactions non ha comunicato l'importo: bonifico NON annotato");
      else if (q("sommato")) righeRegistro.push(`bonifico annotato: ${importo.toFixed(2)}`);
      if (q("gia_pagata")) righeRegistro.push(`${q("gia_pagata")} mesi erano già «pagata»: notifica ripetuta, importo non riscritto`);
      if (q("gia_a_mano")) righeRegistro.push(`${q("gia_a_mano")} mesi avevano già il bonifico annotato a mano: tenuta la cifra scritta da una persona`);
      if (q("collide_incasso"))
        righeRegistro.push(
          `🔴 BONIFICO DI ${importo!.toFixed(2)} € NON ANNOTATO su ${saldi
            .filter((s) => esito.get(s.id) === "collide_incasso")
            .map((s) => nomeMese(s.mese))
            .join(", ")}: quel mese porta già un incasso dal partner, e la colonna del bonifico non può tenere le due direzioni insieme. Il pagamento è avvenuto: va sistemato a mano.`
        );
    }
    if (saldi.length > 1) righeRegistro.push(`mesi: ${saldi.map((s) => nomeMese(s.mese)).join(", ")}`);
  }

  await registra({
    azione: `Transactions: richiesta ${riferimento} → ${stato}`,
    categoria: "pagamenti",
    entita: "saldo",
    entitaId: saldi[0].id,
    partner: partner?.nome ?? null,
    dettaglio: [...righeRegistro, contorno].filter(Boolean).join(" · ") || null,
  });

  return NextResponse.json({ ok: true });
}
