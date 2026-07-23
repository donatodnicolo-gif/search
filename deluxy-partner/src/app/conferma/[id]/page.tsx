import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/format";
import { confermaEsegui, annullaConferma, VALIDITA_MINUTI, TENTATIVI_MASSIMI } from "@/lib/conferme";

export const dynamic = "force-dynamic";

// Pagina di conferma del pagamento: si digita il codice di 6 cifre arrivato via
// email. Finché il codice non è corretto il pagamento NON è registrato.

async function conferma(id: string, fd: FormData) {
  "use server";
  const esito = await confermaEsegui(id, String(fd.get("codice") ?? ""));
  if (!esito.ok) {
    redirect(`/conferma/${id}?errore=${encodeURIComponent(esito.errore)}`);
  }
  for (const p of ["/", "/partner", "/saldi", "/pagamenti", "/scadenzario"]) revalidatePath(p, "layout");
  redirect(`${esito.ritornoUrl ?? "/"}${(esito.ritornoUrl ?? "/").includes("?") ? "&" : "?"}pagato=1`);
}

async function annulla(id: string) {
  "use server";
  await annullaConferma(id);
  redirect("/?annullato=1");
}

export default async function ConfermaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await prisma.confermaPagamento.findUnique({ where: { id } });

  if (!r) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <span className="badge orange"><span className="dot" />Richiesta non trovata</span>
        <p style={{ marginTop: 12 }}><Link href="/" style={{ color: "var(--blue)" }}>Torna alla dashboard</Link></p>
      </div>
    );
  }

  const chiusa = Boolean(r.confermatoIl || r.annullatoIl) || r.scadeIl < new Date();
  const minutiRimasti = Math.max(0, Math.ceil((r.scadeIl.getTime() - Date.now()) / 60000));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Conferma il pagamento</h1>
          <p className="page-caption">
            Per registrare un pagamento serve il codice di 6 cifre mandato via email a{" "}
            <strong>{r.email}</strong>. Finché non lo inserisci, il pagamento non è registrato.
          </p>
        </div>
      </div>

      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.errore)}</span>
        </div>
      )}

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="info-grid">
          <div className="info-item">
            <div className="k">Operazione</div>
            <div className="v" style={{ fontSize: 14 }}>{r.descrizione}</div>
          </div>
          {r.importo != null && (
            <div className="info-item">
              <div className="k">Importo</div>
              <div className="v">{euro(r.importo)}</div>
            </div>
          )}
          <div className="info-item">
            <div className="k">Richiesta da</div>
            <div className="v" style={{ fontSize: 14 }}>{r.richiestaDa ?? "—"}</div>
          </div>
          <div className="info-item">
            <div className="k">Validità</div>
            <div className="v" style={{ fontSize: 14 }}>
              {r.confermatoIl
                ? "già confermata"
                : r.annullatoIl
                  ? "annullata"
                  : minutiRimasti > 0
                    ? `ancora ${minutiRimasti} min`
                    : "scaduta"}
            </div>
          </div>
        </div>

        {r.confermatoIl ? (
          <p style={{ marginTop: 16 }}>
            <span className="badge green"><span className="dot" />Pagamento già confermato e registrato</span>
          </p>
        ) : chiusa ? (
          <p style={{ marginTop: 16, fontSize: 13.5, color: "var(--text-secondary)" }}>
            Questa richiesta non è più valida: torna indietro e rifai il pagamento per ricevere un codice nuovo.
          </p>
        ) : (
          <form action={conferma.bind(null, id)} style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label htmlFor="codice" style={{ display: "block", fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 6 }}>
                Codice ricevuto via email
              </label>
              <input
                id="codice"
                name="codice"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                placeholder="______"
                style={{ width: 160, fontSize: 20, letterSpacing: "0.3em", textAlign: "center", padding: "8px 10px" }}
              />
            </div>
            <button className="btn primary" type="submit">Conferma e registra</button>
            <button className="btn secondary" type="submit" formAction={annulla.bind(null, id)}>Annulla</button>
          </form>
        )}

        <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-secondary)" }}>
          Il codice vale {VALIDITA_MINUTI} minuti e una volta sola; dopo {TENTATIVI_MASSIMI} tentativi
          sbagliati la richiesta si blocca. Questa app <strong>non esegue bonifici</strong>: la conferma
          serve a registrare in Deluxy Partner un pagamento che avviene in banca.
        </p>
      </div>

      <p style={{ marginTop: 16 }}>
        <Link href={r.ritornoUrl ?? "/"} style={{ color: "var(--blue)", fontSize: 13.5 }}>← Torna indietro senza registrare nulla</Link>
      </p>
    </>
  );
}
