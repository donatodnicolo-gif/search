"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { ibanValido } from "./impostazioni";
import { registra, attoreCorrente } from "./registro";
import { euro } from "./format";

function revalida() {
  for (const p of ["/approvazioni", "/pagamenti", "/"]) revalidatePath(p, "layout");
}

// Approva una richiesta di pagamento in arrivo: crea un Pagamento diretto
// «predisposto» (l'esecuzione vera resta protetta dal codice email in Pagamenti
// diretti) e marca la richiesta come approvata.
export async function approvaRichiesta(id: string) {
  const r = await prisma.richiestaPagamentoIn.findUnique({ where: { id } });
  if (!r) redirect("/approvazioni?errore=" + encodeURIComponent("Richiesta non trovata."));
  if (r!.stato !== "in_attesa") redirect("/approvazioni?errore=" + encodeURIComponent("Richiesta già decisa."));
  if (!r!.iban) redirect("/approvazioni?errore=" + encodeURIComponent("Manca l'IBAN: completalo prima di approvare (Modifica), oppure crea il pagamento a mano in Pagamenti diretti."));

  const iban = r!.iban!.replace(/\s/g, "").toUpperCase();
  const attore = await attoreCorrente();
  const p = await prisma.pagamentoDiretto.create({
    data: {
      beneficiario: r!.beneficiario ?? r!.contatto ?? "Beneficiario da richiesta",
      iban,
      bic: r!.bic,
      importo: +r!.importo.toFixed(2),
      causale: r!.causale,
      note: [r!.note, r!.contatto ? `Richiesta da ${r!.origine} · ${r!.contatto}` : `Richiesta da ${r!.origine}`].filter(Boolean).join(" — "),
      ibanValido: ibanValido(iban),
    },
  });
  await prisma.richiestaPagamentoIn.update({
    where: { id },
    data: { stato: "approvata", decisoIl: new Date(), decisoDa: attore.utente, pagamentoDirettoId: p.id },
  });
  await registra({
    azione: `Approvata richiesta di pagamento ${euro(r!.importo)} a ${r!.beneficiario ?? r!.contatto ?? "—"} (da ${r!.origine})`,
    categoria: "pagamenti", entita: "pagamento_diretto", entitaId: p.id,
  });
  revalida();
  redirect(`/pagamenti/${p.id}?daRichiesta=1`);
}

export async function rifiutaRichiesta(id: string) {
  const r = await prisma.richiestaPagamentoIn.findUnique({ where: { id } });
  if (!r || r.stato !== "in_attesa") redirect("/approvazioni");
  const attore = await attoreCorrente();
  await prisma.richiestaPagamentoIn.update({
    where: { id },
    data: { stato: "rifiutata", decisoIl: new Date(), decisoDa: attore.utente },
  });
  await registra({
    azione: `Rifiutata richiesta di pagamento ${euro(r!.importo)} (da ${r!.origine})`,
    categoria: "pagamenti",
  });
  revalida();
  redirect("/approvazioni?rifiutata=1");
}

// Completa/corregge i dati di una richiesta prima di approvarla (es. IBAN letto
// male dal messaggio).
export async function aggiornaRichiesta(id: string, fd: FormData) {
  const s = (k: string) => {
    const v = fd.get(k);
    return v == null || String(v).trim() === "" ? null : String(v).trim();
  };
  const importoRaw = s("importo");
  const importo = importoRaw ? parseFloat(importoRaw.replace(",", ".")) : NaN;
  await prisma.richiestaPagamentoIn.update({
    where: { id },
    data: {
      ...(Number.isFinite(importo) && importo > 0 ? { importo: +importo.toFixed(2) } : {}),
      beneficiario: s("beneficiario"),
      iban: s("iban") ? s("iban")!.replace(/\s/g, "").toUpperCase() : null,
      bic: s("bic") ? s("bic")!.replace(/\s/g, "").toUpperCase() : null,
      causale: s("causale"),
    },
  });
  revalida();
  redirect("/approvazioni?salvata=1");
}
