"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { registraEvento } from "@/lib/classificazione";
import { codificaChiave } from "@/lib/clienti";
import { canaleValido, tipologiaValida } from "@/lib/segmenti";
import { importaFeedback } from "@/lib/feedback";
import { preparaGiro, type VariabileScript } from "@/lib/automazioni";
import { rilevaEventi } from "@/lib/eventi";
import { riepilogaCliente, riepilogaClientiMancanti } from "@/lib/clienti-ai";
import { leggiOccasioniDaiBiglietti } from "@/lib/eventi-ai";
import { ricalcolaCategorie } from "@/lib/categorie";
import { proponiCategorieAI } from "@/lib/categorie-ai";
import { eseguiSyncOrdini } from "@/lib/sync";
import { tokenNegozio } from "@/lib/shopify";
import { cercaDocumento, scriviConsegna, dataValida, fasciaValida } from "@/lib/consegna";
import { salvaInRubrica } from "@/lib/rubrica";

// Tutte le mutazioni della UI passano da qui (server actions). Ogni
// riclassificazione lascia una traccia in EventoOrdine.

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

// ---- Sync ----
export async function sincronizza(fd: FormData) {
  const giorni = Number(s(fd, "giorni") ?? "90") || 90;
  await eseguiSyncOrdini(giorni);
  revalidatePath("/");
  revalidatePath("/bacheca");
  revalidatePath("/impostazioni");
}

// ---- Stato di un ordine ----
export async function cambiaStato(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  const statoId = s(fd, "statoId");
  if (!ordineId) return;
  const stato = statoId ? await prisma.statoOrdine.findUnique({ where: { id: statoId } }) : null;
  await prisma.ordine.update({
    where: { id: ordineId },
    data: {
      stato: statoId ? { connect: { id: statoId } } : { disconnect: true },
      ultimaClassifica: new Date(),
    },
  });
  await registraEvento(ordineId, "stato", `Stato → ${stato?.nome ?? "nessuno"}`);
  revalidatePath("/");
  revalidatePath("/bacheca");
  revalidatePath(`/ordini/${ordineId}`);
}

// ---- Classificazione completa (dalla scheda ordine) ----
export async function aggiornaClassificazione(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  if (!ordineId) return;
  const categoriaPagamento = s(fd, "categoriaPagamento");
  const attuale = await prisma.ordine.findUnique({
    where: { id: ordineId },
    select: { categoriaPagamento: true },
  });
  const categoriaManuale = categoriaPagamento != null && categoriaPagamento !== attuale?.categoriaPagamento;

  await prisma.ordine.update({
    where: { id: ordineId },
    data: {
      categoriaPagamento: categoriaPagamento ?? undefined,
      ...(categoriaManuale ? { categoriaPagamentoManuale: true } : {}),
      tipoConsegna: s(fd, "tipoConsegna"),
      tipoProdotto: s(fd, "tipoProdotto"),
      canale: s(fd, "canale"),
      assegnatoApp: s(fd, "assegnatoApp"),
      fornitore: s(fd, "fornitore"),
      responsabile: s(fd, "responsabile"),
      noteInterne: s(fd, "noteInterne"),
      ultimaClassifica: new Date(),
    },
  });
  await registraEvento(ordineId, "categoria", "Classificazione aggiornata");
  revalidatePath("/");
  revalidatePath(`/ordini/${ordineId}`);
}

// ---- Ordini problematici (rimborsi parziali) ----
// Il marchio «problematico» non si toglie a mano — dipende dallo stato Shopify e
// resta finché resta quello. Quello che si può dire è «l'ho guardato, ecco cosa
// ho concluso»: l'ordine esce dalla coda dei problemi aperti e la nota resta
// scritta, così il prossimo non ricomincia da capo.
export async function segnaProblemaGestito(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  if (!ordineId) return;
  const gestito = fd.get("gestito") !== "no";
  const nota = s(fd, "nota");

  await prisma.ordine.update({
    where: { id: ordineId },
    data: { problemaGestito: gestito, problemaNota: nota },
  });
  await registraEvento(
    ordineId,
    "problema",
    gestito
      ? `Rimborso parziale verificato${nota ? `: ${nota}` : ""}`
      : "Rimborso parziale rimesso fra i casi da verificare",
  );
  revalidatePath("/");
  revalidatePath(`/ordini/${ordineId}`);
}

// ---- Etichette su un ordine ----
export async function toggleEtichetta(fd: FormData) {
  const ordineId = s(fd, "ordineId");
  const etichettaId = s(fd, "etichettaId");
  if (!ordineId || !etichettaId) return;
  const ordine = await prisma.ordine.findUnique({
    where: { id: ordineId },
    select: { etichette: { select: { id: true, nome: true } } },
  });
  const eti = await prisma.etichetta.findUnique({ where: { id: etichettaId } });
  const presente = ordine?.etichette.some((e) => e.id === etichettaId);
  await prisma.ordine.update({
    where: { id: ordineId },
    data: {
      etichette: presente ? { disconnect: { id: etichettaId } } : { connect: { id: etichettaId } },
      ultimaClassifica: new Date(),
    },
  });
  await registraEvento(ordineId, "etichetta", `${presente ? "Rimossa" : "Aggiunta"} etichetta ${eti?.nome ?? ""}`);
  revalidatePath("/");
  revalidatePath(`/ordini/${ordineId}`);
}

// ---- Feedback dal Customer Service ----
// Import a mano dalla pagina Impostazioni. L'esito torna nella query string
// perché la pagina è un server component e l'operazione parla con un'altra app:
// se non è configurata, o se là c'è un problema, si deve leggere il motivo.
export async function importaFeedbackOrdini(fd: FormData) {
  const completo = fd.get("completo") === "on";
  const esito = await importaFeedback(completo);
  revalidatePath("/impostazioni");
  revalidatePath("/");
  const messaggio = esito.errore
    ? `errore=${encodeURIComponent(esito.errore)}`
    : `esito=${encodeURIComponent(
        `${esito.letti} feedback letti · ${esito.nuovi} nuovi · ${esito.aggiornati} aggiornati · ${esito.collegati} collegati a un ordine, ${esito.scollegati} no`,
      )}`;
  redirect(`/impostazioni?${messaggio}`);
}

// ---- Tipologia di un cliente (scheda cliente) ----
// I clienti non sono una tabella: il tag si aggancia alla chiave (email →
// telefono → nome). Tipo vuoto = si torna alla tipologia dedotta dal nome.
export async function impostaTipologiaCliente(fd: FormData) {
  const chiave = s(fd, "chiave");
  if (!chiave) return;
  const tipo = tipologiaValida(s(fd, "tipo"));
  const note = s(fd, "note");

  if (!tipo) {
    await prisma.tagCliente.deleteMany({ where: { chiave } });
  } else {
    await prisma.tagCliente.upsert({
      where: { chiave },
      create: { chiave, tipo, note, autore: "operatore" },
      update: { tipo, note, autore: "operatore" },
    });
  }

  revalidatePath("/clienti");
  revalidatePath(`/clienti/${codificaChiave(chiave)}`);
  revalidatePath("/liste");
}

// ---- Riepilogo AI di un cliente (scheda cliente) ----
// L'AI legge i suoi ordini e scrive chi è, cosa compra e cosa gli piace. A ogni
// ordine nuovo aggiunge un punto invece di riscrivere tutto: la storia cresce.
export async function riepilogaClienteAI(fd: FormData) {
  const chiave = s(fd, "chiave");
  if (!chiave) return;
  const esito = await riepilogaCliente(chiave, { rifai: s(fd, "rifai") === "si" });
  revalidatePath(`/clienti/${codificaChiave(chiave)}`);
  // `ok` con un messaggio non è un errore: è «non c'era niente da fare».
  if (esito.errore) {
    const campo = esito.ok ? "esito" : "errore";
    redirect(`/clienti/${codificaChiave(chiave)}?${campo}=${encodeURIComponent(esito.errore)}`);
  }
  redirect(
    `/clienti/${codificaChiave(chiave)}?esito=${encodeURIComponent(
      `Riepilogo aggiornato leggendo ${esito.ordini} ${esito.ordini === 1 ? "ordine" : "ordini"}`,
    )}`,
  );
}

// In blocco, coi clienti che valgono di più: ogni cliente è una chiamata a
// pagamento, quindi il numero si sceglie e si vede.
export async function riepilogaClientiMancantiAI(fd: FormData) {
  const quanti = Math.min(200, Math.max(1, Number(s(fd, "quanti") ?? "20") || 20));
  const esito = await riepilogaClientiMancanti(quanti);
  revalidatePath("/clienti");
  const messaggio = esito.errore
    ? `errore=${encodeURIComponent(esito.errore)}`
    : `esito=${encodeURIComponent(
        `${esito.fatti} riepiloghi scritti${esito.saltati ? ` · ${esito.saltati} saltati (già fatti o senza ordini)` : ""}${
          esito.fermato ? " · mi sono fermato per non superare il tempo: premi di nuovo per continuare" : ""
        }`,
      )}`;
  redirect(`/clienti?${messaggio}`);
}

// ---- Privacy di un cliente (scheda cliente) ----
// Le scelte scritte qui vincono su quelle importate da Shopify: sono l'ultima
// volontà che conosciamo. `si`/`no` per canale, più il blocco generale.
// Vuoto = «non lo so», e allora vale Shopify (e se manca anche quello, non si
// contatta: nel dubbio si tace).
export async function impostaPrivacyCliente(fd: FormData) {
  const chiave = s(fd, "chiave");
  if (!chiave) return;
  const scelta = (campo: string) => {
    const v = s(fd, campo);
    return v === "si" || v === "no" ? v : null;
  };
  const dati = {
    email: scelta("email"),
    sms: scelta("sms"),
    telefono: scelta("telefono"),
    bloccato: fd.get("bloccato") === "on",
    note: s(fd, "note"),
    autore: "operatore",
  };

  await prisma.privacyCliente.upsert({
    where: { chiave },
    create: { chiave, ...dati },
    update: dati,
  });

  revalidatePath("/clienti");
  revalidatePath(`/clienti/${codificaChiave(chiave)}`);
  revalidatePath("/liste");
}

// ---- Categorie di prodotto ----
// La specialità di un negozio: serve a classificare i prodotti che dal titolo
// non si riconoscono. Cambiarla ha effetto solo dopo il ricalcolo, quindi si
// ricalcola subito.
export async function impostaCategoriaNegozio(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  await prisma.negozioShopify.update({
    where: { id },
    data: { categoriaPredefinita: s(fd, "categoriaPredefinita") },
  });
  const esito = await ricalcolaCategorie();
  revalidatePath("/impostazioni");
  revalidatePath("/liste");
  redirect(
    `/impostazioni?esito=${encodeURIComponent(`Specialità salvata · ${esito.aggiornati.toLocaleString("it-IT")} ordini riclassificati`)}`,
  );
}

export async function ricalcolaCategorieOrdini() {
  const esito = await ricalcolaCategorie();
  revalidatePath("/impostazioni");
  revalidatePath("/liste");
  redirect(
    `/impostazioni?esito=${encodeURIComponent(`${esito.aggiornati.toLocaleString("it-IT")} ordini riclassificati per categoria`)}`,
  );
}

// ---- Eventi dei clienti (le occasioni ricavate dagli ordini) ----
export async function rilevaEventiClienti() {
  const esito = await rilevaEventi();
  revalidatePath("/eventi");
  revalidatePath("/clienti");
  redirect(
    `/eventi?esito=${encodeURIComponent(
      `${esito.ordiniLetti.toLocaleString("it-IT")} ordini letti · ${esito.eventi.toLocaleString("it-IT")} occasioni, di cui ${esito.ricorrenti} confermate da più anni · ${esito.nuovi} nuove, ${esito.aggiornati} aggiornate`,
    )}`,
  );
}

// Tipo e stato di un evento: li scrive una persona, e né il rilevamento né
// l'AI li toccano più. È la stessa regola della tipologia cliente — la mano
// vince, e resta scritto che è stata una mano.
export async function aggiornaEventoCliente(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const tipo = s(fd, "tipo");
  const attuale = await prisma.eventoCliente.findUnique({ where: { id }, select: { tipo: true } });

  await prisma.eventoCliente.update({
    where: { id },
    data: {
      tipo: tipo ?? undefined,
      stato: s(fd, "stato") ?? undefined,
      titolo: s(fd, "titolo") ?? undefined,
      note: s(fd, "note"),
      // Se il tipo cambia, da adesso è una scelta umana: l'AI non ci ripassa.
      ...(tipo && tipo !== attuale?.tipo ? { tipoDa: "manuale" } : {}),
    },
  });
  revalidatePath("/eventi");
  revalidatePath("/clienti");
}

// L'AI legge i biglietti e dice per che occasione erano quegli ordini.
// Propone: quello che scrive una persona resta intoccabile.
export async function leggiBigliettiConAI(fd: FormData) {
  const quanti = Math.min(300, Math.max(10, Number(s(fd, "quanti") ?? "100") || 100));
  const esito = await leggiOccasioniDaiBiglietti(quanti);
  revalidatePath("/eventi");
  const messaggio = esito.errore
    ? `errore=${encodeURIComponent(esito.errore)}`
    : `esito=${encodeURIComponent(
        `${esito.esaminati} biglietti letti con ${esito.modello} in ${esito.chiamate} chiamate · ${esito.riconosciuti} occasioni riconosciute · ${esito.daPrecisare} testi che non dicono l'occasione${esito.scartati ? ` · ${esito.scartati} risposte scartate` : ""}`,
      )}`;
  redirect(`/eventi?${messaggio}`);
}

// ---- Categorie dei prodotti: la proposta dell'AI ----
// L'AI propone, la persona corregge. Qui si chiede la proposta; l'esito torna
// nella query string perché parla con un servizio esterno e, se non risponde,
// il motivo si deve leggere.
export async function chiediCategorieAI(fd: FormData) {
  const quanti = Math.min(400, Math.max(10, Number(s(fd, "quanti") ?? "120") || 120));
  const esito = await proponiCategorieAI(quanti);
  revalidatePath("/categorie");
  revalidatePath("/liste");
  const messaggio = esito.errore
    ? `errore=${encodeURIComponent(esito.errore)}`
    : `esito=${encodeURIComponent(
        `${esito.esaminati} prodotti guardati con ${esito.modello} in ${esito.chiamate} chiamate · ${esito.classificati} classificati · ${esito.nonClassificati} lasciati da parte perché ambigui${esito.scartati ? ` · ${esito.scartati} risposte scartate` : ""}`,
      )}`;
  redirect(`/categorie?${messaggio}`);
}

// La categoria decisa da una persona: vince su tutto e l'AI non la tocca più.
export async function impostaCategoriaProdotto(fd: FormData) {
  const titolo = s(fd, "titolo");
  if (!titolo) return;
  const categoria = s(fd, "categoria");

  if (!categoria) {
    // Vuoto = «togli la mia decisione»: si torna a quello che dicono le regole.
    await prisma.categoriaProdotto.deleteMany({ where: { titolo } });
  } else {
    await prisma.categoriaProdotto.upsert({
      where: { titolo },
      create: { titolo, categoria, origine: "manuale", confermata: true },
      update: { categoria, origine: "manuale", confermata: true },
    });
  }
  await ricalcolaCategorie();
  revalidatePath("/categorie");
  revalidatePath("/liste");
}

// «L'ho guardata ed è giusta»: la proposta dell'AI diventa una scelta confermata.
export async function confermaCategoriaProdotto(fd: FormData) {
  const titolo = s(fd, "titolo");
  if (!titolo) return;
  await prisma.categoriaProdotto.updateMany({
    where: { titolo },
    data: { origine: "manuale", confermata: true },
  });
  revalidatePath("/categorie");
}

// ---- Script (i testi che si mandano ai clienti) ----
export async function creaScript(fd: FormData) {
  const nome = s(fd, "nome");
  if (!nome) return;
  const creato = await prisma.script.create({
    data: {
      nome,
      descrizione: s(fd, "descrizione") ?? "",
      canale: canaleValido(s(fd, "canale")),
      testo: s(fd, "testo") ?? "",
    },
  });
  revalidatePath("/script");
  redirect(`/script/${creato.id}`);
}

// Le variabili arrivano dal modulo come righe numerate (var_chiave_0,
// var_etichetta_0, …). Una riga senza nome viene scartata: è così che si
// cancella una variabile, ed è anche la riga vuota in fondo alla tabella.
function variabiliDalModulo(fd: FormData): VariabileScript[] {
  const variabili: VariabileScript[] = [];
  for (let i = 0; i < 50; i++) {
    if (!fd.has(`var_chiave_${i}`)) continue;
    const chiave = (s(fd, `var_chiave_${i}`) ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!chiave) continue;
    variabili.push({
      chiave,
      etichetta: s(fd, `var_etichetta_${i}`) ?? "",
      valore: s(fd, `var_valore_${i}`) ?? "",
      obbligatoria: fd.get(`var_obbligatoria_${i}`) === "on",
    });
  }
  return variabili;
}

export async function aggiornaScript(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const variabili = variabiliDalModulo(fd);
  await prisma.script.update({
    where: { id },
    data: {
      nome: s(fd, "nome") ?? undefined,
      descrizione: s(fd, "descrizione") ?? "",
      canale: canaleValido(s(fd, "canale")),
      oggetto: s(fd, "oggetto") ?? "",
      testo: s(fd, "testo") ?? "",
      variabili,
      attivo: fd.get("attivo") === "on",
    },
  });
  revalidatePath("/script");
  revalidatePath(`/script/${id}`);
  revalidatePath("/automazioni");
  redirect(`/script/${id}?esito=${encodeURIComponent(`Script salvato · ${variabili.length} variabili dichiarate`)}`);
}

// I valori scelti da un'automazione per le variabili del suo script: arrivano
// dal modulo come `valore_<chiave>`. Vuoto = si usa il predefinito dello script.
function valoriDalModulo(fd: FormData): Record<string, string> {
  const valori: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("valore_") || typeof v !== "string") continue;
    const chiave = k.slice("valore_".length).toLowerCase();
    if (chiave && v.trim()) valori[chiave] = v.trim();
  }
  return valori;
}

export async function eliminaScript(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  // Le automazioni che lo usavano non si cancellano: restano senza script
  // (onDelete: SetNull) e lo dicono, invece di sparire con lui.
  await prisma.script.delete({ where: { id } });
  revalidatePath("/script");
  revalidatePath("/automazioni");
  redirect("/script");
}

// ---- Automazioni ----
export async function creaAutomazione(fd: FormData) {
  const nome = s(fd, "nome");
  if (!nome) return;
  const creata = await prisma.automazione.create({
    data: {
      nome,
      descrizione: s(fd, "descrizione") ?? "",
      lista: s(fd, "lista") ?? "da-riattivare",
      canale: canaleValido(s(fd, "canale")),
      // Lo script si sceglie già qui: è il motivo per cui la sezione esiste.
      scriptId: s(fd, "scriptId"),
      script: s(fd, "script") ?? "",
    },
  });
  revalidatePath("/automazioni");
  redirect(`/automazioni/${creata.id}`);
}

export async function aggiornaAutomazione(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  await prisma.automazione.update({
    where: { id },
    data: {
      nome: s(fd, "nome") ?? undefined,
      descrizione: s(fd, "descrizione") ?? "",
      lista: s(fd, "lista") ?? undefined,
      canale: canaleValido(s(fd, "canale")),
      // Lo script collegato: vuoto = si torna al testo scritto sull'automazione.
      scriptId: s(fd, "scriptId"),
      valori: valoriDalModulo(fd),
      script: s(fd, "script") ?? "",
      oggetto: s(fd, "oggetto") ?? "",
      giorniSilenzio: Math.max(0, Number(s(fd, "giorniSilenzio") ?? "30") || 0),
      limiteGiro: Math.min(2000, Math.max(1, Number(s(fd, "limiteGiro") ?? "50") || 50)),
      // Il consenso si può togliere solo di proposito, e resta scritto qui.
      soloConsenso: fd.get("soloConsenso") === "on",
      attiva: fd.get("attiva") === "on",
    },
  });
  revalidatePath("/automazioni");
  revalidatePath(`/automazioni/${id}`);
}

export async function eliminaAutomazione(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  await prisma.automazione.delete({ where: { id } });
  revalidatePath("/automazioni");
  redirect("/automazioni");
}

// Prepara un giro: crea i messaggi (nessun invio). L'esito torna nella query
// string, con quanti sono stati saltati e perché.
export async function preparaGiroAutomazione(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const a = await prisma.automazione.findUnique({ where: { id } });
  if (!a) return;

  const esito = await preparaGiro(a);
  revalidatePath(`/automazioni/${id}`);
  const saltati = esito.saltati.map((x) => `${x.quanti} ${x.motivo}`).join(" · ");
  const messaggio = esito.errore
    ? `errore=${encodeURIComponent(esito.errore)}`
    : `esito=${encodeURIComponent(
        `${esito.preparati} messaggi preparati su ${esito.esaminati} clienti esaminati${saltati ? ` — saltati: ${saltati}` : ""}`,
      )}`;
  redirect(`/automazioni/${id}?${messaggio}`);
}

// Segna come inviati i messaggi pronti: lo dice una persona, dopo averli
// mandati davvero. L'app non finge di aver inviato ciò che non ha inviato.
export async function segnaInviati(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const uno = s(fd, "messaggioId");
  await prisma.messaggioAutomazione.updateMany({
    where: uno ? { id: uno } : { automazioneId: id, stato: "pronto" },
    data: { stato: "inviato", inviatoIl: new Date() },
  });
  revalidatePath(`/automazioni/${id}`);
}

export async function annullaMessaggiPronti(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const uno = s(fd, "messaggioId");
  await prisma.messaggioAutomazione.updateMany({
    where: uno ? { id: uno } : { automazioneId: id, stato: "pronto" },
    data: { stato: "annullato", motivo: "annullato a mano" },
  });
  revalidatePath(`/automazioni/${id}`);
}

// ---- Gestione etichette (Impostazioni) ----
export async function creaEtichetta(fd: FormData) {
  const nome = s(fd, "nome");
  if (!nome) return;
  await prisma.etichetta.upsert({
    where: { nome },
    create: { nome, colore: s(fd, "colore") ?? "#0071e3" },
    update: { colore: s(fd, "colore") ?? undefined },
  });
  revalidatePath("/impostazioni");
}

export async function eliminaEtichetta(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  await prisma.etichetta.delete({ where: { id } });
  revalidatePath("/impostazioni");
}

// ---- Gestione stati/pipeline (Impostazioni) ----
export async function creaStato(fd: FormData) {
  const nome = s(fd, "nome");
  if (!nome) return;
  const chiave = (s(fd, "chiave") ?? nome).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const max = await prisma.statoOrdine.aggregate({ _max: { ordine: true } });
  await prisma.statoOrdine.upsert({
    where: { chiave },
    create: {
      chiave,
      nome,
      colore: s(fd, "colore") ?? "#6e6e73",
      ordine: (max._max.ordine ?? -1) + 1,
      terminale: fd.get("terminale") === "on",
    },
    update: { nome, colore: s(fd, "colore") ?? undefined, terminale: fd.get("terminale") === "on" },
  });
  revalidatePath("/impostazioni");
  revalidatePath("/bacheca");
}

export async function aggiornaStato(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const predefinito = fd.get("predefinito") === "on";
  // Un solo stato predefinito alla volta.
  if (predefinito) {
    await prisma.statoOrdine.updateMany({ where: { predefinito: true }, data: { predefinito: false } });
  }
  await prisma.statoOrdine.update({
    where: { id },
    data: {
      nome: s(fd, "nome") ?? undefined,
      colore: s(fd, "colore") ?? undefined,
      ordine: Number(s(fd, "ordine") ?? "0") || 0,
      predefinito,
      terminale: fd.get("terminale") === "on",
    },
  });
  revalidatePath("/impostazioni");
  revalidatePath("/bacheca");
}

export async function eliminaStato(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  // Stacca gli ordini prima di eliminare lo stato (onDelete: SetNull non è
  // dichiarato, quindi lo facciamo esplicitamente).
  await prisma.ordine.updateMany({ where: { statoId: id }, data: { statoId: null } });
  await prisma.statoOrdine.delete({ where: { id } });
  revalidatePath("/impostazioni");
  revalidatePath("/bacheca");
}

// ---- Gestione negozi Shopify (Impostazioni) ----
export async function creaNegozio(fd: FormData) {
  const brand = s(fd, "brand");
  const dominio = s(fd, "dominio");
  if (!brand || !dominio) return;
  await prisma.negozioShopify.upsert({
    where: { brand },
    create: {
      brand,
      dominio,
      token: s(fd, "token") ?? "",
      clientId: s(fd, "clientId"),
      clientSecret: s(fd, "clientSecret"),
    },
    update: {
      dominio,
      token: s(fd, "token") ?? "",
      clientId: s(fd, "clientId"),
      clientSecret: s(fd, "clientSecret"),
      attivo: true,
    },
  });
  revalidatePath("/impostazioni");
}

// Colore del brand: distingue gli ordini dei vari negozi nell'elenco e nelle colonne.
export async function cambiaColoreBrand(fd: FormData) {
  const id = s(fd, "id");
  const colore = s(fd, "colore");
  if (!id || !colore) return;
  await prisma.negozioShopify.update({ where: { id }, data: { colore } });
  revalidatePath("/");
  revalidatePath("/clienti");
  revalidatePath("/impostazioni");
}

// Come si chiama questo negozio nell'app Ricerca fornitori: serve ai link
// rapidi "Cerca fornitore" (qui "Flowers", lì "deluxyflowers.com").
export async function cambiaBrandRicerca(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  await prisma.negozioShopify.update({ where: { id }, data: { brandRicerca: s(fd, "brandRicerca") } });
  revalidatePath("/");
  revalidatePath("/impostazioni");
}

export async function toggleNegozio(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const n = await prisma.negozioShopify.findUnique({ where: { id } });
  if (n) await prisma.negozioShopify.update({ where: { id }, data: { attivo: !n.attivo } });
  revalidatePath("/impostazioni");
}

export async function eliminaNegozio(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  await prisma.negozioShopify.delete({ where: { id } });
  revalidatePath("/impostazioni");
}

// ---- Consegna su bozze e ordini Shopify ----
// Scrive Data_Consegna / Fascia_Oraria_Consegna là dove Shopify non offre un
// campo: nelle bozze create a mano. L'esito torna nella query string perché la
// pagina è un server component e l'operazione riguarda Shopify, non il DB.
export async function impostaConsegnaShopify(fd: FormData) {
  const negozioId = s(fd, "negozioId");
  const numero = s(fd, "numero");
  const data = s(fd, "data");
  const fascia = s(fd, "fascia");

  const base = new URLSearchParams();
  if (negozioId) base.set("negozio", negozioId);
  if (numero) base.set("numero", numero);
  const torna = (extra: Record<string, string>) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/consegna?${p.toString()}`;
  };

  let destinazione: string;
  try {
    if (!negozioId || !numero) throw new Error("Servono il negozio e il numero della bozza o dell'ordine.");
    if (data && !dataValida(data)) throw new Error("Data non valida.");
    if (fascia && !fasciaValida(fascia)) throw new Error("Fascia oraria non prevista.");

    const neg = await prisma.negozioShopify.findUnique({ where: { id: negozioId } });
    if (!neg) throw new Error("Negozio non trovato.");

    const token = await tokenNegozio(neg);
    const doc = await cercaDocumento(neg.dominio, token, numero);
    if (!doc) throw new Error(`Nessuna bozza né ordine con numero ${numero} su ${neg.brand}.`);

    await scriviConsegna(neg.dominio, token, doc, data, fascia);
    const descrizione = [data, fascia].filter(Boolean).join(" · ") || "consegna azzerata";
    destinazione = torna({ esito: `${doc.tipo === "bozza" ? "Bozza" : "Ordine"} ${doc.numero}: ${descrizione}` });
  } catch (e) {
    destinazione = torna({ errore: (e as Error).message });
  }

  // Qui si aggiorna solo Shopify, che della consegna è la fonte: il registro
  // locale la rilegge dagli attributi al prossimo import.
  revalidatePath("/consegna");
  redirect(destinazione);
}

// ---- Rubrica Google: salva i clienti selezionati fra i contatti ----
// La pagina mostra prima la prova a vuoto; qui si scrive davvero.
export async function salvaRubrica(fd: FormData) {
  const sel = {
    limite: Math.min(2000, Math.max(1, Number(s(fd, "limite") ?? "50") || 50)),
    minimoOrdini: Math.max(1, Number(s(fd, "minimoOrdini") ?? "2") || 2),
    dal: s(fd, "dal") ?? undefined,
  };
  await salvaInRubrica(sel);
  revalidatePath("/clienti/rubrica");
}

// ---- Chiavi API (Impostazioni): attiva/disattiva. Creazione via `npm run chiave`. ----
export async function toggleChiave(fd: FormData) {
  const id = s(fd, "id");
  if (!id) return;
  const k = await prisma.apiKey.findUnique({ where: { id } });
  if (k) await prisma.apiKey.update({ where: { id }, data: { attiva: !k.attiva } });
  revalidatePath("/impostazioni");
}
