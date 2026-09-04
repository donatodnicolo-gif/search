import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { schedaCliente } from "@/lib/orders";
import { configurazioneMail } from "@/lib/mail";
import { inviaMailPersonalizzata } from "@/lib/actions";
import { euro, segmento } from "@/lib/etichette";
import { primoNome, sostituisciVariabili } from "@/lib/variabili";

export const dynamic = "force-dynamic";

type Query = {
  cliente?: string;
  evento?: string;
  invito?: string;
  template?: string;
  occasione?: string;
  ordinelink?: string;
  errore?: string;
};

// COMPONI — una mail per UNA persona. Il template si sceglie, le variabili si
// riempiono coi dati veri (cliente, evento), e il testo si rilegge PRIMA di
// inviare: la personalizzazione sbagliata è peggio della mail generica.
export default async function Componi({ searchParams }: { searchParams: Promise<Query> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const codice = sp.cliente?.trim();

  const [scheda, templates, evento, config] = await Promise.all([
    codice ? schedaCliente(codice) : Promise.resolve(null),
    prisma.templateMail.findMany({ orderBy: { nome: "asc" } }),
    sp.evento ? prisma.evento.findUnique({ where: { id: sp.evento } }) : Promise.resolve(null),
    configurazioneMail(),
  ]);

  const cliente = scheda?.ok ? scheda.dati : null;
  const seg = cliente ? segmento(cliente.segmento) : null;
  const ev = evento
    ? { titolo: evento.titolo, dataInizio: evento.dataInizio, luogo: evento.luogo, dressCode: evento.dressCode }
    : null;

  // Template scelto (o suggerito dal contesto): l'anteprima arriva già coi
  // dati veri, pronta da rileggere e ritoccare.
  const template =
    templates.find((t) => t.id === sp.template) ??
    (sp.evento ? templates.find((t) => t.nome.toLowerCase().includes("invito")) : undefined) ??
    (sp.occasione ? templates.find((t) => t.nome.toLowerCase().includes("auguri")) : undefined);

  let oggetto = template ? sostituisciVariabili(template.oggetto, cliente, ev) : "";
  let corpo = template ? sostituisciVariabili(template.corpo, cliente, ev) : "";
  if (!template && sp.occasione && cliente) {
    const nome = primoNome(cliente.nome) || "";
    oggetto = `Un pensiero per ${sp.occasione.toLowerCase()}`;
    corpo = `Gentile ${nome || "cliente"},\n\n`;
  }
  // Arrivati qui dal «Nuovo ordine»: la mail porta il link di pagamento. Il
  // link non è salvato da nessuna parte, viaggia solo in questo passaggio.
  const ordinelink = sp.ordinelink?.trim();
  if (ordinelink && /^https:\/\//.test(ordinelink)) {
    const nome = primoNome(cliente?.nome) || "";
    if (!oggetto) oggetto = "Il suo ordine Deluxy — link per il pagamento";
    corpo =
      `Gentile ${nome || "cliente"},\n\n` +
      `come concordato, ecco il collegamento riservato per completare il suo ordine:\n\n${ordinelink}\n\n` +
      `Basta un minuto, con qualunque carta. Per ogni desiderio o modifica siamo qui.\n\n` +
      `Con i più cordiali saluti,\nil team Deluxy`;
  }

  const linkTemplate = (id: string) => {
    const p = new URLSearchParams();
    if (codice) p.set("cliente", codice);
    if (sp.evento) p.set("evento", sp.evento);
    if (sp.invito) p.set("invito", sp.invito);
    if (sp.occasione) p.set("occasione", sp.occasione);
    if (ordinelink) p.set("ordinelink", ordinelink);
    if (id) p.set("template", id);
    return `/mail/componi?${p}`;
  };

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Scrivi una mail</h1>
          <p className="page-sub">
            {cliente
              ? `A ${cliente.nome ?? cliente.email}: le variabili del template sono già riempite coi suoi dati — rileggi, ritocca, invia.`
              : "Scegli un cliente dal libro (o arriva qui da una ricorrenza o da un invito) per avere il testo già personalizzato."}
          </p>
        </div>
        <a className="btn ghost" href={sp.evento ? `/eventi/${sp.evento}` : codice ? `/clienti/${codice}` : "/mail"}>
          ← Indietro
        </a>
      </div>

      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}
      {!config.pronta ? (
        <div className="errore-card">
          L&apos;invio non è configurato ({config.manca.join(" e ")}): la mail non partirà. Come sistemarlo:{" "}
          <a className="link-quieto" href="/impostazioni">Impostazioni</a>.
        </div>
      ) : null}
      {codice && scheda && !scheda.ok ? <div className="errore-card">{scheda.errore}</div> : null}

      <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)" }}>
        <div className="card">
          <form action={inviaMailPersonalizzata}>
            <input type="hidden" name="chiaveCliente" value={codice ?? ""} />
            <input type="hidden" name="nomeCliente" value={cliente?.nome ?? ""} />
            <input type="hidden" name="invitoId" value={sp.invito ?? ""} />
            <input type="hidden" name="eventoId" value={sp.evento ?? ""} />
            <input type="hidden" name="templateId" value={template?.id ?? ""} />
            <input
              type="hidden"
              name="torna"
              value={sp.evento ? `/eventi/${sp.evento}` : codice ? `/clienti/${codice}` : "/mail"}
            />
            <div className="campo">
              <label>A <span className="ob">*</span></label>
              <input
                type="email"
                name="destinatario"
                defaultValue={cliente?.email ?? ""}
                placeholder="email del destinatario"
                required
              />
            </div>
            <div className="campo">
              <label>Oggetto <span className="ob">*</span></label>
              <input type="text" name="oggetto" defaultValue={oggetto} required />
            </div>
            <div className="campo">
              <label>Testo <span className="ob">*</span></label>
              <textarea name="corpo" rows={14} defaultValue={corpo} required />
              <span className="aiuto">
                Se restano {"{{variabili}}"} nel testo, si riempiono coi dati del cliente al momento dell&apos;invio.
              </span>
            </div>
            <div className="form-piede">
              <button className="btn" type="submit" disabled={!config.pronta}>
                Invia la mail
              </button>
            </div>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {cliente ? (
            <div className="card">
              <div className="card-titolo" style={{ fontSize: 16 }}>{cliente.nome ?? cliente.email}</div>
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
                {cliente.citta ? <span>{cliente.citta}</span> : null}
              </div>
              {cliente.riepilogo?.gusti ? (
                <p className="secondario" style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <span className="chip oro">Gusti</span> {cliente.riepilogo.gusti}
                </p>
              ) : null}
              <p style={{ marginTop: 10 }}>
                <a className="link-quieto" href={`/clienti/${codice}`}>Apri la scheda completa →</a>
              </p>
            </div>
          ) : null}

          {evento ? (
            <div className="card">
              <div className="card-titolo" style={{ fontSize: 16 }}>Per l&apos;evento</div>
              <p style={{ fontSize: 14 }}>{evento.titolo}</p>
              <p className="secondario piccolo">{evento.luogo}</p>
            </div>
          ) : null}

          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Template</div>
            <div className="card-sub">Cambiare template ricompone il testo coi dati del cliente.</div>
            {templates.length === 0 ? (
              <p className="secondario piccolo">
                Nessun template: <a className="link-quieto" href="/mail/template">creane uno →</a>
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
                {template ? (
                  <a className="link-quieto" href={linkTemplate("")} style={{ marginTop: 4 }}>
                    Riparti dal foglio bianco
                  </a>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
