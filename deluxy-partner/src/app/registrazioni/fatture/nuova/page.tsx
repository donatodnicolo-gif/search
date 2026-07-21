import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ficStato, ficClientiFatturabili, ficEntityUltimaFattura, ficCreaFattura, type RigaFattura, type FicEntity } from "@/lib/fic";
import { RigheProForma } from "@/components/RigheProForma";

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
    const res = await ficCreaFattura({ clienteId, entity: entity ?? undefined, righe, visibleSubject: oggetto, data, scadenza });
    numero = res.numero;
  } catch (e) {
    redirect("/registrazioni/fatture/nuova?errore=" + encodeURIComponent((e as Error).message));
  }
  revalidatePath("/registrazioni/fatture", "layout");
  redirect(`/registrazioni/fatture?emessa=${encodeURIComponent(numero)}`);
}

export default async function NuovaFatturaCloud({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const sp = await searchParams;
  const stato = await ficStato();
  const clienti = stato.collegato ? await ficClientiFatturabili().catch(() => []) : [];
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
              <select name="clienteId" defaultValue="">
                <option value="">Seleziona cliente…</option>
                {clienti.map((c) => (
                  <option key={c.valore} value={c.valore}>
                    {c.nome}{c.piva ? ` — ${c.piva}` : ""}{c.inRubrica ? "" : " (da fatture passate)"}
                  </option>
                ))}
              </select>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Include la rubrica e i clienti già fatturati (anche non salvati in rubrica). Se il cliente
                <strong> non è in elenco</strong>, usa «Cliente nuovo» qui sotto.
              </p>
            </div>
            <div>
              <label className="field-label">Data documento</label>
              <input type="date" name="data" defaultValue={oggi} />
            </div>
            <div>
              <label className="field-label">Scadenza pagamento</label>
              <input type="date" name="scadenza" />
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

            <RigheProForma />
          </div>
          <div className="form-footer">
            <button type="submit" className="btn primary">Emetti su Fatture in Cloud</button>
          </div>
        </form>
      )}
    </>
  );
}
