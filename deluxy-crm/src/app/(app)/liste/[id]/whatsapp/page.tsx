import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { numeriWA, numeroWhatsApp } from "@/lib/whatsapp";
import { inviaWhatsAppALista } from "@/lib/actions";
import { sostituisciVariabili } from "@/lib/variabili";
import WaAssistito from "@/components/WaAssistito";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Query = { template?: string; dettaglio?: string; errore?: string };

// WHATSAPP ALLA LISTA — due canali, spiegati per quello che sono:
// · dall'API parte dal numero Business del marchio, ma Meta consegna il testo
//   libero SOLO a chi ci ha scritto nelle ultime 24 ore (a freddo rifiuta);
// · il canale assistito apre le chat sul WhatsApp dell'operatore, col testo
//   già personalizzato: un clic a persona, nessun limite, tono personale.
export default async function WhatsAppAllaLista({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [lista, templates, numeri] = await Promise.all([
    prisma.listaClienti.findUnique({ where: { id }, include: { membri: { orderBy: { speso: "desc" } } } }),
    prisma.templateWhatsApp.findMany({ orderBy: { nome: "asc" } }),
    numeriWA(),
  ]);
  if (!lista) notFound();

  const template = templates.find((t) => t.id === sp.template) ?? templates[0];
  const destinatari = lista.membri
    .map((m) => ({ m, numero: numeroWhatsApp(m.telefono) }))
    .filter((x): x is { m: (typeof lista.membri)[number]; numero: string } => Boolean(x.numero));
  const senzaNumero = lista.membri.length - destinatari.length;

  const testoPer = (m: (typeof lista.membri)[number]) =>
    template
      ? sostituisciVariabili(
          template.testo,
          { nome: m.nome || null, citta: m.citta || null, segmento: m.segmento, ordini: m.ordini, speso: m.speso, ultimoOrdine: m.ultimoOrdine },
          null,
        )
      : "";

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">WhatsApp alla lista</h1>
          <p className="page-sub">
            «{lista.nome}» — {destinatari.length} numeri utilizzabili su {lista.membri.length}
            {senzaNumero ? ` (${senzaNumero} senza numero o senza prefisso)` : ""}. Ogni messaggio parte personalizzato.
          </p>
        </div>
        <a className="btn ghost" href={`/liste/${id}`}>← Lista</a>
      </div>

      {sp.dettaglio ? <div className="ok-card">{sp.dettaglio}</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      {templates.length === 0 ? (
        <div className="card vuoto">
          <h3>Serve un template WhatsApp</h3>
          <p>
            Breve, caldo, con le {"{{variabili}}"}: <a className="link-quieto" href="/whatsapp">creane uno →</a>
          </p>
        </div>
      ) : (
        <>
          <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", alignItems: "start", marginBottom: 16 }}>
            <div className="card">
              <div className="card-titolo" style={{ fontSize: 16 }}>Template</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {templates.map((t) => (
                  <a
                    key={t.id}
                    className={`filtro-pillola${template?.id === t.id ? " attivo" : ""}`}
                    href={`/liste/${id}/whatsapp?template=${t.id}`}
                    style={{ textAlign: "left" }}
                  >
                    {t.nome}
                  </a>
                ))}
              </div>

              <div className="card-titolo" style={{ fontSize: 16 }}>Invio dall&apos;API (numero del marchio)</div>
              <div className="card-sub">
                Arriva solo a chi ci ha scritto nelle ultime 24 ore: è la regola di Meta, non nostra. I rifiutati si
                recuperano col canale assistito qui sotto.
              </div>
              <form action={inviaWhatsAppALista}>
                <input type="hidden" name="listaId" value={id} />
                <input type="hidden" name="templateId" value={template?.id ?? ""} />
                <div className="campo">
                  <label>Da quale numero</label>
                  <select name="numeroId" defaultValue="">
                    <option value="">Quello predefinito del Customer Service</option>
                    {numeri.ok
                      ? numeri.numeri
                          .filter((n) => n.attivo)
                          .map((n) => (
                            <option key={n.phoneNumberId} value={n.phoneNumberId}>
                              {n.brand || n.nome} · {n.numeroVisibile}
                            </option>
                          ))
                      : null}
                  </select>
                  {!numeri.ok ? <span className="aiuto">{numeri.errore}</span> : null}
                </div>
                <button className="btn" type="submit" disabled={!template || destinatari.length === 0}>
                  Prova l&apos;invio a {destinatari.length} numeri
                </button>
              </form>
            </div>

            <div className="card">
              <div className="card-titolo" style={{ fontSize: 16 }}>Anteprima (sul primo della lista)</div>
              {template && destinatari[0] ? (
                <>
                  <div className="card-sub">
                    A {destinatari[0].m.nome || destinatari[0].numero}
                  </div>
                  <p className="secondario" style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {testoPer(destinatari[0].m)}
                  </p>
                </>
              ) : (
                <p className="secondario piccolo">Nessun numero utilizzabile in questa lista.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-titolo">Canale assistito — dal tuo WhatsApp, un clic a persona</div>
            <div className="card-sub">
              Ogni riga apre la chat col testo già scritto e personalizzato: lo mandi tu, dal tuo telefono o WhatsApp
              Web. Niente finestra 24h, tono personale — per i clienti top è il canale giusto.
            </div>
            <div className="timeline">
              {destinatari.map(({ m, numero }) => (
                <div className="timeline-voce" key={m.id}>
                  <div className="timeline-corpo">
                    <div className="timeline-titolo">{m.nome || numero}</div>
                    <div className="timeline-quando">{numero}{m.citta ? ` · ${m.citta}` : ""}</div>
                  </div>
                  <div style={{ alignSelf: "center" }}>
                    <WaAssistito
                      chiaveCliente={m.chiaveCliente}
                      nomeCliente={m.nome}
                      telefono={numero}
                      testo={testoPer(m)}
                      listaId={id}
                      mini
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
