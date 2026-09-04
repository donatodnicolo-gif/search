import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { schedaCliente } from "@/lib/orders";
import { numeriWA, numeroWhatsApp } from "@/lib/whatsapp";
import { inviaWhatsAppSingolo } from "@/lib/actions";
import { euro, segmento } from "@/lib/etichette";
import { sostituisciVariabili } from "@/lib/variabili";
import WaAssistito from "@/components/WaAssistito";

export const dynamic = "force-dynamic";

type Query = { cliente?: string; template?: string; occasione?: string; esito?: string; errore?: string };

// COMPONI WHATSAPP — un messaggio per UNA persona, sui due canali: dall'API
// (numero del marchio, vale la finestra 24h di Meta) o dal WhatsApp
// dell'operatore (wa.me col testo pronto — per il clienteling spesso è meglio).
export default async function ComponiWhatsApp({ searchParams }: { searchParams: Promise<Query> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const codice = sp.cliente?.trim();

  const [scheda, templates, numeri] = await Promise.all([
    codice ? schedaCliente(codice) : Promise.resolve(null),
    prisma.templateWhatsApp.findMany({ orderBy: { nome: "asc" } }),
    numeriWA(),
  ]);

  const cliente = scheda?.ok ? scheda.dati : null;
  const seg = cliente ? segmento(cliente.segmento) : null;
  const numero = numeroWhatsApp(cliente?.telefono);
  const template = templates.find((t) => t.id === sp.template);
  const testo = template && cliente ? sostituisciVariabili(template.testo, cliente, null) : "";

  const linkTemplate = (id: string) => {
    const p = new URLSearchParams();
    if (codice) p.set("cliente", codice);
    if (sp.occasione) p.set("occasione", sp.occasione);
    if (id) p.set("template", id);
    return `/whatsapp/componi?${p}`;
  };

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Scrivi su WhatsApp</h1>
          <p className="page-sub">
            {cliente
              ? `A ${cliente.nome ?? cliente.telefono}: rileggi, ritocca, e scegli da dove mandare.`
              : "Arriva qui dalla scheda di un cliente per avere numero e testo già pronti."}
          </p>
        </div>
        <a className="btn ghost" href={codice ? `/clienti/${encodeURIComponent(codice)}` : "/whatsapp"}>← Indietro</a>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">Messaggio partito.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}
      {codice && scheda && !scheda.ok ? <div className="errore-card">{scheda.errore}</div> : null}
      {cliente && !numero ? (
        <div className="errore-card">
          Il numero di questo cliente ({cliente.telefono ?? "assente"}) non è utilizzabile su WhatsApp: manca o non ha
          un prefisso riconoscibile.
        </div>
      ) : null}

      <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", alignItems: "start" }}>
        <div className="card">
          <form action={inviaWhatsAppSingolo}>
            <input type="hidden" name="chiaveCliente" value={codice ?? ""} />
            <input type="hidden" name="nomeCliente" value={cliente?.nome ?? ""} />
            <input type="hidden" name="torna" value={codice ? `/clienti/${encodeURIComponent(codice)}` : "/whatsapp"} />
            <div className="campo">
              <label>Numero <span className="ob">*</span></label>
              <input type="text" name="telefono" defaultValue={numero ?? cliente?.telefono ?? ""} placeholder="+39…" required />
            </div>
            <div className="campo">
              <label>Testo <span className="ob">*</span></label>
              <textarea name="testo" rows={7} defaultValue={testo} required placeholder="Breve e caldo: due frasi, come a un amico che si rispetta." />
            </div>
            <div className="campo">
              <label>Se parte dall&apos;API: da quale numero</label>
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
            </div>
            <div className="form-piede" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <button className="btn" type="submit" disabled={!numeri.ok}>
                Invia dall&apos;API (numero del marchio)
              </button>
              {numero && cliente ? (
                <WaAssistito
                  chiaveCliente={codice ?? ""}
                  nomeCliente={cliente.nome ?? ""}
                  telefono={numero}
                  testo={testo || ""}
                  etichetta="Apri sul TUO WhatsApp"
                />
              ) : null}
            </div>
            <p className="terziario piccolo" style={{ marginTop: 8 }}>
              L&apos;API consegna solo a chi ci ha scritto nelle ultime 24 ore (regola di Meta). «Apri sul TUO WhatsApp»
              non ha limiti: la chat si apre col testo pronto e la mandi tu. NB: il testo del bottone è quello del
              template scelto — se lo ritocchi qui sopra, per il canale assistito riscegli il template dopo il ritocco.
            </p>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {cliente ? (
            <div className="card">
              <div className="card-titolo" style={{ fontSize: 16 }}>{cliente.nome ?? cliente.telefono}</div>
              <div className="card-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {seg ? (
                  <span className="badge colorato" style={{ ["--badge-colore" as string]: seg.colore }}>
                    <span className="dot" />
                    {seg.nome}
                  </span>
                ) : null}
                <span>
                  {euro(cliente.speso)} · {cliente.ordini} ordini
                </span>
              </div>
              {cliente.riepilogo?.gusti ? (
                <p className="secondario" style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <span className="chip oro">Gusti</span> {cliente.riepilogo.gusti}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Template</div>
            {templates.length === 0 ? (
              <p className="secondario piccolo">
                Nessuno: <a className="link-quieto" href="/whatsapp">creane uno →</a>
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {templates.map((t) => (
                  <a
                    key={t.id}
                    className={`filtro-pillola${template?.id === t.id ? " attivo" : ""}`}
                    href={linkTemplate(t.id)}
                    style={{ textAlign: "left" }}
                  >
                    {t.nome}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
