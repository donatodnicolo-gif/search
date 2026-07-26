"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { cifra, sha256, tokenCasuale, hashPassword } from "@/lib/crypto";
import { generaSegretoTotp } from "@/lib/totp";
import { registra } from "@/lib/audit";
import { creaRichiesta, decidi } from "@/lib/richieste";
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
import { aCentesimi } from "@/lib/denaro";

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

/** Genera l'XML e lo restituisce come testo, registrandone l'impronta. */
export async function esportaLotto(id: string): Promise<{ nome: string; xml: string } | { errore: string }> {
  const operatore = await esigiOperatore();
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
  await registra("lotto.esportato", operatore.email, { riferimento: lotto.riferimento, impronta }, { ip: await ipRichiesta() });
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
    if (cent == null) return { errore: `Valore non valido per ${campo}.` };
    daSalvare.push([campo, String(cent)]);
  }

  for (const campo of ["sogliaRischioDoppiaFirma", "colpiAlMinuto", "minutiFirma"] as const) {
    const grezzo = testo(fd, campo);
    if (!grezzo) continue;
    const n = Number(grezzo);
    if (!Number.isFinite(n) || n < 0) return { errore: `Valore non valido per ${campo}.` };
    daSalvare.push([campo, String(Math.round(n))]);
  }

  const ordIban = normalizzaIban(testo(fd, "ordinanteIban"));
  if (ordIban) {
    const { ibanValido } = await import("@/lib/iban");
    if (!ibanValido(ordIban)) return { errore: "IBAN dell'ordinante non valido." };
  }

  daSalvare.push(["soloBeneficiariVerificati", fd.get("soloBeneficiariVerificati") ? "true" : "false"]);
  daSalvare.push(["ordinanteNome", testo(fd, "ordinanteNome")]);
  daSalvare.push(["ordinanteIban", ordIban]);
  daSalvare.push(["ordinanteBic", testo(fd, "ordinanteBic").toUpperCase()]);

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
