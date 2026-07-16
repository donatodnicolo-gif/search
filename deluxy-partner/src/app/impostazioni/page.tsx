import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CHIAVI, leggiImpostazioni, salvaImpostazione, ibanValido } from "@/lib/impostazioni";

export const dynamic = "force-dynamic";

async function salva(fd: FormData) {
  "use server";
  const nome = String(fd.get("ordinanteNome") ?? "");
  const iban = String(fd.get("ordinanteIban") ?? "").replace(/\s/g, "").toUpperCase();
  const bic = String(fd.get("ordinanteBic") ?? "").replace(/\s/g, "").toUpperCase();
  if (iban && !ibanValido(iban)) {
    revalidatePath("/impostazioni");
    redirect("/impostazioni?errore=iban");
  }
  await salvaImpostazione(CHIAVI.ordinanteNome, nome);
  await salvaImpostazione(CHIAVI.ordinanteIban, iban);
  await salvaImpostazione(CHIAVI.ordinanteBic, bic);
  revalidatePath("/impostazioni");
  redirect("/impostazioni?salvato=1");
}

export default async function ImpostazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ salvato?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const imp = await leggiImpostazioni();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-caption">
            Dati dell&apos;ordinante per le distinte SEPA e gestione dell&apos;accesso.
          </p>
        </div>
      </div>

      {sp.salvato && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Impostazioni salvate</span>
        </div>
      )}
      {sp.errore === "iban" && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>IBAN non valido: ricontrolla le cifre.</span>
        </div>
      )}

      <h2 className="section-title" style={{ marginTop: 0 }}>Ordinante bonifici SEPA</h2>
      <form action={salva} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Intestazione conto (ordinante)</label>
            <input type="text" name="ordinanteNome" defaultValue={imp[CHIAVI.ordinanteNome] ?? ""} placeholder="es. DELUXY SRL" />
          </div>
          <div>
            <label className="field-label">IBAN conto Deluxy</label>
            <input type="text" name="ordinanteIban" defaultValue={imp[CHIAVI.ordinanteIban] ?? ""} placeholder="IT00 X000 0000 0000 0000 0000 000" />
          </div>
          <div>
            <label className="field-label">BIC (facoltativo)</label>
            <input type="text" name="ordinanteBic" defaultValue={imp[CHIAVI.ordinanteBic] ?? ""} placeholder="es. BCITITMM" />
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 14 }}>
          Questi dati compilano il file SEPA (pain.001) generato da &laquo;Saldi e bonifici&raquo;.
          Il file va poi caricato e <strong>autorizzato nell&apos;home banking</strong>: l&apos;app non dispone mai pagamenti da sola.
        </p>
        <div className="form-footer">
          <button type="submit" className="btn primary">Salva impostazioni</button>
        </div>
      </form>

      <h2 className="section-title">Accesso all&apos;app</h2>
      <div className="card">
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          L&apos;accesso è protetto da una password unica di team, impostata come variabile
          d&apos;ambiente <code>PARTNER_APP_PASSWORD</code> su Vercel (Settings → Environment Variables).
          Cambiandola si disconnettono automaticamente tutte le sessioni attive.
        </p>
      </div>
    </>
  );
}
