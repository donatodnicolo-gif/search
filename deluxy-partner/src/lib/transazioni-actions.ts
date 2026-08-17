"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { parseEstratto, hashMovimento } from "./estratto";
import { chiaveControparte } from "./riconciliazione";
import { qontoOrganizzazione, qontoTransazioni } from "./qonto";
import { segnaFatturaPagataConEsito } from "./actions";
import { registra } from "./registro";

function revalidate() {
  for (const p of ["/", "/transazioni", "/fatture", "/scadenzario", "/saldi", "/partner"]) {
    revalidatePath(p, "layout");
  }
}

// Come `revalidate()`, ma SENZA /transazioni. Serve alle azioni di riga: quella
// pagina è `force-dynamic` (si ricostruisce a ogni visita, quindi non resta mai
// indietro), mentre rivalidarla qui farebbe sparire la riga nello stesso istante
// in cui compare l'esito — e chi ha premuto resterebbe di nuovo senza risposta.
// Il rinfresco lo chiede il client dopo un paio di secondi, letto il messaggio.
function revalidateTranneLista() {
  for (const p of ["/", "/fatture", "/scadenzario", "/saldi", "/partner"]) {
    revalidatePath(p, "layout");
  }
}

// Importa un estratto conto (CSV/XLSX). Dedup per hash: ricaricare lo stesso
// file o periodi sovrapposti non crea doppioni.
export async function importaEstratto(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/transazioni?errore=" + encodeURIComponent("Seleziona un file CSV o XLSX."));
  }
  if (file.size > 10 * 1024 * 1024) {
    redirect("/transazioni?errore=" + encodeURIComponent("File troppo grande (max 10 MB)."));
  }

  let movimenti;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    movimenti = parseEstratto(buffer, file.name);
  } catch (e) {
    redirect("/transazioni?errore=" + encodeURIComponent((e as Error).message));
  }

  const res = await prisma.transazioneBancaria.createMany({
    data: movimenti.movimenti.map((m) => ({
      data: m.data,
      importo: m.importo,
      descrizione: m.descrizione.slice(0, 500),
      controparte: m.controparte?.slice(0, 200) ?? null,
      ibanControparte: m.ibanControparte,
      hash: m.hash,
      fonte: file.name,
    })),
    skipDuplicates: true,
  });

  // Riallinea l'IBAN anche sui movimenti già presenti (un ricarico dello stesso
  // estratto serve proprio a recuperare gli IBAN che prima scartavamo).
  let ibanAggiunti = 0;
  for (const m of movimenti.movimenti) {
    if (!m.ibanControparte) continue;
    const u = await prisma.transazioneBancaria.updateMany({
      where: { hash: m.hash, ibanControparte: null },
      data: { ibanControparte: m.ibanControparte },
    });
    ibanAggiunti += u.count;
  }

  // Se il file porta nuovi movimenti, prova l'abbinamento automatico ordini per
  // numero d'ordine in causale (incassi + costi fornitore). Best-effort.
  let abbinati = { incassi: 0, costi: 0 };
  if (res.count > 0) {
    try {
      const { eseguiAbbinamentoPerNumero } = await import("./ordini-abbina");
      const e = await eseguiAbbinamentoPerNumero();
      abbinati = { incassi: e.incassi, costi: e.costi };
    } catch (err) {
      console.warn("[transazioni] abbinamento automatico ordini non riuscito:", (err as Error).message);
    }
  }

  revalidate();
  const qs = new URLSearchParams({
    import: "ok",
    nuove: String(res.count),
    doppioni: String(movimenti.movimenti.length - res.count),
    scartate: String(movimenti.scartate),
  });
  if (ibanAggiunti) qs.set("iban", String(ibanAggiunti));
  if (abbinati.incassi || abbinati.costi) {
    qs.set("abbIncassi", String(abbinati.incassi));
    qs.set("abbCosti", String(abbinati.costi));
  }
  redirect(`/transazioni?${qs.toString()}`);
}

// Sincronizza i movimenti direttamente dall'API Qonto (tutti i conti,
// movimenti completati). Stessa pipeline dell'import file: dedup per hash,
// nessuna registrazione automatica.
// Nucleo riutilizzabile: lo usano sia il bottone in pagina sia il cron notturno.
// Scarica e deduplica; NON registra nulla: i movimenti restano "nuovi" e in
// attesa di conferma dell'operatore in /transazioni.
export async function scaricaMovimentiQonto(): Promise<{ nuove: number; totali: number; conti: number }> {
  let nuove = 0, totali = 0, conti = 0;
  const org = await qontoOrganizzazione();
  for (const conto of org.conti) {
    if (conto.status && conto.status !== "active") continue;
    conti++;
    const txs = await qontoTransazioni(conto.iban);
    totali += txs.length;
    if (!txs.length) continue;
    const res = await prisma.transazioneBancaria.createMany({
      data: txs.map((t) => {
        const data = new Date(t.settled_at ?? t.emitted_at);
        const importo = t.side === "credit" ? Math.abs(t.amount) : -Math.abs(t.amount);
        const descrizione = [t.label, t.reference].filter(Boolean).join(" — ") || "(senza descrizione)";
        return {
          data,
          importo,
          divisa: t.currency ?? "EUR",
          descrizione: descrizione.slice(0, 500),
          controparte: t.label?.slice(0, 200) ?? null,
          hash: hashMovimento(data, importo, `qonto:${t.transaction_id}`),
          fonte: `Qonto (${conto.iban.slice(-8)})`,
        };
      }),
      skipDuplicates: true,
    });
    nuove += res.count;
  }
  // traccia dell'ultima sincronizzazione riuscita (mostrata in /transazioni)
  await prisma.impostazione.upsert({
    where: { chiave: "qonto.ultimaSync" },
    create: { chiave: "qonto.ultimaSync", valore: new Date().toISOString() },
    update: { valore: new Date().toISOString() },
  });
  return { nuove, totali, conti };
}

export async function sincronizzaQonto() {
  let esito: { nuove: number; totali: number; conti: number };
  try {
    esito = await scaricaMovimentiQonto();
  } catch (e) {
    redirect("/transazioni?errore=" + encodeURIComponent(`Sincronizzazione Qonto fallita: ${(e as Error).message}`));
  }
  if (esito.nuove > 0) {
    try {
      const { eseguiAbbinamentoPerNumero } = await import("./ordini-abbina");
      await eseguiAbbinamentoPerNumero();
    } catch (err) {
      console.warn("[qonto] abbinamento automatico ordini non riuscito:", (err as Error).message);
    }
  }
  revalidate();
  // messaggio dedicato alla sync Qonto (distinto dall'import da file)
  redirect(`/transazioni?qonto=ok&nuove=${esito.nuove}&conti=${esito.conti}&totali=${esito.totali}`);
}

// Esito di un'azione di riga in /transazioni, mostrato ACCANTO al bottone.
// Prima queste azioni non tornavano niente: se andavano a buon fine la riga
// spariva, se fallivano non compariva nulla — e «non fa niente» è esattamente
// ciò che si è visto (movimento CONLESTELLE del 04/08 rimasto «nuova»).
export type EsitoRiga = { ok: boolean; testo: string } | null;

// Gli errori con `digest` NEXT_* sono il modo in cui Next implementa redirect e
// notFound: intercettarli li spegnerebbe. Vanno sempre rilanciati.
function eDiNext(e: unknown): boolean {
  return typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_");
}

function messaggioErrore(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  // I due errori che l'operatore può risolvere da sé, detti in italiano.
  if (/timeout|timed out|aborted/i.test(m)) return "Il salvataggio ha impiegato troppo e si è interrotto. Riprova: se il movimento è già registrato lo trovi in fondo.";
  if (/Server Action|Failed to find/i.test(m)) return "La pagina è rimasta aperta da prima di un aggiornamento dell'app: ricaricala (F5) e ripremi.";
  return m.slice(0, 300);
}

// La transazione salda una fattura: fattura → pagata con la data del movimento
export async function registraTransazioneFattura(txId: string, fatturaId: string): Promise<EsitoRiga> {
  try {
    const [tx, fattura] = await Promise.all([
      prisma.transazioneBancaria.findUnique({ where: { id: txId } }),
      prisma.fatturaServizio.findUnique({ where: { id: fatturaId }, include: { partner: true } }),
    ]);
    // Non è più un `return` muto: se uno dei due non c'è, chi ha premuto deve
    // sapere perché non è successo niente.
    if (!tx) return { ok: false, testo: "Il movimento non esiste più (forse è stato eliminato da un'altra scheda). Ricarica la pagina." };
    if (!fattura) return { ok: false, testo: "La fattura non esiste più. Ricarica la pagina." };
    if (tx.stato === "registrata") return { ok: false, testo: `Questo movimento risulta già registrato${tx.esito ? `: ${tx.esito}` : ""}.` };

    // Passa dalla funzione unica: segna pagata + data, registra l'incasso sul saldo
    // del mese (partner in compensazione), aggiorna il registro Pagamenti e allinea
    // Fatture in Cloud. Prima qui si scriveva solo il flag e le altre sezioni
    // restavano indietro (fattura «Da incassare» su FIC).
    const { ficAllineata } = await segnaFatturaPagataConEsito(fatturaId, true, tx.data);

    // L'avviso su FIC va scritto SUL MOVIMENTO, non solo restituito: appena la
    // riga viene registrata sparisce da «Match trovati» e un messaggio a video
    // se ne andrebbe con lei. Nello storico invece resta leggibile.
    const numero = fattura.numero ?? "s.n.";
    const avvisoFic = ficAllineata === false ? " · su Fatture in Cloud NON allineata (allineala da Registrazioni → Fatture)" : "";
    await prisma.transazioneBancaria.update({
      where: { id: txId },
      data: {
        stato: "registrata",
        partnerId: fattura.partnerId,
        esito: `Fattura ${numero} di ${fattura.partner.nome} segnata saldata${avvisoFic}`,
      },
    });
    await registra({
      azione: `Movimento bancario riconciliato con la fattura ${numero}`,
      categoria: "transazioni", entita: "fattura", entitaId: fattura.id, partner: fattura.partner.nome,
    });
    revalidateTranneLista();
    return {
      ok: true,
      testo: `Fattura ${numero} saldata${ficAllineata === false ? " — ma su Fatture in Cloud resta «da incassare»: allineala da Registrazioni → Fatture" : ""}`,
    };
  } catch (e) {
    if (eDiNext(e)) throw e;
    console.error("[transazioni] registraTransazioneFattura non riuscita:", e);
    return { ok: false, testo: messaggioErrore(e) };
  }
}

// La transazione è un pagamento partner: registra il bonifico (+ inviato / − ricevuto)
// sul mese indicato (o sul mese del movimento).
export async function registraTransazionePagamento(
  txId: string,
  partnerId: string,
  mese: number | null
): Promise<EsitoRiga> {
  try {
  const tx = await prisma.transazioneBancaria.findUnique({ where: { id: txId } });
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!tx) return { ok: false, testo: "Il movimento non esiste più. Ricarica la pagina." };
  if (!partner) return { ok: false, testo: "Il partner non esiste più. Ricarica la pagina." };
  if (tx.stato === "registrata") return { ok: false, testo: `Questo movimento risulta già registrato${tx.esito ? `: ${tx.esito}` : ""}.` };
  const anno = tx.data.getUTCFullYear();
  const meseEff = mese ?? tx.data.getUTCMonth() + 1;
  // convenzione interna: bonifico > 0 inviato al partner, < 0 ricevuto.
  // In banca l'addebito è negativo (noi paghiamo) → inviato positivo.
  const importoFirmato = tx.importo < 0 ? Math.abs(tx.importo) : -Math.abs(tx.importo);
  const esistente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese: meseEff } },
  });
  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese: meseEff } },
    create: { partnerId, anno, mese: meseEff, bonificoImporto: importoFirmato, bonificoData: tx.data, dataPagamento: tx.data },
    update: {
      bonificoImporto: (esistente?.bonificoImporto ?? 0) + importoFirmato,
      bonificoData: tx.data,
      dataPagamento: esistente?.dataPagamento ?? tx.data,
    },
  });
  await prisma.transazioneBancaria.update({
    where: { id: txId },
    data: {
      stato: "registrata",
      partnerId,
      esito: `${importoFirmato > 0 ? "Bonifico inviato a" : "Incasso da"} ${partner.nome} — ${nomeMeseIt(meseEff)} ${anno}`,
    },
  });
  await registra({
    azione: `Movimento bancario registrato come ${importoFirmato > 0 ? "bonifico al partner" : "incasso dal partner"} (${nomeMeseIt(meseEff)} ${anno})`,
    categoria: "transazioni", entita: "partner", entitaId: partnerId, partner: partner.nome,
  });
  revalidateTranneLista();
  return {
    ok: true,
    testo: `${importoFirmato > 0 ? "Bonifico a" : "Incasso da"} ${partner.nome} registrato su ${nomeMeseIt(meseEff)} ${anno}`,
  };
  } catch (e) {
    if (eDiNext(e)) throw e;
    console.error("[transazioni] registraTransazionePagamento non riuscita:", e);
    return { ok: false, testo: messaggioErrore(e) };
  }
}

export async function ignoraTransazione(txId: string): Promise<EsitoRiga> {
  try {
    await prisma.transazioneBancaria.update({ where: { id: txId }, data: { stato: "ignorata" } });
    revalidateTranneLista();
    return { ok: true, testo: "Movimento messo fra gli ignorati (si ripristina dallo storico)" };
  } catch (e) {
    if (eDiNext(e)) throw e;
    console.error("[transazioni] ignoraTransazione non riuscita:", e);
    return { ok: false, testo: messaggioErrore(e) };
  }
}

// Associa a mano un partner a un movimento non riconosciuto: registra il
// movimento sul partner (incasso/bonifico) E memorizza la regola controparte →
// partner, così i movimenti futuri dello stesso soggetto si riconoscono da soli.
export async function associaControparte(txId: string, fd: FormData) {
  const partnerId = String(fd.get("partnerId") ?? "");
  if (!partnerId) return;
  const tx = await prisma.transazioneBancaria.findUnique({ where: { id: txId } });
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!tx || !partner) return;

  // 1. salva/rinforza la regola sulla controparte
  const chiave = chiaveControparte(tx);
  if (chiave) {
    await prisma.associazioneControparte.upsert({
      where: { chiave },
      create: { chiave, partnerId, partnerNome: partner.nome, esempio: (tx.controparte ?? tx.descrizione).slice(0, 200) },
      update: { partnerId, partnerNome: partner.nome, usi: { increment: 1 } },
    });
  }

  // 2. registra questo movimento sul partner (stessa logica del pagamento)
  const anno = tx.data.getUTCFullYear();
  const meseEff = tx.data.getUTCMonth() + 1;
  const importoFirmato = tx.importo < 0 ? Math.abs(tx.importo) : -Math.abs(tx.importo);
  const esistente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese: meseEff } },
  });
  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese: meseEff } },
    create: { partnerId, anno, mese: meseEff, bonificoImporto: importoFirmato, bonificoData: tx.data, dataPagamento: tx.data },
    update: {
      bonificoImporto: (esistente?.bonificoImporto ?? 0) + importoFirmato,
      bonificoData: tx.data,
      dataPagamento: esistente?.dataPagamento ?? tx.data,
    },
  });
  await prisma.transazioneBancaria.update({
    where: { id: txId },
    data: {
      stato: "registrata",
      partnerId,
      esito: `${importoFirmato > 0 ? "Bonifico a" : "Incasso da"} ${partner.nome} (associazione salvata) — ${nomeMeseIt(meseEff)} ${anno}`,
    },
  });
  revalidate();
}

export async function eliminaAssociazione(id: string) {
  await prisma.associazioneControparte.delete({ where: { id } });
  revalidate();
}

// Ignora in blocco un elenco di transazioni (es. tutte le non riconosciute:
// spese carta, fornitori, incassi e-commerce estranei ai partner).
export async function ignoraTransazioni(ids: string[]) {
  if (!ids.length) return;
  await prisma.transazioneBancaria.updateMany({
    where: { id: { in: ids }, stato: "nuova" },
    data: { stato: "ignorata" },
  });
  revalidate();
}

export async function ripristinaTransazione(txId: string) {
  await prisma.transazioneBancaria.update({
    where: { id: txId },
    data: { stato: "nuova", esito: null, partnerId: null },
  });
  revalidate();
}

// Svuota le transazioni non ancora registrate (per rifare un import pulito)
export async function eliminaTransazioniNonRegistrate() {
  await prisma.transazioneBancaria.deleteMany({ where: { stato: { in: ["nuova", "ignorata"] } } });
  revalidate();
}

function nomeMeseIt(m: number): string {
  return ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"][m - 1] ?? String(m);
}
