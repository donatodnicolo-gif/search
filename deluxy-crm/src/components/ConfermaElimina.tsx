import Modale from "./Modale";

// La conferma narrativa prima di un'eliminazione IRREVERSIBILE (Libro UX
// legge 7, §7): un bottone rosso apre una finestra stretta che dice COSA si
// elimina e cosa succede, e solo lì c'è il verbo. I figli sono il `<form>`
// con la server action e i suoi campi nascosti: la finestra non sa nulla
// dell'azione, la incornicia soltanto.
//
// Per le rimozioni reversibili (togliere un invitato, un membro di lista)
// non si usa: lì basta esegui + si rifà.
export default function ConfermaElimina({
  etichetta = "Elimina",
  titolo,
  conseguenza,
  mini = false,
  children,
}: {
  etichetta?: string;
  titolo: string;
  conseguenza: string;
  mini?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Modale bottone={etichetta} titolo={titolo} sotto={conseguenza} className={`btn rosso${mini ? " mini" : ""}`} stretta>
      {/* `modale-conferma`: solo qui il form è UN bottone da allineare a destra (il
          dettaglio ricorrenza usa lo stesso contenitore con un form a più campi). */}
      <div className="modale-azioni modale-conferma">{children}</div>
    </Modale>
  );
}
