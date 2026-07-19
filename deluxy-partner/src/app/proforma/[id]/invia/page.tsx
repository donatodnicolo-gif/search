import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { euro, dataIt } from "@/lib/format";
import { totaliProForma, testoEmailProForma, rifProForma } from "@/lib/proforma";
import { inviaEmail, smtpConfigurato } from "@/lib/mail";

export const dynamic = "force-dynamic";

// Anteprima e invio della pro-forma via email. L'email parte SOLO quando
// l'operatore preme «Invia», dopo aver rivisto destinatario, oggetto e testo.
// In alternativa «Apri nel client di posta» prepara la stessa mail nel
// programma dell'operatore. All'invio il documento passa allo stato "inviata".
async function invia(proFormaId: string, fd: FormData) {
  "use server";
  const to = String(fd.get("to") ?? "").trim();
  const subject = String(fd.get("subject") ?? "").trim();
  const text = String(fd.get("text") ?? "").trim();
  if (!to || !subject || !text) redirect(`/proforma/${proFormaId}/invia?errore=campi`);

  try {
    await inviaEmail({ to, subject, text });
  } catch (e) {
    redirect(`/proforma/${proFormaId}/invia?errore=${encodeURIComponent((e as Error).message)}`);
  }

  await prisma.proForma.update({
    where: { id: proFormaId },
    data: { stato: "inviata", inviataIl: new Date(), inviataA: to },
  });
  // se il destinatario non era in anagrafica, lo memorizziamo
  const pf = await prisma.proForma.findUnique({
    where: { id: proFormaId },
    include: { partner: true },
  });
  if (pf && !pf.partner.email) {
    await prisma.partner.update({ where: { id: pf.partnerId }, data: { email: to } });
  }
  revalidatePath("/proforma", "layout");
  redirect(`/proforma/${proFormaId}?inviata=1`);
}

async function segnaInviataManuale(proFormaId: string, fd: FormData) {
  "use server";
  const to = String(fd.get("to") ?? "").trim();
  await prisma.proForma.update({
    where: { id: proFormaId },
    data: { stato: "inviata", inviataIl: new Date(), ...(to ? { inviataA: to } : {}) },
  });
  revalidatePath("/proforma", "layout");
  redirect(`/proforma/${proFormaId}?inviata=1`);
}

export default async function InviaProFormaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const pf = await prisma.proForma.findUnique({
    where: { id },
    include: { partner: true, righe: { orderBy: { ordine: "asc" } } },
  });
  if (!pf) notFound();
  if (pf.stato === "annullata" || pf.stato === "fatturata") redirect(`/proforma/${id}`);

  const tot = totaliProForma(pf.righe);
  const { oggetto, corpo } = testoEmailProForma(pf, pf.righe);
  const smtp = await smtpConfigurato();
  const mailto = `mailto:${encodeURIComponent(pf.partner.email ?? "")}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href={`/proforma/${id}`} className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna al documento
          </Link>
          <h1 className="page-title">Invia {rifProForma(pf)}</h1>
          <p className="page-caption">
            {pf.partner.nome} · {euro(tot.totale)} IVA inclusa
            {pf.inviataIl ? ` · già inviata il ${dataIt(pf.inviataIl)}` : ""}
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
          <span className="badge orange"><span className="dot" />Invio diretto non configurato</span>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 8 }}>
            Per inviare dall&apos;app, configura la casella email in{" "}
            <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni → Email (SMTP)</Link>.
            Nel frattempo usa &laquo;Apri nel client di posta&raquo;: prepari la mail nel tuo programma, la invii
            da lì e poi la segni come inviata. Per allegare il PDF: dal documento, &laquo;Stampa / PDF&raquo;.
          </p>
        </div>
      )}

      <form action={invia.bind(null, id)} className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Destinatario <span className="req">*</span></label>
            <input
              type="email"
              name="to"
              required
              defaultValue={pf.partner.email ?? ""}
              placeholder={pf.partner.email ? "" : "email del partner (verrà salvata in anagrafica)"}
            />
          </div>
          <div className="full">
            <label className="field-label">Oggetto <span className="req">*</span></label>
            <input type="text" name="subject" required defaultValue={oggetto} />
          </div>
          <div className="full">
            <label className="field-label">Testo <span className="req">*</span></label>
            <textarea name="text" rows={16} required defaultValue={corpo} style={{ fontSize: 14, lineHeight: 1.55 }} />
          </div>
        </div>
        <div className="form-footer" style={{ alignItems: "center" }}>
          <a className="btn secondary" href={mailto}>Apri nel client di posta</a>
          <button className="btn primary" type="submit" disabled={!smtp} title={smtp ? "Invia l'email al partner" : "Configura SMTP per inviare dall'app"}>
            Invia pro-forma
          </button>
        </div>
      </form>

      <form action={segnaInviataManuale.bind(null, id)} style={{ marginTop: 12, textAlign: "right" }}>
        <button className="btn secondary small" type="submit" title="Se hai inviato dal tuo client di posta, registra qui l'invio">
          Ho inviato dal mio client — segna come inviata
        </button>
      </form>
    </>
  );
}
