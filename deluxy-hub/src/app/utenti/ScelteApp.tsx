// Spunte "quali app può aprire questo utente". Gli id spuntati arrivano alla
// server action come campi "app" ripetuti.
//
// ⚠️ L'elenco delle app arriva per PROPS e non da `catalogoApp()`: quella legge
// `process.env`, e questo componente viene reso anche dentro un componente
// client (la riga della tabella). Vedi la trappola del client che importa una
// libreria server: il typecheck passa e la build muore su webpack.
export function ScelteApp({
  app,
  selezionate,
}: {
  app: readonly { id: string; nome: string }[];
  selezionate: readonly string[];
}) {
  const scelti = new Set(selezionate);
  return (
    <div className="campo" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
      <span>App visibili nella home</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
        {app.map((a) => (
          // .spunta-app si accende quando è spuntata: prima una pillola scelta e
          // una non scelta erano identiche, e su una pagina di PERMESSI questo
          // non è un attrito ma il rischio di sbagliare senza accorgersene.
          <label key={a.id} className="spunta-app">
            <input type="checkbox" name="app" value={a.id} defaultChecked={scelti.has(a.id)} />
            {a.nome}
          </label>
        ))}
      </div>
      <span
        style={{
          fontSize: 11.5,
          color: "var(--text-tertiary)",
          fontWeight: 400,
          marginTop: 7,
          display: "block",
        }}
      >
        Gli amministratori vedono comunque tutte le app, a prescindere da queste spunte.
      </span>
    </div>
  );
}
