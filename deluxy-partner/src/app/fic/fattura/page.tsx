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
import { anagraficaPerId } from "@/lib/anagrafiche";
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
  } else if (clienteVal === "registro:") {
    // Crea al volo il cliente su FIC dai dati del REGISTRO Anagrafiche: FIC
    // accetta un'entity coi dati fiscali e la registra emettendo la fattura.
    // I dati mancanti (P.IVA, SDI/PEC) li intercetta ficCreaFattura, dicendo
    // QUALE manca e dove aggiungerlo — non si emette una fattura fiscale monca.
    const anagId = String(fd.get("anagraficaId") ?? "").trim();
    const a = anagId ? await anagraficaPerId(anagId, 6000) : null;
    if (!a) {
      redirect(`${back}&errore=${encodeURIComponent("Non ho i dati del registro per creare il cliente: scegline uno esistente o riprova.")}`);
    }
    // ⚠️ Si costruisce omettendo i campi VUOTI: mandare `certified_email: null`
    // faceva rifiutare FIC con «PEC del cliente non valida» anche quando il
    // recapito c'era (lo SDI). E il Codice Destinatario si mette SEMPRE: lo SDI
    // del registro se c'è, altrimenti «0000000» — che è lo standard quando il
    // cliente non ha né SDI né PEC (la fattura arriva allo SDI e il cliente la
    // scarica dal cassetto fiscale). La PEC NON è obbligatoria.
    const pec = a.datiFinanziari?.pec?.trim() || null;
    const sdi = a.datiFinanziari?.codiceSdi?.trim().toUpperCase() || null;
    entity = {
      name: a.ragioneSociale || a.nome,
      vat_number: a.pIva,
      // Azienda italiana: il codice fiscale coincide con la P.IVA se non ce
      // n'è uno a parte, altrimenti FIC chiede il codice fiscale del cliente.
      tax_code: a.codiceFiscale || a.pIva,
      country: "Italia",
      ei_code: sdi || "0000000",
      ...(a.indirizzo ? { address_street: a.indirizzo } : {}),
      ...(a.citta ? { address_city: a.citta } : {}),
      ...(a.provincia ? { address_province: a.provincia } : {}),
      ...(pec ? { certified_email: pec } : {}),
      ...(a.email ? { email: a.email } : {}),
    };
  }
  if (!clienteId && !entity) {
    redirect(`${back}&errore=${encodeURIComponent("Scegli il cliente su Fatture in Cloud.")}`);
  }

  const oggetto = String(fd.get("oggetto") ?? "").trim();
  const scadenzaTxt = String(fd.get("scadenza") ?? "").trim();
  const scadenza = scadenzaTxt ? new Date(scadenzaTxt + "T00:00:00.000Z") : null;
  // Anticipo (facoltativo): importo lordo dell'acconto e la sua scadenza.
  const anticipoImp = parseFloat(String(fd.get("anticipo") ?? "").replace(",", "."));
  const anticipoScadTxt = String(fd.get("anticipoScadenza") ?? "").trim();
  const anticipo =
    Number.isFinite(anticipoImp) && anticipoImp > 0
      ? { importo: anticipoImp, scadenza: anticipoScadTxt ? new Date(anticipoScadTxt + "T00:00:00.000Z") : null }
      : null;

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
    const res = await ficCreaFattura({ clienteId, entity, righe, visibleSubject: oggetto, scadenza, anticipo, metodoPagamentoId });
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
  let partnerAnagraficaId: string | null = null;
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
    partnerAnagraficaId = pf.partner.anagraficaId;
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
    partnerAnagraficaId = f.partner.anagraficaId;
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
  // La P.IVA del partner dal registro Anagrafiche: serve a proporre il cliente
  // FIC per identità fiscale (esatta) invece che per somiglianza di nome —
  // «HAVI LOGISTICS» non deve più diventare «Hansol Logistics». 6 s di timeout
  // (a freddo il registro sfiora i 3,5 s); se non risponde si prosegue senza.
  const anagPartner = partnerAnagraficaId ? await anagraficaPerId(partnerAnagraficaId, 6000) : null;
  const pivaPartner = anagPartner?.pIva ?? null;
  const scelta = await suggerisciClienteFic({ id: partnerId, nome: partnerNome, piva: pivaPartner }, clienti);
  const suggerito = scelta.cliente;
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  // Se nessun cliente FIC combacia ma il partner ha i dati fiscali nel registro,
  // si può crearne uno nuovo su FIC da quei dati (opzione «registro:»).
  const nomeRegistro = anagPartner ? (anagPartner.ragioneSociale || anagPartner.nome) : null;
  const puoCreareDaRegistro = Boolean(anagPartner?.pIva && nomeRegistro);
  const nuovoDaRegistro = !suggerito && puoCreareDaRegistro;

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
              <input type="hidden" name="anagraficaId" value={partnerAnagraficaId ?? ""} />
              <select name="cliente" required defaultValue={suggerito?.valore ?? (nuovoDaRegistro ? "registro:" : "")}>
                <option value="" disabled>Seleziona cliente…</option>
                {puoCreareDaRegistro && (
                  <option value="registro:">➕ Crea nuovo cliente dal registro — {nomeRegistro} — P.IVA {anagPartner?.pIva}</option>
                )}
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
              ) : scelta.da === "storico" ? (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Intestatario delle fatture già emesse a &laquo;{partnerNome}&raquo;: &laquo;{scelta.ficNome}&raquo;.
                </p>
              ) : scelta.da === "piva" ? (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Preso per <strong style={{ color: "var(--text)" }}>P.IVA</strong> dal registro: su Fatture in Cloud
                  &laquo;{scelta.ficNome}&raquo; ha la stessa partita IVA del partner.
                </p>
              ) : nuovoDaRegistro ? (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Nessun cliente su Fatture in Cloud con la P.IVA di &laquo;{partnerNome}&raquo;: alla conferma
                  ne verrà <strong style={{ color: "var(--text)" }}>creato uno nuovo</strong> coi dati del registro
                  (ragione sociale, P.IVA, indirizzo, SDI/PEC). Se non ha SDI ne PEC la fattura va comunque allo SDI (codice 0000000) e il cliente la scarica dal cassetto fiscale.
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
              <label className="field-label">Anticipo € <span className="muted" style={{ fontWeight: 400 }}>(facoltativo)</span></label>
              <input type="text" name="anticipo" inputMode="decimal" placeholder="es. 1.000,00 — IVA inclusa" />
              <span className="muted" style={{ fontSize: 11.5 }}>Se lo indichi, la fattura nasce con due scadenze: l’acconto e il saldo.</span>
            </div>
            <div>
              <label className="field-label">Scadenza dell’anticipo</label>
              <input type="date" name="anticipoScadenza" defaultValue={iso(new Date())} />
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
