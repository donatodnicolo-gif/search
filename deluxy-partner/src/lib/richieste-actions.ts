"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { registra } from "./registro";
import { euro } from "./format";
import { SESSION_COOKIE, sessioneCorrente } from "./auth";
import { richiediPagamentoLibero, transactionsConfigurato } from "./transactions";
import { categorieDaBudgets } from "./categorie-spesa";
import { cercaBeneficiariRegistro, type BeneficiarioRegistro } from "./anagrafiche";

// Sezione «Richiedi pagamento»: chiedere il pagamento di una spesa qualsiasi.
//
// Due cose che qui NON succedono, e vanno dette: non esce denaro (lo fa solo
// deluxy-transactions, dopo l'autorizzazione di una persona) e non si registra
// nessun costo. Questa è la domanda, non la risposta.

function torna(chiave: string, valore: string): never {
  revalidatePath("/richiedi-pagamento");
  redirect(`/richiedi-pagamento?${chiave}=${encodeURIComponent(valore)}`);
}

// Ricerca beneficiari nel registro Anagrafiche, chiamata dal campo di ricerca
// della nuova richiesta (client). È sola lettura e non fatale.
export async function cercaBeneficiari(q: string): Promise<BeneficiarioRegistro[]> {
  try {
    return await cercaBeneficiariRegistro(q);
  } catch {
    return [];
  }
}

/** IBAN: controllo di forma + resto di 97 (ISO 13616). Lo si fa QUI e non solo
 *  in Transactions perché un IBAN sbagliato scoperto là diventa una pratica
 *  ferma che qualcuno deve rincorrere; scoperto qui è un campo da ricorreggere
 *  mentre si ha ancora il documento davanti. */
function ibanValido(grezzo: string): boolean {
  const iban = grezzo.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const riordinato = iban.slice(4) + iban.slice(0, 4);
  const numerico = riordinato.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let resto = 0;
  for (const cifra of numerico) resto = (resto * 10 + Number(cifra)) % 97;
  return resto === 1;
}

function numero(v: FormDataEntryValue | null): number {
  return Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
}

export async function creaRichiestaPagamento(fd: FormData) {
  if (!transactionsConfigurato()) {
    torna("errore", "Transactions non è collegata: mancano TRANSACTIONS_API_KEY e TRANSACTIONS_HMAC_SECRET.");
  }

  const partnerId = String(fd.get("partnerId") ?? "").trim() || null;
  let beneficiario = String(fd.get("beneficiario") ?? "").trim();
  let iban = String(fd.get("iban") ?? "").replace(/\s+/g, "").toUpperCase();
  let partnerNome: string | null = null;

  // Scegliendo un partner, beneficiario e IBAN si prendono dall'anagrafica:
  // ricopiarli a mano è il modo più facile per mandare soldi all'IBAN sbagliato.
  if (partnerId) {
    const p = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { nome: true, ragioneSociale: true, iban: true, intestatarioConto: true },
    });
    if (!p) torna("errore", "Partner non trovato.");
    partnerNome = p.nome;
    // A chi esce il bonifico: vince l'INTESTATARIO DEL CONTO, che la banca
    // verifica contro l'IBAN. Ragione sociale e insegna sono ripieghi: un conto
    // può essere intestato a una persona o a un'altra società.
    beneficiario = p.intestatarioConto?.trim() || p.ragioneSociale?.trim() || p.nome;
    iban = (p.iban ?? "").replace(/\s+/g, "").toUpperCase();
    if (!iban) torna("errore", `${p.nome} non ha un IBAN in anagrafica: aggiungilo, oppure scrivilo qui sotto scegliendo «Beneficiario libero».`);
  }

  const importo = numero(fd.get("importo"));
  const causale = String(fd.get("causale") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim() || null;
  const scadenza = String(fd.get("scadenza") ?? "").trim() || null;
  const categoriaId = String(fd.get("categoria") ?? "").trim() || null;
  const fornitura = String(fd.get("fornitura") ?? "") === "on";
  const fatturaFornitoreRif = String(fd.get("fatturaFornitoreRif") ?? "").trim() || null;

  if (!beneficiario) torna("errore", "Manca il beneficiario: a chi va pagato?");
  if (!ibanValido(iban)) torna("errore", "IBAN non valido: ricontrollalo (il codice di controllo non torna).");
  if (!(importo >= 0.01)) torna("errore", "Importo non valido.");
  if (!causale) torna("errore", "La causale è obbligatoria: è quello che si legge in banca.");
  if (causale.length > 140) torna("errore", "La causale supera i 140 caratteri consentiti da SEPA.");

  // La categoria di costo arriva da Budgets: si rilegge per prendere anche il
  // nome e la voce di P&L, invece di fidarsi di quello che è tornato dal form.
  let categoriaNome: string | null = null;
  let categoriaTipoPL: string | null = null;
  if (categoriaId) {
    const esito = await categorieDaBudgets();
    const cat = esito.ok ? esito.categorie.find((c) => c.id === categoriaId) : null;
    if (!cat) torna("errore", "Categoria non riconosciuta: ricarica la pagina e riprova.");
    categoriaNome = cat.nome;
    categoriaTipoPL = cat.tipoPL;
  }

  const jar = await cookies();
  const sessione = await sessioneCorrente(jar.get(SESSION_COOKIE)?.value);
  const richiedente = sessione?.tipo === "utente" ? sessione.nome : "Accesso a password";

  // Si salva PRIMA di chiamare: l'id della riga è il riferimento idempotente
  // mandato a Transactions, e se la chiamata fallisce resta comunque la traccia
  // di cosa era stato chiesto invece di un tentativo sparito nel nulla.
  const riga = await prisma.richiestaPagamento.create({
    data: {
      beneficiario, iban, importo, causale, note,
      scadenza: scadenza ? new Date(scadenza) : null,
      categoriaId, categoriaNome, categoriaTipoPL,
      fornitura, fatturaFornitoreRif,
      partnerId, partnerNome, richiedente,
      stato: "bozza",
    },
  });

  const esito = await richiediPagamentoLibero({
    idRichiesta: riga.id,
    beneficiario, iban, importo, causale,
    categoria: categoriaNome,
    note: [
      note,
      fornitura ? "Pagamento di una fornitura (costo prodotto)" : null,
      fatturaFornitoreRif ? `Fattura fornitore ${fatturaFornitoreRif}` : null,
      categoriaNome ? `Categoria di costo: ${categoriaNome}` : null,
    ].filter(Boolean).join(" · ") || null,
    scadenza,
  });

  if (!esito.ok) {
    await prisma.richiestaPagamento.update({ where: { id: riga.id }, data: { stato: "errore" } });
    torna("errore", esito.errore);
  }

  await prisma.richiestaPagamento.update({
    where: { id: riga.id },
    data: { riferimento: esito.riferimento, stato: esito.stato },
  });
  await registra({
    azione: `Richiesto a Transactions il pagamento di ${euro(importo)} a ${beneficiario}`,
    categoria: "pagamenti",
    entita: "richiesta",
    entitaId: riga.id,
    partner: partnerNome,
    dettaglio: `${esito.riferimento} · ${causale}${categoriaNome ? ` · ${categoriaNome}` : ""}`,
  });
  torna("ok", esito.riferimento);
}
