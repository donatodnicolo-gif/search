import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { aggiornaContatto, eliminaContatto } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { linkContattoHubspot } from "@/lib/hubspot-link";

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
    include: { partner: { select: { id: true, nome: true, categoria: true, citta: true } } },
  });
  if (!contatto) notFound();

  const aggiorna = aggiornaContatto.bind(null, contatto.id);
  const elimina = eliminaContatto.bind(null, contatto.id);

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
            </div>
          </section>
          <div className="azioni-modulo">
            <button className="btn" type="submit">Salva</button>
            <a className="btn btn-secondario" href="/contatti">Annulla</a>
          </div>
        </form>

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
