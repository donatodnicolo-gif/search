import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CHIAVI, leggiImpostazioni, salvaImpostazione, ibanValido } from "@/lib/impostazioni";
import { inviaEmail } from "@/lib/mail";

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

async function salvaSmtp(fd: FormData) {
  "use server";
  const host = String(fd.get("smtpHost") ?? "").trim();
  const port = String(fd.get("smtpPort") ?? "").trim();
  const user = String(fd.get("smtpUser") ?? "").trim();
  const pass = String(fd.get("smtpPass") ?? ""); // vuota = non modificare
  const from = String(fd.get("smtpFrom") ?? "").trim();
  await salvaImpostazione(CHIAVI.smtpHost, host);
  await salvaImpostazione(CHIAVI.smtpPort, port);
  await salvaImpostazione(CHIAVI.smtpUser, user);
  await salvaImpostazione(CHIAVI.smtpFrom, from);
  if (pass.trim() !== "") await salvaImpostazione(CHIAVI.smtpPass, pass);
  if (fd.get("smtpPassCancella") === "on") await salvaImpostazione(CHIAVI.smtpPass, "");
  revalidatePath("/impostazioni");
  redirect("/impostazioni?salvato=smtp");
}

async function inviaProva(fd: FormData) {
  "use server";
  const to = String(fd.get("provaA") ?? "").trim();
  if (!to) redirect("/impostazioni?errore=prova-destinatario");
  try {
    await inviaEmail({
      to,
      subject: "Prova invio — Deluxy Partner",
      text:
        "Questa è un'email di prova inviata da Deluxy Partner per verificare la configurazione SMTP.\n" +
        "Se la stai leggendo, l'invio dei solleciti è pronto.",
    });
  } catch (e) {
    redirect(`/impostazioni?errore=${encodeURIComponent((e as Error).message)}`);
  }
  redirect("/impostazioni?salvato=prova");
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
          <span className="badge green">
            <span className="dot" />
            {sp.salvato === "prova" ? "Email di prova inviata: controlla la casella" : "Impostazioni salvate"}
          </span>
        </div>
      )}
      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>
            {sp.errore === "iban"
              ? "IBAN non valido: ricontrolla le cifre."
              : sp.errore === "prova-destinatario"
                ? "Indica un destinatario per l'email di prova."
                : decodeURIComponent(sp.errore)}
          </span>
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

      <h2 className="section-title">Email solleciti (SMTP)</h2>
      <form action={salvaSmtp} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Server SMTP</label>
            <input type="text" name="smtpHost" defaultValue={imp[CHIAVI.smtpHost] ?? ""} placeholder="authsmtp.deluxy.it" />
          </div>
          <div>
            <label className="field-label">Porta</label>
            <input type="number" name="smtpPort" defaultValue={imp[CHIAVI.smtpPort] ?? "587"} placeholder="587" />
          </div>
          <div>
            <label className="field-label">Utente (indirizzo email completo)</label>
            <input type="text" name="smtpUser" defaultValue={imp[CHIAVI.smtpUser] ?? ""} placeholder="amministrazione@deluxy.it" />
          </div>
          <div>
            <label className="field-label">
              Password casella{imp[CHIAVI.smtpPass] ? " (impostata — lascia vuoto per non cambiarla)" : ""}
            </label>
            <input type="password" name="smtpPass" autoComplete="new-password" placeholder={imp[CHIAVI.smtpPass] ? "••••••••" : ""} />
          </div>
          <div>
            <label className="field-label">Mittente visualizzato</label>
            <input type="text" name="smtpFrom" defaultValue={imp[CHIAVI.smtpFrom] ?? ""} placeholder="Deluxy Amministrazione <amministrazione@deluxy.it>" />
          </div>
          {imp[CHIAVI.smtpPass] && (
            <div className="checkbox-row">
              <input type="checkbox" id="smtpPassCancella" name="smtpPassCancella" />
              <label htmlFor="smtpPassCancella">Cancella la password salvata</label>
            </div>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 14 }}>
          Con <strong>Register.it</strong> (dominio deluxy.it): server <code>authsmtp.deluxy.it</code>,
          porta <code>587</code> (o 25), utente e password del servizio <em>SMTP autenticato</em> di Register
          (parametri esatti nel pannello Register.it → SMTP autenticato). In alternativa funziona qualsiasi
          altro provider (Gmail con password per le app, Aruba, Resend…).
        </p>
        <div className="form-footer">
          <button type="submit" className="btn primary">Salva SMTP</button>
        </div>
      </form>

      <div className="card" style={{ marginTop: 16 }}>
        <form action={inviaProva} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <label className="field-label">Verifica la configurazione: invia un&apos;email di prova a</label>
            <input type="email" name="provaA" placeholder="tuo-indirizzo@esempio.it" />
          </div>
          <button type="submit" className="btn secondary">Invia email di prova</button>
        </form>
      </div>

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
