import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CHIAVI, leggiImpostazioni, salvaImpostazione, ibanValido } from "@/lib/impostazioni";
import { inviaEmail } from "@/lib/mail";
import { ficStato } from "@/lib/fic";
import { qontoOrganizzazione, qontoConfigurato } from "@/lib/qonto";

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

async function salvaQonto(fd: FormData) {
  "use server";
  const login = String(fd.get("qontoLogin") ?? "").trim();
  const key = String(fd.get("qontoKey") ?? "").trim(); // vuota = non modificare
  await salvaImpostazione("qonto.login", login);
  if (key !== "") await salvaImpostazione("qonto.secretKey", key);
  if (fd.get("qontoKeyCancella") === "on") await salvaImpostazione("qonto.secretKey", "");
  revalidatePath("/impostazioni");
  redirect("/impostazioni?salvato=1");
}

async function verificaQonto() {
  "use server";
  try {
    const org = await qontoOrganizzazione();
    const conti = org.conti
      .map((c) => `${c.name ?? c.slug}: ${c.balance.toLocaleString("it-IT", { minimumFractionDigits: 2 })} ${c.currency}`)
      .join(" · ");
    redirect(
      "/impostazioni?salvato=qonto&dettaglio=" +
        encodeURIComponent(`${org.nome} — ${org.conti.length} conto/i (${conti})`)
    );
  } catch (e) {
    // il redirect interno di Next viaggia come eccezione: non intercettarlo
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    redirect("/impostazioni?errore=" + encodeURIComponent((e as Error).message));
  }
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
  searchParams: Promise<{ salvato?: string; errore?: string; azienda?: string; dettaglio?: string }>;
}) {
  const sp = await searchParams;
  const imp = await leggiImpostazioni();
  const fic = await ficStato();

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
            {sp.salvato === "prova"
              ? "Email di prova inviata: controlla la casella"
              : sp.salvato === "fic"
                ? `Fatture in Cloud collegato${sp.azienda ? ` — azienda: ${sp.azienda}` : ""}`
                : sp.salvato === "qonto"
                  ? `Qonto connesso: ${sp.dettaglio ? decodeURIComponent(sp.dettaglio) : "ok"}`
                  : "Impostazioni salvate"}
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

      <h2 className="section-title">Fatture in Cloud</h2>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            {fic.collegato ? (
              <span className="badge green"><span className="dot" />Collegato — azienda: {fic.companyName}</span>
            ) : fic.credenziali ? (
              <span className="badge orange"><span className="dot" />App FINANCE configurata, account non ancora collegato</span>
            ) : (
              <span className="badge neutral"><span className="dot" />Non configurato</span>
            )}
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
              Il collegamento permette di emettere fatture dall&apos;app (con numero di ritorno automatico)
              e sincronizzare lo stato degli incassi. Il consenso si dà una sola volta con l&apos;account
              Fatture in Cloud; il rinnovo del token è automatico.
            </p>
          </div>
          {fic.credenziali && (
            <a className="btn primary" href="/api/fic/authorize">
              {fic.collegato ? "Ricollega" : "Collega Fatture in Cloud"}
            </a>
          )}
        </div>
      </div>

      <h2 className="section-title">Qonto (conto bancario)</h2>
      <form action={salvaQonto} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Login API (es. deluxy-1234)</label>
            <input type="text" name="qontoLogin" defaultValue={imp["qonto.login"] ?? ""} placeholder="nome-organizzazione-1234" />
          </div>
          <div>
            <label className="field-label">
              Secret key{imp["qonto.secretKey"] ? " (impostata — lascia vuoto per non cambiarla)" : ""}
            </label>
            <input type="password" name="qontoKey" autoComplete="new-password" placeholder={imp["qonto.secretKey"] ? "••••••••" : ""} />
          </div>
          {imp["qonto.secretKey"] && (
            <div className="checkbox-row">
              <input type="checkbox" id="qontoKeyCancella" name="qontoKeyCancella" />
              <label htmlFor="qontoKeyCancella">Cancella la secret key salvata</label>
            </div>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 14 }}>
          Le credenziali si generano dall&apos;app Qonto: <strong>Impostazioni → Integrazioni e Partner →
          Chiave API</strong>. Accesso in sola lettura ai movimenti: abilita il bottone
          &laquo;Sincronizza da Qonto&raquo; in Import transazioni (niente più export CSV manuali).
        </p>
        <div className="form-footer">
          <button type="submit" className="btn primary">Salva Qonto</button>
        </div>
      </form>
      {(await qontoConfigurato()) && (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <form action={verificaQonto} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
              Controlla che le credenziali funzionino: legge nome organizzazione, conti e saldi.
            </span>
            <button type="submit" className="btn secondary" style={{ marginLeft: "auto" }}>Verifica connessione</button>
          </form>
        </div>
      )}

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
