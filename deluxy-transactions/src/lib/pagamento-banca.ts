import { prisma } from "./db";
import { registra, sigilloDellaRiga } from "./audit";
import { notificaOrigine } from "./webhook";
import { euro } from "./denaro";
import { leggiRegole } from "./impostazioni";
import { normalizzaIban } from "./iban";
import { verificaCancello } from "./sblocco";
import { beneficiariFidati, contoDaUsare, controllaIntestatario, creaBonifico, qontoConfigurato } from "./qonto";

// Pagamento vero: da qui il denaro esce davvero dal conto.
//
// Questo è l'unico file dell'ecosistema Deluxy che fa partire un bonifico.
// Prima di arrivare alla banca, un pagamento deve aver superato TUTTI questi
// cancelli, in quest'ordine — e ognuno di essi è una risposta a un modo
// concreto di perdere soldi:
//
//  1. lo **sblocco del pagatore** (codice via email + PIN), `verificaCancello`;
//  2. l'**interruttore** `qontoEsecuzioneAttiva`, spento di default;
//  3. il **sigillo** di ogni richiesta: se qualcuno ha toccato importo o IBAN
//     direttamente sul database, non si paga niente;
//  4. il **beneficiario fidato in Qonto**: si paga solo verso IBAN già resi
//     «trusted» a mano dentro l'app della banca. Questo server, da solo, non
//     può inventare un beneficiario nuovo;
//  5. il **controllo dell'intestatario** (VoP) subito prima di ogni bonifico:
//     se il nome non corrisponde all'IBAN, quel pagamento non parte;
//  6. il **saldo**: se non basta, non si comincia nemmeno.
//
// Regola sull'errore: al primo bonifico fallito ci si FERMA. Metà distinta
// pagata e metà no è una situazione brutta ma chiara; andare avanti alla cieca
// dopo un errore della banca è come non sapere cosa è uscito.

export type EsitoPagamento = {
  pagate: { riferimento: string; importoCent: number; transferId: string }[];
  bloccate: { riferimento: string; motivo: string }[];
  errore?: string;
};

export async function pagaLottoConQonto(
  lottoId: string,
  operatore: { id: string; email: string },
  ip: string | null,
): Promise<EsitoPagamento> {
  const vuoto: EsitoPagamento = { pagate: [], bloccate: [] };

  // 1. Lo sblocco del pagatore.
  const chiuso = await verificaCancello(lottoId, operatore);
  if (chiuso) return { ...vuoto, errore: chiuso };

  // 2. L'interruttore.
  const regole = await leggiRegole();
  if (!regole.qontoEsecuzioneAttiva) {
    return {
      ...vuoto,
      errore:
        "Il pagamento dalla banca è spento. Un amministratore lo accende in Impostazioni: finché è spento, da qui esce solo il file SEPA.",
    };
  }
  if (!(await qontoConfigurato())) {
    return { ...vuoto, errore: "Qonto non configurato (QONTO_LOGIN / QONTO_SECRET_KEY su Vercel)." };
  }

  const lotto = await prisma.lotto.findUnique({ where: { id: lottoId }, include: { richieste: true } });
  if (!lotto) return { ...vuoto, errore: "Distinta inesistente." };
  if (lotto.stato === "pagato") return { ...vuoto, errore: "Distinta già pagata." };
  if (lotto.stato === "annullato") return { ...vuoto, errore: "Distinta annullata." };

  // Solo bonifici: un metodo diverso da "iban" non deve nemmeno poter arrivare
  // qui (la distinta li rifiuta a monte), ma il filtro si ripete dove conta.
  const daPagare = lotto.richieste.filter((r) => r.stato === "in_lotto" && !r.qontoTransferId && r.metodo === "iban");
  if (daPagare.length === 0) return { ...vuoto, errore: "Non c'è niente da pagare in questa distinta." };

  // 3. Il sigillo: nessuna riga toccata fuori dall'app.
  for (const r of daPagare) {
    if (sigilloDellaRiga(r) !== r.sigillo) {
      await registra(
        "sicurezza.allarme",
        operatore.email,
        { motivo: "sigillo non valido alla vigilia del pagamento", richiesta: r.riferimento },
        { ip, richiestaId: r.id },
      );
      return {
        ...vuoto,
        errore: `${r.riferimento} è stata modificata fuori dall'app: non pago niente di questa distinta.`,
      };
    }
  }

  const conto = await contoDaUsare();
  if (!conto.ok) return { ...vuoto, errore: conto.errore };

  // 6. Il saldo, prima di cominciare.
  const totale = daPagare.reduce((s, r) => s + r.importoCent, 0);
  const disponibile = conto.dati.authorized_balance_cents ?? conto.dati.balance_cents;
  if (typeof disponibile === "number" && disponibile < totale) {
    return {
      ...vuoto,
      errore: `Sul conto ci sono ${euro(disponibile)} e ne servono ${euro(totale)}: non comincio.`,
    };
  }

  // 4. I beneficiari fidati, presi una volta sola.
  const fidati = await beneficiariFidati();
  if (!fidati.ok) return { ...vuoto, errore: fidati.errore };
  const perIban = new Map<string, { id: string; name?: string }>();
  for (const b of fidati.dati) {
    if (b.iban && b.id) perIban.set(normalizzaIban(b.iban), { id: b.id, name: b.name });
  }

  // Lo sblocco si consuma ADESSO, prima del primo bonifico: un'esecuzione per
  // codice. Se qualcosa va storto a metà, per riprovare serve un codice nuovo.
  await prisma.lotto.update({ where: { id: lottoId }, data: { sbloccoScadeIl: new Date() } });
  await registra(
    "pagamento.eseguito",
    operatore.email,
    { fase: "inizio", lotto: lotto.riferimento, pagamenti: daPagare.length, totaleCent: totale },
    { ip },
  );

  const esito: EsitoPagamento = { pagate: [], bloccate: [] };

  for (const r of daPagare) {
    const beneficiario = perIban.get(normalizzaIban(r.iban));
    if (!beneficiario) {
      esito.bloccate.push({
        riferimento: r.riferimento,
        motivo: `l'IBAN non è fra i beneficiari fidati in Qonto — rendilo fidato nell'app della banca`,
      });
      continue;
    }

    // 5. Il controllo dell'intestatario, uno per bonifico e appena prima.
    const vop = await controllaIntestatario(r.iban, r.beneficiario);
    if (!vop.ok) {
      esito.bloccate.push({ riferimento: r.riferimento, motivo: `controllo intestatario fallito: ${vop.errore}` });
      continue;
    }
    if (vop.dati.risultato !== "MATCH") {
      const dettaglio =
        vop.dati.risultato === "CLOSE_MATCH" && vop.dati.nomeTrovato
          ? `la banca dice che l'intestatario è «${vop.dati.nomeTrovato}»`
          : `esito del controllo: ${vop.dati.risultato}`;
      await registra(
        "sicurezza.allarme",
        operatore.email,
        { motivo: "intestatario non corrispondente", richiesta: r.riferimento, esito: vop.dati.risultato },
        { ip, richiestaId: r.id },
      );
      esito.bloccate.push({
        riferimento: r.riferimento,
        motivo: `nome e IBAN non corrispondono: ${dettaglio}. Non pago: correggi il nome del beneficiario o verifica le coordinate.`,
      });
      continue;
    }
    if (!vop.dati.proofToken) {
      esito.bloccate.push({ riferimento: r.riferimento, motivo: "la banca non ha restituito la prova del controllo." });
      continue;
    }

    const bonifico = await creaBonifico({
      contoId: conto.dati.id,
      beneficiarioId: beneficiario.id,
      importoCent: r.importoCent,
      causale: r.causale,
      proofToken: vop.dati.proofToken,
      richiestaId: r.id,
    });

    if (!bonifico.ok) {
      // Ci si ferma: da qui in poi non si sa più cosa è partito e cosa no.
      await registra(
        "pagamento.eseguito",
        operatore.email,
        {
          fase: "interrotto",
          lotto: lotto.riferimento,
          suRichiesta: r.riferimento,
          errore: bonifico.errore,
          pagateFinQui: esito.pagate.map((p) => p.riferimento),
        },
        { ip, richiestaId: r.id },
      );
      return {
        ...esito,
        errore: `Mi sono fermato su ${r.riferimento}: ${bonifico.errore}. Quello che risulta pagato qui sopra è partito davvero; il resto no.`,
      };
    }

    const adesso = new Date();
    await prisma.richiesta.update({
      where: { id: r.id },
      data: {
        stato: "pagata",
        pagataIl: adesso,
        pagatoCon: "qonto",
        qontoTransferId: bonifico.dati.id || null,
        qontoStato: bonifico.dati.stato,
      },
    });
    await registra(
      "richiesta.pagata",
      operatore.email,
      { riferimento: r.riferimento, importoCent: r.importoCent, tramite: "qonto", transferId: bonifico.dati.id },
      { ip, richiestaId: r.id },
    );
    // L'app che ha chiesto il pagamento va avvisata ANCHE qui: era l'unico
    // esito che non partiva mai (giuria 28/08) — proprio il pagamento più
    // «vero». L'outbox non solleva: un webhook giù non ferma i bonifici.
    await notificaOrigine(r.id);
    esito.pagate.push({ riferimento: r.riferimento, importoCent: r.importoCent, transferId: bonifico.dati.id });
  }

  // La distinta si chiude solo se non è rimasto niente in sospeso.
  const rimaste = await prisma.richiesta.count({ where: { lottoId, stato: "in_lotto" } });
  if (rimaste === 0) {
    await prisma.lotto.update({ where: { id: lottoId }, data: { stato: "pagato", pagatoIl: new Date() } });
  }
  await registra(
    "pagamento.eseguito",
    operatore.email,
    {
      fase: "fine",
      lotto: lotto.riferimento,
      pagate: esito.pagate.length,
      bloccate: esito.bloccate.length,
      // Il *perché* di ogni blocco, non solo quanti: con il solo conteggio, un
      // «bloccate: 1» nel registro non dice niente a chi lo rilegge domani, e
      // il motivo — che qui sopra c'è già — andrebbe perso.
      motivi: esito.bloccate.map((b) => `${b.riferimento}: ${b.motivo}`),
      totalePagatoCent: esito.pagate.reduce((s, p) => s + p.importoCent, 0),
    },
    { ip },
  );

  return esito;
}

// ---------------------------------------------------------------------------
// Riconciliazione: il cerchio si chiude quando il denaro è uscito davvero
// ---------------------------------------------------------------------------

export type RigaRiconciliazione = {
  movimentoId: string;
  data: string | null;
  importoCent: number;
  descrizione: string;
  causale: string;
  richiesta: { id: string; riferimento: string; stato: string } | null;
};

/**
 * Abbina i movimenti in uscita del conto alle richieste, cercando il
 * riferimento Deluxy (TRX-…) dentro causale o descrizione del movimento.
 * Non tocca niente: dice solo cosa ha riconosciuto. Chi guarda decide.
 */
export function abbina(
  movimenti: { id: string; amount_cents?: number; settled_at?: string; label?: string; reference?: string }[],
  richieste: { id: string; riferimento: string; stato: string; importoCent: number }[],
): RigaRiconciliazione[] {
  const perRiferimento = new Map(richieste.map((r) => [r.riferimento.toUpperCase(), r]));
  return movimenti.map((m) => {
    const testo = `${m.reference ?? ""} ${m.label ?? ""}`.toUpperCase();
    let trovata: (typeof richieste)[number] | undefined;
    for (const [rif, r] of perRiferimento) {
      if (testo.includes(rif)) {
        trovata = r;
        break;
      }
    }
    // Senza riferimento nel testo non si indovina per importo: due bonifici
    // dello stesso importo nello stesso giorno sono normali, e sbagliare
    // l'abbinamento significa dare per pagata una richiesta che non lo è.
    return {
      movimentoId: m.id,
      data: m.settled_at ?? null,
      importoCent: Math.abs(m.amount_cents ?? 0),
      descrizione: m.label ?? "",
      causale: m.reference ?? "",
      richiesta: trovata ? { id: trovata.id, riferimento: trovata.riferimento, stato: trovata.stato } : null,
    };
  });
}
