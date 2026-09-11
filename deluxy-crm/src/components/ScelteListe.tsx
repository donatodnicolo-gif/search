// Le liste di clienti da collegare a un evento (11/09/2026): caselle, una per
// lista, con quanti clienti ha. Stesso pezzo nel «Nuovo evento» e nel
// «Modifica l'evento». Da una lista collegata si aggiungono gli invitati in
// un colpo (dettaglio evento).
export default function ScelteListe({
  liste,
  scelte = [],
}: {
  liste: { id: string; nome: string; _count: { membri: number } }[];
  scelte?: string[];
}) {
  return (
    <div className="campo">
      <label>
        Liste di clienti collegate <span className="aiuto">(da una lista collegata si aggiungono gli invitati in un colpo)</span>
      </label>
      {liste.length === 0 ? (
        <span className="terziario piccolo">
          Nessuna lista, per ora: si costruiscono in <a className="link-quieto" href="/liste">Liste</a>.
        </span>
      ) : (
        <div className="scelte">
          {liste.map((l) => (
            <label key={l.id} className="scelta">
              <input type="checkbox" name="liste" value={l.id} defaultChecked={scelte.includes(l.id)} /> {l.nome}{" "}
              <span className="terziario">· {l._count.membri}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
