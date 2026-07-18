"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { parseEstratto, hashMovimento } from "./estratto";
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
      hash: m.hash,
      fonte: file.name,
    })),
    skipDuplicates: true,
  });

  revalidate();
  redirect(
    `/transazioni?import=ok&nuove=${res.count}&doppioni=${movimenti.movimenti.length - res.count}&scartate=${movimenti.scartate}`
  );
}

// Sincronizza i movimenti direttamente dall'API Qonto (tutti i conti,
// movimenti completati). Stessa pipeline dell'import file: dedup per hash,
// nessuna registrazione automatica.
export async function sincronizzaQonto() {
  let nuove = 0, totali = 0, conti = 0;
  try {
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
  } catch (e) {
    redirect("/transazioni?errore=" + encodeURIComponent((e as Error).message));
  }
  revalidate();
  redirect(`/transazioni?import=ok&nuove=${nuove}&doppioni=${totali - nuove}&scartate=0`);
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
