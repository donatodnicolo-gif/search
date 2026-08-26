import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { serializzaOrdine, INCLUDE_ORDINE } from "@/lib/ordini";
import { ordinali } from "@/lib/repeater";
import { CATEGORIE_PAGAMENTO } from "@/lib/classificazione";

// GET /api/v1/ordini/:id — un ordine con la sua classificazione (sola lettura).
// Come l'elenco, un ordine ANNULLATO non viene servito: risponde 410 (non più
// disponibile) spiegando perché, invece di restituirlo come se fosse valido.
// Con `?annullati=inclusi` lo si ottiene comunque, per chi deve gestirlo
// davvero (rimborsi, riconciliazioni).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;
  const { id } = await params;
  const ordine = await prisma.ordine.findUnique({ where: { id }, include: INCLUDE_ORDINE });
  if (!ordine) return erroreApi(404, "Ordine non trovato");

  const includiAnnullati = req.nextUrl.searchParams.get("annullati")?.trim().toLowerCase() === "inclusi";
  if (ordine.annullatoIl && !includiAnnullati) {
    return erroreApi(
      410,
      `Ordine ${ordine.numero} annullato il ${ordine.annullatoIl.toISOString().slice(0, 10)}: non viene servito. Usa ?annullati=inclusi se devi gestirlo comunque.`,
    );
  }
  return NextResponse.json(serializzaOrdine(ordine, undefined, await ordinali([ordine.id])));
}

// PATCH /api/v1/ordini/:id — riclassifica un ordine (richiede chiave di scrittura).
// Corpo JSON, tutti i campi opzionali:
//   { stato: "<chiave>", etichette: ["urgente"], categoriaPagamento, tipoConsegna,
//     tipoProdotto, canale, assegnatoApp, fornitore, responsabile,
//     classificazioni: { ...libero }, noteInterne }
// Le etichette rimpiazzano l'intero set; quelle non esistenti vengono create.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;
  const { id } = await params;

  const esiste = await prisma.ordine.findUnique({ where: { id }, select: { id: true } });
  if (!esiste) return erroreApi(404, "Ordine non trovato");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Corpo JSON non valido");
  }

  const data: Record<string, unknown> = {};

  if ("categoriaPagamento" in body) {
    const c = String(body.categoriaPagamento);
    if (!CATEGORIE_PAGAMENTO.includes(c as (typeof CATEGORIE_PAGAMENTO)[number])) {
      return erroreApi(400, `categoriaPagamento non valida (${CATEGORIE_PAGAMENTO.join(", ")})`);
    }
    data.categoriaPagamento = c;
    data.categoriaPagamentoManuale = true;
  }
  for (const campo of ["tipoConsegna", "tipoProdotto", "canale", "assegnatoApp", "fornitore", "responsabile", "noteInterne"] as const) {
    if (campo in body) data[campo] = body[campo] == null ? null : String(body[campo]);
  }
  // ── IL COSTO DEL FORNITORE, PROPOSTO DAL CUSTOMER SERVICE ──
  //
  // ⚠️⚠️ Chi decide a chi va l'ordine e a quanto è il **Customer Service**
  // (Standard Deluxy §7.2: «decisione di gestione dell'ordine — come si evade, a
  // chi, esiti coi fornitori»). Quel numero nasce lì, al telefono col fornitore,
  // e finora non arrivava mai fin qui: `costoFornitore` si poteva scrivere solo
  // a mano da questa app, e infatti su ~1.300 ordini è quasi sempre `null` —
  // cioè il margine risultava «non calcolabile» su quasi tutto.
  //
  // ⚠️ `costoDa: "customer-service"` e non "manuale": chi legge deve poter
  // distinguere un costo deciso qui da uno arrivato da un'altra app. Un'origine
  // sbagliata fa cercare la persona che non l'ha scritto.
  //
  // ⚠️ `null` cancella il costo (il fornitore ha detto di no, la riga era
  // sbagliata) e azzera anche nome, data e origine: lasciarne uno pieno
  // vorrebbe dire un ordine che dice di avere un costo che non ha.
  if ("costoFornitore" in body) {
    const grezzo = body.costoFornitore;
    if (grezzo === null || grezzo === "") {
      data.costoFornitore = null;
      data.costoFornitoreNome = null;
      data.costoIl = null;
      data.costoDa = null;
    } else {
      const n = Number(grezzo);
      // ⚠️ Il tetto non è un vezzo: un importo assurdo arrivato da un'altra app
      // finirebbe nei margini e nei riepiloghi, e lì un numero sbagliato non si
      // riconosce — sembra un ordine andato male.
      if (!Number.isFinite(n) || n < 0 || n > 100000) {
        return erroreApi(400, "costoFornitore non è un importo valido (fra 0 e 100.000)");
      }
      data.costoFornitore = +n.toFixed(2);
      data.costoIl = new Date();
      data.costoDa = "customer-service";
      if ("costoFornitoreNome" in body) {
        data.costoFornitoreNome = body.costoFornitoreNome == null ? null : String(body.costoFornitoreNome).slice(0, 120);
      }
    }
  } else if ("costoFornitoreNome" in body) {
    // Il nome da solo si può correggere senza toccare l'importo.
    data.costoFornitoreNome = body.costoFornitoreNome == null ? null : String(body.costoFornitoreNome).slice(0, 120);
  }

  // ── LO STATO DI LAVORAZIONE, PROPOSTO DAL CUSTOMER SERVICE ──
  //
  // ⚠️ Come si evade l'ordine lo decide il Customer Service (§7.2): qui lo si
  // COPIA soltanto, per mostrarlo sulla scheda. NON è la nostra pipeline
  // (`stato`), che è un'altra cosa (registro/controllo): due campi distinti,
  // apposta. `csGestioneDa` è chi l'ha deciso, `csGestioneIl` quando (se non
  // arriva, "ora": un momento inventato è meglio di nessuna traccia).
  //
  // ⚠️ `""`/`null` azzera anche chi e quando: uno stato tolto che lasciasse un
  // autore attaccato manderebbe a cercare chi non ha deciso niente.
  if ("csGestione" in body) {
    const g = body.csGestione == null ? "" : String(body.csGestione).slice(0, 40);
    data.csGestione = g;
    if (!g) {
      data.csGestioneDa = "";
      data.csGestioneIl = null;
    } else {
      if ("csGestioneDa" in body) {
        data.csGestioneDa = body.csGestioneDa == null ? "" : String(body.csGestioneDa).slice(0, 120);
      }
      const quando = "csGestioneIl" in body ? new Date(String(body.csGestioneIl)) : new Date();
      data.csGestioneIl = Number.isNaN(quando.getTime()) ? new Date() : quando;
    }
  } else if ("csGestioneDa" in body) {
    // Il nome da solo si può correggere senza toccare lo stato.
    data.csGestioneDa = body.csGestioneDa == null ? "" : String(body.csGestioneDa).slice(0, 120);
  }

  // ── SMISTAMENTO: il CS decide se l'ordine può andare in automatico ──
  //
  // "manuale" = riservato al Customer Service: l'orders-sync della piattaforma
  // lo salta. "" (o "auto") = può andare in automatico. È l'interruttore di
  // governo del giro: l'automatico non scavalca mai il decisore.
  if ("smistamento" in body) {
    const s = body.smistamento == null ? "" : String(body.smistamento).trim().toLowerCase();
    if (s && s !== "manuale" && s !== "auto") {
      return erroreApi(400, 'smistamento: si accetta "manuale", "auto" o vuoto');
    }
    data.smistamento = s === "manuale" ? "manuale" : "";
  }

  // ── EVASIONE E CONSEGNA, PROPOSTE DAL CUSTOMER SERVICE (Standard §7.4) ──
  //
  // Il percorso A (fornitore in chat, consegna lui): il CS ci dice che
  // l'ordine è evaso da un fornitore diretto e quando è stato consegnato.
  // `piattaforma` NON si accetta da qui: quella la scrive solo il ritiro
  // dal canale della piattaforma (lib/piattaforma.ts) — due mani sullo
  // stesso campo con la stessa parola sono un conflitto che non si vede.
  if ("evasione" in body) {
    const e = body.evasione == null ? "" : String(body.evasione).slice(0, 40);
    if (e && e !== "fornitore_diretto") {
      return erroreApi(400, 'evasione: da qui si accetta solo "fornitore_diretto" (o vuoto per azzerare)');
    }
    data.evasione = e;
  }
  if ("consegnataIl" in body) {
    if (body.consegnataIl == null) {
      data.consegnataIl = null;
      data.consegnataDa = "";
    } else {
      const quando = new Date(String(body.consegnataIl));
      if (Number.isNaN(quando.getTime())) return erroreApi(400, "consegnataIl non è una data valida");
      data.consegnataIl = quando;
      data.consegnataDa =
        "consegnataDa" in body && body.consegnataDa != null
          ? String(body.consegnataDa).slice(0, 20)
          : "fornitore";
    }
  }

  // ── GLI INGREDIENTI DELLA CONSEGNA NOSTRA, DALLA PIATTAFORMA ──
  //
  // `margineOrdine()` sa gia' farci i conti — `totale − costoFornitore −
  // costoConsegna + feeConsegna` — ma finora dichiarava il margine PARZIALE con
  // la nota «la piattaforma non lo espone ancora». Adesso lo espone: la
  // piattaforma consegne e' l'unica che sa quanto e' costato il valet e quanta
  // fee di listino abbiamo trattenuto al partner.
  //
  // ⚠️ Qui arrivano gli INGREDIENTI, non il margine gia' fatto. Il margine si
  // calcola in un posto solo (Standard §7): se ogni app mandasse il proprio
  // numero, due schermate direbbero due cifre diverse e nessuno saprebbe quale
  // credere.
  //
  // ⚠️ `null` azzera: la consegna e' stata annullata o la riga era sbagliata.
  // Lasciare un vecchio costo attaccato a un ordine che non l'ha piu' e'
  // peggio che non averlo mai scritto.
  for (const campo of ["costoConsegna", "feeConsegna"] as const) {
    if (!(campo in body)) continue;
    const grezzo = body[campo];
    if (grezzo === null || grezzo === "") {
      data[campo] = null;
      continue;
    }
    const n = Number(grezzo);
    // Stesso tetto di `costoFornitore`: un importo assurdo arrivato da
    // un'altra app finisce nei margini, e li' un numero sbagliato non si
    // riconosce — sembra un ordine andato male.
    //
    // ⚠️ Sotto zero si rifiuta perche' questi sono COSTI PAGATI, e un costo
    // negativo vorrebbe dire che il valet paga noi. Il MARGINE invece puo'
    // benissimo essere negativo: e' il risultato, non un ingrediente. Chi
    // manda questi numeri li porti a zero prima (come fa la piattaforma
    // consegne, dove un minus in busta non trasforma il valet in debitore).
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return erroreApi(400, `${campo} non e' un importo valido (fra 0 e 100.000)`);
    }
    data[campo] = +n.toFixed(2);
  }

  // ── L'ECONOMIA DELLA VENDITA, gia' calcolata dalla piattaforma (26/08) ──
  // primoMargine e margineFinale sono RISULTATI e possono essere negativi
  // (un ordine venduto sotto costo esiste); feeVendita e' un importo trattenuto
  // e sotto zero non ha senso. `null` azzera, come per gli ingredienti.
  for (const campo of ["primoMargine", "feeVendita", "margineFinale"] as const) {
    if (!(campo in body)) continue;
    const grezzo = body[campo];
    if (grezzo === null || grezzo === "") {
      data[campo] = null;
      continue;
    }
    const n = Number(grezzo);
    const minimo = campo === "feeVendita" ? 0 : -100000;
    if (!Number.isFinite(n) || n < minimo || n > 100000) {
      return erroreApi(400, `${campo} non e' un importo valido (fra ${minimo} e 100.000)`);
    }
    data[campo] = +n.toFixed(2);
  }

  // ── L'INCASSO (27/08): metodo di pagamento e commissione stimata ──
  // La commissione e' un costo (mai negativa); il metodo e' testo corto.
  if ("commissioneIncassi" in body) {
    const grezzo = body.commissioneIncassi;
    if (grezzo === null || grezzo === "") data.commissioneIncassi = null;
    else {
      const n = Number(grezzo);
      if (!Number.isFinite(n) || n < 0 || n > 100000) {
        return erroreApi(400, "commissioneIncassi non e' un importo valido (fra 0 e 100.000)");
      }
      data.commissioneIncassi = +n.toFixed(2);
    }
  }
  if ("metodoIncasso" in body) {
    const grezzo = body.metodoIncasso;
    if (grezzo === null || grezzo === "") data.metodoIncasso = null;
    else if (typeof grezzo !== "string" || grezzo.length > 60) {
      return erroreApi(400, "metodoIncasso deve essere un testo di al massimo 60 caratteri");
    } else data.metodoIncasso = grezzo.trim();
  }

  if ("classificazioni" in body) {
    data.classificazioni = body.classificazioni == null ? Prisma.DbNull : body.classificazioni;
  }

  if ("stato" in body) {
    if (body.stato == null) {
      data.statoId = null;
    } else {
      const stato = await prisma.statoOrdine.findUnique({ where: { chiave: String(body.stato) } });
      if (!stato) return erroreApi(400, `stato "${body.stato}" inesistente`);
      data.statoId = stato.id;
    }
  }

  if ("etichette" in body) {
    if (!Array.isArray(body.etichette)) return erroreApi(400, "etichette deve essere un array di nomi");
    const nomi = body.etichette.map((x) => String(x).trim()).filter(Boolean);
    for (const nome of nomi) {
      await prisma.etichetta.upsert({ where: { nome }, create: { nome }, update: {} });
    }
    const rec = await prisma.etichetta.findMany({ where: { nome: { in: nomi } }, select: { id: true } });
    data.etichette = { set: rec.map((r) => ({ id: r.id })) };
  }

  data.ultimaClassifica = new Date();

  await prisma.ordine.update({ where: { id }, data: data as Prisma.OrdineUncheckedUpdateInput });
  // ⚠️ L'evento dice CHE COSA è cambiato, non solo «riclassificato»: un costo
  // che compare senza traccia manda a cercare chi l'ha messo, e la storia
  // dell'ordine è l'unico posto dove si può rispondere.
  const pezzi: string[] = [];
  if ("costoFornitore" in body) {
    pezzi.push(
      data.costoFornitore == null
        ? "costo fornitore rimosso"
        : `costo fornitore ${data.costoFornitore} €${data.costoFornitoreNome ? " — " + data.costoFornitoreNome : ""}`,
    );
  }
  if ("fornitore" in body) pezzi.push(`fornitore: ${body.fornitore ?? "—"}`);
  if ("csGestione" in body) {
    pezzi.push(
      data.csGestione
        ? `lavorazione CS: ${data.csGestione}${data.csGestioneDa ? " — " + data.csGestioneDa : ""}`
        : "stato di lavorazione CS rimosso",
    );
  }
  await prisma.eventoOrdine.create({
    data: {
      ordineId: id,
      tipo: pezzi.length ? "controllo" : "categoria",
      descrizione: pezzi.length
        ? `${pezzi.join(" · ")} (via API, ${client.nome})`
        : `Riclassificato via API (${client.nome})`,
      autore: client.nome,
    },
  });

  const aggiornato = await prisma.ordine.findUnique({ where: { id }, include: INCLUDE_ORDINE });
  return NextResponse.json(serializzaOrdine(aggiornato!, undefined, await ordinali([aggiornato!.id])));
}
