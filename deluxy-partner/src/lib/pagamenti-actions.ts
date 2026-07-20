"use server";

// Server actions dei pagamenti diretti a fornitori. L'app predispone e traccia
// i bonifici; l'esecuzione avviene SEMPRE fuori (file SEPA autorizzato in banca).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { ibanValido } from "./impostazioni";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function n(fd: FormData, k: string): number | null {
  const t = s(fd, k);
  if (t == null) return null;
  const v = parseFloat(t.replace(/[^\d.,-]/g, "").replace(",", "."));
  return isNaN(v) ? null : v;
}

function revalida(id?: string) {
  revalidatePath("/pagamenti", "layout");
  if (id) revalidatePath(`/pagamenti/${id}`, "layout");
  revalidatePath("/", "layout");
}

export async function creaPagamentoDiretto(fd: FormData) {
  const beneficiario = s(fd, "beneficiario");
  const ibanRaw = s(fd, "iban");
  const importo = n(fd, "importo");
  if (!beneficiario || !ibanRaw || importo == null || importo <= 0) {
    throw new Error("Beneficiario, IBAN e importo (positivo) sono obbligatori.");
  }
  const iban = ibanRaw.replace(/\s/g, "").toUpperCase();
  const p = await prisma.pagamentoDiretto.create({
    data: {
      beneficiario,
      iban,
      bic: s(fd, "bic")?.replace(/\s/g, "").toUpperCase() ?? null,
      importo: +importo.toFixed(2),
      causale: s(fd, "causale"),
      fornitore: s(fd, "fornitore"),
      note: s(fd, "note"),
      ibanValido: ibanValido(iban),
    },
  });
  revalida(p.id);
  redirect(`/pagamenti/${p.id}?creato=1`);
}

export async function aggiornaPagamentoDiretto(id: string, fd: FormData) {
  const esistente = await prisma.pagamentoDiretto.findUnique({ where: { id } });
  if (!esistente) throw new Error("Pagamento non trovato.");
  if (esistente.stato === "pagato") throw new Error("Un pagamento già segnato pagato non si modifica.");
  const beneficiario = s(fd, "beneficiario");
  const ibanRaw = s(fd, "iban");
  const importo = n(fd, "importo");
  if (!beneficiario || !ibanRaw || importo == null || importo <= 0) {
    throw new Error("Beneficiario, IBAN e importo (positivo) sono obbligatori.");
  }
  const iban = ibanRaw.replace(/\s/g, "").toUpperCase();
  await prisma.pagamentoDiretto.update({
    where: { id },
    data: {
      beneficiario,
      iban,
      bic: s(fd, "bic")?.replace(/\s/g, "").toUpperCase() ?? null,
      importo: +importo.toFixed(2),
      causale: s(fd, "causale"),
      fornitore: s(fd, "fornitore"),
      note: s(fd, "note"),
      ibanValido: ibanValido(iban),
    },
  });
  revalida(id);
  redirect(`/pagamenti/${id}?salvato=1`);
}

// Segna il pagamento come eseguito (dopo aver autorizzato il bonifico in banca).
export async function segnaPagamentoEseguito(id: string, fd?: FormData) {
  const dataTxt = fd ? s(fd, "data") : null;
  const data = dataTxt ? new Date(dataTxt + "T00:00:00.000Z") : new Date();
  await prisma.pagamentoDiretto.update({
    where: { id },
    data: { stato: "pagato", dataPagamento: isNaN(data.getTime()) ? new Date() : data },
  });
  revalida(id);
  redirect(`/pagamenti/${id}`);
}

export async function annullaPagamentoDiretto(id: string) {
  await prisma.pagamentoDiretto.update({ where: { id }, data: { stato: "annullato" } });
  revalida(id);
  redirect(`/pagamenti/${id}`);
}

export async function riapriPagamentoDiretto(id: string) {
  await prisma.pagamentoDiretto.update({ where: { id }, data: { stato: "predisposto", dataPagamento: null } });
  revalida(id);
  redirect(`/pagamenti/${id}`);
}

export async function eliminaPagamentoDiretto(id: string) {
  await prisma.pagamentoDiretto.delete({ where: { id } });
  revalida();
  redirect("/pagamenti");
}
