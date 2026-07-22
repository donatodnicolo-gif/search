"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { parseEstratto, hashMovimento } from "./estratto";
import { chiaveControparte } from "./riconciliazione";
import { qontoOrganizzazione, qontoTransazioni } from "./qonto";

function revalidate() {
  for (const p of ["/", "/transazioni", "/fatture", "/scadenzario", "/saldi", "/partner"]) {
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

  revalidate();
  const qs = new URLSearchParams({
    import: "ok",
    nuove: String(res.count),
    doppioni: String(movimenti.movimenti.length - res.count),
    scartate: String(movimenti.scartate),
  });
  if (ibanAggiunti) qs.set("iban", String(ibanAggiunti));
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
  revalidate();
  // messaggio dedicato alla sync Qonto (distinto dall'import da file)
  redirect(`/transazioni?qonto=ok&nuove=${esito.nuove}&conti=${esito.conti}&totali=${esito.totali}`);
}

// La transazione salda una fattura: fattura → pagata con la data del movimento
export async function registraTransazioneFattura(txId: string, fatturaId: string) {
  const [tx, fattura] = await Promise.all([
    prisma.transazioneBancaria.findUnique({ where: { id: txId } }),
    prisma.fatturaServizio.findUnique({ where: { id: fatturaId }, include: { partner: true } }),
  ]);
  if (!tx || !fattura) return;
  await prisma.fatturaServizio.update({
    where: { id: fatturaId },
    data: { pagata: true, dataPagamento: tx.data },
  });
  await prisma.transazioneBancaria.update({
    where: { id: txId },
    data: {
      stato: "registrata",
      partnerId: fattura.partnerId,
      esito: `Fattura ${fattura.numero ?? "s.n."} di ${fattura.partner.nome} segnata saldata`,
    },
  });
  revalidate();
}

// La transazione è un pagamento partner: registra il bonifico (+ inviato / − ricevuto)
// sul mese indicato (o sul mese del movimento).
export async function registraTransazionePagamento(
  txId: string,
  partnerId: string,
  mese: number | null
) {
  const tx = await prisma.transazioneBancaria.findUnique({ where: { id: txId } });
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!tx || !partner) return;
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
  revalidate();
}

export async function ignoraTransazione(txId: string) {
  await prisma.transazioneBancaria.update({ where: { id: txId }, data: { stato: "ignorata" } });
  revalidate();
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
