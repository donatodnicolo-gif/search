import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ficStato, ficClienti, ficCreaFattura, type RigaFattura } from "@/lib/fic";
import { RigheProForma } from "@/components/RigheProForma";

export const dynamic = "force-dynamic";

// Creazione di una fattura ex-novo direttamente su Fatture in Cloud.
// La fattura NON viene inviata allo SDI: il controllo e l'invio restano su FIC.
// Il numero assegnato torna nell'elenco automaticamente.
async function emettiFattura(fd: FormData) {
  "use server";
  const clienteId = parseInt(String(fd.get("clienteId") ?? ""));
  if (!clienteId) redirect("/registrazioni/fatture/nuova?errore=" + encodeURIComponent("Scegli il cliente."));

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

  let numero: string;
  try {
    const res = await ficCreaFattura({ clienteId, righe, visibleSubject: oggetto, data, scadenza });
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
  const clienti = stato.collegato ? await ficClienti().catch(() => []) : [];
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
              <label className="field-label">Cliente su Fatture in Cloud <span className="req">*</span></label>
              <select name="clienteId" required defaultValue="">
                <option value="" disabled>Seleziona cliente…</option>
                {clienti.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Il cliente dev&apos;essere già presente su Fatture in Cloud. Nuovo cliente? Crealo prima su FIC.
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
