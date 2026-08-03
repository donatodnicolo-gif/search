"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { cifra, sha256, tokenCasuale, hashPassword } from "@/lib/crypto";
import { generaSegretoTotp } from "@/lib/totp";
import { registra } from "@/lib/audit";
import { chiudiFuoriDallApp, creaRichiesta, decidi } from "@/lib/richieste";
import {
  accedi,
  confermaSecondoFattore,
  esci as chiudiSessione,
  ipRichiesta,
  operatoreCorrente,
} from "@/lib/sessione";
import { notificaOrigine } from "@/lib/webhook";
import { leggiRegole, salvaRegola, type Regole } from "@/lib/impostazioni";
import { generaXml, verificaOrdinante } from "@/lib/sepa";
import { normalizzaIban, normalizzaNome } from "@/lib/iban";
import { aCentesimi, euro } from "@/lib/denaro";
import { chiediCodice, impronteDelPin, pinAccettabile, sblocca, verificaCancello } from "@/lib/sblocco";
import { pagaLottoConQonto } from "@/lib/pagamento-banca";
import { provaChiaviQonto, qontoConfigurato, salvaChiaviQonto, scollegaQonto } from "@/lib/qonto";
import { elencoDestinatari, inviaEmail, provaSmtp, salvaConfigSmtp, scollegaPosta, type ConfigSmtp } from "@/lib/mail";

// Tutte le azioni della UI. Ognuna ricontrolla chi è l'operatore: il middleware
// filtra i cookie falsi, ma l'autorizzazione vera si decide qui, dove si sa
// anche il ruolo. Le server action di Next hanno già la protezione CSRF
// (controllo dell'origine), rinforzata dal cookie SameSite=strict.

const testo = (fd: FormData, nome: string) => String(fd.get(nome) ?? "").trim();

async function esigiOperatore() {
  const o = await operatoreCorrente();
  if (!o) redirect("/login");
  return o;
}

async function esigiAdmin() {
  const o = await esigiOperatore();
  if (o.ruolo !== "admin") throw new Error("Serve il ruolo amministratore.");
  return o;
}

// ---------------------------------------------------------------------------
// Sessione
// ---------------------------------------------------------------------------

export async function entra(_stato: unknown, fd: FormData): Promise<{ errore?: string }> {
  const esito = await accedi(testo(fd, "email"), String(fd.get("password") ?? ""), testo(fd, "codice"));
  if (!esito.ok) return { errore: esito.errore };
  const da = testo(fd, "da");
  redirect(da.startsWith("/") ? da : "/");
}

export async function esci(): Promise<void> {
  await chiudiSessione();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Decidere su una richiesta
// ---------------------------------------------------------------------------

export async function decidiRichiesta(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const operatore = await esigiOperatore();
  const id = testo(fd, "id");
  const azione = testo(fd, "azione");
  if (!["approvata", "rifiutata", "sospesa"].includes(azione)) return { errore: "Azione sconosciuta." };

  // Secondo fattore su ogni decisione, non solo all'accesso: una sessione
  // aperta e lasciata incustodita non deve poter autorizzare un bonifico.
  if (operatore.totpAttivo) {
    if (!(await confermaSecondoFattore(operatore.id, testo(fd, "codice")))) {
      return { errore: "Codice a 6 cifre errato o scaduto." };
    }
  }

  const esito = await decidi(
    id,
    { id: operatore.id, email: operatore.email, ruolo: operatore.ruolo, tettoApprovazione: operatore.tettoApprovazione },
    azione as "approvata" | "rifiutata" | "sospesa",
    testo(fd, "motivo"),
    await ipRichiesta(),
  );
  if (!esito.ok) return { errore: esito.errore };

  // La notifica all'app di origine non deve poter far fallire l'approvazione.
  notificaOrigine(id).catch(() => {});

  revalidatePath("/");
  revalidatePath("/richieste");
  revalidatePath(`/richieste/${id}`);
  return { ok: esito.messaggio };
}

// ---------------------------------------------------------------------------
// Chiudere una richiesta senza pagarla da qui
// ---------------------------------------------------------------------------

// «Questa l'ho già pagata dal portale della banca» / «annullala, non si paga
// più». Non è una porta da cui esce denaro — non tocca il cancello del pagatore
// e non chiede il PIN — ma chiude una partita e lo dice a chi l'aveva aperta,
// quindi vuole il secondo fattore e un motivo scritto.
export async function chiudiRichiesta(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const operatore = await esigiOperatore();
  const id = testo(fd, "id");
  const esito = testo(fd, "esito");
  if (esito !== "pagata_fuori" && esito !== "annullata") return { errore: "Azione sconosciuta." };

  if (operatore.totpAttivo) {
    if (!(await confermaSecondoFattore(operatore.id, testo(fd, "codice")))) {
      return { errore: "Codice a 6 cifre errato o scaduto: non è stato cambiato niente." };
    }
  }

  const motivo = testo(fd, "motivo");
  const chiusura = await chiudiFuoriDallApp(
    id,
    { id: operatore.id, email: operatore.email, ruolo: operatore.ruolo },
    { esito, metodo: testo(fd, "metodo"), motivo, dataPagamento: testo(fd, "dataPagamento") },
    await ipRichiesta(),
  );
  if (!chiusura.ok) return { errore: chiusura.errore };

  // L'app che ha chiesto il pagamento va avvisata: per Finance «pagata fuori»
  // chiude il mese, «annullata» rimette il dovuto in coda. Se il webhook non
  // parte, la chiusura resta comunque valida qui — è un avviso, non la verità.
  notificaOrigine(id, { motivo }).catch(() => {});

  revalidatePath("/");
  revalidatePath("/richieste");
  revalidatePath(`/richieste/${id}`);
  revalidatePath("/distinte");
  return { ok: `${chiusura.messaggio} L'app che l'aveva chiesta è stata avvisata.` };
}

// ---------------------------------------------------------------------------
// Richiesta creata a mano dentro l'app
// ---------------------------------------------------------------------------

export async function nuovaRichiestaManuale(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const operatore = await esigiOperatore();
  if (operatore.ruolo === "osservatore") return { errore: "Il ruolo osservatore non può creare richieste." };

  const esito = await creaRichiesta(
    {
      importo: testo(fd, "importo"),
      beneficiario: testo(fd, "beneficiario"),
      iban: testo(fd, "iban"),
      bic: testo(fd, "bic"),
      causale: testo(fd, "causale"),
      note: testo(fd, "note"),
      categoria: testo(fd, "categoria"),
      scadenza: testo(fd, "scadenza") || undefined,
    },
    { origine: "manuale", attore: operatore.email, ip: await ipRichiesta() },
  );
  if (!esito.ok) return { errore: esito.errore };
  revalidatePath("/");
  revalidatePath("/richieste");
  return {
    ok: `Richiesta ${esito.richiesta.riferimento} creata. La dovrà approvare un altro operatore: chi crea non firma.`,
  };
}

// ---------------------------------------------------------------------------
// Beneficiari
// ---------------------------------------------------------------------------

export async function verificaBeneficiario(fd: FormData): Promise<void> {
  const operatore = await esigiOperatore();
  if (operatore.ruolo === "osservatore") return;
  const id = testo(fd, "id");
  const b = await prisma.beneficiario.findUnique({ where: { id } });
  if (!b) return;
  await prisma.beneficiario.update({
    where: { id },
    data: {
      verificato: !b.verificato,
      verificatoDa: b.verificato ? null : operatore.email,
      verificatoIl: b.verificato ? null : new Date(),
    },
  });
  await registra(
    "beneficiario.verificato",
    operatore.email,
    { nome: b.nome, iban: b.iban, verificato: !b.verificato },
    { ip: await ipRichiesta() },
  );
  revalidatePath("/beneficiari");
}

export async function aggiungiBeneficiario(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const operatore = await esigiOperatore();
  if (operatore.ruolo === "osservatore") return { errore: "Il ruolo osservatore non può modificare la rubrica." };
  const nome = testo(fd, "nome");
  const iban = normalizzaIban(testo(fd, "iban"));
  if (nome.length < 2 || !iban) return { errore: "Nome e IBAN sono obbligatori." };
  const { ibanValido } = await import("@/lib/iban");
  if (!ibanValido(iban)) return { errore: "IBAN non valido: il checksum non torna." };
  await prisma.beneficiario.upsert({
    where: { nomeNorm_iban: { nomeNorm: normalizzaNome(nome), iban } },
    update: { verificato: true, verificatoDa: operatore.email, verificatoIl: new Date() },
    create: {
      nome,
      nomeNorm: normalizzaNome(nome),
      iban,
      bic: testo(fd, "bic") || null,
      paese: iban.slice(0, 2),
      verificato: true,
      verificatoDa: operatore.email,
      verificatoIl: new Date(),
      note: testo(fd, "note") || null,
    },
  });
  await registra("beneficiario.verificato", operatore.email, { nome, iban, verificato: true }, { ip: await ipRichiesta() });
  revalidatePath("/beneficiari");
  return { ok: `${nome} aggiunto fra i beneficiari verificati.` };
}

// ---------------------------------------------------------------------------
// Distinte SEPA
// ---------------------------------------------------------------------------

export async function creaDistinta(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const operatore = await esigiOperatore();
  if (operatore.ruolo === "osservatore") return { errore: "Il ruolo osservatore non può creare distinte." };

  const ids = fd.getAll("richieste").map(String).filter(Boolean);
  if (ids.length === 0) return { errore: "Nessuna richiesta selezionata." };

  const regole = await leggiRegole();
  const problema = verificaOrdinante({ nome: regole.ordinanteNome, iban: regole.ordinanteIban, bic: regole.ordinanteBic });
  if (problema) return { errore: problema };

  // Solo richieste davvero approvate e non già in distinta: il filtro è qui,
  // non nella pagina, perché è qui che conta.
  const richieste = await prisma.richiesta.findMany({ where: { id: { in: ids }, stato: "approvata", lottoId: null } });
  if (richieste.length === 0) return { errore: "Nessuna delle richieste selezionate è approvata e libera." };

  const anno = new Date().getFullYear();
  const ultimo = await prisma.lotto.findFirst({
    where: { riferimento: { startsWith: `LOTTO-${anno}-` } },
    orderBy: { riferimento: "desc" },
    select: { riferimento: true },
  });
  const n = ultimo ? Number(ultimo.riferimento.slice(`LOTTO-${anno}-`.length)) + 1 : 1;
  const riferimento = `LOTTO-${anno}-${String(n).padStart(4, "0")}`;

  const lotto = await prisma.lotto.create({ data: { riferimento, creatoDa: operatore.email } });
  await prisma.richiesta.updateMany({
    where: { id: { in: richieste.map((r) => r.id) } },
    data: { lottoId: lotto.id, stato: "in_lotto" },
  });
  await registra(
    "lotto.creato",
    operatore.email,
    { riferimento, richieste: richieste.map((r) => r.riferimento), totaleCent: richieste.reduce((s, r) => s + r.importoCent, 0) },
    { ip: await ipRichiesta() },
  );
  for (const r of richieste) notificaOrigine(r.id).catch(() => {});

  revalidatePath("/distinte");
  redirect(`/distinte/${lotto.id}`);
}

export async function segnaLottoPagato(fd: FormData): Promise<void> {
  const operatore = await esigiOperatore();
  if (operatore.ruolo === "osservatore") return;
  const id = testo(fd, "id");
  const lotto = await prisma.lotto.findUnique({ where: { id }, include: { richieste: true } });
  if (!lotto || lotto.stato === "pagato") return;
  const adesso = new Date();
  await prisma.lotto.update({ where: { id }, data: { stato: "pagato", pagatoIl: adesso } });
  await prisma.richiesta.updateMany({ where: { lottoId: id }, data: { stato: "pagata", pagataIl: adesso } });
  await registra("lotto.pagato", operatore.email, { riferimento: lotto.riferimento }, { ip: await ipRichiesta() });
  for (const r of lotto.richieste) notificaOrigine(r.id).catch(() => {});
  revalidatePath("/distinte");
  revalidatePath(`/distinte/${id}`);
}

// ---------------------------------------------------------------------------
// Sblocco del pagamento — l'unica porta da cui esce il denaro
// ---------------------------------------------------------------------------

export async function chiediCodicePagamento(
  _stato: unknown,
  fd: FormData,
): Promise<{ errore?: string; ok?: string }> {
  const operatore = await esigiOperatore();
  const esito = await chiediCodice(testo(fd, "id"), operatore, await ipRichiesta());
  revalidatePath(`/distinte/${testo(fd, "id")}`);
  return esito.ok ? { ok: esito.messaggio } : { errore: esito.errore };
}

export async function sbloccaPagamento(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const operatore = await esigiOperatore();
  const id = testo(fd, "id");
  const esito = await sblocca(id, operatore, testo(fd, "codice"), String(fd.get("pin") ?? ""), await ipRichiesta());
  revalidatePath(`/distinte/${id}`);
  return esito.ok ? { ok: esito.messaggio } : { errore: esito.errore };
}

/** Il PIN se lo mette la persona, non l'amministratore: nessun altro lo sa. */
export async function impostaPin(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const operatore = await esigiOperatore();
  const password = String(fd.get("password") ?? "");
  const pin = String(fd.get("pin") ?? "").trim();
  const ripeti = String(fd.get("ripeti") ?? "").trim();

  const o = await prisma.operatore.findUnique({ where: { id: operatore.id } });
  if (!o) return { errore: "Operatore inesistente." };

  // Password e secondo fattore anche qui: cambiare il PIN vale quanto pagare.
  const { passwordCorretta } = await import("@/lib/crypto");
  if (!passwordCorretta(password, o.passwordHash, o.passwordSalt)) return { errore: "Password errata." };
  if (o.totpAttivo && !(await confermaSecondoFattore(operatore.id, testo(fd, "codice")))) {
    return { errore: "Codice a 6 cifre errato o scaduto." };
  }
  if (pin !== ripeti) return { errore: "I due PIN non coincidono." };
  const problema = pinAccettabile(pin);
  if (problema) return { errore: problema };

  const { hash, salt } = impronteDelPin(pin);
  await prisma.operatore.update({
    where: { id: operatore.id },
    data: { pinHash: hash, pinSalt: salt, pinAggiornatoIl: new Date() },
  });
  await registra("operatore.pin_impostato", operatore.email, {}, { ip: await ipRichiesta() });
  revalidatePath("/pin");
  return { ok: "PIN impostato. Non è scritto da nessuna parte: se lo dimentichi va rifatto da qui." };
}

// ---------------------------------------------------------------------------
// Collegamento alla banca: le chiavi si incollano qui, non me le manda nessuno
// ---------------------------------------------------------------------------

export async function collegaBanca(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const admin = await esigiAdmin();
  const login = testo(fd, "login");
  const segreto = String(fd.get("segreto") ?? "").trim();
  const contoId = testo(fd, "contoId");
  if (!login || !segreto) return { errore: "Servono sia il login sia la chiave segreta di Qonto." };

  // Si prova PRIMA di salvare: chiavi sbagliate salvate in silenzio si
  // scoprirebbero davanti a una distinta sbloccata, nel momento peggiore.
  const prova = await provaChiaviQonto({ login, segreto, contoId: contoId || null });
  if (!prova.ok) return { errore: `Qonto non accetta queste chiavi: ${prova.errore}` };

  await salvaChiaviQonto({ login, segreto, contoId });
  await registra(
    "banca.collegata",
    admin.email,
    { conti: prova.conti, contoScelto: contoId || "(principale)" },
    { ip: await ipRichiesta() },
  );
  revalidatePath("/impostazioni");
  revalidatePath("/banca");
  return {
    ok: `Banca collegata: ${prova.conti} ${prova.conti === 1 ? "conto visibile" : "conti visibili"}. La chiave è salvata cifrata: da qui in avanti non si rilegge, si sostituisce.`,
  };
}

export async function scollegaBanca(): Promise<void> {
  const admin = await esigiAdmin();
  await scollegaQonto();
  await salvaRegola("qontoEsecuzioneAttiva", "false");
  await registra("banca.collegata", admin.email, { scollegata: true }, { ip: await ipRichiesta() });
  revalidatePath("/impostazioni");
  revalidatePath("/banca");
}

// ---------------------------------------------------------------------------
// Server di posta
// ---------------------------------------------------------------------------

// Da qui passa il codice che sblocca il denaro: cambiare il server di posta
// vale quanto cambiare il pagatore. Perciò, oltre al ruolo admin, si chiede il
// secondo fattore — una sessione rubata non basta a dirottare i codici — e la
// modifica finisce nel registro. La password non entra mai né nel registro né
// nella pagina: si scrive, si prova, si salva cifrata.
export async function collegaPosta(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const admin = await esigiAdmin();

  if (admin.totpAttivo && !(await confermaSecondoFattore(admin.id, testo(fd, "codice")))) {
    return { errore: "Codice a 6 cifre errato: il server di posta non è stato cambiato." };
  }

  const host = testo(fd, "host");
  const utente = testo(fd, "utente");
  const password = String(fd.get("password") ?? "").trim();
  const mittente = testo(fd, "mittente") || utente;
  const porta = Number(testo(fd, "porta") || 587);
  const destinatari = elencoDestinatari(testo(fd, "destinatari"));
  if (!host || !utente || !password) return { errore: "Servono l'indirizzo del server, l'utente e la password." };
  if (!Number.isFinite(porta) || porta <= 0 || porta > 65535) return { errore: "La porta non è un numero valido (465 con Register, 587 con Gmail)." };
  if (!destinatari.length) {
    return {
      errore:
        "Serve almeno una casella fra i destinatari ammessi: senza, questa app potrebbe scrivere a chiunque e il secondo lucchetto sui codici di pagamento non esisterebbe.",
    };
  }

  const config: ConfigSmtp = { host, porta: Math.round(porta), utente, password, mittente, destinatari };

  // Si prova PRIMA di salvare, come per le chiavi della banca: una posta che
  // non funziona si scoprirebbe davanti a una distinta da sbloccare.
  const prova = await provaSmtp(config);
  if (!prova.ok) return { errore: `Il server di posta non accetta questi dati: ${prova.errore}` };

  await salvaConfigSmtp(config);
  await registra(
    "posta.configurata",
    admin.email,
    { host, porta: Math.round(porta), utente, mittente, destinatari }, // mai la password
    { ip: await ipRichiesta() },
  );

  let coda = "";
  if (fd.get("prova")) {
    // La prova va al primo destinatario ammesso, non a chi sta configurando:
    // se andasse all'admin, l'elenco degli ammessi non verrebbe mai messo alla
    // prova proprio nell'unico momento in cui si può scoprire che è sbagliato.
    const a = destinatari[0];
    try {
      await inviaEmail({
        a,
        oggetto: "Deluxy Transactions — prova di invio",
        testo:
          "Se leggi questo messaggio, il server di posta funziona e i codici di sblocco dei pagamenti possono partire.\n\n" +
          `Configurato da ${admin.email} su ${host}:${Math.round(porta)}.`,
      });
      coda = ` Email di prova mandata a ${a}.`;
    } catch (e) {
      coda = ` Attenzione: la connessione funziona ma l'invio di prova a ${a} è fallito (${e instanceof Error ? e.message : "errore"}).`;
    }
  }

  revalidatePath("/impostazioni");
  return { ok: `Server di posta collegato e salvato cifrato.${coda}` };
}

export async function scollegaPostaAzione(): Promise<void> {
  const admin = await esigiAdmin();
  await scollegaPosta();
  await registra("posta.configurata", admin.email, { scollegata: true }, { ip: await ipRichiesta() });
  revalidatePath("/impostazioni");
}

// ---------------------------------------------------------------------------
// Pagamento dalla banca (Qonto)
// ---------------------------------------------------------------------------

export type EsitoPagamentoUI = {
  errore?: string;
  ok?: string;
  bloccate?: { riferimento: string; motivo: string }[];
};

export async function pagaConQonto(_stato: unknown, fd: FormData): Promise<EsitoPagamentoUI> {
  const operatore = await esigiOperatore();
  const id = testo(fd, "id");
  const esito = await pagaLottoConQonto(id, operatore, await ipRichiesta());

  revalidatePath(`/distinte/${id}`);
  revalidatePath("/distinte");
  revalidatePath("/richieste");

  // I motivi tornano come elenco, non incollati in una frase sola: chi legge
  // deve capire al primo colpo *quale* controllo ha fermato *quale* pagamento.
  const bloccate = esito.bloccate.length ? esito.bloccate : undefined;
  const pagate = esito.pagate.length
    ? `Partiti ${esito.pagate.length} bonifici per ${euro(esito.pagate.reduce((s, p) => s + p.importoCent, 0))}.`
    : "";

  if (esito.errore) return { errore: esito.errore, ok: pagate || undefined, bloccate };
  if (!pagate && !bloccate) return { ok: "Niente da pagare." };
  return { ok: pagate || undefined, bloccate };
}

/** Genera l'XML e lo restituisce come testo, registrandone l'impronta. */
export async function esportaLotto(id: string): Promise<{ nome: string; xml: string } | { errore: string }> {
  const operatore = await esigiOperatore();

  // Il cancello: qui esce il denaro. Solo il pagatore, solo con lo sblocco
  // ancora valido (codice via email + PIN).
  const chiuso = await verificaCancello(id, operatore);
  if (chiuso) return { errore: chiuso };

  const lotto = await prisma.lotto.findUnique({ where: { id }, include: { richieste: true } });
  if (!lotto) return { errore: "Distinta inesistente." };
  const regole = await leggiRegole();
  const ordinante = { nome: regole.ordinanteNome, iban: regole.ordinanteIban, bic: regole.ordinanteBic };
  const problema = verificaOrdinante(ordinante);
  if (problema) return { errore: problema };

  const xml = generaXml(
    lotto.richieste.map((r) => ({
      riferimento: r.riferimento,
      beneficiario: r.beneficiario,
      iban: r.iban,
      bic: r.bic,
      importoCent: r.importoCent,
      causale: r.causale,
    })),
    ordinante,
    { riferimentoLotto: lotto.riferimento, dataEsecuzione: new Date() },
  );

  const impronta = sha256(xml);
  await prisma.lotto.update({
    where: { id },
    data: { stato: lotto.stato === "aperto" ? "esportato" : lotto.stato, esportatoIl: new Date(), improntaXml: impronta },
  });
  await registra(
    "lotto.esportato",
    operatore.email,
    { riferimento: lotto.riferimento, impronta, sbloccatoDa: lotto.sbloccatoDa, sbloccatoIl: lotto.sbloccatoIl },
    { ip: await ipRichiesta() },
  );
  return { nome: `${lotto.riferimento}.xml`, xml };
}

// ---------------------------------------------------------------------------
// Chiavi API delle altre app
// ---------------------------------------------------------------------------

export async function creaChiaveApi(
  _stato: unknown,
  fd: FormData,
): Promise<{ errore?: string; chiave?: string; segreto?: string; nome?: string }> {
  const operatore = await esigiAdmin();
  const nome = testo(fd, "nome").toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9-]{3,40}$/.test(nome)) {
    return { errore: "Nome non valido: minuscolo, lettere numeri e trattini, da 3 a 40 caratteri." };
  }
  const chiave = `trx_${tokenCasuale(24)}`;
  const segreto = tokenCasuale(32);
  const tettoRichiesta = aCentesimi(testo(fd, "tettoRichiesta")) ?? 0;
  const tettoGiornaliero = aCentesimi(testo(fd, "tettoGiornaliero")) ?? 0;

  await prisma.chiaveApi.create({
    data: {
      nome,
      hash: sha256(chiave),
      prefisso: chiave.slice(0, 12),
      segretoHmac: cifra(segreto),
      tettoRichiesta,
      tettoGiornaliero,
      ipConsentiti: testo(fd, "ipConsentiti"),
    },
  });
  await registra("chiave.creata", operatore.email, { nome, tettoRichiesta, tettoGiornaliero }, { ip: await ipRichiesta() });
  revalidatePath("/chiavi");
  // Chiave e segreto si vedono UNA volta sola: dopo questa schermata restano
  // solo l'hash e il segreto cifrato.
  return { chiave, segreto, nome };
}

export async function revocaChiaveApi(fd: FormData): Promise<void> {
  const operatore = await esigiAdmin();
  const id = testo(fd, "id");
  const c = await prisma.chiaveApi.findUnique({ where: { id } });
  if (!c) return;
  await prisma.chiaveApi.update({ where: { id }, data: { attiva: false, revocataIl: new Date() } });
  await registra("chiave.revocata", operatore.email, { nome: c.nome }, { ip: await ipRichiesta() });
  revalidatePath("/chiavi");
}

// ---------------------------------------------------------------------------
// Operatori
// ---------------------------------------------------------------------------

export async function creaOperatore(
  _stato: unknown,
  fd: FormData,
): Promise<{ errore?: string; ok?: string; segretoTotp?: string; email?: string }> {
  const admin = await esigiAdmin();
  const email = testo(fd, "email").toLowerCase();
  const nome = testo(fd, "nome");
  const password = String(fd.get("password") ?? "");
  const ruolo = testo(fd, "ruolo") || "approvatore";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { errore: "Email non valida." };
  if (nome.length < 2) return { errore: "Nome obbligatorio." };
  if (password.length < 12) return { errore: "La password deve avere almeno 12 caratteri." };
  if (!["admin", "approvatore", "osservatore"].includes(ruolo)) return { errore: "Ruolo sconosciuto." };
  if (await prisma.operatore.findUnique({ where: { email } })) return { errore: "Esiste già un operatore con questa email." };

  const { hash, salt } = hashPassword(password);
  const segretoTotp = generaSegretoTotp();
  await prisma.operatore.create({
    data: {
      email,
      nome,
      ruolo,
      passwordHash: hash,
      passwordSalt: salt,
      totpSegreto: cifra(segretoTotp),
      totpAttivo: true,
      tettoApprovazione: aCentesimi(testo(fd, "tetto")) ?? 0,
    },
  });
  await registra("operatore.creato", admin.email, { email, ruolo }, { ip: await ipRichiesta() });
  revalidatePath("/operatori");
  return { ok: `Operatore ${nome} creato.`, segretoTotp, email };
}

export async function cambiaStatoOperatore(fd: FormData): Promise<void> {
  const admin = await esigiAdmin();
  const id = testo(fd, "id");
  const o = await prisma.operatore.findUnique({ where: { id } });
  if (!o) return;
  // Non ci si disattiva da soli: si resterebbe fuori dalla propria app.
  if (o.id === admin.id) return;
  await prisma.operatore.update({ where: { id }, data: { attivo: !o.attivo, tentativiFalliti: 0, bloccatoFinoA: null } });
  if (o.attivo) {
    // Disattivare deve buttare fuori subito chi è già dentro.
    await prisma.sessione.updateMany({ where: { operatoreId: id, revocataIl: null }, data: { revocataIl: new Date() } });
  }
  await registra("operatore.modificato", admin.email, { email: o.email, attivo: !o.attivo }, { ip: await ipRichiesta() });
  revalidatePath("/operatori");
}

// ---------------------------------------------------------------------------
// Impostazioni
// ---------------------------------------------------------------------------

// I campi si chiamano in un modo nel codice e in un altro sulla pagina: negli
// errori si usa il secondo, altrimenti si dice a chi sta configurando dei
// pagamenti «valore non valido per sogliaRischioDoppiaFirma».
const ETICHETTE: Record<string, string> = {
  sogliaDoppiaFirma: "«Da questa cifra in su servono due firme»",
  tettoAssoluto: "«Oltre questa cifra non approva nessuno»",
  sogliaRischioDoppiaFirma: "«Quanto dev'essere sospetta una richiesta perché servano due firme»",
  colpiAlMinuto: "«Quante richieste al minuto può mandare un'app»",
  minutiFirma: "«Di quanto può sbagliare l'orologio dell'app che chiede»",
  minutiCodicePagamento: "«Per quanti minuti vale il codice ricevuto per email»",
  minutiSbloccoPagamento: "«Per quanti minuti resta aperta la porta dopo lo sblocco»",
  urlPortaleBanca: "«Indirizzo del sito della banca»",
  urlCaricamentoSepa: "«Indirizzo della pagina dove si carica il file»",
};

export async function salvaImpostazioni(_stato: unknown, fd: FormData): Promise<{ errore?: string; ok?: string }> {
  const admin = await esigiAdmin();
  const prima = await leggiRegole();

  // Prima si controlla tutto, poi si scrive: se un campo è sbagliato non deve
  // restare salvata mezza configurazione (soglie nuove e IBAN vecchio).
  const daSalvare: [keyof Regole, string][] = [];

  for (const campo of ["sogliaDoppiaFirma", "tettoAssoluto"] as const) {
    const grezzo = testo(fd, campo);
    if (!grezzo) continue;
    const cent = aCentesimi(grezzo);
    if (cent == null) {
      return { errore: `${ETICHETTE[campo]}: «${grezzo}» non è una cifra in euro. Scrivila come 1.500,00 oppure 1500.` };
    }
    daSalvare.push([campo, String(cent)]);
  }

  for (const campo of [
    "sogliaRischioDoppiaFirma",
    "colpiAlMinuto",
    "minutiFirma",
    "minutiCodicePagamento",
    "minutiSbloccoPagamento",
  ] as const) {
    const grezzo = testo(fd, campo);
    if (!grezzo) continue;
    const n = Number(grezzo);
    if (!Number.isFinite(n) || n < 0) {
      return { errore: `${ETICHETTE[campo]}: «${grezzo}» non è un numero. Ci va un numero intero, senza lettere né simboli.` };
    }
    daSalvare.push([campo, String(Math.round(n))]);
  }

  const ordIban = normalizzaIban(testo(fd, "ordinanteIban"));
  if (ordIban) {
    const { ibanValido } = await import("@/lib/iban");
    if (!ibanValido(ordIban)) {
      return { errore: "L'IBAN da cui parte il denaro non è valido: ricontrollalo carattere per carattere. Nient'altro è stato salvato." };
    }
  }

  // Il pagatore non è un campo libero: se si scrive un'email che non è di
  // nessun operatore attivo, il denaro non esce più da nessuna parte e nessuno
  // capisce perché. Meglio fermarsi qui.
  //
  // Si controlla però SOLO se il campo è stato cambiato. Il modulo arriva
  // precompilato con il pagatore attuale, che finché nessuno lo salva è un
  // valore di partenza scritto nel codice e non corrisponde a nessun operatore:
  // validandolo comunque, quel campo teneva in ostaggio tutte le altre
  // impostazioni — IBAN dell'ordinante compreso — e ogni salvataggio tornava
  // indietro. Chi non tocca il campo non deve pagare per il suo valore.
  const pagatore = testo(fd, "pagatoreEmail").toLowerCase();
  if (pagatore && pagatore !== prima.pagatoreEmail.trim().toLowerCase()) {
    const p = await prisma.operatore.findUnique({ where: { email: pagatore } });
    if (!p) {
      return {
        errore: `Nessun operatore con l'email ${pagatore}: il pagatore dev'essere una persona che esiste già, crealo in Operatori. Nient'altro è stato salvato.`,
      };
    }
    if (!p.attivo) {
      return { errore: `L'operatore ${pagatore} è disattivato: non può essere il pagatore. Nient'altro è stato salvato.` };
    }
    daSalvare.push(["pagatoreEmail", pagatore]);
  }

  // L'interruttore della banca non si accende se la banca non è collegata:
  // altrimenti si crederebbe di poter pagare e si scoprirebbe di no davanti a
  // una distinta sbloccata.
  const vuoleBanca = Boolean(fd.get("qontoEsecuzioneAttiva"));
  if (vuoleBanca && !(await qontoConfigurato())) {
    return {
      errore:
        "La banca non è collegata: incolla prima le chiavi in «Collegamento alla banca», qui sotto, poi accendi l'interruttore. Nient'altro è stato salvato.",
    };
  }
  daSalvare.push(["qontoEsecuzioneAttiva", vuoleBanca ? "true" : "false"]);

  daSalvare.push(["soloBeneficiariVerificati", fd.get("soloBeneficiariVerificati") ? "true" : "false"]);
  daSalvare.push(["ordinanteNome", testo(fd, "ordinanteNome")]);
  daSalvare.push(["ordinanteIban", ordIban]);
  daSalvare.push(["ordinanteBic", testo(fd, "ordinanteBic").toUpperCase()]);

  // I link: si accettano solo http/https, e mai un "javascript:" travestito.
  for (const campo of ["urlPortaleBanca", "urlCaricamentoSepa"] as const) {
    const grezzo = testo(fd, campo);
    if (!grezzo) {
      daSalvare.push([campo, ""]);
      continue;
    }
    let url: URL;
    try {
      url = new URL(grezzo);
    } catch {
      return { errore: `${ETICHETTE[campo]}: «${grezzo}» non è un indirizzo. Deve cominciare con https:// — copialo dalla barra del browser.` };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { errore: `${ETICHETTE[campo]}: si accettano solo indirizzi che cominciano con http o https.` };
    }
    daSalvare.push([campo, url.toString()]);
  }

  for (const [campo, valore] of daSalvare) await salvaRegola(campo, valore);

  const dopo = await leggiRegole();
  const cambiati = (Object.keys(dopo) as (keyof Regole)[]).filter((k) => dopo[k] !== prima[k]);
  await registra(
    "impostazione.modificata",
    admin.email,
    { cambiati: cambiati.map((k) => ({ campo: k, da: String(prima[k]), a: String(dopo[k]) })) },
    { ip: await ipRichiesta() },
  );
  revalidatePath("/impostazioni");
  return { ok: cambiati.length ? "Impostazioni salvate." : "Nessuna modifica." };
}
