import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { ivato } from "@/lib/calc";
import { testoSollecito } from "@/lib/sollecito";
import { inviaEmail, smtpConfigurato } from "@/lib/mail";

export const dynamic = "force-dynamic";

// Anteprima e invio del sollecito di pagamento per una fattura aperta.
// L'email parte SOLO quando l'operatore preme "Invia sollecito", dopo aver
// rivisto destinatario, oggetto e testo. In alternativa "Apri nel client di
// posta" prepara la stessa mail nel programma di posta dell'operatore.
async function inviaSollecito(fatturaId: string, fd: FormData) {
  "use server";
  const to = String(fd.get("to") ?? "").trim();
  const subject = String(fd.get("subject") ?? "").trim();
  const text = String(fd.get("text") ?? "").trim();
  const da = String(fd.get("da") ?? "").trim(); // "partner" = tornato dalla scheda
  if (!to || !subject || !text) redirect(`/solleciti/${fatturaId}?errore=campi`);

  try {
    await inviaEmail({ to, subject, text });
  } catch (e) {
    redirect(`/solleciti/${fatturaId}?errore=${encodeURIComponent((e as Error).message)}`);
  }

  await prisma.fatturaServizio.update({
    where: { id: fatturaId },
    data: { sollecitoInviatoIl: new Date() },
  });
  // se il destinatario non era salvato, lo memorizziamo come contatto
  // amministrativo del partner (è l'indirizzo a cui si chiedono i pagamenti)
  const fattura = await prisma.fatturaServizio.findUnique({
    where: { id: fatturaId },
    include: { partner: true },
  });
  if (fattura && !fattura.partner.ammEmail) {
    await prisma.partner.update({
      where: { id: fattura.partnerId },
      data: { ammEmail: to, ...(fattura.partner.email ? {} : { email: to }) },
    });
  }
  revalidatePath("/scadenzario");
  revalidatePath(`/partner/${fattura?.partnerId ?? ""}`, "layout");
  // tornando dalla scheda partner si resta lì, altrimenti allo scadenzario
  redirect(da === "partner" && fattura ? `/partner/${fattura.partnerId}?sollecito=ok` : "/scadenzario?sollecito=ok");
}

async function segnaSollecitoManuale(fatturaId: string) {
  "use server";
  await prisma.fatturaServizio.update({
    where: { id: fatturaId },
    data: { sollecitoInviatoIl: new Date() },
  });
  revalidatePath("/scadenzario");
  redirect("/scadenzario?sollecito=ok");
}

export default async function SollecitoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; da?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const daPartner = sp.da === "partner";
  const fattura = await prisma.fatturaServizio.findUnique({
    where: { id },
    include: { partner: true, tipologia: true },
  });
  if (!fattura) notFound();

  const { oggetto, corpo } = testoSollecito(fattura);
  const smtp = await smtpConfigurato();
  const action = inviaSollecito.bind(null, id);
  const manuale = segnaSollecitoManuale.bind(null, id);
  // destinatario predefinito: il contatto amministrativo (chi paga), poi l'email generica
  const destinatario = fattura.partner.ammEmail ?? fattura.partner.email ?? "";
  const mailto = `mailto:${encodeURIComponent(destinatario)}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;

  return (
    <>
      <div className="page-head">
        <div>
          <Link
            href={daPartner ? `/partner/${fattura.partnerId}` : "/scadenzario"}
            className="btn secondary small"
            style={{ marginBottom: 10 }}
          >
            ← {daPartner ? "Torna alla scheda partner" : "Torna allo scadenzario"}
          </Link>
          <h1 className="page-title">Sollecito di pagamento</h1>
          <p className="page-caption">
            {fattura.partner.nome} — fatt. {fattura.numero ?? "s.n."} · {euro(ivato(fattura))} IVA incl.
            {fattura.scadenza ? ` · scaduta il ${dataIt(fattura.scadenza)}` : ""}
            {fattura.sollecitoInviatoIl ? ` · ultimo sollecito il ${dataIt(fattura.sollecitoInviatoIl)}` : ""}
          </p>
        </div>
      </div>

      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>
            {sp.errore === "campi" ? "Compila destinatario, oggetto e testo." : decodeURIComponent(sp.errore)}
          </span>
        </div>
      )}

      {!smtp && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="badge orange" style={{ marginBottom: 8 }}><span className="dot" />Invio diretto non configurato</span>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 8 }}>
            Per inviare dall&apos;app, configura la casella email in{" "}
            <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni → Email solleciti</Link>{" "}
            (con Register.it: server <code>authsmtp.deluxy.it</code>, porta 587, credenziali del servizio SMTP autenticato).
            Nel frattempo puoi usare &laquo;Apri nel client di posta&raquo; qui sotto: prepara la mail nel tuo programma
            di posta, la invii da lì e poi la segni come inviata.
          </p>
        </div>
      )}

      <form action={action} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Destinatario <span className="req">*</span></label>
            <input
              type="email"
              name="to"
              required
              defaultValue={destinatario}
              placeholder={destinatario ? "" : "email amministrazione (verrà salvata sul partner)"}
            />
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              {fattura.partner.ammEmail ? (
                <>
                  Contatto amministrativo{fattura.partner.ammNome ? ` (${fattura.partner.ammNome})` : ""}.{" "}
                  <Link href={`/partner/${fattura.partnerId}`} style={{ color: "var(--blue)" }}>Cambialo nella scheda partner</Link>.
                </>
              ) : (
                <>
                  Nessun contatto amministrativo impostato: si usa l&apos;email generale del partner.{" "}
                  <Link href={`/partner/${fattura.partnerId}`} style={{ color: "var(--blue)" }}>Impostalo qui</Link>.
                </>
              )}
            </p>
          </div>
          <input type="hidden" name="da" value={sp.da ?? ""} />
          <div className="full">
            <label className="field-label">Oggetto <span className="req">*</span></label>
            <input type="text" name="subject" required defaultValue={oggetto} />
          </div>
          <div className="full">
            <label className="field-label">Testo <span className="req">*</span></label>
            <textarea name="text" rows={13} required defaultValue={corpo} style={{ fontSize: 14, lineHeight: 1.55 }} />
          </div>
        </div>
        <div className="form-footer" style={{ alignItems: "center" }}>
          <a className="btn secondary" href={mailto}>Apri nel client di posta</a>
          <button className="btn primary" type="submit" disabled={!smtp} title={smtp ? "Invia l'email al partner" : "Configura SMTP per inviare dall'app"}>
            Invia sollecito
          </button>
        </div>
      </form>

      <form action={manuale} style={{ marginTop: 12, textAlign: "right" }}>
        <button className="btn secondary small" type="submit" title="Se hai inviato la mail dal tuo client di posta, registra qui la data del sollecito">
          Ho inviato dal mio client — segna come inviato
        </button>
      </form>
    </>
  );
}
