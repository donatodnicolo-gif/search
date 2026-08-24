import { prisma } from "@/lib/db";
import { RiportoSelect } from "@/components/RiportoSelect";

// L'organigramma si disegna dai riporti (Persona.responsabileId) e SI COSTRUISCE
// da qui: su ogni scheda c'è il menu «riporta a», che salva subito. Radici =
// chi non riporta a nessuno. Chi è attivo ma non collocato non sparisce.

export const dynamic = "force-dynamic";

type Nodo = {
  id: string;
  nome: string;
  ruolo: string;
  funzione: string | null;
  responsabileId: string | null;
  figli: Nodo[];
};

export default async function PaginaOrganigramma({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  const persone = await prisma.persona.findMany({
    where: { stato: "attivo" },
    include: { funzione: true },
    orderBy: { nome: "asc" },
  });

  const nodi = new Map<string, Nodo>();
  for (const p of persone) {
    nodi.set(p.id, {
      id: p.id,
      nome: p.nome,
      ruolo: p.ruolo,
      funzione: p.funzione?.nome ?? null,
      responsabileId: p.responsabileId,
      figli: [],
    });
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
  const opzioni = persone.map((p) => ({ id: p.id, nome: p.nome }));
  const nessunCollegamento = persone.length > 0 && persone.every((p) => !p.responsabileId);

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Organigramma</h1>
          <p className="page-sub">
            Chi riporta a chi. Si costruisce da qui: scegli su ogni scheda il responsabile con il
            menu «riporta a» — il salvataggio è immediato.
          </p>
        </div>
      </div>

      {sp.err && <div className="avviso-errore">{sp.err}</div>}

      {nessunCollegamento && (
        <div className="avviso-nota">
          Ancora nessun collegamento: tutte le persone sono allo stesso livello. Parti dal vertice
          (che resta «nessuno») e collega gli altri, uno per uno, col menu sulla loro scheda.
        </div>
      )}

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
            <Ramo key={r.id} nodo={r} squadra={conta(r)} opzioni={opzioni} />
          ))}
        </div>
      )}
    </>
  );
}

function Ramo({ nodo, squadra, opzioni }: { nodo: Nodo; squadra?: number; opzioni: { id: string; nome: string }[] }) {
  const iniziali = nodo.nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  // Sé stessi e i propri sottoposti (a catena) non sono responsabili validi:
  // il menu non li offre nemmeno (la guardia vera resta nella server action).
  const sottoAlbero = new Set<string>();
  const raccogli = (n: Nodo) => {
    sottoAlbero.add(n.id);
    n.figli.forEach(raccogli);
  };
  raccogli(nodo);
  const selezionabili = opzioni.filter((o) => !sottoAlbero.has(o.id));

  return (
    <div className="org-nodo">
      <div className="org-scheda">
        <div className="avatar">{iniziali}</div>
        <div className="org-info">
          <a className="org-nome link-nome" href={`/persone/${nodo.id}`}>
            {nodo.nome}
          </a>
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
          <RiportoSelect personaId={nodo.id} valore={nodo.responsabileId ?? ""} opzioni={selezionabili} />
        </div>
      </div>
      {nodo.figli.length > 0 && (
        <div className="org-figli">
          {nodo.figli.map((f) => (
            <Ramo key={f.id} nodo={f} opzioni={opzioni} />
          ))}
        </div>
      )}
    </div>
  );
}
