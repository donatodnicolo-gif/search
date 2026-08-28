"use server";

// Server actions delle pro-forma: creazione, modifica, ciclo di vita
// (bozza → inviata → fatturata | annullata) ed eliminazione.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { registra } from "./registro";
import { ficStato, ficIdDaNumero } from "./fic";

// eDiNext: gli errori di redirect/notFound di Next NON vanno inghiottiti.
function eDiNext(e: unknown): boolean {
  return typeof (e as { digest?: unknown })?.digest === "string" &&
    /^(NEXT_REDIRECT|NEXT_NOT_FOUND)/.test(String((e as { digest?: unknown }).digest));
}
const s2 = s;
function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function num(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (t === "") return null;
  const x = parseFloat(t.replace(",", "."));
  return isNaN(x) ? null : x;
}
function d(fd: FormData, k: string): Date | null {
  const t = s(fd, k);
  if (!t) return null;
  const date = new Date(t + "T00:00:00.000Z");
  return isNaN(date.getTime()) ? null : date;
}

function revalidateProforma(id?: string) {
  revalidatePath("/proforma", "layout");
  if (id) revalidatePath(`/proforma/${id}`, "layout");
  revalidatePath("/", "layout");
}

// Le righe arrivano come campi ripetuti (uno per riga, stesso name):
// rigaDescrizione / rigaQuantita / rigaPrezzo / rigaIva.
function righeDaForm(fd: FormData) {
  const descrizioni = fd.getAll("rigaDescrizione").map((v) => String(v).trim());
  const quantita = fd.getAll("rigaQuantita");
  const prezzi = fd.getAll("rigaPrezzo");
  const aliquote = fd.getAll("rigaIva");
  const righe = descrizioni
    .map((descrizione, i) => ({
      ordine: i,
      descrizione,
      quantita: num(quantita[i]) ?? 1,
      prezzoUnitario: num(prezzi[i]) ?? 0,
      aliquotaIva: num(aliquote[i]) ?? 22,
    }))
    .filter((r) => r.descrizione !== "");
  return righe;
}

export async function createProForma(fd: FormData) {
  const partnerId = s(fd, "partnerId");
  const data = d(fd, "data") ?? new Date();
  const righe = righeDaForm(fd);
  if (!partnerId) throw new Error("Seleziona il partner");
  if (righe.length === 0) throw new Error("Inserisci almeno una riga con descrizione");

  const anno = data.getUTCFullYear();
  // numerazione progressiva per anno
  const ultimo = await prisma.proForma.aggregate({
    where: { anno },
    _max: { numero: true },
  });
  const numero = (ultimo._max.numero ?? 0) + 1;

  const p = await prisma.proForma.create({
    data: {
      numero,
      anno,
      partnerId,
      data,
      scadenza: d(fd, "scadenza"),
      oggetto: s(fd, "oggetto"),
      note: s(fd, "note"),
      righe: { create: righe },
    },
    include: { partner: { select: { nome: true } } },
  });
  await registra({
    azione: `Creata pro-forma PF ${numero}/${anno}`,
    categoria: "proforma", entita: "proforma", entitaId: p.id, partner: p.partner.nome,
  });
  revalidateProforma(p.id);
  redirect(`/proforma/${p.id}`);
}

// La modifica è consentita solo in bozza: un documento inviato/fatturato/
// annullato resta com'era (per correggerlo si riporta prima in bozza).
export async function updateProForma(id: string, fd: FormData) {
  const esistente = await prisma.proForma.findUnique({ where: { id } });
  if (!esistente) throw new Error("Pro-forma non trovata");
  if (esistente.stato !== "bozza") throw new Error("Solo le bozze si possono modificare");

  const righe = righeDaForm(fd);
  if (righe.length === 0) throw new Error("Inserisci almeno una riga con descrizione");

  await prisma.$transaction([
    prisma.proFormaRiga.deleteMany({ where: { proFormaId: id } }),
    prisma.proForma.update({
      where: { id },
      data: {
        data: d(fd, "data") ?? esistente.data,
        scadenza: d(fd, "scadenza"),
        oggetto: s(fd, "oggetto"),
        note: s(fd, "note"),
        righe: { create: righe },
      },
    }),
  ]);
  revalidateProforma(id);
  redirect(`/proforma/${id}?salvato=1`);
}

// Passaggi di stato. "fatturata" registra anche il n° della fattura definitiva
// (emessa su Fatture in Cloud); "bozza" riapre il documento per correzioni.
export async function cambiaStatoProForma(id: string, stato: string, fd?: FormData) {
  if (!["bozza", "inviata", "fatturata", "annullata"].includes(stato)) {
    throw new Error("Stato non valido");
  }

  // ⚠️ 28/08/2026 — «fatturata» non è più un flag a vuoto. Prima si poteva
  // marcare fatturata SENZA numero e senza che la fattura esistesse davvero
  // (caso reale: PF 2/2026 «fatturata» ma niente in Fatture in Cloud). Ora:
  //  1. il numero della fattura definitiva è OBBLIGATORIO;
  //  2. se FIC è collegato, si verifica che quel numero esista davvero là —
  //     altrimenti lo stato è una bugia che si scopre a valle.
  let numeroFattura: string | null = null;
  if (stato === "fatturata") {
    numeroFattura = (fd ? s2(fd, "fatturaNumero") : null)?.trim() || null;
    if (!numeroFattura) {
      redirect(`/proforma/${id}?erroreStato=${encodeURIComponent("Per segnare «fatturata» serve il numero della fattura definitiva.")}`);
    }
    const anno = new Date().getFullYear();
    try {
      const { collegato } = await ficStato();
      if (collegato) {
        const idFic = await ficIdDaNumero(numeroFattura, anno);
        if (!idFic) {
          redirect(`/proforma/${id}?erroreStato=${encodeURIComponent(`La fattura «${numeroFattura}» non risulta in Fatture in Cloud: controlla il numero o emettila prima.`)}`);
        }
      }
    } catch (e) {
      if (eDiNext(e)) throw e;
      // FIC irraggiungibile: non blocco (il numero c'è), ma non fingo di aver verificato.
      console.warn("[proforma] verifica FIC non riuscita, procedo col solo numero:", (e as Error).message);
    }
  }

  const ora = new Date();
  const pf = await prisma.proForma.update({
    where: { id },
    data:
      stato === "fatturata"
        ? { stato, fatturataIl: ora, fatturaNumero: numeroFattura, annullataIl: null }
        : stato === "annullata"
          ? { stato, annullataIl: ora }
          : stato === "inviata"
            ? { stato, inviataIl: ora, annullataIl: null, fatturataIl: null, fatturaNumero: null }
            : { stato, annullataIl: null, fatturataIl: null, fatturaNumero: null },
    include: { partner: { select: { nome: true } } },
  });
  await registra({
    azione: `Pro-forma PF ${pf.numero}/${pf.anno} → ${stato}`,
    categoria: "proforma", entita: "proforma", entitaId: id, partner: pf.partner.nome,
  });
  revalidateProforma(id);
  redirect(`/proforma/${id}`);
}

export async function deleteProForma(id: string) {
  // Si eliminano solo le pro-forma NON ancora fatturate davvero. Una con un
  // numero di fattura vero è collegata a un documento fiscale su Fatture in
  // Cloud: cancellare qui il record perderebbe il legame senza toccare la
  // fattura vera — meglio non farlo (guard, oltre alla UI).
  const pf = await prisma.proForma.findUnique({ where: { id }, select: { stato: true, fatturaNumero: true } });
  if (!pf) redirect("/proforma");
  if (pf.stato === "fatturata" && pf.fatturaNumero) {
    redirect(`/proforma/${id}?erroreStato=${encodeURIComponent("Questa pro-forma ha una fattura emessa su Fatture in Cloud: non si elimina. Semmai riportala in bozza.")}`);
  }
  await prisma.proForma.delete({ where: { id } });
  revalidateProforma();
  redirect("/proforma");
}
