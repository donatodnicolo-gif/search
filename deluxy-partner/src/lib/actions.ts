"use server";

// Server actions: tutte le mutazioni dell'app passano da qui.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function n(fd: FormData, k: string): number | null {
  const t = s(fd, k);
  if (t == null) return null;
  const v = parseFloat(t.replace(",", "."));
  return isNaN(v) ? null : v;
}
function b(fd: FormData, k: string): boolean {
  return fd.get(k) === "on" || fd.get(k) === "true";
}
function d(fd: FormData, k: string): Date | null {
  const t = s(fd, k);
  if (!t) return null;
  const date = new Date(t + "T00:00:00.000Z");
  return isNaN(date.getTime()) ? null : date;
}

function revalidateAll() {
  for (const p of ["/", "/partner", "/fatture", "/vendite", "/saldi", "/scadenzario", "/report"]) {
    revalidatePath(p, "layout");
  }
}

// ---------- Partner ----------

function partnerData(fd: FormData) {
  return {
    nome: s(fd, "nome") ?? "",
    ragioneSociale: s(fd, "ragioneSociale"),
    categoria: s(fd, "categoria"),
    citta: s(fd, "citta"),
    servizi: s(fd, "servizi"),
    clienteAnno: s(fd, "clienteAnno"),
    feePercent: n(fd, "feePercent"),
    debiti2025: n(fd, "debiti2025") ?? 0,
    pdrDebito: s(fd, "pdrDebito"),
    crediti2025: n(fd, "crediti2025") ?? 0,
    ggPagamento: Math.round(n(fd, "ggPagamento") ?? 0),
    compensazione: b(fd, "compensazione"),
    commissioniADetrazione: b(fd, "commissioniADetrazione"),
    addebitoDiretto: b(fd, "addebitoDiretto"),
    cartaCreditoApp: b(fd, "cartaCreditoApp"),
    iban: s(fd, "iban"),
    email: s(fd, "email"),
    telefono: s(fd, "telefono"),
    note: s(fd, "note"),
    attivo: b(fd, "attivo"),
  };
}

export async function createPartner(fd: FormData) {
  const data = partnerData(fd);
  if (!data.nome) throw new Error("Nome obbligatorio");
  const p = await prisma.partner.create({ data });
  revalidateAll();
  redirect(`/partner/${p.id}`);
}

export async function updatePartner(id: string, fd: FormData) {
  const data = partnerData(fd);
  if (!data.nome) throw new Error("Nome obbligatorio");
  await prisma.partner.update({ where: { id }, data });
  revalidateAll();
  redirect(`/partner/${id}`);
}

// ---------- Fatture servizi ----------

export async function createFattura(fd: FormData) {
  const partnerId = s(fd, "partnerId");
  const tipologiaId = s(fd, "tipologiaId");
  const imponibile = n(fd, "imponibile");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  if (!partnerId || !tipologiaId || imponibile == null || !anno || !mese) {
    throw new Error("Compilare partner, tipologia, periodo e imponibile");
  }
  const emissione = d(fd, "emissione");
  let scadenza = d(fd, "scadenza");
  if (!scadenza && emissione) {
    // scadenza automatica dai giorni di pagamento del partner
    const p = await prisma.partner.findUnique({ where: { id: partnerId } });
    scadenza = new Date(emissione.getTime() + (p?.ggPagamento ?? 0) * 86400000);
  }
  await prisma.fatturaServizio.create({
    data: {
      partnerId,
      tipologiaId,
      anno,
      mese,
      numero: s(fd, "numero"),
      emissione,
      scadenza,
      imponibile,
      aliquotaIva: n(fd, "aliquotaIva") ?? 22,
      pagata: b(fd, "pagata"),
      dataPagamento: d(fd, "dataPagamento"),
      descrizione: s(fd, "descrizione"),
    },
  });
  revalidateAll();
  redirect(`/fatture?anno=${anno}&mese=${mese}`);
}

export async function updateFattura(id: string, fd: FormData) {
  const imponibile = n(fd, "imponibile");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  const tipologiaId = s(fd, "tipologiaId");
  if (imponibile == null || !anno || !mese || !tipologiaId) {
    throw new Error("Compilare tipologia, periodo e imponibile");
  }
  await prisma.fatturaServizio.update({
    where: { id },
    data: {
      tipologiaId,
      anno,
      mese,
      numero: s(fd, "numero"),
      emissione: d(fd, "emissione"),
      scadenza: d(fd, "scadenza"),
      imponibile,
      aliquotaIva: n(fd, "aliquotaIva") ?? 22,
      pagata: b(fd, "pagata"),
      dataPagamento: b(fd, "pagata") ? d(fd, "dataPagamento") : null,
      descrizione: s(fd, "descrizione"),
    },
  });
  revalidateAll();
  redirect(`/fatture/${id}?salvato=1`);
}

export async function segnaFatturaPagata(id: string, pagata: boolean, dataPagamento?: string) {
  await prisma.fatturaServizio.update({
    where: { id },
    data: {
      pagata,
      dataPagamento: pagata
        ? dataPagamento
          ? new Date(dataPagamento + "T00:00:00.000Z")
          : new Date()
        : null,
    },
  });
  revalidateAll();
}

export async function deleteFattura(id: string) {
  await prisma.fatturaServizio.delete({ where: { id } });
  revalidateAll();
}

// ---------- Vendite vendor ----------

export async function createVendita(fd: FormData) {
  const partnerId = s(fd, "partnerId");
  const incassoLordo = n(fd, "incassoLordo");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  if (!partnerId || incassoLordo == null || !anno || !mese) {
    throw new Error("Compilare partner, periodo e incasso");
  }
  let feePercent = n(fd, "feePercent");
  if (feePercent == null) {
    const p = await prisma.partner.findUnique({ where: { id: partnerId } });
    feePercent = p?.feePercent ?? 0;
  }
  await prisma.venditaVendor.create({
    data: {
      partnerId,
      anno,
      mese,
      data: d(fd, "data"),
      descrizione: s(fd, "descrizione"),
      incassoLordo,
      feePercent,
    },
  });
  revalidateAll();
  redirect(`/vendite?anno=${anno}&mese=${mese}`);
}

// Modifica una vendita esistente (incasso, fee, periodo, descrizione).
// La fee è memorizzata sulla singola vendita: cambiarla qui aggiorna commissione
// e dovuto di quel movimento senza toccare le altre vendite.
export async function updateVendita(id: string, fd: FormData) {
  const incassoLordo = n(fd, "incassoLordo");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  const feePercent = n(fd, "feePercent");
  if (incassoLordo == null || !anno || !mese || feePercent == null) {
    throw new Error("Compilare incasso, periodo e fee");
  }
  await prisma.venditaVendor.update({
    where: { id },
    data: { incassoLordo, anno, mese, feePercent, data: d(fd, "data"), descrizione: s(fd, "descrizione") },
  });
  revalidateAll();
  redirect(`/vendite/${id}?salvato=1`);
}

// Riallinea la fee di tutte le vendite di un partner (di un anno) alla fee
// attuale del partner. Usato quando si corregge la fee e la si vuole applicare
// anche ai movimenti già registrati.
export async function riallineaFeeVendite(partnerId: string, anno: number) {
  const p = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!p) return;
  await prisma.venditaVendor.updateMany({
    where: { partnerId, anno },
    data: { feePercent: p.feePercent ?? 0 },
  });
  revalidateAll();
  redirect(`/partner/${partnerId}`);
}

export async function deleteVendita(id: string) {
  await prisma.venditaVendor.delete({ where: { id } });
  revalidateAll();
}

// ---------- Saldo mensile / bonifici ----------

export async function upsertSaldo(fd: FormData) {
  const partnerId = s(fd, "partnerId");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  if (!partnerId || !anno || !mese) throw new Error("Partner e periodo obbligatori");
  const data = {
    commFattEmessa: b(fd, "commFattEmessa"),
    commFattNumero: s(fd, "commFattNumero"),
    aggiunte: n(fd, "aggiunte") ?? 0,
    detrazioni: n(fd, "detrazioni") ?? 0,
    dataPagamento: d(fd, "dataPagamento"),
    bonificoImporto: n(fd, "bonificoImporto"),
    bonificoData: d(fd, "bonificoData"),
    chiuso: b(fd, "chiuso"),
    note: s(fd, "note"),
  };
  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, ...data },
    update: data,
  });
  revalidateAll();
  const back = s(fd, "back");
  if (back) redirect(back);
}

// Registra rapidamente un bonifico a pareggio del saldo del mese
export async function registraBonifico(
  partnerId: string,
  anno: number,
  mese: number,
  importo: number,
  dataIso?: string
) {
  const data = dataIso ? new Date(dataIso + "T00:00:00.000Z") : new Date();
  const esistente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
  });
  const nuovoImporto = (esistente?.bonificoImporto ?? 0) + importo;
  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, bonificoImporto: importo, bonificoData: data, dataPagamento: data },
    update: { bonificoImporto: nuovoImporto, bonificoData: data, dataPagamento: esistente?.dataPagamento ?? data },
  });
  revalidateAll();
}

// Registra il pagamento di un mese dalla scheda partner, indicando importo, data
// e direzione: "inviato" = abbiamo pagato noi il partner (bonifico > 0),
// "ricevuto" = ha pagato il partner (bonifico < 0). Si somma a quanto già registrato.
export async function registraPagamentoMese(
  partnerId: string,
  anno: number,
  mese: number,
  direzione: "inviato" | "ricevuto",
  fd: FormData
) {
  const importo = n(fd, "importo");
  if (importo == null || Math.abs(importo) < 0.005) return;
  const firmato = direzione === "inviato" ? Math.abs(importo) : -Math.abs(importo);
  const data = d(fd, "data") ?? new Date();
  const esistente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
  });
  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, bonificoImporto: firmato, bonificoData: data, dataPagamento: data },
    update: {
      bonificoImporto: (esistente?.bonificoImporto ?? 0) + firmato,
      bonificoData: data,
      dataPagamento: data,
    },
  });
  revalidateAll();
}

// Salva le note del mese (dalla scheda partner). Le note vengono incluse nel
// prompt del recap AI.
export async function salvaNoteMese(
  partnerId: string,
  anno: number,
  mese: number,
  fd: FormData
) {
  const note = s(fd, "note");
  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, note },
    update: { note },
  });
  revalidateAll();
}

// Annulla i pagamenti registrati per un mese (torna a "da saldare")
export async function azzeraPagamentoMese(partnerId: string, anno: number, mese: number) {
  await prisma.saldoMensile.updateMany({
    where: { partnerId, anno, mese },
    data: { bonificoImporto: null, bonificoData: null, dataPagamento: null, chiuso: false },
  });
  revalidateAll();
}

// Segna saldate (o riapre) tutte le fatture servizi di un mese di un partner
export async function segnaFattureMesePagate(
  partnerId: string,
  anno: number,
  mese: number,
  pagata: boolean
) {
  await prisma.fatturaServizio.updateMany({
    where: { partnerId, anno, mese },
    data: { pagata, dataPagamento: pagata ? new Date() : null },
  });
  revalidateAll();
}
