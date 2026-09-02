"use server";

// Le azioni della pagina «Da Fatture in Cloud» (/fatture/da-fic).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { registra } from "./registro";
import { importaFattureFicSicure, creaFatturaImportata } from "./fic-mancanti";

/**
 * Registra UNA fattura FIC con la scelta della persona (scheda + tipologia).
 * Da quel momento quel cliente è «imparato»: le prossime sue fatture le
 * importa il controllo automatico.
 */
export async function registraFatturaFic(fd: FormData) {
  const numero = String(fd.get("numero") ?? "").trim();
  const partnerId = String(fd.get("partnerId") ?? "").trim();
  const tipologiaId = String(fd.get("tipologiaId") ?? "").trim();
  const anno = Number(fd.get("anno"));
  const mese = Number(fd.get("mese"));
  const imponibile = Number(fd.get("imponibile"));
  const aliquotaIva = Number(fd.get("aliquotaIva"));
  const emissione = String(fd.get("data") ?? "").trim();
  const scadenza = String(fd.get("scadenza") ?? "").trim();
  const pagata = String(fd.get("pagata") ?? "") === "1";
  const dataPagamento = String(fd.get("dataPagamento") ?? "").trim();
  const descrizione = String(fd.get("descrizione") ?? "").trim() || null;
  if (!numero || !partnerId || !tipologiaId || !Number.isInteger(anno) || !Number.isInteger(mese) || !Number.isFinite(imponibile)) {
    redirect(`/fatture/da-fic?esito=incompleta`);
  }

  // Idempotente sul numero: un doppio click non registra due volte.
  const gia = await prisma.fatturaServizio.findFirst({ where: { numero } });
  if (gia) redirect(`/fatture/da-fic?esito=gia`);

  // Stesso percorso del cron: nasce non pagata e, se su FIC è pagata, passa da
  // «Saldata» (incasso sul saldo per i partner in compensazione, registro Pagamenti).
  const id = await creaFatturaImportata({
    partnerId,
    tipologiaId,
    anno,
    mese,
    numero,
    data: emissione || new Date().toISOString().slice(0, 10),
    scadenza: scadenza || null,
    pagata,
    dataPagamento: dataPagamento || null,
    imponibile,
    aliquotaIva: Number.isFinite(aliquotaIva) ? aliquotaIva : 22,
    descrizione: descrizione ?? "Registrata da Fatture in Cloud",
  });
  const f = await prisma.fatturaServizio.findUniqueOrThrow({
    where: { id },
    include: { partner: { select: { nome: true } }, tipologia: { select: { nome: true } } },
  });
  await registra({
    azione: `Fattura ${numero} registrata da FIC (${f.tipologia.nome})`,
    categoria: "fatture",
    entita: "fattura",
    entitaId: f.id,
    partner: f.partner.nome,
    dettaglio: `Dalla pagina «Da Fatture in Cloud»; competenza ${anno}-${String(mese).padStart(2, "0")} (mese di emissione). Le prossime fatture di questo cliente le importa il controllo automatico.`,
  });
  revalidatePath("/fatture", "layout");
  redirect(`/fatture/da-fic?esito=ok`);
}

/** Il bottone «Importa le sicure adesso»: lo stesso lavoro del cron, a mano. */
export async function importaFicAdesso() {
  const esito = await importaFattureFicSicure("manuale");
  revalidatePath("/fatture", "layout");
  redirect(
    esito.ok
      ? `/fatture/da-fic?esito=import&n=${esito.importate}`
      : `/fatture/da-fic?esito=errore`
  );
}
