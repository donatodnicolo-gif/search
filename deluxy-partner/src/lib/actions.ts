"use server";

// Server actions: tutte le mutazioni dell'app passano da qui.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { feeApplicabile, feeDaTariffe } from "./fee";
import { risolviAnagrafica, contattoAmministrativo, aggiornaAnagrafica, scritturaAnagraficheAttiva, type CampiAnagrafica } from "./anagrafiche";
import { ivato, nomeMese } from "./calc";
import { registraPagamento, rimuoviPagamento } from "./pagamenti-rif";
import type { SaldoMensile } from "@prisma/client";

// Riflette il bonifico di un mese-partner nel registro pagamenti: crea/aggiorna
// il riferimento se c'è un bonifico, lo rimuove se azzerato. bonificoImporto>0 =
// inviato al partner (out); <0 = ricevuto dal partner (in).
async function aggiornaPagamentoDaSaldo(saldo: SaldoMensile) {
  if (!saldo.bonificoImporto || Math.abs(saldo.bonificoImporto) < 0.005) {
    await rimuoviPagamento("bonifico_partner", saldo.id);
    return;
  }
  const partner = await prisma.partner.findUnique({ where: { id: saldo.partnerId }, select: { nome: true } });
  const uscita = saldo.bonificoImporto > 0;
  await registraPagamento({
    tipo: "bonifico_partner",
    direzione: uscita ? "out" : "in",
    importo: Math.abs(saldo.bonificoImporto),
    data: saldo.bonificoData ?? saldo.dataPagamento ?? new Date(),
    origineId: saldo.id,
    controparte: partner?.nome ?? null,
    partnerId: saldo.partnerId,
    descrizione: `${uscita ? "Bonifico a" : "Incasso da"} ${partner?.nome ?? "partner"} — ${nomeMese(saldo.mese)} ${saldo.anno}`,
  });
}

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function n(fd: FormData, k: string): number | null {
  const t = s(fd, k);
  if (t == null) return null;
  const v = parseFloat(t.replace(",", "."));
  return isNaN(v) ? null : v;
}
function b(fd: FormData, k: string): boolean {
  return fd.get(k) === "on" || fd.get(k) === "true";
}
function d(fd: FormData, k: string): Date | null {
  const t = s(fd, k);
  if (!t) return null;
  const date = new Date(t + "T00:00:00.000Z");
  return isNaN(date.getTime()) ? null : date;
}

function revalidateAll() {
  for (const p of ["/", "/partner", "/fatture", "/vendite", "/saldi", "/scadenzario", "/report"]) {
    revalidatePath(p, "layout");
  }
}

// ---------- Partner ----------

function partnerData(fd: FormData) {
  return {
    nome: s(fd, "nome") ?? "",
    // ragioneSociale NON si scrive da qui: è centralizzata nel registro
    // Anagrafiche (mostrata in sola lettura nel form). Evita copie divergenti.
    categoria: s(fd, "categoria"),
    citta: s(fd, "citta"),
    servizi: s(fd, "servizi"),
    clienteAnno: s(fd, "clienteAnno"),
    feePercent: n(fd, "feePercent"),
    debiti2025: n(fd, "debiti2025") ?? 0,
    pdrDebito: s(fd, "pdrDebito"),
    crediti2025: n(fd, "crediti2025") ?? 0,
    ggPagamento: Math.round(n(fd, "ggPagamento") ?? 0),
    compensazione: b(fd, "compensazione"),
    commissioniADetrazione: b(fd, "commissioniADetrazione"),
    addebitoDiretto: b(fd, "addebitoDiretto"),
    cartaCreditoApp: b(fd, "cartaCreditoApp"),
    iban: s(fd, "iban"),
    email: s(fd, "email"),
    telefono: s(fd, "telefono"),
    ammNome: s(fd, "ammNome"),
    ammRuolo: s(fd, "ammRuolo"),
    ammEmail: s(fd, "ammEmail"),
    ammTelefono: s(fd, "ammTelefono"),
    note: s(fd, "note"),
    attivo: b(fd, "attivo"),
  };
}

export async function createPartner(fd: FormData) {
  const data = partnerData(fd);
  if (!data.nome) throw new Error("Nome obbligatorio");
  const p = await prisma.partner.create({ data });
  revalidateAll();
  redirect(`/partner/${p.id}`);
}

export async function updatePartner(id: string, fd: FormData) {
  const data = partnerData(fd);
  if (!data.nome) throw new Error("Nome obbligatorio");
  const partner = await prisma.partner.update({ where: { id }, data });
  // I dati anagrafici (IBAN, email, telefono, contatto amministrativo) sono
  // centralizzati: se il partner è collegato al registro e la scrittura è
  // attiva, li portiamo in Anagrafiche (fonte di verità). La copia locale resta
  // come cache operativa (solleciti/SEPA), allineata al momento del salvataggio.
  if (partner.anagraficaId && scritturaAnagraficheAttiva()) {
    const campi: CampiAnagrafica = {
      ...(data.iban ? { iban: data.iban } : {}),
      ...(data.email ? { email: data.email } : {}),
      ...(data.telefono ? { telefono: data.telefono } : {}),
      ...(data.ammNome ? { amministrazioneNome: data.ammNome } : {}),
      ...(data.ammEmail ? { amministrazioneEmail: data.ammEmail } : {}),
      ...(data.ammTelefono ? { amministrazioneTelefono: data.ammTelefono } : {}),
    };
    if (Object.keys(campi).length > 0) {
      // best-effort: se il registro è irraggiungibile non blocchiamo il salvataggio locale
      await aggiornaAnagrafica(partner.anagraficaId, campi).catch(() => {});
    }
  }
  revalidateAll();
  redirect(`/partner/${id}`);
}

// Copia nel partner il contatto amministrativo trovato nel registro Anagrafiche.
// Il registro resta la fonte di verità: qui se ne tiene una copia operativa per
// sapere a chi mandare solleciti e pro-forma (questa app ha chiave di sola lettura).
export async function importaContattoAmministrativo(partnerId: string) {
  const p = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!p) throw new Error("Partner non trovato");
  const anagrafica = await risolviAnagrafica(p.nome, p.anagraficaId);
  const c = contattoAmministrativo(anagrafica);
  if (!c) redirect(`/partner/${partnerId}?amm=non-trovato`);
  await prisma.partner.update({
    where: { id: partnerId },
    data: {
      ammNome: c.nome ?? p.ammNome,
      ammRuolo: c.ruolo ?? p.ammRuolo,
      ammEmail: c.email ?? p.ammEmail,
      ammTelefono: c.telefono ?? p.ammTelefono,
      // se l'anagrafica è stata risolta per nome, memorizziamo il collegamento
      anagraficaId: p.anagraficaId ?? anagrafica?.id ?? null,
    },
  });
  revalidateAll();
  redirect(`/partner/${partnerId}?amm=importato`);
}

// ---------- Fatture servizi ----------

export async function createFattura(fd: FormData) {
  const partnerId = s(fd, "partnerId");
  const tipologiaId = s(fd, "tipologiaId");
  const imponibile = n(fd, "imponibile");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  if (!partnerId || !tipologiaId || imponibile == null || !anno || !mese) {
    throw new Error("Compilare partner, tipologia, periodo e imponibile");
  }
  const emissione = d(fd, "emissione");
  let scadenza = d(fd, "scadenza");
  if (!scadenza && emissione) {
    // scadenza automatica dai giorni di pagamento del partner
    const p = await prisma.partner.findUnique({ where: { id: partnerId } });
    scadenza = new Date(emissione.getTime() + (p?.ggPagamento ?? 0) * 86400000);
  }
  await prisma.fatturaServizio.create({
    data: {
      partnerId,
      tipologiaId,
      anno,
      mese,
      numero: s(fd, "numero"),
      emissione,
      scadenza,
      imponibile,
      aliquotaIva: n(fd, "aliquotaIva") ?? 22,
      pagata: b(fd, "pagata"),
      dataPagamento: d(fd, "dataPagamento"),
      descrizione: s(fd, "descrizione"),
    },
  });
  revalidateAll();
  redirect(`/fatture?anno=${anno}&mese=${mese}`);
}

export async function updateFattura(id: string, fd: FormData) {
  const imponibile = n(fd, "imponibile");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  const tipologiaId = s(fd, "tipologiaId");
  if (imponibile == null || !anno || !mese || !tipologiaId) {
    throw new Error("Compilare tipologia, periodo e imponibile");
  }
  await prisma.fatturaServizio.update({
    where: { id },
    data: {
      tipologiaId,
      anno,
      mese,
      numero: s(fd, "numero"),
      emissione: d(fd, "emissione"),
      scadenza: d(fd, "scadenza"),
      imponibile,
      aliquotaIva: n(fd, "aliquotaIva") ?? 22,
      pagata: b(fd, "pagata"),
      dataPagamento: b(fd, "pagata") ? d(fd, "dataPagamento") : null,
      descrizione: s(fd, "descrizione"),
    },
  });
  revalidateAll();
  redirect(`/fatture/${id}?salvato=1`);
}

// Storna dal saldo del mese l'incasso registrato automaticamente da «Saldata»
// (solo se era stato registrato: incassoRegistrato=true). Riporta bonificoImporto
// al valore precedente; se torna ~0 lo azzera del tutto.
async function stornaIncassoAuto(f: { partnerId: string; anno: number; mese: number; incassoRegistrato: boolean; imponibile: number; aliquotaIva: number; pagata: boolean }) {
  if (!f.incassoRegistrato) return;
  const s = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId: f.partnerId, anno: f.anno, mese: f.mese } },
  });
  if (!s) return;
  const nuovo = +(((s.bonificoImporto ?? 0) + ivato(f)).toFixed(2));
  const saldo = await prisma.saldoMensile.update({
    where: { id: s.id },
    data: { bonificoImporto: Math.abs(nuovo) < 0.005 ? null : nuovo, ...(Math.abs(nuovo) < 0.005 ? { bonificoData: null } : {}) },
  });
  await aggiornaPagamentoDaSaldo(saldo);
}

// «Saldata» = bonifico ricevuto in banca per la fattura. Per i partner in
// COMPENSAZIONE registra anche l'incasso (IVATO) sul saldo del mese: così i soldi
// veri contano nel residuo e il dovuto vendite resta interamente da pagare
// (es. maggio: saldata la 488 → incassato 488, e al partner dobbiamo 154,22).
// Per i partner a partite separate basta il flag pagata (comportamento invariato).
export async function segnaFatturaPagata(id: string, pagata: boolean, dataPagamento?: string) {
  const prima = await prisma.fatturaServizio.findUnique({ where: { id }, include: { partner: true } });
  if (!prima) return;
  // storna un eventuale incasso auto precedente (cambio stato pulito)
  await stornaIncassoAuto(prima);

  const dp = pagata ? (dataPagamento ? new Date(dataPagamento + "T00:00:00.000Z") : new Date()) : null;
  const autoIncasso = pagata && prima.partner.compensazione;
  const f = await prisma.fatturaServizio.update({
    where: { id },
    data: { pagata, compensata: false, dataPagamento: dp, incassoRegistrato: autoIncasso },
    include: { partner: true },
  });
  if (autoIncasso) {
    const s = await prisma.saldoMensile.findUnique({
      where: { partnerId_anno_mese: { partnerId: f.partnerId, anno: f.anno, mese: f.mese } },
    });
    const nuovo = +(((s?.bonificoImporto ?? 0) - ivato(f)).toFixed(2));
    const saldo = await prisma.saldoMensile.upsert({
      where: { partnerId_anno_mese: { partnerId: f.partnerId, anno: f.anno, mese: f.mese } },
      create: { partnerId: f.partnerId, anno: f.anno, mese: f.mese, bonificoImporto: nuovo, bonificoData: dp },
      update: { bonificoImporto: nuovo, bonificoData: dp },
    });
    await aggiornaPagamentoDaSaldo(saldo);
  }
  if (pagata) {
    await registraPagamento({
      tipo: "fattura_servizi",
      direzione: "in",
      importo: ivato(f),
      data: f.dataPagamento ?? new Date(),
      origineId: f.id,
      controparte: f.partner.nome,
      partnerId: f.partnerId,
      descrizione: `Fattura ${f.numero ?? "s.n."} — ${f.partner.nome}`,
    });
  } else {
    await rimuoviPagamento("fattura_servizi", f.id);
  }
  revalidateAll();
}

// «Compensata» = quell'importo NON arriva in banca: resta un credito verso il
// partner che viene scalato dai prossimi importi a lui dovuti finché è coperto.
// Nessun incasso registrato: il motore (fatture IVATE − dovuto vendite) fa già
// la compensazione; il flag documenta la scelta e toglie la fattura da «da incassare».
export async function segnaFatturaCompensata(id: string, compensata: boolean) {
  const prima = await prisma.fatturaServizio.findUnique({ where: { id } });
  if (!prima) return;
  await stornaIncassoAuto(prima);
  await prisma.fatturaServizio.update({
    where: { id },
    data: { compensata, pagata: false, dataPagamento: null, incassoRegistrato: false },
  });
  await rimuoviPagamento("fattura_servizi", id);
  revalidateAll();
}

export async function deleteFattura(id: string) {
  await prisma.fatturaServizio.delete({ where: { id } });
  revalidateAll();
}

// Registra una fattura ESISTENTE su Fatture in Cloud come "Servizio a fatturazione"
// del partner (backfill delle fatture create prima dell'aggancio automatico o non
// collegate). Idempotente per numero: se esiste già non duplica.
export async function registraFicComeServizio(partnerId: string, fd: FormData) {
  const numero = String(fd.get("numero") ?? "").trim() || null;
  const tipologiaId = String(fd.get("tipologiaId") ?? "").trim();
  const imponibile = n(fd, "imponibile");
  const aliquotaIva = n(fd, "aliquotaIva") ?? 22;
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  const descrizione = String(fd.get("descrizione") ?? "").trim() || null;
  if (!tipologiaId || imponibile == null || !anno || !mese) {
    redirect(`/partner/${partnerId}?ficreg=errore`);
  }
  if (numero) {
    const esiste = await prisma.fatturaServizio.findFirst({ where: { partnerId, numero } });
    if (esiste) redirect(`/partner/${partnerId}?ficreg=gia#mese-${mese}`);
  }
  await prisma.fatturaServizio.create({
    data: { partnerId, tipologiaId, anno, mese, numero, imponibile, aliquotaIva, descrizione },
  });
  revalidateAll();
  redirect(`/partner/${partnerId}?ficreg=ok#mese-${mese}`);
}

// ---------- Vendite vendor ----------

export async function createVendita(fd: FormData) {
  const partnerId = s(fd, "partnerId");
  const incassoLordo = n(fd, "incassoLordo");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  if (!partnerId || incassoLordo == null || !anno || !mese) {
    throw new Error("Compilare partner, periodo e incasso");
  }
  let feePercent = n(fd, "feePercent");
  if (feePercent == null) {
    // fee del mese di competenza dallo storico tariffe (o fee base del partner)
    feePercent = await feeApplicabile(partnerId, anno, mese);
  }
  await prisma.venditaVendor.create({
    data: {
      partnerId,
      anno,
      mese,
      data: d(fd, "data"),
      descrizione: s(fd, "descrizione"),
      incassoLordo,
      feePercent,
    },
  });
  revalidateAll();
  redirect(`/vendite?anno=${anno}&mese=${mese}`);
}

// Modifica una vendita esistente (incasso, fee, periodo, descrizione).
// La fee è memorizzata sulla singola vendita: cambiarla qui aggiorna commissione
// e dovuto di quel movimento senza toccare le altre vendite.
export async function updateVendita(id: string, fd: FormData) {
  const incassoLordo = n(fd, "incassoLordo");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  const feePercent = n(fd, "feePercent");
  if (incassoLordo == null || !anno || !mese || feePercent == null) {
    throw new Error("Compilare incasso, periodo e fee");
  }
  await prisma.venditaVendor.update({
    where: { id },
    data: { incassoLordo, anno, mese, feePercent, data: d(fd, "data"), descrizione: s(fd, "descrizione") },
  });
  revalidateAll();
  redirect(`/vendite/${id}?salvato=1`);
}

// Riallinea la fee di ogni vendita di un partner (di un anno) alla fee valida
// per il SUO mese secondo lo storico tariffe (fallback: fee base del partner).
// Così le vendite si aggiornano ciascuna con la fee corretta del proprio periodo.
export async function riallineaFeeVendite(partnerId: string, anno: number) {
  const [p, tariffe, vendite] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { feePercent: true } }),
    prisma.tariffaPartner.findMany({ where: { partnerId } }),
    prisma.venditaVendor.findMany({ where: { partnerId, anno } }),
  ]);
  const feeBase = p?.feePercent ?? 0;
  for (const v of vendite) {
    const fee = feeDaTariffe(tariffe, v.anno, v.mese, feeBase);
    if (fee !== v.feePercent) {
      await prisma.venditaVendor.update({ where: { id: v.id }, data: { feePercent: fee } });
    }
  }
  revalidateAll();
  redirect(`/partner/${partnerId}`);
}

// Aggiunge/aggiorna una decorrenza di fee: "dal mese/anno la fee diventa X%".
export async function aggiungiTariffa(partnerId: string, fd: FormData) {
  const dalAnno = n(fd, "dalAnno");
  const dalMese = n(fd, "dalMese");
  const feePercent = n(fd, "feePercent");
  if (!dalAnno || !dalMese || feePercent == null) throw new Error("Compila mese, anno e fee");
  await prisma.tariffaPartner.upsert({
    where: { partnerId_dalAnno_dalMese: { partnerId, dalAnno, dalMese } },
    create: { partnerId, dalAnno, dalMese, feePercent },
    update: { feePercent },
  });
  revalidateAll();
  redirect(`/partner/${partnerId}`);
}

export async function eliminaTariffa(id: string, partnerId: string) {
  await prisma.tariffaPartner.delete({ where: { id } });
  revalidateAll();
  redirect(`/partner/${partnerId}`);
}

export async function deleteVendita(id: string) {
  await prisma.venditaVendor.delete({ where: { id } });
  revalidateAll();
}

// ---------- Voci extra del mese (aggiunte/detrazioni) ----------
// Le singole voci vivono in ExtraSaldo; i totali aggiunte/detrazioni su
// SaldoMensile sono una cache ricalcolata a ogni modifica (i calcoli del motore
// continuano a leggere quei due campi).
async function ricalcolaExtra(partnerId: string, anno: number, mese: number) {
  const items = await prisma.extraSaldo.findMany({ where: { partnerId, anno, mese } });
  const aggiunte = items.filter((x) => x.importo > 0).reduce((a, x) => a + x.importo, 0);
  const detrazioni = items.filter((x) => x.importo < 0).reduce((a, x) => a - x.importo, 0); // positivo
  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, aggiunte, detrazioni },
    update: { aggiunte, detrazioni },
  });
}

export async function aggiungiExtra(partnerId: string, anno: number, mese: number, fd: FormData) {
  const descrizione = String(fd.get("descrizione") ?? "").trim() || null;
  const importo = n(fd, "importo");
  if (importo == null || importo === 0) {
    redirect(`/partner/${partnerId}?extra=importo#mese-${mese}`);
  }
  await prisma.extraSaldo.create({ data: { partnerId, anno, mese, descrizione, importo } });
  await ricalcolaExtra(partnerId, anno, mese);
  revalidateAll();
  redirect(`/partner/${partnerId}#mese-${mese}`);
}

export async function eliminaExtra(id: string, partnerId: string) {
  const ex = await prisma.extraSaldo.findUnique({ where: { id } });
  if (ex) {
    await prisma.extraSaldo.delete({ where: { id } });
    await ricalcolaExtra(ex.partnerId, ex.anno, ex.mese);
  }
  revalidateAll();
  redirect(`/partner/${partnerId}${ex ? `#mese-${ex.mese}` : ""}`);
}

// ---------- Saldo mensile / bonifici ----------

export async function upsertSaldo(fd: FormData) {
  const partnerId = s(fd, "partnerId");
  const anno = n(fd, "anno");
  const mese = n(fd, "mese");
  if (!partnerId || !anno || !mese) throw new Error("Partner e periodo obbligatori");
  const data = {
    commFattEmessa: b(fd, "commFattEmessa"),
    commFattNumero: s(fd, "commFattNumero"),
    aggiunte: n(fd, "aggiunte") ?? 0,
    detrazioni: n(fd, "detrazioni") ?? 0,
    dataPagamento: d(fd, "dataPagamento"),
    bonificoImporto: n(fd, "bonificoImporto"),
    bonificoData: d(fd, "bonificoData"),
    chiuso: b(fd, "chiuso"),
    note: s(fd, "note"),
  };
  const saldo = await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, ...data },
    update: data,
  });
  await aggiornaPagamentoDaSaldo(saldo);
  revalidateAll();
  const back = s(fd, "back");
  if (back) redirect(back);
}

// Registra rapidamente un bonifico a pareggio del saldo del mese
export async function registraBonifico(
  partnerId: string,
  anno: number,
  mese: number,
  importo: number,
  dataIso?: string
) {
  const data = dataIso ? new Date(dataIso + "T00:00:00.000Z") : new Date();
  const esistente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
  });
  const nuovoImporto = (esistente?.bonificoImporto ?? 0) + importo;
  const saldo = await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, bonificoImporto: importo, bonificoData: data, dataPagamento: data },
    update: { bonificoImporto: nuovoImporto, bonificoData: data, dataPagamento: esistente?.dataPagamento ?? data },
  });
  await aggiornaPagamentoDaSaldo(saldo);
  revalidateAll();
}

// Registra il pagamento di un mese dalla scheda partner, indicando importo, data
// e direzione: "inviato" = abbiamo pagato noi il partner (bonifico > 0),
// "ricevuto" = ha pagato il partner (bonifico < 0). Si somma a quanto già registrato.
export async function registraPagamentoMese(
  partnerId: string,
  anno: number,
  mese: number,
  direzione: "inviato" | "ricevuto",
  fd: FormData
) {
  const importo = n(fd, "importo");
  if (importo == null || Math.abs(importo) < 0.005) return;
  const firmato = direzione === "inviato" ? Math.abs(importo) : -Math.abs(importo);
  const data = d(fd, "data") ?? new Date();
  const esistente = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
  });
  const saldo = await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, bonificoImporto: firmato, bonificoData: data, dataPagamento: data },
    update: {
      bonificoImporto: (esistente?.bonificoImporto ?? 0) + firmato,
      bonificoData: data,
      dataPagamento: data,
    },
  });
  await aggiornaPagamentoDaSaldo(saldo);
  revalidateAll();
}

// Salva le note del mese (dalla scheda partner). Le note vengono incluse nel
// prompt del recap AI.
export async function salvaNoteMese(
  partnerId: string,
  anno: number,
  mese: number,
  fd: FormData
) {
  const note = s(fd, "note");
  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, note },
    update: { note },
  });
  revalidateAll();
}

// Annulla i pagamenti registrati per un mese (torna a "da saldare")
export async function azzeraPagamentoMese(partnerId: string, anno: number, mese: number) {
  const saldo = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
  });
  await prisma.saldoMensile.updateMany({
    where: { partnerId, anno, mese },
    data: { bonificoImporto: null, bonificoData: null, dataPagamento: null, chiuso: false },
  });
  if (saldo) await rimuoviPagamento("bonifico_partner", saldo.id);
  revalidateAll();
}

// Segna saldate (o riapre) tutte le fatture servizi di un mese di un partner
export async function segnaFattureMesePagate(
  partnerId: string,
  anno: number,
  mese: number,
  pagata: boolean
) {
  const fatture = await prisma.fatturaServizio.findMany({
    where: { partnerId, anno, mese },
    include: { partner: true },
  });
  await prisma.fatturaServizio.updateMany({
    where: { partnerId, anno, mese },
    data: { pagata, dataPagamento: pagata ? new Date() : null },
  });
  for (const f of fatture) {
    if (pagata) {
      await registraPagamento({
        tipo: "fattura_servizi",
        direzione: "in",
        importo: ivato(f),
        data: new Date(),
        origineId: f.id,
        controparte: f.partner.nome,
        partnerId: f.partnerId,
        descrizione: `Fattura ${f.numero ?? "s.n."} — ${f.partner.nome}`,
      });
    } else {
      await rimuoviPagamento("fattura_servizi", f.id);
    }
  }
  revalidateAll();
}
