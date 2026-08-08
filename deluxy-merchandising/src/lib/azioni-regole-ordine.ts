"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { aggiungiDaRegola } from "./aggiunta-da-regola";
import { applicaRegolaSalvata, numeraPosizioni, ordineSecondoPassi } from "./ordinamento-vetrina";
import { isRegola, regoleDaForm, type RegolaOrdinamento } from "./ordinamento-vetrina";
import { CAMPI, parsePassi, serializePassi, type Campo, type Condizione, type Passo } from "./regole-ordine";

/** Crea una regola vuota e porta dritti a scriverla: un nome da solo non serve a niente. */
export async function creaRegolaOrdine(fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim();
  if (!nome) redirect("/visual/regole?esito=errore&messaggio=" + encodeURIComponent("Il nome serve: è come si ritrova la regola."));
  const esiste = await prisma.regolaOrdine.findUnique({ where: { nome }, select: { id: true } });
  if (esiste) {
    redirect(`/visual/regole?esito=errore&messaggio=${encodeURIComponent(`Esiste già una regola «${nome}».`)}`);
  }
  const r = await prisma.regolaOrdine.create({
    data: { nome, descrizione: String(fd.get("descrizione") ?? "").trim() || null, passi: "[]" },
  });
  redirect(`/visual/regole/${r.id}`);
}

export async function rinominaRegolaOrdine(id: string, fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim();
  const descrizione = String(fd.get("descrizione") ?? "").trim() || null;
  if (nome) await prisma.regolaOrdine.update({ where: { id }, data: { nome, descrizione } });
  revalidatePath(`/visual/regole/${id}`);
}

/**
 * Elimina una regola. Le collezioni che la usavano tornano «solo a mano»
 * (`onDelete: SetNull`): **l'ordine già scritto non si tocca**, resta quello
 * che era: cancellare una regola non è chiedere di rimescolare le vetrine.
 */
export async function eliminaRegolaOrdine(id: string) {
  await prisma.regolaOrdine.delete({ where: { id } });
  redirect("/visual/regole");
}

/**
 * **Ogni quanto la regola rimescola dentro i suoi gruppi.** Non cambia le
 * condizioni: cambia chi, di quelli che una cella prende, sta davanti.
 *
 * Il turno si calcola dalla data, quindi impostarlo non riscrive niente da solo:
 * la fila nuova si vede **quando la regola si riapplica** — a mano da qui o
 * dalla scheda della collezione, da sola se la collezione e' iscritta a un ritmo
 * in Rotazioni. E' scritto in pagina, perche' un'impostazione che sembra fare
 * qualcosa e non lo fa e' peggio che non averla.
 */
export async function impostaRotazioneRegola(id: string, fd: FormData) {
  const g = Number(fd.get("rotazioneGiorni"));
  const giorni = Number.isFinite(g) && g > 0 ? Math.min(365, Math.round(g)) : null;
  await prisma.regolaOrdine.update({ where: { id }, data: { rotazioneGiorni: giorni } });
  revalidatePath(`/visual/regole/${id}`);
}

const isCampo = (v: string): v is Campo => CAMPI.some((c) => c.chiave === v);

/** Aggiunge un passo in fondo: l'ordine dei passi **è** la priorità. */
export async function aggiungiPasso(id: string, fd: FormData) {
  const r = await prisma.regolaOrdine.findUnique({ where: { id }, select: { passi: true } });
  const passi = parsePassi(r?.passi);
  const tipo = String(fd.get("tipo") ?? "");
  if (tipo === "metrica") {
    const m = String(fd.get("metrica") ?? "");
    if (isRegola(m) && m !== "manuale") passi.push({ t: "metrica", m });
  } else {
    const campo = String(fd.get("campo") ?? "");
    if (!isCampo(campo)) return;
    if (campo === "prezzo") {
      const da = Number.parseFloat(String(fd.get("da") ?? ""));
      const a = Number.parseFloat(String(fd.get("a") ?? ""));
      passi.push({
        t: "attr",
        campo,
        da: Number.isFinite(da) ? da : undefined,
        a: Number.isFinite(a) ? a : undefined,
      });
    } else {
      // I valori arrivano da un <select multiple>: valgono **in alternativa**
      // dentro lo stesso passo (categoria Fiori *o* Torte), come nei criteri
      // delle tipologie — stessa convenzione, non una nuova.
      const valori = fd.getAll("valori").map(String).filter(Boolean);
      if (valori.length === 0) return;
      passi.push({ t: "attr", campo, valori });
    }
  }
  await salvaPassi(id, passi, fd);
}

/**
 * **Aggiunge in un colpo tutte le condizioni scelte nella griglia.**
 *
 * Prima ogni attributo era un form a sé con il suo pulsante: per dire «prima i
 * Fiori, poi chi costa più di 200 €, a parità il più venduto» ci volevano tre
 * salvataggi e tre ricariche di pagina. Qui si compila quello che serve e si
 * preme una volta.
 *
 * **L'ordine è quello della griglia**, dall'alto in basso: è l'unico che si può
 * dedurre da un modulo senza chiedere anche la priorità di ogni riga — e le
 * frecce sono lì per correggerlo dopo.
 */
export async function aggiungiPassiInBlocco(id: string, fd: FormData) {
  const r = await prisma.regolaOrdine.findUnique({ where: { id }, select: { passi: true } });
  const passi = parsePassi(r?.passi);
  passi.push(...passiDaForm(fd));
  await salvaPassi(id, passi, fd);
}

/**
 * **Riscrive un passo già salvato** con quello che c'è nella griglia.
 *
 * Prima una condizione si poteva solo togliere e rifare da capo: per cambiare
 * una sola spunta su una cella da cinque condizioni si ricominciava, e nel
 * frattempo la vetrina restava ordinata da una regola incompleta. Qui il passo
 * resta **al suo posto** — la priorità non cambia, cambia il contenuto.
 */
export async function sostituisciPasso(id: string, indice: number, fd: FormData) {
  const r = await prisma.regolaOrdine.findUnique({ where: { id }, select: { passi: true } });
  const passi = parsePassi(r?.passi);
  if (indice < 0 || indice >= passi.length) return;
  const nuovi = passiDaForm(fd);
  // Svuotare la griglia e salvare **non cancella il passo**: per toglierlo c'è
  // la ×, e far sparire una condizione perché si è deselezionato tutto sarebbe
  // una cancellazione non chiesta.
  if (nuovi.length === 0) return;
  passi.splice(indice, 1, ...nuovi);
  await salvaPassi(id, passi, fd);
}

/**
 * Legge la griglia e ne ricava i passi. **Una compilazione = una cella**, non
 * tante condizioni separate: è la differenza fra «i bouquet di fiori urgenti» e
 * «prima i fiori, poi i bouquet, poi gli urgenti».
 *
 * Sta in una funzione sola perché la usano sia «aggiungi» sia «modifica»: con
 * due copie, il giorno che si aggiunge un campo una delle due lo ignorerebbe.
 */
function passiDaForm(fd: FormData): Passo[] {
  const condizioni: Condizione[] = [];
  for (const c of CAMPI) {
    if (c.chiave === "prezzo") {
      const da = Number.parseFloat(String(fd.get("prezzoDa") ?? ""));
      const a = Number.parseFloat(String(fd.get("prezzoA") ?? ""));
      if (Number.isFinite(da) || Number.isFinite(a)) {
        condizioni.push({
          campo: "prezzo",
          da: Number.isFinite(da) ? da : undefined,
          a: Number.isFinite(a) ? a : undefined,
        });
      }
      continue;
    }
    const valori = fd.getAll(`valori:${c.chiave}`).map(String).filter(Boolean);
    if (valori.length > 0) condizioni.push({ campo: c.chiave, valori });
  }
  // **In ordine di scelta**: la prima decide, le successive spezzano i pareggi.
  // I doppioni si scartano tenendo la prima posizione.
  const metriche: RegolaOrdinamento[] = [];
  for (const raw of fd.getAll("metrica")) {
    const v = String(raw);
    if (isRegola(v) && v !== "manuale" && !metriche.includes(v)) metriche.push(v);
  }
  // La metrica scelta **insieme** alle condizioni resta attaccata alla cella:
  // dice come si ordinano i prodotti che la cella porta in cima. Senza
  // condizioni ogni metrica è un passo a sé: mettono in fila tutti.
  if (condizioni.length > 0) return [{ t: "cella", c: condizioni, m: metriche.length ? metriche : undefined }];
  return metriche.map((m) => ({ t: "metrica", m }));
}

/** Toglie un passo, o lo sposta su/giù: la priorità si cambia senza riscrivere tutto. */
export async function muoviPasso(id: string, indice: number, dove: "su" | "giu" | "via", fd?: FormData) {
  const r = await prisma.regolaOrdine.findUnique({ where: { id }, select: { passi: true } });
  const passi = parsePassi(r?.passi);
  if (indice < 0 || indice >= passi.length) return;
  if (dove === "via") {
    passi.splice(indice, 1);
  } else {
    const j = dove === "su" ? indice - 1 : indice + 1;
    if (j < 0 || j >= passi.length) return;
    [passi[indice], passi[j]] = [passi[j], passi[indice]];
  }
  await salvaPassi(id, passi, fd);
}

/**
 * Salva i passi e decide **dove si torna**.
 *
 * Se si stava lavorando dalla scheda di una collezione (`tornaA`), la regola le
 * viene **riapplicata subito** e si torna lì: altrimenti si aggiunge una
 * condizione e a schermo non si muove niente, che si legge come «non ha
 * funzionato». Le *altre* collezioni che usano la regola restano com'erano
 * finché non si preme «Riapplica ovunque»: rifarle tutte di nascosto sarebbe
 * rimescolare vetrine che nessuno stava guardando.
 */
async function salvaPassi(id: string, passi: Passo[], fd?: FormData) {
  await prisma.regolaOrdine.update({ where: { id }, data: { passi: serializePassi(passi) } });
  const tornaA = fd ? String(fd.get("tornaA") ?? "") : "";
  if (tornaA) {
    if (passi.length > 0) {
      await aggiungiDaRegola(tornaA);
      await applicaRegolaSalvata(tornaA, id);
    }
    revalidatePath(`/visual/${tornaA}`);
    redirect(`/visual/${tornaA}#regola`);
  }
  revalidatePath(`/visual/regole/${id}`);
}

/**
 * **Salva l'ordine che si sta guardando come regola**, dalla scheda della
 * collezione. È lì che nasce una regola vera: si prova con le metriche rapide
 * finché la fila convince, e a quel punto la si vuole tenere e riusare — non
 * ricominciare da una pagina vuota.
 *
 * La regola nasce coi passi che erano scelti e viene **assegnata e applicata**
 * alla collezione; le condizioni (categoria, prezzo, tag, risposta al bisogno)
 * si aggiungono **restando qui**, con lo stesso costruttore della pagina della
 * regola.
 */
export async function creaRegolaDaCollezione(collezioneId: string, fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim();
  const torna = (m: string) =>
    redirect(`/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(m)}`);
  if (!nome) torna("Il nome serve: è come si ritrova la regola.");
  if (await prisma.regolaOrdine.findUnique({ where: { nome }, select: { id: true } })) {
    torna(`Esiste già una regola «${nome}». Scegli un altro nome o applicala dall'elenco.`);
  }

  const metriche = regoleDaForm(fd);
  const r = await prisma.regolaOrdine.create({
    data: {
      nome,
      descrizione: `Nata dall'ordine della collezione, il ${new Date().toLocaleDateString("it-IT")}.`,
      passi: serializePassi(metriche.map((m) => ({ t: "metrica", m }))),
    },
  });
  // Se non c'era nessuna metrica la regola nasce vuota: si assegna comunque,
  // ma **non si riscrive l'ordine** — una regola senza passi non è «tutti i
  // prodotti», è una regola da finire, e non deve rimescolare una fila curata.
  if (metriche.length > 0) await applicaRegolaSalvata(collezioneId, r.id);
  else await prisma.collezioneShopify.update({ where: { id: collezioneId }, data: { regolaOrdineId: r.id } });
  // Si resta **sulla collezione**: le condizioni si scrivono da qui, davanti
  // alla fila che devono cambiare. Sbalzare su un'altra pagina vorrebbe dire
  // scriverle alla cieca.
  revalidatePath(`/visual/${collezioneId}`);
  redirect(`/visual/${collezioneId}#regola`);
}

/**
 * **Estende la regola a tutta la collezione.**
 *
 * Una regola fatta di celle decide chi va in cima; **tutti gli altri** — quelli
 * che nessun passo prende — restano dietro nell'ordine in cui erano, che con una
 * vetrina curata a mano nel tempo non vuol dire piu' niente. Qui si dice: chi la
 * regola non tocca si mette `in ordine di vendita`, i piu' venduti avanti.
 *
 * Si ottiene **aggiungendo un ultimo passo** `best_seller` alla regola, senza
 * salvarlo: per i prodotti presi dalle celle le chiavi di prima hanno gia'
 * deciso e questo spezza solo i pareggi rimasti; per tutti gli altri, che su
 * quelle chiavi sono pari, decide lui. Una funzione sola con l'ordinamento
 * normale — con un secondo motore le due strade divergerebbero al primo ritocco.
 *
 * **Non tocca la regola salvata**: le altre collezioni che la usano non si
 * muovono, e riapplicandola qui si torna al comportamento di prima.
 */
export async function estendiRegolaAllaCollezione(collezioneId: string) {
  const c = await prisma.collezioneShopify.findUnique({
    where: { id: collezioneId },
    select: { regolaOrdineId: true },
  });
  if (!c?.regolaOrdineId) return;
  const r = await prisma.regolaOrdine.findUnique({ where: { id: c.regolaOrdineId }, select: { passi: true } });
  const passi = parsePassi(r?.passi);
  if (passi.length === 0) return;
  await aggiungiDaRegola(collezioneId);
  const ordine = await ordineSecondoPassi(collezioneId, [...passi, { t: "metrica", m: "best_seller" }]);
  await numeraPosizioni(collezioneId, ordine);
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { ordineModificatoIl: new Date() },
  });
  revalidatePath(`/visual/${collezioneId}`);
}

/**
 * **Accende o spegne l'aggiunta automatica**, e se si accende fa subito il primo
 * giro: un interruttore che dice «da ora entrano da soli» e non fa entrare
 * nessuno finche' non tocchi qualcos'altro si legge come rotto.
 *
 * Spegnendolo **non esce nessuno**: i prodotti gia' entrati restano dove sono.
 * Togliere da una vetrina e' un'altra decisione, e non e' questa.
 */
export async function impostaAggiuntaAutomatica(collezioneId: string, fd: FormData) {
  const acceso = String(fd.get("aggiuntaAutomatica") ?? "") === "1";
  await prisma.collezioneShopify.update({ where: { id: collezioneId }, data: { aggiuntaAutomatica: acceso } });
  let messaggio = acceso ? "Aggiunta automatica accesa." : "Aggiunta automatica spenta: i prodotti già entrati restano.";
  if (acceso) {
    const e = await aggiungiDaRegola(collezioneId);
    if (e.errore) messaggio = e.errore;
    else if (e.aggiunti > 0) {
      const c = await prisma.collezioneShopify.findUnique({ where: { id: collezioneId }, select: { regolaOrdineId: true } });
      if (c?.regolaOrdineId) await applicaRegolaSalvata(collezioneId, c.regolaOrdineId);
      messaggio = `${e.aggiunti} prodotti entrati dalla regola${e.restano ? ` · altri ${e.restano} al prossimo giro` : ""}.`;
    } else messaggio = "Aggiunta automatica accesa: non c'era niente da far entrare.";
  }
  revalidatePath(`/visual/${collezioneId}`);
  redirect(`/visual/${collezioneId}?esito=ok&messaggio=${encodeURIComponent(messaggio)}#regola`);
}

/** Applica una regola salvata a una collezione (dalla scheda della collezione). */
export async function applicaRegolaSalvataAzione(collezioneId: string, fd: FormData) {
  const regolaId = String(fd.get("regolaOrdineId") ?? "");
  if (!regolaId) return;
  // Prima si fa entrare chi la regola porta dentro, poi si ordina: al contrario
  // i nuovi arrivati resterebbero in fondo fino al giro successivo.
  await prisma.collezioneShopify.update({ where: { id: collezioneId }, data: { regolaOrdineId: regolaId } });
  await aggiungiDaRegola(collezioneId);
  await applicaRegolaSalvata(collezioneId, regolaId);
  revalidatePath(`/visual/${collezioneId}`);
}

/**
 * Riapplica una regola a **tutte** le collezioni che la usano. È il motivo per
 * cui una regola si salva: la si corregge in un posto e le vetrine si rifanno.
 */
export async function riapplicaRegolaOvunque(id: string) {
  const colls = await prisma.collezioneShopify.findMany({ where: { regolaOrdineId: id }, select: { id: true } });
  // Una per volta e non in parallelo: ognuna scrive le posizioni di tutti i suoi
  // prodotti, e mandarne dieci insieme su un pool da 5 connessioni condiviso con
  // altre cinque app le fa scadere in coda invece che andare più veloce.
  for (const c of colls) await applicaRegolaSalvata(c.id, id);
  revalidatePath(`/visual/regole/${id}`);
  revalidatePath("/visual");
}
