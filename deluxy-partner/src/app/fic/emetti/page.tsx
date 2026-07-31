import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { riepilogoPartner } from "@/lib/queries";
import { euro } from "@/lib/format";
import { BottoneInvio } from "@/components/BottoneInvio";
import { nomeMese } from "@/lib/calc";
import {
  ficStato,
  ficClientiFatturabiliCached,
  ficEntityUltimaFattura,
  ficCreaFattura,
  ficMetodiPagamento,
  type FicEntity,
} from "@/lib/fic";
import { suggerisciClienteFic } from "@/lib/fic-cliente";

export const dynamic = "force-dynamic";

// Anteprima ed emissione della fattura commissioni su Fatture in Cloud.
// La fattura viene creata NON inviata: il controllo e l'invio allo SDI
// restano su Fatture in Cloud. Il numero assegnato torna nell'app da solo.
async function emetti(partnerId: string, anno: number, mese: number, fd: FormData) {
  "use server";
  const clienteVal = String(fd.get("cliente") ?? "").trim();
  const imponibile = parseFloat(String(fd.get("imponibile") ?? "").replace(",", "."));
  const descrizione = String(fd.get("descrizione") ?? "").trim();
  const back = `/fic/emetti?partnerId=${partnerId}&anno=${anno}&mese=${mese}`;
  if (!clienteVal || !imponibile || imponibile <= 0 || !descrizione) {
    redirect(back + "&errore=" + encodeURIComponent("Compila cliente, descrizione e imponibile."));
  }

  // Il soggetto può stare in rubrica (`id:`) oppure comparire solo come
  // intestatario di fatture passate (`nome:`): in quel secondo caso i dati
  // fiscali si riprendono dall'ultima fattura e viaggiano con la nuova, senza
  // doverlo prima censire in rubrica.
  let clienteId: number | undefined;
  let entity: FicEntity | undefined;
  if (clienteVal.startsWith("id:")) {
    clienteId = parseInt(clienteVal.slice(3)) || undefined;
  } else if (clienteVal.startsWith("nome:")) {
    const nome = clienteVal.slice(5);
    entity = (await ficEntityUltimaFattura(nome)) ?? { name: nome };
  }
  if (!clienteId && !entity) {
    redirect(back + "&errore=" + encodeURIComponent("Scegli il cliente dall'elenco."));
  }

  let numero: string;
  try {
    const res = await ficCreaFattura({
      clienteId,
      entity,
      descrizione,
      imponibile,
      visibleSubject: `Commissioni ${nomeMese(mese)} ${anno}`,
      metodoPagamentoId: Number(fd.get("metodoPagamento")) || undefined,
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
  const metodi = fic.collegato ? await ficMetodiPagamento().catch(() => []) : [];
  const { mesi } = await riepilogoPartner(partnerId, anno);
  const r = mesi[mese - 1].riepilogo;
  const saldo = mesi[mese - 1].saldo;

  // Elenco dei soggetti FATTURABILI: la rubrica clienti di FIC più gli
  // intestatari delle fatture già emesse. Con la sola rubrica qui mancavano i
  // due terzi dei partner riconciliati (53 nomi in rubrica contro 112 intestati).
  let clienti: Awaited<ReturnType<typeof ficClientiFatturabiliCached>> = [];
  let erroreFic: string | null = null;
  if (fic.collegato) {
    try {
      clienti = await ficClientiFatturabiliCached();
    } catch (e) {
      erroreFic = (e as Error).message;
    }
  }
  // pre-selezione del cliente: prima la riconciliazione già confermata, poi la
  // somiglianza dei nomi (vedi src/lib/fic-cliente.ts)
  const scelta = await suggerisciClienteFic(partner, clienti);
  const suggerito = scelta.cliente;

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
              <select name="cliente" required defaultValue={suggerito?.valore ?? ""}>
                <option value="" disabled>Seleziona il cliente…</option>
                {clienti.map((c) => (
                  <option key={c.valore} value={c.valore}>
                    {c.nome}
                    {c.piva ? ` — P.IVA ${c.piva}` : ""}
                    {c.inRubrica ? "" : " · già fatturato (non in rubrica)"}
                    {suggerito?.valore === c.valore ? "  ← suggerito" : ""}
                  </option>
                ))}
              </select>
              {!suggerito ? (
                <p style={{ fontSize: 12.5, color: "var(--orange)", marginTop: 6 }}>
                  Nessun cliente combacia col nome del partner, e per questo partner non risulta una
                  riconciliazione confermata: scegli qui il cliente (oppure fallo una volta sola in{" "}
                  <Link href="/registrazioni/riconciliazione" style={{ color: "var(--blue)" }}>
                    Riconciliazione clienti
                  </Link>
                  , e da lì in poi arriva già scelto).
                </p>
              ) : scelta.da === "riconciliazione" ? (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Preso dalla <strong style={{ color: "var(--text)" }}>riconciliazione confermata</strong>: su
                  Fatture in Cloud questo partner è «{scelta.ficNome}».
                  {scelta.alternative.length > 0 &&
                    ` Risulta riconciliato anche con ${scelta.alternative
                      .map((a) => `«${a.nome}»`)
                      .join(", ")}: se la fattura va intestata a quello, cambialo qui.`}
                </p>
              ) : scelta.da === "storico" ? (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  È l&apos;intestatario delle <strong style={{ color: "var(--text)" }}>fatture commissioni
                  già emesse</strong> a questo partner: su Fatture in Cloud è «{scelta.ficNome}».
                </p>
              ) : (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Scelto per somiglianza del nome, non da una riconciliazione né da fatture passate:
                  controlla che sia il cliente giusto.
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
            <div>
              {/* Obbligatorio sulla fattura elettronica (ModalitaPagamento SDI).
                  Preselezionato sul predefinito di Fatture in Cloud. */}
              <label className="field-label">Metodo di pagamento</label>
              <select name="metodoPagamento" defaultValue={String(metodi.find((m) => m.predefinito)?.id ?? metodi[0]?.id ?? "")}>
                {metodi.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}{m.predefinito ? " (predefinito)" : ""}</option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 14 }}>
            La fattura viene creata su Fatture in Cloud <strong>senza invio allo SDI</strong>: la controlli
            e la invii da lì. Il numero assegnato viene salvato automaticamente nel saldo del mese.
          </p>
          <div className="form-footer">
            <Link href={`/partner/${partnerId}`} className="btn secondary">Annulla</Link>
            <BottoneInvio inCorso="Sto creando la fattura…">Crea fattura su Fatture in Cloud</BottoneInvio>
          </div>
        </form>
      )}
    </>
  );
}
