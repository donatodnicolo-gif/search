import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { nomeRubricaDefault } from "@/lib/rubrica";
import { aggiornaContatto, eliminaContatto } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { linkContattoHubspot } from "@/lib/hubspot-link";
import { eAzione, etichettaCampo, etichettaOrigine } from "@/lib/log-modifiche";
import { ETICHETTE_STATO, isStato } from "@/lib/stati";

export const dynamic = "force-dynamic";

function Campo({
  etichetta,
  nome,
  valore,
  tipo,
  largo,
}: {
  etichetta: string;
  nome: string;
  valore: string | null;
  tipo?: string;
  largo?: boolean;
}) {
  return (
    <div className={`campo-modulo${largo ? " largo" : ""}`}>
      <label htmlFor={nome}>{etichetta}</label>
      <input id={nome} name={nome} type={tipo ?? "text"} defaultValue={valore ?? ""} />
    </div>
  );
}

// Scheda del singolo referente: si apre col click dal nome in /contatti e
// permette di correggere ruolo, nome, telefono ed email senza passare dal
// form completo dell'anagrafica.
export default async function SchedaContatto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contatto = await prisma.contatto.findUnique({
    where: { id },
    include: { partner: { select: { id: true, nome: true, categoria: true, citta: true, stato: true } } },
  });
  if (!contatto) notFound();

  // Storia di QUESTA persona: le righe di log che la riguardano, comprese
  // quelle scritte quando è stata spostata da un'altra azienda (il log resta
  // agganciato al contatto, non solo all'azienda di adesso).
  const modifiche = await prisma.modifica.findMany({
    where: { contattoId: contatto.id },
    orderBy: { creatoIl: "desc" },
    take: 60,
    include: { partner: { select: { id: true, nome: true } } },
  });

  const aggiorna = aggiornaContatto.bind(null, contatto.id);
  const elimina = eliminaContatto.bind(null, contatto.id);

  const rubricaDefault = nomeRubricaDefault({
    statoLabel: isStato(contatto.partner.stato)
      ? ETICHETTE_STATO[contatto.partner.stato]
      : contatto.partner.stato,
    partnerNome: contatto.partner.nome,
    citta: contatto.partner.citta,
    nome: contatto.nome,
  });

  return (
    <div className="layout">
      <Sidebar contattiAttiva />
      <main className="main">
        <a className="ritorno" href="/contatti">← Torna ai contatti</a>

        <div className="page-head">
          <div>
            <h1 className="page-title">{contatto.nome || "Contatto senza nome"}</h1>
            <p className="page-sub">
              Referente di{" "}
              <a href={`/partner/${contatto.partner.id}`}>{contatto.partner.nome}</a>
              {[contatto.partner.categoria, contatto.partner.citta].filter(Boolean).length > 0 &&
                " · " + [contatto.partner.categoria, contatto.partner.citta].filter(Boolean).join(" · ")}
              {contatto.hubspotId && (
                <>
                  {" · "}
                  <a href={linkContattoHubspot(contatto.hubspotId)} target="_blank" rel="noreferrer">
                    Apri in HubSpot ↗
                  </a>
                </>
              )}
            </p>
          </div>
        </div>

        <form action={aggiorna}>
          <section className="scheda">
            <h2 className="scheda-titolo">Dati del contatto</h2>
            <div className="modulo">
              <Campo etichetta="Nome" nome="nome" valore={contatto.nome} />
              <Campo etichetta="Ruolo" nome="ruolo" valore={contatto.ruolo} />
              <Campo etichetta="Telefono" nome="telefono" valore={contatto.telefono} tipo="tel" />
              <Campo etichetta="Email" nome="email" valore={contatto.email} tipo="email" largo />
              <div className="campo-modulo largo">
                <label htmlFor="nomeRubrica">Nome su rubrica</label>
                <input
                  id="nomeRubrica"
                  name="nomeRubrica"
                  type="text"
                  defaultValue={contatto.nomeRubrica ?? ""}
                  placeholder={rubricaDefault}
                />
                <p className="testo-guida" style={{ marginTop: 4 }}>
                  Nome con cui «Salva in Google» crea il contatto. Se lasci vuoto:{" "}
                  <code>{rubricaDefault}</code>
                </p>
              </div>
            </div>
          </section>
          <div className="azioni-modulo">
            <button className="btn" type="submit">Salva</button>
            <a className="btn btn-secondario" href="/contatti">Annulla</a>
          </div>
        </form>

        <section className="scheda">
          <h2 className="scheda-titolo">
            Storia <span className="scheda-sub">i cambiamenti registrati su questa persona</span>
          </h2>
          {modifiche.length === 0 ? (
            <p className="testo-guida" style={{ margin: 0 }}>
              Nessuna modifica registrata. Il log parte dal 30/07/2026: quello che è stato cambiato
              prima non è stato tracciato.
            </p>
          ) : (
            <ol className="storia">
              {modifiche.map((m) => (
                <li key={m.id}>
                  <span className="storia-data">
                    {m.creatoIl.toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>
                    <span className="storia-campo">{etichettaCampo(m.campo)}</span>
                    {eAzione(m.campo) ? (
                      (m.a ?? m.da) ? (
                        <>
                          {" "}
                          <strong>{m.a ?? m.da}</strong>
                        </>
                      ) : null
                    ) : (
                      <>
                        {" "}
                        <span className="storia-da">{m.da ?? "(vuoto)"}</span>{" "}
                        <span className="storia-freccia">→</span> <strong>{m.a ?? "(vuoto)"}</strong>
                      </>
                    )}
                    {m.partner && m.partner.id !== contatto.partner.id && (
                      <span className="cella-fonte">
                        {" "}
                        · in <a href={`/partner/${m.partner.id}`}>{m.partner.nome}</a>
                      </span>
                    )}
                  </span>
                  <span className="storia-origine">
                    {etichettaOrigine(m.origine)}
                    {m.autore ? ` · ${m.autore}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <form action={elimina} style={{ marginTop: 24 }}>
          <button
            className="btn btn-secondario"
            type="submit"
            title="Elimina definitivamente questo referente dal registro"
          >
            Elimina contatto
          </button>
        </form>
      </main>
    </div>
  );
}
