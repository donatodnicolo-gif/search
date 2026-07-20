import { ANNO_CORRENTE, caricaAnno, costoPersonaAnno, personeDelTeam } from "@/lib/calc";
import { TeamEditor } from "@/components/TeamEditor";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  // Ogni team con il suo organico e il costo del lavoro dell'anno.
  const team = dati.team.map((t) => {
    const persone = personeDelTeam(dati, t.id);
    return {
      ...t,
      persone: persone.map((p) => ({
        id: p.id,
        nome: p.nome,
        ruolo: p.ruolo,
        tipo: p.tipo,
        costo: costoPersonaAnno(p),
      })),
      costo: persone.reduce((s, p) => s + costoPersonaAnno(p), 0),
    };
  });

  const senzaTeam = personeDelTeam(dati, null).map((p) => ({
    id: p.id,
    nome: p.nome,
    ruolo: p.ruolo,
    tipo: p.tipo,
    costo: costoPersonaAnno(p),
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-caption">
            Le squadre aziendali con il loro responsabile e il costo del lavoro {dati.year}.
            Le persone si assegnano a un team dalla scheda in Dipendenti.
          </p>
        </div>
      </div>
      <TeamEditor team={team} senzaTeam={senzaTeam} />
    </>
  );
}
