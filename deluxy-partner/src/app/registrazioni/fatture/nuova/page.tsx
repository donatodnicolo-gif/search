import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { risolviAnagrafica } from "@/lib/anagrafiche";
import { datiFiscaliDaFic } from "@/lib/riconciliazione-fic";
import { matchPartner } from "@/lib/riconciliazione";
import { ficStato, ficClientiFatturabiliCached, ficEntityUltimaFattura, ficCreaFattura, ficMetodiPagamento, type RigaFattura, type FicEntity } from "@/lib/fic";
import { RigheProForma } from "@/components/RigheProForma";
import { TerminiPagamento } from "@/components/TerminiPagamento";
import { SceltaCliente, type OpzioneCliente } from "@/components/SceltaCliente";
import { BottoneInvio } from "@/components/BottoneInvio";

export const dynamic = "force-dynamic";

// Creazione di una fattura ex-novo direttamente su Fatture in Cloud.
// La fattura NON viene inviata allo SDI: il controllo e l'invio restano su FIC.
// Il numero assegnato torna nell'elenco automaticamente.
async function emettiFattura(fd: FormData) {
  "use server";
  // il cliente è "id:<n>" (rubrica), "nome:<nome>" (visto in fatture passate),
  // oppure vuoto = cliente nuovo (dati compilati a mano più sotto).
  const clienteVal = String(fd.get("clienteId") ?? "").trim();

  const oggetto = String(fd.get("oggetto") ?? "").trim();
  const scadenzaTxt = String(fd.get("scadenza") ?? "").trim();
  const scadenza = scadenzaTxt ? new Date(scadenzaTxt + "T00:00:00.000Z") : null;
  const dataTxt = String(fd.get("data") ?? "").trim();
  const data = dataTxt ? new Date(dataTxt + "T00:00:00.000Z") : new Date();

  // righe dal form (stesso formato dell'editor pro-forma)
  const descrizioni = fd.getAll("rigaDescrizione").map((v) => String(v).trim());
  const quantita = fd.getAll("rigaQuantita");
  const prezzi = fd.getAll("rigaPrezzo");
  const aliquote = fd.getAll("rigaIva");
  const num = (v: FormDataEntryValue | undefined) => {
    const t = v == null ? "" : String(v).trim();
    if (t === "") return NaN;
    return parseFloat(t.replace(",", "."));
  };
  const righe: RigaFattura[] = descrizioni
    .map((descrizione, i) => ({
      descrizione,
      quantita: isNaN(num(quantita[i])) ? 1 : num(quantita[i]),
      prezzoUnitario: num(prezzi[i]),
      aliquotaIva: isNaN(num(aliquote[i])) ? 22 : num(aliquote[i]),
    }))
    .filter((r) => r.descrizione !== "");

  if (righe.length === 0 || righe.some((r) => isNaN(r.prezzoUnitario))) {
    redirect("/registrazioni/fatture/nuova?errore=" + encodeURIComponent("Inserisci almeno una riga con descrizione e prezzo."));
  }

  // risolve il cliente: id rubrica, dati da una fattura passata, o cliente nuovo
  let clienteId: number | undefined;
  let entity: FicEntity | undefined;
  if (clienteVal.startsWith("id:")) {
    clienteId = parseInt(clienteVal.slice(3)) || undefined;
  } else if (clienteVal.startsWith("nome:")) {
    const nome = clienteVal.slice(5);
    entity = (await ficEntityUltimaFattura(nome)) ?? { name: nome };
  } else if (clienteVal.startsWith("partner:")) {
    // Partner registrato in Deluxy Partner (Finance): costruisce l'entità FIC dai
    // suoi dati anagrafici letti dal registro Anagrafiche (fiscali) + cache locale.
    const partner = await prisma.partner.findUnique({ where: { id: clienteVal.slice(8) } });
    if (partner) {
      const a = await risolviAnagrafica(partner.nome, partner.anagraficaId);
      const fin = a?.datiFinanziari;
      const raw = a?.indirizzo ?? "";
      const street = raw.split(",")[0]?.trim() || raw;
      const cap = raw.match(/\b\d{5}\b/)?.[0] ?? "";
      const email = a?.email || partner.email || "";
      // Se il registro Anagrafiche non ha i dati fiscali, si prendono da
      // Fatture in Cloud: spesso quel cliente e gia stato fatturato la con
      // partita IVA e codice SDI, e ridigitarli e lavoro inutile (oltre che un
      // modo per sbagliarli). Vale solo come RIPIEGO: dove il registro sa, il
      // registro vince, perche e lui la fonte di verita delle anagrafiche.
      const daFic = a?.pIva || a?.codiceFiscale ? null : await datiFiscaliDaFic(partner);
      entity = {
        name: a?.ragioneSociale || daFic?.nome || partner.nome,
        ...(a?.pIva ?? daFic?.piva ? { vat_number: (a?.pIva ?? daFic?.piva)! } : {}),
        ...(a?.codiceFiscale ?? daFic?.codiceFiscale ? { tax_code: (a?.codiceFiscale ?? daFic?.codiceFiscale)! } : {}),
        ...(street ? { address_street: street } : {}),
        ...(cap ? { address_postal_code: cap } : {}),
        ...(a?.citta ? { address_city: a.citta } : {}),
        ...(a?.provincia ? { address_province: a.provincia } : {}),
        country: "Italia",
        ...(fin?.codiceSdi ?? daFic?.codiceSdi ? { ei_code: (fin?.codiceSdi ?? daFic?.codiceSdi)! } : {}),
        ...(fin?.pec ?? daFic?.pec ? { certified_email: (fin?.pec ?? daFic?.pec)! } : {}),
        ...(email ? { email } : {}),
      };
    }
  } else {
    // Cliente nuovo: dati inseriti a mano. FIC lo crea al volo con la fattura
    // (nessuna necessità di censirlo prima in rubrica).
    const t = (k: string) => String(fd.get(k) ?? "").trim();
    const nuovoNome = t("nuovoNome");
    if (nuovoNome) {
      const piva = t("nuovoPiva");
      const cf = t("nuovoCf");
      const sdi = t("nuovoSdi").toUpperCase();
      const pec = t("nuovoPec");
      entity = {
        name: nuovoNome,
        ...(piva ? { vat_number: piva } : {}),
        ...(cf ? { tax_code: cf } : {}),
        ...(t("nuovoIndirizzo") ? { address_street: t("nuovoIndirizzo") } : {}),
        ...(t("nuovoCap") ? { address_postal_code: t("nuovoCap") } : {}),
        ...(t("nuovoCitta") ? { address_city: t("nuovoCitta") } : {}),
        ...(t("nuovoProvincia") ? { address_province: t("nuovoProvincia") } : {}),
        country: t("nuovoPaese") || "Italia",
        ...(sdi ? { ei_code: sdi } : {}),
        ...(pec ? { certified_email: pec } : {}),
        ...(t("nuovoEmail") ? { email: t("nuovoEmail") } : {}),
      };
    }
  }
  if (!clienteId && !entity) {
    redirect("/registrazioni/fatture/nuova?errore=" + encodeURIComponent("Scegli un cliente dall'elenco oppure compila almeno la ragione sociale in «Cliente nuovo»."));
  }

  let numero: string;
  try {
    const metodoPagamentoId = Number(fd.get("metodoPagamento")) || undefined;
    const res = await ficCreaFattura({ clienteId, entity: entity ?? undefined, righe, visibleSubject: oggetto, data, scadenza, metodoPagamentoId });
    numero = res.numero;
  } catch (e) {
    redirect("/registrazioni/fatture/nuova?errore=" + encodeURIComponent((e as Error).message));
  }
  revalidatePath("/registrazioni/fatture", "layout");

  // Se il cliente è un partner FINANCE, registra la fattura anche come
  // "Servizio a fatturazione" del partner, così entra nei conteggi (fatturato,
  // dovuto). numero = numero FIC (evita doppioni con la sezione FIC nella scheda).
  const tipologiaId = String(fd.get("tipologiaId") ?? "").trim();
  let partnerId: string | null = null;
  if (clienteVal.startsWith("partner:")) {
    partnerId = clienteVal.slice(8);
  } else if (entity?.name) {
    const ric = await prisma.riconciliazioneAnagrafica.findFirst({
      where: { ficNome: { equals: entity.name, mode: "insensitive" }, NOT: { partnerId: null } },
      select: { partnerId: true },
    });
    partnerId =
      ric?.partnerId ??
      (await prisma.partner.findFirst({ where: { nome: { equals: entity.name, mode: "insensitive" } }, select: { id: true } }))?.id ??
      null;
  }
  let registrata = false;
  if (partnerId && tipologiaId) {
    try {
      const imponibile = righe.reduce((a, r) => a + (r.quantita ?? 1) * r.prezzoUnitario, 0);
      await prisma.fatturaServizio.create({
        data: {
          partnerId,
          tipologiaId,
          anno: data.getUTCFullYear(),
          mese: data.getUTCMonth() + 1,
          numero,
          imponibile: +imponibile.toFixed(2),
          aliquotaIva: righe[0]?.aliquotaIva ?? 22,
          scadenza: scadenza ?? undefined,
          descrizione: oggetto || null,
        },
      });
      registrata = true;
      for (const pth of ["/", "/partner", "/fatture", "/saldi", "/scadenzario", "/report"]) revalidatePath(pth, "layout");
    } catch {
      // la fattura FIC è comunque creata; la registrazione locale si può rifare a mano
    }
  }
  redirect(`/registrazioni/fatture?emessa=${encodeURIComponent(numero)}${registrata ? "&servizio=1" : ""}`);
}

export default async function NuovaFatturaCloud({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const sp = await searchParams;
  const [stato, partners, tipologie] = await Promise.all([
    ficStato(),
    prisma.partner.findMany({ where: { attivo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.tipologiaServizio.findMany({ orderBy: { ordine: "asc" }, select: { id: true, nome: true } }),
  ]);
  const tipDefault = tipologie.find((t) => /altro/i.test(t.nome))?.id ?? tipologie[0]?.id ?? "";
  const clienti = stato.collegato ? await ficClientiFatturabiliCached().catch(() => []) : [];
  // Metodi di pagamento di Fatture in Cloud: obbligatori su una fattura
  // elettronica, ed è quello che mancava quando la creazione si fermava con
  // «metodo di pagamento obbligatorio».
  const metodi = stato.collegato ? await ficMetodiPagamento().catch(() => []) : [];
  // UNA VOCE SOLA per chi è già stato riconciliato.
  //
  // Lo stesso soggetto compare due volte — il partner Deluxy con l'insegna
  // («GRUÈ») e l'intestatario di Fatture in Cloud con la denominazione legale
  // («GRUE' S.R.L.») — e sceglierne una a caso è come è nata la fattura
  // bloccata. Dove la riconciliazione ha già detto che sono la stessa azienda,
  // si mostra una riga sola.
  //
  // Il criterio è la RICONCILIAZIONE CONFERMATA, non la somiglianza dei nomi:
  // qui si decide a chi si intesta una fattura, e un accostamento probabile non
  // è un buon motivo per far sparire una voce dall'elenco.
  const riconciliati = await prisma.riconciliazioneAnagrafica.findMany({
    where: { stato: "confermata", NOT: { partnerId: null } },
    select: { ficNome: true, partnerId: true },
  });
  const chiave = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
  const partnerDiFic = new Map(riconciliati.map((r) => [chiave(r.ficNome), r.partnerId!]));

  // `ficNome` non è sempre il nome del cliente su FIC: quando la
  // riconciliazione è nata dalla scheda partner ci finisce il nome del PARTNER
  // (CLIVATI), mentre su Fatture in Cloud quel cliente si chiama «CLIVATI 1969
  // S.R.L.». Il confronto esatto non basta, e resterebbero due voci per chi è
  // già riconciliato. Per i soli partner riconciliati si usa allora lo stesso
  // aggancio per parole intere della riconciliazione — non è una somiglianza a
  // caso: è ristretta a chi è già stato dichiarato la stessa azienda.
  const idRiconciliati = new Set(riconciliati.map((r) => r.partnerId!));
  const partnerRiconciliati = partners.filter((p) => idRiconciliati.has(p.id));

  const ficDelPartner = new Map<string, { nome: string; piva: string | null }>();
  const ficAssorbiti = new Set<string>();
  for (const c of clienti) {
    // `matchPartner` legge solo il nome del partner: il cast evita di caricare
    // l'intera riga per un confronto di stringhe.
    const pid =
      partnerDiFic.get(chiave(c.nome)) ??
      matchPartner(c.nome, partnerRiconciliati as unknown as Parameters<typeof matchPartner>[1])?.id;
    if (!pid) continue;
    ficAssorbiti.add(c.valore);
    // fra più intestazioni dello stesso partner vince quella con la P.IVA
    const gia = ficDelPartner.get(pid);
    if (!gia || (!gia.piva && c.piva)) ficDelPartner.set(pid, { nome: c.nome, piva: c.piva });
  }

  const opzioniCliente: OpzioneCliente[] = [
    ...partners.map((p) => {
      // Si tiene il valore del PARTNER: i suoi dati fiscali arrivano dal
      // registro Anagrafiche, che è aggiornato, mentre l'intestatario FIC è la
      // fotografia di una fattura vecchia.
      const fic = ficDelPartner.get(p.id);
      return {
        valore: `partner:${p.id}`,
        etichetta: p.nome,
        dettaglio: fic ? [fic.nome, fic.piva ?? undefined].filter(Boolean).join(" · ") : undefined,
        gruppo: fic ? "Cliente Deluxy · già in Fatture in Cloud" : "Cliente Deluxy (Finance)",
      };
    }),
    // dell'elenco FIC restano solo quelli NON riconciliati con un partner
    ...clienti
      .filter((c) => !ficAssorbiti.has(c.valore))
      .map((c) => ({
        valore: c.valore,
        etichetta: c.nome,
        dettaglio: [c.piva ?? undefined, c.inRubrica ? undefined : "da fatture passate"].filter(Boolean).join(" · ") || undefined,
        gruppo: "Fatture in Cloud",
      })),
  ];
  const oggi = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/registrazioni/fatture" className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna alle fatture
          </Link>
          <h1 className="page-title">Nuova fattura</h1>
          <p className="page-caption">
            Crea una fattura direttamente su <strong>Fatture in Cloud</strong>. Viene creata
            <strong> senza inviarla allo SDI</strong>: la controlli e la invii da Fatture in Cloud.
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
            per emettere le fatture dall&apos;app.
          </p>
        </div>
      ) : (
        <form action={emettiFattura} className="card">
          <div className="form-grid">
            <div>
              <label className="field-label">Cliente su Fatture in Cloud</label>
              <SceltaCliente name="clienteId" opzioni={opzioniCliente} />
              <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Scrivi le prime lettere: cerca fra i <strong>partner Deluxy</strong> (dati fiscali dal registro
                Anagrafiche) e i clienti di <strong>Fatture in Cloud</strong>. Sotto ogni risultato c'è scritto da
                dove viene. Se non lo trovi, lascia vuoto e compila «Cliente nuovo» qui sotto.
              </p>
            </div>
            <div>
              <label className="field-label">Data documento</label>
              <input type="date" name="data" defaultValue={oggi} />
            </div>
            <TerminiPagamento oggi={oggi} />
            <div>
              {/* Obbligatorio su una fattura ELETTRONICA: e la ModalitaPagamento
                  che pretende lo SDI (bonifico = MP05). Preselezionato sul
                  predefinito di Fatture in Cloud. */}
              <label className="field-label">Metodo di pagamento</label>
              <select name="metodoPagamento" defaultValue={String(metodi.find((m) => m.predefinito)?.id ?? metodi[0]?.id ?? "")}>
                {metodi.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}{m.predefinito ? " (predefinito)" : ""}</option>
                ))}
              </select>
              {metodi.length === 0 && (
                <span className="muted" style={{ fontSize: 11.5 }}>
                  Nessun metodo configurato su Fatture in Cloud: creane uno (es. Bonifico) nelle sue impostazioni.
                </span>
              )}
            </div>

            <div className="full">
              <details style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-m)", padding: "10px 14px", background: "var(--bg)" }}>
                <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500 }}>
                  ➕ Cliente nuovo (non ancora in Fatture in Cloud)
                </summary>
                <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 12px" }}>
                  Compila qui <strong>solo</strong> se il cliente non è nell&apos;elenco sopra: FIC lo crea al volo
                  con la fattura. Lascia il menu su «Seleziona cliente…».
                </p>
                <div className="form-grid">
                  <div className="full">
                    <label className="field-label">Ragione sociale / Nome <span className="req">*</span></label>
                    <input type="text" name="nuovoNome" placeholder="Es. ROSSI SRL" />
                  </div>
                  <div>
                    <label className="field-label">P. IVA</label>
                    <input type="text" name="nuovoPiva" placeholder="es. 01234567890" />
                  </div>
                  <div>
                    <label className="field-label">Codice fiscale</label>
                    <input type="text" name="nuovoCf" />
                  </div>
                  <div>
                    <label className="field-label">Indirizzo</label>
                    <input type="text" name="nuovoIndirizzo" placeholder="Via …" />
                  </div>
                  <div>
                    <label className="field-label">CAP</label>
                    <input type="text" name="nuovoCap" />
                  </div>
                  <div>
                    <label className="field-label">Città</label>
                    <input type="text" name="nuovoCitta" />
                  </div>
                  <div>
                    <label className="field-label">Provincia</label>
                    <input type="text" name="nuovoProvincia" placeholder="es. MI" />
                  </div>
                  <div>
                    <label className="field-label">Paese</label>
                    <input type="text" name="nuovoPaese" defaultValue="Italia" />
                  </div>
                  <div>
                    <label className="field-label">Codice destinatario (SDI)</label>
                    <input type="text" name="nuovoSdi" placeholder="7 caratteri" />
                  </div>
                  <div>
                    <label className="field-label">PEC</label>
                    <input type="email" name="nuovoPec" />
                  </div>
                  <div>
                    <label className="field-label">Email</label>
                    <input type="email" name="nuovoEmail" />
                  </div>
                </div>
              </details>
            </div>

            <div className="full">
              <label className="field-label">Oggetto visibile in fattura</label>
              <input type="text" name="oggetto" placeholder="es. Servizi di consegna giugno 2026" />
            </div>

            <div className="full">
              <label className="field-label">
                Tipologia servizio{" "}
                <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>· usata solo se il cliente è un partner Deluxy</span>
              </label>
              <select name="tipologiaId" defaultValue={tipDefault} style={{ maxWidth: 320 }}>
                {tipologie.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Se il cliente è un <strong>partner</strong>, la fattura viene registrata anche come «Servizio a
                fatturazione» in questa tipologia, così entra nei conteggi del partner (fatturato, dovuto…).
              </p>
            </div>

            <RigheProForma />
          </div>
          <div className="form-footer">
            <BottoneInvio inCorso="Sto emettendo su Fatture in Cloud…">Emetti su Fatture in Cloud</BottoneInvio>
          </div>
        </form>
      )}
    </>
  );
}
