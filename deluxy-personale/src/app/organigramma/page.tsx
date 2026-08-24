import { prisma } from "@/lib/db";

// L'organigramma si disegna dai riporti (Persona.responsabileId): radici = chi
// non riporta a nessuno. Chi è attivo ma non collocato non sparisce: finisce
// in un elenco dichiarato in fondo (un albero che perde persone è peggio di un
// albero con una voce "da collocare").

export const dynamic = "force-dynamic";

type Nodo = {
  id: string;
  nome: string;
  ruolo: string;
  funzione: string | null;
  figli: Nodo[];
};

export default async function PaginaOrganigramma() {
  const persone = await prisma.persona.findMany({
    where: { stato: "attivo" },
    include: { funzione: true },
    orderBy: { nome: "asc" },
  });

  const nodi = new Map<string, Nodo>();
  for (const p of persone) {
    nodi.set(p.id, { id: p.id, nome: p.nome, ruolo: p.ruolo, funzione: p.funzione?.nome ?? null, figli: [] });
  }
  const radici: Nodo[] = [];
  for (const p of persone) {
    const nodo = nodi.get(p.id)!;
    // Un responsabile cessato (o inesistente) non regge un ramo: il nodo
    // diventa radice, non sparisce.
    if (p.responsabileId && nodi.has(p.responsabileId)) {
      nodi.get(p.responsabileId)!.figli.push(nodo);
    } else {
      radici.push(nodo);
    }
  }

  const conta = (n: Nodo): number => n.figli.reduce((s, f) => s + conta(f), n.figli.length);

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Organigramma</h1>
          <p className="page-sub">
            Chi riporta a chi. Si cambia dalla scheda della persona («Riporta a»).
          </p>
        </div>
      </div>

      {persone.length === 0 ? (
        <div className="card vuoto">
          <div className="vuoto-icona">🏛️</div>
          <div className="vuoto-titolo">Ancora nessuno in organigramma</div>
          <div className="vuoto-testo">Aggiungi le persone e collega ognuna al suo responsabile.</div>
          <div style={{ marginTop: 14 }}>
            <a className="btn" href="/persone/nuova">
              Nuova persona
            </a>
          </div>
        </div>
      ) : (
        <div className="org-albero">
          {radici.map((r) => (
            <Ramo key={r.id} nodo={r} squadra={conta(r)} />
          ))}
        </div>
      )}
    </>
  );
}

function Ramo({ nodo, squadra }: { nodo: Nodo; squadra?: number }) {
  const iniziali = nodo.nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div className="org-nodo">
      <a className="org-scheda" href={`/persone/${nodo.id}`}>
        <div className="avatar">{iniziali}</div>
        <div className="org-info">
          <div className="org-nome">{nodo.nome}</div>
          <div className="org-ruolo">{nodo.ruolo || "ruolo da indicare"}</div>
        </div>
        <div className="org-extra">
          {nodo.funzione && (
            <span className="badge">
              <span className="dot" />
              {nodo.funzione}
            </span>
          )}
          {squadra != null && squadra > 0 && (
            <span className="badge oro">
              <span className="dot" />
              {squadra} in squadra
            </span>
          )}
        </div>
      </a>
      {nodo.figli.length > 0 && (
        <div className="org-figli">
          {nodo.figli.map((f) => (
            <Ramo key={f.id} nodo={f} />
          ))}
        </div>
      )}
    </div>
  );
}
