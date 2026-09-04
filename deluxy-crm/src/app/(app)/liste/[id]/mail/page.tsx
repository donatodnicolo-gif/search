import { notFound } from "next/navigation";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { prisma } from "@/lib/db";
import { configurazioneMail } from "@/lib/mail";
import { inviaMailALista } from "@/lib/actions";
import { sostituisciVariabili } from "@/lib/variabili";
import { TornaIndietro } from "@/components/TornaIndietro";

export const dynamic = "force-dynamic";
// Un giro di invii (fino a 150 mail, una per volta) può durare minuti.
export const maxDuration = 300;

type Query = { template?: string; esito?: string; errore?: string; dettaglio?: string };

// MAIL ALLA LISTA — una mail PER OGNI persona, col suo nome e i suoi numeri:
// il template è lo stesso, la mail no. Chi ha già ricevuto questo template da
// questa lista non lo riceve due volte (si può rilanciare senza paura).
export default async function MailAllaLista({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const { id } = await params;
  const sp = await searchParams;

  const [lista, templates, config] = await Promise.all([
    prisma.listaClienti.findUnique({ where: { id }, include: { membri: { orderBy: { speso: "desc" } } } }),
    prisma.templateMail.findMany({ orderBy: { nome: "asc" } }),
    configurazioneMail(),
  ]);
  if (!lista) notFound();

  const template = templates.find((t) => t.id === sp.template) ?? templates[0];
  const conEmail = lista.membri.filter((m) => m.email);
  const giaFatte = template
    ? await prisma.mailInviata.count({ where: { listaId: id, templateId: template.id, esito: "inviata" } })
    : 0;

  const primo = conEmail[0];
  const anteprima =
    template && primo
      ? {
          oggetto: sostituisciVariabili(
            template.oggetto,
            { nome: primo.nome || null, citta: primo.citta || null, segmento: primo.segmento, ordini: primo.ordini, speso: primo.speso, ultimoOrdine: primo.ultimoOrdine },
            null,
          ),
          corpo: sostituisciVariabili(
            template.corpo,
            { nome: primo.nome || null, citta: primo.citta || null, segmento: primo.segmento, ordini: primo.ordini, speso: primo.speso, ultimoOrdine: primo.ultimoOrdine },
            null,
          ),
        }
      : null;

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Mail alla lista</h1>
          <p className="page-sub">
            «{lista.nome}» — {conEmail.length} destinatari con email su {lista.membri.length}
            {giaFatte ? ` · ${giaFatte} hanno già ricevuto questo template` : ""}. Ogni mail parte personalizzata, una
            alla volta, dalla casella aziendale.
          </p>
        </div>
        <TornaIndietro fallback={`/liste/${id}`} label="Lista" />
      </div>

      {sp.esito === "ok" ? <div className="ok-card">{sp.dettaglio ?? "Fatto."}</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}
      {!config.pronta ? (
        <div className="errore-card">
          L&apos;invio non è configurato (manca {config.manca.join(" e ")}): vedi{" "}
          <a className="link-quieto" href="/impostazioni">Impostazioni</a>.
        </div>
      ) : null}

      {templates.length === 0 ? (
        <div className="card vuoto">
          <h3>Serve un template</h3>
          <p>
            L&apos;invio a lista parte da un template con le {"{{variabili}}"}:{" "}
            <a className="link-quieto" href="/mail/template">creane uno →</a>
          </p>
        </div>
      ) : (
        <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", alignItems: "start" }}>
          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Template</div>
            <div className="card-sub">Cambiare template ricompone l&apos;anteprima.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {templates.map((t) => (
                <a
                  key={t.id}
                  className={`filtro-pillola${template?.id === t.id ? " attivo" : ""}`}
                  href={`/liste/${id}/mail?template=${t.id}`}
                  style={{ textAlign: "left" }}
                >
                  {t.nome}
                </a>
              ))}
            </div>
            <form action={inviaMailALista}>
              <input type="hidden" name="listaId" value={id} />
              <input type="hidden" name="templateId" value={template?.id ?? ""} />
              <button className="btn" type="submit" disabled={!config.pronta || !template || conEmail.length === 0}>
                Invia a {Math.max(0, conEmail.length - giaFatte)} clienti
              </button>
              <p className="terziario piccolo" style={{ marginTop: 8 }}>
                Massimo 150 per giro: se sono di più, si rilancia e riprende da chi manca. Chi ha già ricevuto non
                riceve doppioni.
              </p>
            </form>
          </div>

          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Anteprima (sul primo della lista)</div>
            {anteprima && primo ? (
              <>
                <div className="card-sub">A {primo.nome || primo.email}</div>
                <p style={{ fontSize: 14, fontWeight: 550, marginBottom: 8 }}>{anteprima.oggetto}</p>
                <p className="secondario" style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {anteprima.corpo}
                </p>
              </>
            ) : (
              <p className="secondario piccolo">Nessun destinatario con email in questa lista.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
