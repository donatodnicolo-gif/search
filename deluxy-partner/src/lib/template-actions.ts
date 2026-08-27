"use server";

// Server actions dei template dei documenti: crea, modifica, predefinito,
// attiva/disattiva, elimina.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { registra } from "./registro";
import { rendiPredefinito } from "./template-documento";
import { logoAccettabile } from "./documento-costanti";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function num(fd: FormData, k: string, dflt: number): number {
  const t = s(fd, k);
  if (!t) return dflt;
  const x = parseFloat(t.replace(",", "."));
  return isNaN(x) ? dflt : x;
}

function rivalida(id?: string) {
  revalidatePath("/template", "layout");
  if (id) revalidatePath(`/template/${id}`, "layout");
  // I documenti mostrano l'intestazione: cambiandola cambiano anche loro.
  revalidatePath("/proforma", "layout");
}

/** I campi che l'utente scrive, letti una volta sola per crea e modifica. */
function campiDaForm(fd: FormData) {
  return {
    nome: s(fd, "nome") ?? "",
    brand: s(fd, "brand"),
    ragioneSociale: s(fd, "ragioneSociale") ?? "",
    indirizzo: s(fd, "indirizzo"),
    piva: s(fd, "piva"),
    codiceFiscale: s(fd, "codiceFiscale"),
    rea: s(fd, "rea"),
    contatti: s(fd, "contatti"),
    logoDataUrl: s(fd, "logoDataUrl"),
    iban: s(fd, "iban"),
    intestatarioConto: s(fd, "intestatarioConto"),
    modalitaPagamento: s(fd, "modalitaPagamento"),
    noteDefault: s(fd, "noteDefault"),
    disclaimer: s(fd, "disclaimer"),
    aliquotaIvaDefault: num(fd, "aliquotaIvaDefault", 22),
    attivo: fd.get("attivo") != null,
  };
}

/**
 * ⚠️ Gli errori si riportano nell'URL e si mostrano nel form, non si
 * inghiottono: un salvataggio che non avviene e non lo dice è la cosa peggiore
 * che possa fare una pagina di configurazione — si torna il giorno dopo e il
 * documento esce ancora sbagliato.
 */
function errore(dove: string, messaggio: string): never {
  redirect(`${dove}?errore=${encodeURIComponent(messaggio)}`);
}

export async function creaTemplate(fd: FormData) {
  const c = campiDaForm(fd);
  if (!c.nome) errore("/template/nuovo", "Serve un nome: è quello con cui si sceglie il template.");
  if (!c.ragioneSociale) {
    errore("/template/nuovo", "Serve la ragione sociale di chi emette: è il primo dato che la legge chiede in testa al documento.");
  }
  const logo = logoAccettabile(c.logoDataUrl ?? "");
  if (!logo.ok) errore("/template/nuovo", logo.perche);

  let creato;
  try {
    creato = await prisma.templateDocumento.create({ data: c });
  } catch (e: any) {
    // Nome e brand sono unici: dirlo a parole, non lasciare l'errore Prisma.
    if (e?.code === "P2002") {
      const campo = String(e?.meta?.target ?? "").includes("brand") ? "brand" : "nome";
      errore("/template/nuovo", `Esiste già un template con questo ${campo}: un brand ha una sola intestazione.`);
    }
    throw e;
  }
  // Il primo template diventa il predefinito da solo: averne uno e non usarlo
  // sarebbe una configurazione che non serve a niente.
  const quanti = await prisma.templateDocumento.count();
  if (quanti === 1) await rendiPredefinito(creato.id);

  await registra({ azione: `Creato il template documenti «${creato.nome}»`, categoria: "impostazioni", entita: "template", entitaId: creato.id });
  rivalida(creato.id);
  redirect(`/template/${creato.id}?salvato=1`);
}

export async function salvaTemplate(id: string, fd: FormData) {
  const c = campiDaForm(fd);
  if (!c.nome) errore(`/template/${id}`, "Serve un nome.");
  if (!c.ragioneSociale) errore(`/template/${id}`, "Serve la ragione sociale di chi emette.");
  const logo = logoAccettabile(c.logoDataUrl ?? "");
  if (!logo.ok) errore(`/template/${id}`, logo.perche);

  try {
    await prisma.templateDocumento.update({ where: { id }, data: c });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const campo = String(e?.meta?.target ?? "").includes("brand") ? "brand" : "nome";
      errore(`/template/${id}`, `Esiste già un altro template con questo ${campo}.`);
    }
    throw e;
  }
  await registra({ azione: `Modificato il template documenti «${c.nome}»`, categoria: "impostazioni", entita: "template", entitaId: id });
  rivalida(id);
  redirect(`/template/${id}?salvato=1`);
}

export async function impostaPredefinito(id: string) {
  await rendiPredefinito(id);
  await registra({ azione: "Cambiato il template predefinito dei documenti", categoria: "impostazioni", entita: "template", entitaId: id });
  rivalida(id);
}

/**
 * Elimina un template. ⚠️ I documenti già emessi con questo template NON si
 * toccano: la FK è `set null`, quindi restano e tornano a mostrare
 * l'intestazione generale. Si dice quanti sono, perché è un effetto che si
 * vede sui documenti vecchi e va saputo prima.
 */
export async function eliminaTemplate(id: string) {
  const quanti = await prisma.proForma.count({ where: { templateId: id } });
  const t = await prisma.templateDocumento.findUnique({ where: { id } });
  await prisma.templateDocumento.delete({ where: { id } });
  await registra({
    azione: `Eliminato il template «${t?.nome ?? id}»${quanti ? ` — ${quanti} documenti tornano all'intestazione generale` : ""}`,
    categoria: "impostazioni",
    entita: "template",
    entitaId: id,
  });
  rivalida();
  redirect("/template?eliminato=1");
}
