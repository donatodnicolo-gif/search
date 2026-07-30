"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { registraEvento } from "@/lib/classificazione";
import { GESTIONI_INCASSO, movimentiUsati, salvaQuotaFornitore, valutaQuota, quotaFornitore } from "@/lib/controllo";
import { importaMovimenti, adottaControlloDaFinance } from "@/lib/movimenti";
import { eseguiAbbinamentoPerNumero } from "@/lib/abbina";
import { linkPagamento, type EsitoLink } from "@/lib/pagamento-link";
import { euro } from "@/lib/ordini";

// Le mutazioni del CONTROLLO. Ogni decisione lascia una traccia sull'ordine
// (EventoOrdine): chi guarda un margine dopo sei mesi deve poter sapere chi ha
// deciso che quell'ordine era incassato e chi ha scritto quel costo.

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

function revalida(ordineId?: string) {
  revalidatePath("/controllo");
  revalidatePath("/margini");
  revalidatePath("/impostazioni");
  if (ordineId) revalidatePath(`/ordini/${ordineId}`);
}

// ---- Import dallo specchio di Finance ----

export async function importaMovimentiBanca(fd: FormData) {
  const esito = await importaMovimenti(s(fd, "completo") === "si");
  revalida();
  const q = new URLSearchParams({
    mov: String(esito.nuovi),
    movAgg: String(esito.aggiornati),
  });
  if (esito.errore) q.set("movErrore", esito.errore);
  redirect(`/controllo?${q}`);
}

export async function adottaDaFinance() {
  const esito = await adottaControlloDaFinance();
  revalida();
  const q = new URLSearchParams({
    adInc: String(esito.incassiAdottati),
    adCos: String(esito.costiAdottati),
    adGes: String(esito.gestioniAdottate),
    adNo: String(esito.nonTrovati),
  });
  if (esito.errore) q.set("adErrore", esito.errore);
  redirect(`/controllo?${q}`);
}

export async function abbinaPerNumero() {
  const e = await eseguiAbbinamentoPerNumero();
  revalida();
  const q = new URLSearchParams({
    inc: String(e.incassi),
    incDiff: String(e.incassiImportoDiverso),
    cos: String(e.costi),
    cosFuori: String(e.costiFuoriQuota),
    cosImpl: String(e.costiImplausibili),
    amb: String(e.ambigui),
  });
  redirect(`/controllo?${q}`);
}

// ---- L'incasso di un ordine ----

// I candidati per il popup: accrediti che nessun ordine sta già usando e che
// Finance non ha già registrato per altro (una fattura, una spesa).
export type MovimentoCandidato = {
  id: string;
  data: string;
  importo: number;
  descrizione: string;
  controparte: string | null;
};

export async function cercaMovimentiIncasso(q: string): Promise<MovimentoCandidato[]> {
  const termine = (q ?? "").trim();
  const numero = parseFloat(termine.replace(/[^\d.,-]/g, "").replace(",", "."));
  const usati = await movimentiUsati();
  const movimenti = await prisma.movimentoBanca.findMany({
    where: {
      importo: { gt: 0 },
      statoFinance: { not: "registrata" },
      ...(termine
        ? {
            OR: [
              { descrizione: { contains: termine, mode: "insensitive" } },
              { controparte: { contains: termine, mode: "insensitive" } },
              ...(Number.isFinite(numero) ? [{ importo: { gte: numero - 0.01, lte: numero + 0.01 } }] : []),
            ],
          }
        : {}),
    },
    orderBy: { data: "desc" },
    take: 80,
  });
  return movimenti
    .filter((m) => !usati.has(m.id))
    .slice(0, 30)
    .map((m) => ({
      id: m.id,
      data: m.data.toISOString(),
      importo: m.importo,
      descrizione: m.descrizione,
      controparte: m.controparte,
    }));
}

// Gli addebiti candidati a essere il costo del fornitore. Qui NON si filtra per
// importo uguale al totale: il costo è una frazione, ed è il motivo per cui
// questo abbinamento non si può fare «per importo».
export async function cercaMovimentiCosto(q: string): Promise<MovimentoCandidato[]> {
  const termine = (q ?? "").trim();
  const numero = parseFloat(termine.replace(/[^\d.,-]/g, "").replace(",", "."));
  const usati = await movimentiUsati();
  const movimenti = await prisma.movimentoBanca.findMany({
    where: {
      importo: { lt: 0 },
      ...(termine
        ? {
            OR: [
              { descrizione: { contains: termine, mode: "insensitive" } },
              { controparte: { contains: termine, mode: "insensitive" } },
              ...(Number.isFinite(numero)
                ? [{ importo: { gte: -numero - 0.01, lte: -numero + 0.01 } }]
                : []),
            ],
          }
        : {}),
    },
    orderBy: { data: "desc" },
    take: 80,
  });
  return movimenti
    .filter((m) => !usati.has(m.id))
    .slice(0, 30)
    .map((m) => ({
      id: m.id,
      data: m.data.toISOString(),
      importo: m.importo,
      descrizione: m.descrizione,
      controparte: m.controparte,
    }));
}

export async function abbinaIncasso(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  const movimentoId = s(fd, "movimentoId");
  if (!ordineId || !movimentoId) return;
  const movimento = await prisma.movimentoBanca.findUnique({ where: { id: movimentoId } });
  if (!movimento) return;
  await prisma.ordine.update({
    where: { id: ordineId },
    data: { statoIncasso: "riconciliato", movimentoIncassoId: movimentoId, incassatoIl: movimento.data },
  });
  await registraEvento(
    ordineId,
    "controllo",
    `Incasso abbinato al movimento del ${movimento.data.toLocaleDateString("it-IT")} (${euro(movimento.importo)})`,
  );
  revalida(ordineId);
}

// Incassato ma senza movimento da abbinare (contrassegno, contante, gateway):
// resta scritto che l'abbiamo deciso noi, non la banca.
export async function segnaIncassato(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  if (!ordineId) return;
  await prisma.ordine.update({
    where: { id: ordineId },
    data: { statoIncasso: "riconciliato", incassatoIl: new Date(), movimentoIncassoId: null },
  });
  await registraEvento(ordineId, "controllo", "Segnato incassato a mano, senza movimento bancario");
  revalida(ordineId);
}

export async function ignoraIncasso(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  if (!ordineId) return;
  await prisma.ordine.update({ where: { id: ordineId }, data: { statoIncasso: "ignorato" } });
  await registraEvento(ordineId, "controllo", "Incasso ignorato: fuori dal conto per scelta");
  revalida(ordineId);
}

export async function riapriIncasso(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  if (!ordineId) return;
  await prisma.ordine.update({
    where: { id: ordineId },
    data: { statoIncasso: "da_riconciliare", movimentoIncassoId: null, incassatoIl: null },
  });
  await registraEvento(ordineId, "controllo", "Incasso riaperto: torna da riconciliare");
  revalida(ordineId);
}

export async function impostaGestioneIncasso(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  const scelta = s(fd, "gestione");
  if (!ordineId || !scelta || !(scelta in GESTIONI_INCASSO)) return;
  const ordine = await prisma.ordine.findUnique({ where: { id: ordineId }, select: { gestioneIncasso: true } });
  if (!ordine || ordine.gestioneIncasso === scelta) return;
  await prisma.ordine.update({ where: { id: ordineId }, data: { gestioneIncasso: scelta } });
  await registraEvento(
    ordineId,
    "controllo",
    `Come si incassa: «${GESTIONI_INCASSO[ordine.gestioneIncasso]?.nome ?? ordine.gestioneIncasso}» → «${GESTIONI_INCASSO[scelta].nome}»`,
  );
  revalida(ordineId);
}

// ---- Il costo del fornitore ----

export async function registraCosto(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  if (!ordineId) return;
  const importo = parseFloat((s(fd, "importo") ?? "").replace(",", "."));
  if (!Number.isFinite(importo) || importo < 0) {
    redirect(`/ordini/${ordineId}?erroreCosto=${encodeURIComponent("Indica quanto è stato pagato al fornitore.")}`);
  }
  const movimentoId = s(fd, "movimentoId");
  const movimento = movimentoId ? await prisma.movimentoBanca.findUnique({ where: { id: movimentoId } }) : null;
  const dataTxt = s(fd, "data");
  const ordine = await prisma.ordine.findUnique({ where: { id: ordineId }, select: { totale: true } });
  const quota = await quotaFornitore();

  await prisma.ordine.update({
    where: { id: ordineId },
    data: {
      costoFornitore: +importo.toFixed(2),
      costoFornitoreNome: s(fd, "fornitore") ?? movimento?.controparte ?? null,
      costoMovimentoId: movimento?.id ?? null,
      costoIl: movimento?.data ?? (dataTxt ? new Date(`${dataTxt}T12:00:00Z`) : new Date()),
      costoDa: "manuale",
    },
  });
  const v = ordine ? valutaQuota(ordine.totale, importo, quota) : null;
  await registraEvento(
    ordineId,
    "controllo",
    `Costo fornitore ${euro(importo)}${v ? ` (${v.pct.toFixed(0)}% del valore, quota attesa ${quota}%)` : ""}`,
  );
  // Nessun redirect: l'azione si usa sia dalla scheda dell'ordine sia dal popup
  // della pagina Controllo, e portare via da lì chi sta lavorando su venti righe
  // gli farebbe perdere il posto.
  revalida(ordineId);
}

export async function azzeraCosto(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  if (!ordineId) return;
  await prisma.ordine.update({
    where: { id: ordineId },
    data: { costoFornitore: null, costoFornitoreNome: null, costoMovimentoId: null, costoIl: null, costoDa: null },
  });
  await registraEvento(ordineId, "controllo", "Costo fornitore rimosso");
  revalida(ordineId);
}

// ---- Il link per far pagare un ordine ----
// Si chiede a Shopify sul momento e NON si salva: dentro c'è un segreto, e un
// link vecchio salvato sarebbe una bugia con dentro una chiave. Chi lo chiede
// resta scritto nella storia dell'ordine, perché mandare un link di pagamento è
// un fatto, non una consultazione.
export async function chiediLinkPagamento(ordineId: string): Promise<EsitoLink> {
  const esito = await linkPagamento(ordineId);
  if (esito.ok) {
    await registraEvento(
      ordineId,
      "controllo",
      `Chiesto il link di pagamento Shopify${esito.daPagare != null ? ` (${euro(esito.daPagare)} da incassare)` : ""}`,
    );
  }
  return esito;
}

// ---- La quota attesa ----

export async function salvaQuota(fd: FormData) {
  const quota = Number((s(fd, "quota") ?? "").replace(",", "."));
  if (!Number.isFinite(quota)) return;
  await salvaQuotaFornitore(quota);
  revalida();
}
