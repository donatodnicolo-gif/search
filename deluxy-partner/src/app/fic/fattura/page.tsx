import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { euro, dataIt, pctIt } from "@/lib/format";
import { ivato, nomeMese } from "@/lib/calc";
import { totaliProForma, importoRiga, rifProForma } from "@/lib/proforma";
import {
  ficStato,
  ficClientiFatturabiliCached,
  ficEntityUltimaFattura,
  ficCreaFattura,
  ficMetodiPagamento,
  type RigaFattura,
  type FicEntity,
} from "@/lib/fic";
import { suggerisciClienteFic } from "@/lib/fic-cliente";
import { BottoneInvio } from "@/components/BottoneInvio";

export const dynamic = "force-dynamic";

// Emissione su Fatture in Cloud di una fattura vera, a partire da:
//   ?proforma=<id>  → le righe della pro-forma (che poi passa a "fatturata")
//   ?fattura=<id>   → una fattura servizi registrata qui ma senza numero
// La fattura viene creata NON inviata allo SDI: controllo e invio restano su
// Fatture in Cloud. Il numero assegnato torna nell'app da solo.

async function emetti(origine: string, id: string, fd: FormData) {
  "use server";
  const clienteVal = String(fd.get("cliente") ?? "").trim();
  const back = `/fic/fattura?${origine}=${id}`;
  if (!clienteVal) redirect(`${back}&errore=${encodeURIComponent("Scegli il cliente su Fatture in Cloud.")}`);

  // in rubrica (`id:`) oppure solo intestatario di fatture passate (`nome:`):
  // in quel caso i dati fiscali si riprendono dall'ultima fattura emessa
  let clienteId: number | undefined;
  let entity: FicEntity | undefined;
  if (clienteVal.startsWith("id:")) {
    clienteId = parseInt(clienteVal.slice(3)) || undefined;
  } else if (clienteVal.startsWith("nome:")) {
    const nome = clienteVal.slice(5);
    entity = (await ficEntityUltimaFattura(nome)) ?? { name: nome };
  }
  if (!clienteId && !entity) {
    redirect(`${back}&errore=${encodeURIComponent("Scegli il cliente su Fatture in Cloud.")}`);
  }

  const oggetto = String(fd.get("oggetto") ?? "").trim();
  const scadenzaTxt = String(fd.get("scadenza") ?? "").trim();
  const scadenza = scadenzaTxt ? new Date(scadenzaTxt + "T00:00:00.000Z") : null;

  let righe: RigaFattura[];
  let partnerId: string;

  if (origine === "proforma") {
    const pf = await prisma.proForma.findUnique({ where: { id }, include: { righe: true } });
    if (!pf) redirect("/proforma");
    righe = pf.righe
      .sort((a, b) => a.ordine - b.ordine)
      .map((r) => ({
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzoUnitario: r.prezzoUnitario,
        aliquotaIva: r.aliquotaIva,
      }));
    partnerId = pf.partnerId;
  } else {
    const f = await prisma.fatturaServizio.findUnique({ where: { id }, include: { tipologia: true } });
    if (!f) redirect("/fatture");
    righe = [
      {
        descrizione: f.descrizione ?? `${f.tipologia.nome} — ${nomeMese(f.mese)} ${f.anno}`,
        prezzoUnitario: f.imponibile,
        aliquotaIva: f.aliquotaIva,
      },
    ];
    partnerId = f.partnerId;
  }

  let numero: string;
  try {
    const metodoPagamentoId = Number(fd.get("metodoPagamento")) || undefined;
    const res = await ficCreaFattura({ clienteId, entity, righe, visibleSubject: oggetto, scadenza, metodoPagamentoId });
    numero = res.numero;
  } catch (e) {
    redirect(`${back}&errore=${encodeURIComponent((e as Error).message)}`);
  }

  // Riporta il numero assegnato da FIC nel record di origine
  if (origine === "proforma") {
    await prisma.proForma.update({
      where: { id },
      data: { stato: "fatturata", fatturataIl: new Date(), fatturaNumero: numero, annullataIl: null },
    });
  } else {
    await prisma.fatturaServizio.update({
      where: { id },
      data: { numero, emissione: new Date(), ...(scadenza ? { scadenza } : {}) },
    });
  }
  for (const p of ["/", "/fatture", "/proforma", "/scadenzario", `/partner/${partnerId}`]) {
    revalidatePath(p, "layout");
  }
  redirect(
    origine === "proforma"
      ? `/proforma/${id}?fic=${encodeURIComponent(numero)}`
      : `/fatture/${id}?fic=${encodeURIComponent(numero)}`
  );
}

export default async function EmettiFatturaPage({
  searchParams,
}: {
  searchParams: Promise<{ proforma?: string; fattura?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const origine = sp.proforma ? "proforma" : "fattura";
  const id = sp.proforma ?? sp.fattura ?? "";
  if (!id) notFound();

  const stato = await ficStato();

  // Dati di origine, normalizzati per l'anteprima
  let titolo: string;
  let partnerNome: string;
  // serve l'id, non solo il nome: la riconciliazione confermata è per partner
  let partnerId: string;
  let oggettoDefault: string;
  let scadenzaDefault: Date | null = null;
  let righe: { descrizione: string; quantita: number; prezzoUnitario: number; aliquotaIva: number }[];
  let tornaA: string;

  if (origine === "proforma") {
    const pf = await prisma.proForma.findUnique({
      where: { id },
      include: { partner: true, righe: { orderBy: { ordine: "asc" } } },
    });
    if (!pf) notFound();
    titolo = `Emetti fattura da ${rifProForma(pf)}`;
    partnerNome = pf.partner.nome;
    partnerId = pf.partner.id;
    oggettoDefault = pf.oggetto ?? "";
    scadenzaDefault = pf.scadenza;
    righe = pf.righe.map((r) => ({
      descrizione: r.descrizione,
      quantita: r.quantita,
      prezzoUnitario: r.prezzoUnitario,
      aliquotaIva: r.aliquotaIva,
    }));
    tornaA = `/proforma/${id}`;
  } else {
    const f = await prisma.fatturaServizio.findUnique({
      where: { id },
      include: { partner: true, tipologia: true },
    });
    if (!f) notFound();
    titolo = "Emetti fattura servizi su Fatture in Cloud";
    partnerNome = f.partner.nome;
    partnerId = f.partner.id;
    oggettoDefault = f.descrizione ?? `${f.tipologia.nome} — ${nomeMese(f.mese)} ${f.anno}`;
    scadenzaDefault = f.scadenza;
    righe = [
      {
        descrizione: f.descrizione ?? `${f.tipologia.nome} — ${nomeMese(f.mese)} ${f.anno}`,
        quantita: 1,
        prezzoUnitario: f.imponibile,
        aliquotaIva: f.aliquotaIva,
      },
    ];
    tornaA = `/fatture/${id}`;
  }

  const tot = totaliProForma(righe);
  // soggetti fatturabili = rubrica clienti + intestatari delle fatture emesse
  const clienti = stato.collegato ? await ficClientiFatturabiliCached().catch(() => []) : [];
  // Metodi di pagamento di FIC: obbligatorio sulla fattura elettronica.
  const metodi = stato.collegato ? await ficMetodiPagamento().catch(() => []) : [];
  // preseleziona il cliente FIC: prima la riconciliazione confermata a mano,
  // poi la somiglianza dei nomi (src/lib/fic-cliente.ts)
  const scelta = await suggerisciClienteFic({ id: partnerId, nome: partnerNome }, clienti);
  const suggerito = scelta.cliente;
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <>
      <div className="page-head">
        <div>
          <Link href={tornaA} className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna al documento
          </Link>
          <h1 className="page-title">{titolo}</h1>
          <p className="page-caption">
            {partnerNome} · {euro(tot.totale)} IVA inclusa · la fattura viene creata su Fatture in Cloud
            <strong> senza inviarla allo SDI</strong>: la controlli e la invii da lì.
          </p>
        </div>
      </div>

      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.errore)}</span>
        </div>
      )}

      {!stato.collegato ? (
        <div className="card" style={{ padding: 18 }}>
          <span className="badge orange"><span className="dot" />Fatture in Cloud non collegato</span>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 10 }}>
            Collega l&apos;account in{" "}
            <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni → Fatture in Cloud</Link>{" "}
            per emettere le fatture direttamente dall&apos;app.
          </p>
        </div>
      ) : (
        <form action={emetti.bind(null, origine, id)} className="card">
          <div className="form-grid">
            <div>
              <label className="field-label">Cliente su Fatture in Cloud <span className="req">*</span></label>
              <select name="cliente" required defaultValue={suggerito?.valore ?? ""}>
                <option value="" disabled>Seleziona cliente…</option>
                {clienti.map((c) => (
                  <option key={c.valore} value={c.valore}>
                    {c.nome}
                    {c.piva ? ` — P.IVA ${c.piva}` : ""}
                    {c.inRubrica ? "" : " · già fatturato (non in rubrica)"}
                  </option>
                ))}
              </select>
              {scelta.da === "riconciliazione" ? (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Preso dalla <strong style={{ color: "var(--text)" }}>riconciliazione confermata</strong>: su
                  Fatture in Cloud &laquo;{partnerNome}&raquo; è &laquo;{scelta.ficNome}&raquo;.
                  {scelta.alternative.length > 0 &&
                    ` Riconciliato anche con ${scelta.alternative.map((a) => `«${a.nome}»`).join(", ")}.`}
                </p>
              ) : suggerito ? (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Proposto per somiglianza con &laquo;{partnerNome}&raquo;: controlla che sia il cliente giusto.
                </p>
              ) : null}
            </div>
            <div>
              <label className="field-label">Scadenza pagamento</label>
              <input type="date" name="scadenza" defaultValue={iso(scadenzaDefault)} />
            </div>
            <div>
              {/* Obbligatorio su una fattura ELETTRONICA: e la ModalitaPagamento
                  che pretende lo SDI (bonifico = MP05). Preselezionato sul
                  predefinito di Fatture in Cloud; si puo cambiare. */}
              <label className="field-label">Metodo di pagamento</label>
              <select name="metodoPagamento" defaultValue={String(metodi.find((m) => m.predefinito)?.id ?? metodi[0]?.id ?? "")}>
                {metodi.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}{m.predefinito ? " (predefinito)" : ""}</option>
                ))}
              </select>
              {metodi.length === 0 && (
                <span className="muted" style={{ fontSize: 11.5 }}>
                  Nessun metodo su Fatture in Cloud: creane uno (es. Bonifico) nelle sue impostazioni.
                </span>
              )}
            </div>
            <div className="full">
              <label className="field-label">Oggetto visibile in fattura</label>
              <input type="text" name="oggetto" defaultValue={oggettoDefault} />
            </div>
          </div>

          <h2 className="section-title" style={{ fontSize: 15 }}>Righe che verranno fatturate</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Descrizione</th><th className="num">Q.tà</th>
                  <th className="num">Prezzo unit.</th><th className="num">IVA</th><th className="num">Importo</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r, i) => (
                  <tr key={i}>
                    <td>{r.descrizione}</td>
                    <td className="num">{r.quantita.toLocaleString("it-IT")}</td>
                    <td className="num">{euro(r.prezzoUnitario)}</td>
                    <td className="num">{pctIt(r.aliquotaIva)}</td>
                    <td className="num">{euro(importoRiga(r))}</td>
                  </tr>
                ))}
                <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                  <td colSpan={4}>Totale documento (IVA inclusa)</td>
                  <td className="num">{euro(tot.totale)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="form-footer">
            <BottoneInvio inCorso="Sto emettendo su Fatture in Cloud…">Emetti su Fatture in Cloud</BottoneInvio>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            {origine === "proforma"
              ? "Al termine la pro-forma passa a «fatturata» con il numero assegnato da Fatture in Cloud."
              : "Al termine il numero assegnato viene scritto sulla fattura registrata qui."}
          </p>
        </form>
      )}
    </>
  );
}
