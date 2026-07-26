"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generaLettura } from "./ai-trend";
import { brandCorrente, COOKIE_BRAND } from "./brand";
import { prisma } from "./db";
import { importaVendite } from "./orders";
import { calcolaIpotesi, parametriDaQuery, type Parametri } from "./riordino";

function intero(fd: FormData, k: string, def: number): number {
  const v = fd.get(k);
  const n = typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

// ---------- Ambito (globale / brand) ----------

/**
 * Salva l'ambito scelto e riporta l'utente dov'era.
 * Il percorso arriva dal form: senza, dopo ogni cambio si finirebbe sempre in
 * home, che è il modo più veloce per far odiare un selettore.
 */
export async function impostaAmbito(fd: FormData) {
  const brand = String(fd.get("brand") ?? "").trim();
  const percorso = String(fd.get("percorso") ?? "/") || "/";
  const jar = await cookies();
  if (brand) {
    jar.set(COOKIE_BRAND, brand, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  } else {
    jar.delete(COOKIE_BRAND);
  }
  redirect(percorso.startsWith("/") ? percorso : "/");
}

// ---------- Vendite ----------

/** Importa il venduto dal registro Deluxy Orders e torna in pagina con l'esito. */
export async function importaDaOrders(fd: FormData) {
  const giorni = intero(fd, "giorni", 90);
  const esito = await importaVendite(giorni);
  revalidatePath("/vendite");
  revalidatePath("/riordini");
  revalidatePath("/");
  redirect(`/vendite?esito=${esito.ok ? "ok" : "errore"}&messaggio=${encodeURIComponent(esito.messaggio)}`);
}

// ---------- Ipotesi di ordinativo ----------

/**
 * Congela l'ipotesi corrente in un piano modificabile. Si salvano solo le righe
 * con una quantità proposta: le altre non sono decisioni, sono rumore.
 */
export async function salvaPiano(fd: FormData) {
  const parametri: Parametri = parametriDaQuery({
    storico: String(intero(fd, "storico", 56)),
    lead: String(intero(fd, "lead", 7)),
    copertura: String(intero(fd, "copertura", 21)),
    scorta: String(intero(fd, "scorta", 20)),
  });
  // L'ambito arriva dal cookie, come in pagina: l'ipotesi si congela sullo
  // stesso mondo che l'operatore stava guardando.
  const canale = await brandCorrente();
  const ipotesi = await calcolaIpotesi({ ...parametri, canale });
  const righe = ipotesi.righe.filter((r) => r.quantitaSuggerita > 0);
  if (righe.length === 0) redirect("/riordini?esito=vuoto");

  const nomeDato = fd.get("nome");
  const quando = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  const nome =
    typeof nomeDato === "string" && nomeDato.trim()
      ? nomeDato.trim()
      : `Ipotesi ${canale ?? "tutti i brand"} del ${quando}`;

  const piano = await prisma.pianoRiordino.create({
    data: {
      nome,
      canale,
      giorniStorico: ipotesi.parametri.giorniStorico,
      leadTimeGiorni: ipotesi.parametri.leadTimeGiorni,
      coperturaGiorni: ipotesi.parametri.coperturaGiorni,
      scortaSicurezzaPct: ipotesi.parametri.scortaSicurezzaPct,
      righe: {
        create: righe.map((r) => ({
          prodottoId: r.prodottoId,
          descrizione: `${r.nome} (${r.codice})`,
          venditeGiorno: r.ritmo,
          giacenza: r.giacenza,
          coperturaGiorni: r.coperturaAttuale ?? 0,
          quantitaSuggerita: r.quantitaSuggerita,
          quantitaScelta: r.quantitaSuggerita,
          costoUnitario: r.costoUnitario,
          prezzoUnitario: r.prezzoUnitario,
          confidenza: r.confidenza,
          motivo: r.motivo,
        })),
      },
    },
  });

  revalidatePath("/riordini");
  redirect(`/riordini/${piano.id}`);
}

/** Quantità decisa dall'operatore su una riga del piano. */
export async function cambiaQuantita(rigaId: string, pianoId: string, fd: FormData) {
  const q = Math.max(0, intero(fd, "quantita", 0));
  await prisma.rigaRiordino.update({ where: { id: rigaId }, data: { quantitaScelta: q } });
  revalidatePath(`/riordini/${pianoId}`);
}

export async function cambiaStatoPiano(id: string, stato: string) {
  await prisma.pianoRiordino.update({ where: { id }, data: { stato } });
  revalidatePath(`/riordini/${id}`);
  revalidatePath("/riordini");
}

export async function eliminaRigaPiano(rigaId: string, pianoId: string) {
  await prisma.rigaRiordino.delete({ where: { id: rigaId } });
  revalidatePath(`/riordini/${pianoId}`);
}

export async function eliminaPiano(id: string) {
  await prisma.pianoRiordino.delete({ where: { id } });
  revalidatePath("/riordini");
  redirect("/riordini");
}

// ---------- Lettura AI ----------

export async function chiediLetturaAI(fd: FormData) {
  const giorni = intero(fd, "giorni", 90);
  const esito = await generaLettura(giorni, await brandCorrente());
  revalidatePath("/trend-ai");
  if (esito.ok) redirect(`/trend-ai?lettura=${esito.id}`);
  redirect(`/trend-ai?giorni=${giorni}&errore=${encodeURIComponent(esito.errore)}`);
}

export async function eliminaLettura(id: string) {
  await prisma.letturaTrend.delete({ where: { id } });
  revalidatePath("/trend-ai");
  redirect("/trend-ai");
}
