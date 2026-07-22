import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { riepilogoPartner } from "@/lib/queries";
import { euro } from "@/lib/format";
import { nomeMese } from "@/lib/calc";
import { ficStato, ficClientiCached, ficCreaFattura } from "@/lib/fic";
import { matchPartner } from "@/lib/riconciliazione";
import type { Partner } from "@prisma/client";

export const dynamic = "force-dynamic";

// Anteprima ed emissione della fattura commissioni su Fatture in Cloud.
// La fattura viene creata NON inviata: il controllo e l'invio allo SDI
// restano su Fatture in Cloud. Il numero assegnato torna nell'app da solo.
async function emetti(partnerId: string, anno: number, mese: number, fd: FormData) {
  "use server";
  const clienteId = parseInt(String(fd.get("clienteId") ?? ""));
  const imponibile = parseFloat(String(fd.get("imponibile") ?? "").replace(",", "."));
  const descrizione = String(fd.get("descrizione") ?? "").trim();
  const back = `/fic/emetti?partnerId=${partnerId}&anno=${anno}&mese=${mese}`;
  if (!clienteId || !imponibile || imponibile <= 0 || !descrizione) {
    redirect(back + "&errore=" + encodeURIComponent("Compila cliente, descrizione e imponibile."));
  }

  let numero: string;
  try {
    const res = await ficCreaFattura({
      clienteId,
      descrizione,
      imponibile,
      visibleSubject: `Commissioni ${nomeMese(mese)} ${anno}`,
    });
    numero = res.numero;
  } catch (e) {
    redirect(back + "&errore=" + encodeURIComponent((e as Error).message));
  }

  await prisma.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    create: { partnerId, anno, mese, commFattEmessa: true, commFattNumero: numero },
    update: { commFattEmessa: true, commFattNumero: numero },
  });
  for (const p of ["/", "/saldi", "/scadenzario", `/partner/${partnerId}`]) revalidatePath(p, "layout");
  redirect(`/partner/${partnerId}?fic=${encodeURIComponent(numero)}`);
}

export default async function EmettiPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string; anno?: string; mese?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const partnerId = sp.partnerId ?? "";
  const anno = parseInt(sp.anno ?? "") || new Date().getFullYear();
  const mese = parseInt(sp.mese ?? "") || new Date().getMonth() + 1;

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) notFound();

  const fic = await ficStato();
  const { mesi } = await riepilogoPartner(partnerId, anno);
  const r = mesi[mese - 1].riepilogo;
  const saldo = mesi[mese - 1].saldo;

  let clienti: Awaited<ReturnType<typeof ficClientiCached>> = [];
  let erroreFic: string | null = null;
  if (fic.collegato) {
    try {
      clienti = await ficClientiCached();
    } catch (e) {
      erroreFic = (e as Error).message;
    }
  }
  // pre-selezione del cliente: la ragione sociale FIC deve comparire nel nome
  // partner (es. "MOSCATI SRL" in "BELLAVIA (MOSCATI SRL)") o viceversa
  const comePartner = (nome: string) => ({ nome }) as Partner;
  const suggerito =
    clienti.find((c) => matchPartner(partner.nome, [comePartner(c.name)]) != null) ??
    clienti.find((c) => matchPartner(c.name, [partner]) != null) ??
    null;

  const descrizioneDefault = `Commissioni su vendite ${nomeMese(mese)} ${anno}${partner.feePercent != null ? ` (fee ${partner.feePercent}%)` : ""}`;
  const action = emetti.bind(null, partnerId, anno, mese);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href={`/partner/${partnerId}`} className="btn secondary small" style={{ marginBottom: 10 }}>
            ← Torna alla scheda
          </Link>
          <h1 className="page-title">Emetti fattura commissioni</h1>
          <p className="page-caption">
            {partner.nome} — {nomeMese(mese)} {anno} · vendite {euro(r.vendite)} · commissioni {euro(r.commissioni)}
            {saldo?.commFattEmessa && ` · già emessa: ${saldo.commFattNumero ?? "s.n."}`}
          </p>
        </div>
      </div>

      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.errore)}</span>
        </div>
      )}
      {saldo?.commFattEmessa && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge orange"><span className="dot" />
            Per questo mese risulta già emessa la fattura {saldo.commFattNumero ?? "s.n."}: emettendone un&apos;altra, il numero verrà sovrascritto nell&apos;app.
          </span>
        </div>
      )}

      {!fic.collegato ? (
        <div className="card">
          <span className="badge orange"><span className="dot" />Fatture in Cloud non collegato</span>
          <p style={{ marginTop: 10, fontSize: 14 }}>
            Vai in <Link href="/impostazioni" style={{ color: "var(--blue)" }}>Impostazioni</Link> e premi Collega.
          </p>
        </div>
      ) : erroreFic ? (
        <div className="card" style={{ borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{erroreFic}</span>
        </div>
      ) : (
        <form action={action} className="card">
          <div className="form-grid">
            <div className="full">
              <label className="field-label">Cliente su Fatture in Cloud ({fic.companyName}) <span className="req">*</span></label>
              <select name="clienteId" required defaultValue={suggerito?.id ?? ""}>
                <option value="" disabled>Seleziona il cliente…</option>
                {clienti
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, "it"))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.vat_number ? ` — P.IVA ${c.vat_number}` : ""}{suggerito?.id === c.id ? "  ← suggerito" : ""}
                    </option>
                  ))}
              </select>
              {!suggerito && (
                <p style={{ fontSize: 12.5, color: "var(--orange)", marginTop: 6 }}>
                  Nessun cliente combacia col nome del partner: scegli manualmente (o crealo prima su Fatture in Cloud).
                </p>
              )}
            </div>
            <div className="full">
              <label className="field-label">Descrizione riga <span className="req">*</span></label>
              <input type="text" name="descrizione" required defaultValue={descrizioneDefault} />
            </div>
            <div>
              <label className="field-label">Imponibile € (commissioni netto IVA) <span className="req">*</span></label>
              <input type="number" name="imponibile" step="0.01" min="0.01" required defaultValue={+r.commissioni.toFixed(2)} />
            </div>
            <div>
              <label className="field-label">Totale con IVA 22%</label>
              <input type="text" disabled value={euro(r.commissioni * 1.22)} />
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 14 }}>
            La fattura viene creata su Fatture in Cloud <strong>senza invio allo SDI</strong>: la controlli
            e la invii da lì. Il numero assegnato viene salvato automaticamente nel saldo del mese.
          </p>
          <div className="form-footer">
            <Link href={`/partner/${partnerId}`} className="btn secondary">Annulla</Link>
            <button type="submit" className="btn primary">Crea fattura su Fatture in Cloud</button>
          </div>
        </form>
      )}
    </>
  );
}
