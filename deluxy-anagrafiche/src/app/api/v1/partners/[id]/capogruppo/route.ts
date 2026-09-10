import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { registraModifica } from "@/lib/log-modifiche";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/partners/:id/capogruppo  (10/09/2026, regola utente — chiave di SCRITTURA)
//
// «Inserisci questo partner sotto un'altra entità di fatturazione.» Un punto vendita
// (Diptyque Brera) fattura sotto la società di un altro (Olfattorio SRL, la stessa di
// Olfattorio Rinascente, Diptyque Manzoni…). Nel registro questo è il CAPOGRUPPO: la
// scheda di QUESTA sede entra nel capogruppo con `pagaDaSe = false`, e i dati di
// fatturazione si leggono dal capogruppo (lib/fatturazione.ts).
//
// Il capogruppo si riconosce dalla CAPOFILA: la scheda (o il platformId) del partner che
// rappresenta l'entità. Se la capofila ha già un capogruppo si usa quello; se no si crea
// col nome della sua ragione sociale e coi suoi dati fiscali, e la capofila ci entra
// (continuando a pagare da sé: i suoi dati sono gli stessi del capogruppo).
//
// `:id` e `capofila` accettano l'id del registro o il platformId della piattaforma.
// Corpo: { capofila: string, sistema?: string, nome?: string, pIva?, codiceFiscale?,
//          codiceSdi?, pec?, iban?, intestatarioConto? }  (i fiscali servono solo se il
//          capogruppo va creato e la capofila ne è priva).
export async function POST(req: NextRequest, { params }: Params) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  const s = (k: string) => (typeof body[k] === "string" && (body[k] as string).trim() ? (body[k] as string).trim() : null);
  const capofilaRif = s("capofila");
  // ⭐ 10/09/2026 (regola utente: «crea anche in app una entità capogruppo … e comunica questa cosa
  // anche con Anagrafiche»): la piattaforma può mandare direttamente IL CAPOGRUPPO —
  // { capogruppo: { nome, pIva?, registroId? }, pagaDaSe } — o toglierlo ({ capogruppo: null }).
  const capogruppoDiretto = body.capogruppo && typeof body.capogruppo === "object" ? (body.capogruppo as Record<string, unknown>) : null;
  const togli = "capogruppo" in body && body.capogruppo === null;
  const pagaDaSeRichiesto = typeof body.pagaDaSe === "boolean" ? (body.pagaDaSe as boolean) : null;
  if (!capofilaRif && !capogruppoDiretto && !togli) return erroreApi(400, "Serve «capofila» (id o platformId del partner che rappresenta l'entità), oppure «capogruppo» { nome, pIva? } (o null per toglierlo).");
  if (!capofilaRif) {
    const sede0 = (await prisma.partner.findUnique({ where: { id }, include: { capogruppo: true } })) ?? (await prisma.partner.findUnique({ where: { platformId: id }, include: { capogruppo: true } }));
    if (!sede0) return erroreApi(404, "Anagrafica della sede non trovata: collegala (o creala) prima nel registro.");
    const origine0 = client.nome.replace(/^deluxy-/, "");
    if (togli) {
      await prisma.partner.update({ where: { id: sede0.id }, data: { capogruppoId: null, pagaDaSe: true } });
      if (sede0.capogruppo) await registraModifica(sede0.id, { origine: origine0 }, { campo: "capogruppo", da: sede0.capogruppo.nome, a: undefined });
      return NextResponse.json({ ok: true, capogruppo: null, sede: { id: sede0.id, nome: sede0.nome, pagaDaSe: true } });
    }
    const nome0 = typeof capogruppoDiretto!.nome === "string" ? (capogruppoDiretto!.nome as string).trim() : "";
    const regId = typeof capogruppoDiretto!.registroId === "string" ? (capogruppoDiretto!.registroId as string).trim() : "";
    if (!nome0 && !regId) return erroreApi(400, "«capogruppo» ha bisogno di nome (o registroId).");
    let cg = regId ? await prisma.capogruppo.findUnique({ where: { id: regId } }) : null;
    if (!cg && nome0) cg = await prisma.capogruppo.findUnique({ where: { nome: nome0 } });
    let creato0 = false;
    if (!cg) {
      cg = await prisma.capogruppo.create({ data: { nome: nome0, pIva: typeof capogruppoDiretto!.pIva === "string" ? (capogruppoDiretto!.pIva as string).trim() || null : null, codiceSdi: typeof capogruppoDiretto!.codiceSdi === "string" ? (capogruppoDiretto!.codiceSdi as string).trim() || null : null, pec: typeof capogruppoDiretto!.pec === "string" ? (capogruppoDiretto!.pec as string).trim() || null : null, provenienza: { creatoDa: client.nome, asOf: new Date().toISOString() } } });
      creato0 = true;
    }
    const pagaDaSe0 = pagaDaSeRichiesto ?? false;
    await prisma.partner.update({ where: { id: sede0.id }, data: { capogruppoId: cg.id, pagaDaSe: pagaDaSe0 } });
    if (sede0.capogruppo?.nome !== cg.nome) await registraModifica(sede0.id, { origine: origine0 }, { campo: "capogruppo", da: sede0.capogruppo?.nome, a: cg.nome });
    if (sede0.pagaDaSe !== pagaDaSe0) await registraModifica(sede0.id, { origine: origine0 }, { campo: "pagaDaSe", da: sede0.pagaDaSe ? "sì" : "no", a: pagaDaSe0 ? "sì" : "no (fattura il capogruppo)" });
    return NextResponse.json({ ok: true, capogruppo: { id: cg.id, nome: cg.nome, creato: creato0 }, sede: { id: sede0.id, nome: sede0.nome, pagaDaSe: pagaDaSe0 } });
  }

  const perRif = async (rif: string) =>
    (await prisma.partner.findUnique({ where: { id: rif }, include: { capogruppo: true } })) ??
    (await prisma.partner.findUnique({ where: { platformId: rif }, include: { capogruppo: true } }));

  const [sede, capofila] = await Promise.all([perRif(id), perRif(capofilaRif)]);
  if (!sede) return erroreApi(404, "Anagrafica della sede non trovata: collegala (o creala) prima nel registro.");
  if (!capofila) return erroreApi(404, "Anagrafica della capofila non trovata: la capofila dev'essere già nel registro.");
  if (sede.id === capofila.id) return erroreApi(400, "La sede e la capofila sono la stessa scheda.");

  const origine = client.nome.replace(/^deluxy-/, "");
  let capogruppo = capofila.capogruppo;
  let creato = false;
  if (!capogruppo) {
    const nome = s("nome") ?? capofila.ragioneSociale ?? capofila.nome;
    const gia = await prisma.capogruppo.findUnique({ where: { nome } });
    capogruppo = gia ?? (await prisma.capogruppo.create({
      data: {
        nome,
        pIva: capofila.pIva ?? s("pIva"),
        codiceFiscale: capofila.codiceFiscale ?? s("codiceFiscale"),
        codiceSdi: capofila.codiceSdi ?? s("codiceSdi"),
        pec: capofila.pec ?? s("pec"),
        iban: capofila.iban ?? s("iban"),
        intestatarioConto: capofila.intestatarioConto ?? s("intestatarioConto"),
        banca: capofila.banca,
        metodoPagamento: capofila.metodoPagamento,
        condizioniPagamento: capofila.condizioniPagamento,
        amministrazioneNome: capofila.amministrazioneNome,
        amministrazioneTelefono: capofila.amministrazioneTelefono,
        amministrazioneEmail: capofila.amministrazioneEmail,
        provenienza: { creatoDa: client.nome, asOf: new Date().toISOString(), capofilaId: capofila.id },
      },
    }));
    creato = !gia;
    if (capofila.capogruppoId !== capogruppo.id) {
      await prisma.partner.update({ where: { id: capofila.id }, data: { capogruppoId: capogruppo.id } });
      await registraModifica(capofila.id, { origine }, { campo: "capogruppo", da: capofila.capogruppo?.nome, a: capogruppo.nome });
    }
  }

  const prima = { capogruppo: sede.capogruppo?.nome, pagaDaSe: sede.pagaDaSe };
  await prisma.partner.update({ where: { id: sede.id }, data: { capogruppoId: capogruppo.id, pagaDaSe: false } });
  if (prima.capogruppo !== capogruppo.nome) await registraModifica(sede.id, { origine }, { campo: "capogruppo", da: prima.capogruppo, a: capogruppo.nome });
  if (prima.pagaDaSe !== false) await registraModifica(sede.id, { origine }, { campo: "pagaDaSe", da: "sì", a: "no (fattura il capogruppo)" });

  return NextResponse.json({
    ok: true,
    capogruppo: { id: capogruppo.id, nome: capogruppo.nome, creato },
    sede: { id: sede.id, nome: sede.nome, pagaDaSe: false },
    capofila: { id: capofila.id, nome: capofila.nome },
  });
}
