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
  if (!capofilaRif) return erroreApi(400, "Serve «capofila»: l'id (o il platformId) del partner che rappresenta l'entità di fatturazione.");

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
