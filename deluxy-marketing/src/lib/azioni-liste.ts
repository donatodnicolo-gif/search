"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { testoKeywordPulito } from "./dominio";
import { accodaOperazione } from "./operazioni";
import { registra } from "./registro";

// Le LISTE di parole escluse: si scrivono una volta e si applicano a più
// campagne.
//
// ⚠️ PERCHÉ NON SI COPIANO LE NEGATIVE UNA PER UNA. Sarebbe più semplice da
// scrivere — per ogni campagna scelta, N operazioni `negativa` — e sbagliato:
// da quel momento sarebbero N copie indipendenti, e correggerne UNA vorrebbe
// dire ripassare campagna per campagna. Google ha le liste condivise e lo
// script le sa usare (`newNegativeKeywordListBuilder`, `addNegativeKeywords`,
// `campagna.addNegativeKeywordList`): la lista esiste una volta, le campagne ci
// si agganciano.
//
// ⚠️ LE LISTE VIVONO DENTRO UN ACCOUNT. Applicare la stessa lista a campagne di
// un altro brand crea una COPIA in quell'account — da quel momento sono due
// liste distinte, e allinearle tocca a noi. L'app lo dichiara a schermo invece
// di far credere che sia una sola.

function testo(fd: FormData, nome: string): string {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
}

/** Le parole scritte in una casella, ripulite e senza doppioni fra loro. */
function paroleDa(grezzo: string): string[] {
  const viste = new Set<string>();
  const fuori: string[] = [];
  for (const riga of grezzo.split("\n")) {
    const pulito = testoKeywordPulito(riga.trim());
    if (!pulito) continue;
    const chiave = pulito.toLowerCase();
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    fuori.push(pulito);
  }
  return fuori;
}

function corrispondenzaDa(v: string): string {
  return ["exact", "phrase", "broad"].includes(v) ? v : "exact";
}

export async function creaListaNegative(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) return;
  // ⚠️ Il nome è la chiave con cui lo script ritrova la lista dentro Google
  // Ads: due liste omonime nell'app diventerebbero una sola là.
  const esiste = await prisma.listaNegative.findUnique({ where: { nome } });
  if (esiste) {
    redirect(`/liste-escluse?errore=${encodeURIComponent(`Esiste già una lista che si chiama «${nome}».`)}`);
  }

  const corrispondenza = corrispondenzaDa(testo(fd, "corrispondenza"));
  const parole = paroleDa(testo(fd, "parole"));

  const lista = await prisma.listaNegative.create({
    data: {
      nome,
      descrizione: testo(fd, "descrizione") || null,
      parole: { create: parole.map((p) => ({ testo: p, corrispondenza })) },
    },
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "lista-negative",
    entitaId: lista.id,
    titolo: `Lista di esclusione creata: «${nome}»`,
    dettaglio: `${parole.length} parole. Su Google non esiste ancora: nasce al primo giro dello script, quando la lista viene applicata a una campagna.`,
  });
  revalidatePath("/liste-escluse");
  redirect(`/liste-escluse?aperta=${lista.id}`);
}

export async function aggiungiParoleALista(fd: FormData) {
  const listaId = testo(fd, "listaId");
  const parole = paroleDa(testo(fd, "parole"));
  const corrispondenza = corrispondenzaDa(testo(fd, "corrispondenza"));
  if (!listaId || parole.length === 0) return;

  // `createMany` con `skipDuplicates`: la stessa parola con la stessa
  // corrispondenza non entra due volte (c'è l'indice unico), e riscriverne una
  // già presente non deve diventare un errore in faccia a chi la scrive.
  await prisma.parolaListaNegative.createMany({
    data: parole.map((p) => ({ listaId, testo: p, corrispondenza })),
    skipDuplicates: true,
  });
  revalidatePath("/liste-escluse");
  redirect(`/liste-escluse?aperta=${listaId}`);
}

export async function togliParolaDaLista(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const parola = await prisma.parolaListaNegative.findUnique({ where: { id } });
  if (!parola) return;
  await prisma.parolaListaNegative.delete({ where: { id } });
  revalidatePath("/liste-escluse");
  redirect(`/liste-escluse?aperta=${parola.listaId}`);
}

/**
 * Applica la lista alle campagne scelte: una operazione per campagna.
 *
 * ⚠️ Una operazione PER CAMPAGNA, non una sola per tutte. Chi approva deve
 * poter dire sì a cinque campagne e no a una, e se lo script inciampa su una
 * campagna le altre non devono cadere con lei — è la stessa regola delle
 * keyword portate altrove.
 *
 * ⚠️ Le parole VIAGGIANO CON L'OPERAZIONE. Lo script non richiama l'app per
 * sapere cosa c'è nella lista: quello che viene approvato è esattamente quello
 * che verrà scritto, anche se qualcuno modifica la lista un minuto dopo.
 *
 * ⚠️ L0: escludere non sposta budget e non tocca creativi. Le negative di
 * lancio erano a L1 e avrebbero fatto scattare il blackout di 72 ore sedici
 * volte (corretto il 19/08/2026).
 */
export async function applicaListaACampagne(fd: FormData) {
  const listaId = testo(fd, "listaId");
  const scelte = fd.getAll("campagne").map(String).filter(Boolean);
  if (!listaId || scelte.length === 0) return;

  const lista = await prisma.listaNegative.findUnique({
    where: { id: listaId },
    include: { parole: true },
  });
  if (!lista) return;
  if (lista.parole.length === 0) {
    redirect(`/liste-escluse?errore=${encodeURIComponent("La lista è vuota: prima scrivici dentro qualcosa.")}`);
  }

  const campagne = await prisma.campagna.findMany({
    where: { id: { in: scelte } },
    select: { id: true, nome: true, canale: true, idEsterno: true, account: true, brand: true },
  });

  // Quelle già in coda non si riaccodano: due volte la stessa lista sulla
  // stessa campagna è lavoro doppio per chi approva e niente di più.
  const inCoda = await prisma.operazioneAdv.findMany({
    where: {
      tipo: "lista_negative",
      campagnaId: { in: campagne.map((c) => c.id) },
      stato: { in: ["in_attesa", "approvata"] },
    },
    select: { campagnaId: true, parametri: true },
  });
  const giaInCoda = new Set(
    inCoda
      .filter((o) => {
        try {
          return String(JSON.parse(o.parametri ?? "{}").nome ?? "") === lista.nome;
        } catch {
          return false;
        }
      })
      .map((o) => o.campagnaId)
  );

  const parametri = JSON.stringify({
    nome: lista.nome,
    parole: lista.parole.map((p) => ({ testo: p.testo, corrispondenza: p.corrispondenza })),
  });

  let messe = 0;
  for (const c of campagne) {
    if (giaInCoda.has(c.id)) continue;
    const op = await accodaOperazione({
      data: {
        tipo: "lista_negative",
        canale: c.canale,
        account: c.account,
        bersaglio: c.nome,
        idEsterno: c.idEsterno,
        parametri,
        motivo: `Lista di esclusione «${lista.nome}» (${lista.parole.length} parole)`,
        // ⚠️ Chi approva deve sapere che la lista è per ACCOUNT: applicandola a
        // un brand diverso da dove è nata, su Google ne nasce una copia.
        avvisi:
          "Le liste vivono dentro un account: se questa campagna è di un brand diverso da quello dove la lista esiste già, su Google ne nasce una COPIA con lo stesso nome.",
        livello: "L0",
        prima: "senza la lista",
        campagnaId: c.id,
      },
    });
    messe++;
    await registra({
      autore: "utente",
      tipo: "creazione",
      entita: "operazione",
      entitaId: op.id,
      titolo: `In coda (da approvare): lista «${lista.nome}» su ${c.nome}`,
      dettaglio: `${lista.parole.length} parole. La lista si crea su Google al primo uso e poi viene riusata.`,
    });
  }

  revalidatePath("/liste-escluse");
  revalidatePath("/operazioni");
  redirect(
    `/liste-escluse?aperta=${lista.id}&esito=${encodeURIComponent(
      messe === 0
        ? "Erano già tutte in coda: non ho ripetuto niente."
        : `${messe === 1 ? "1 campagna" : `${messe} campagne`} in coda, da approvare in Operazioni.`
    )}`
  );
}

export async function eliminaListaNegative(fd: FormData) {
  const id = testo(fd, "id");
  if (!id) return;
  const lista = await prisma.listaNegative.findUnique({ where: { id } });
  if (!lista) return;

  // ⚠️ Si cancella QUI, non su Google. La lista che sta dentro Google Ads
  // resta dov'è, con le campagne che ci sono agganciate: gli Script non
  // sanno rimuoverla, e far sparire la riga dall'app raccontando che è
  // sparita anche là sarebbe la solita bugia comoda.
  await prisma.listaNegative.delete({ where: { id } });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "lista-negative",
    entitaId: id,
    titolo: `Lista di esclusione tolta dall'app: «${lista.nome}»`,
    dettaglio:
      "Su Google la lista resta com'è, con le campagne agganciate: va tolta da lì se non serve più.",
  });
  revalidatePath("/liste-escluse");
  redirect("/liste-escluse");
}
