import { eliminaVista, rendiVistaPredefinita, salvaVista } from "@/lib/azioni";
import { parametriVista, visteDiPagina } from "@/lib/viste";

// La barra delle viste salvate, sopra i filtri della pagina.
//
// Una vista è la fotografia dei filtri, dell'ordinamento e del periodo con un
// nome sopra. Sono condivise: non c'è "le mie viste", ci sono le viste della
// pagina. Quella predefinita si apre da sola quando si arriva sulla pagina
// senza filtri; per vedere la pagina nuda c'è «Senza filtri».
export async function VisteSalvate({
  pagina,
  base,
  parametri,
}: {
  pagina: string;
  // Percorso della pagina: le dashboard per brand condividono le viste ma
  // vivono a indirizzi diversi (/brand/gifts, /brand/flowers…).
  base: string;
  parametri: Record<string, string | string[] | undefined>;
}) {
  const viste = await visteDiPagina(pagina);
  const correnti = parametriVista(parametri);

  if (viste.length === 0 && correnti === "") return null;

  return (
    <section className="scheda" style={{ paddingTop: 14, paddingBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="cella-sub" style={{ fontWeight: 600 }}>Viste salvate</span>

        {viste.map((v) => {
          const attiva = v.parametri === correnti;
          return (
            <span
              key={v.id}
              className="pill-scelta"
              style={{ display: "inline-flex", alignItems: "center", gap: 0 }}
            >
              <a
                className={`pill-opt${attiva ? " attuale" : ""}`}
                href={`${base}?${v.parametri}`}
                title={v.parametri.split("&").join(" · ")}
              >
                <span style={{ color: "var(--text)" }}>
                  {v.predefinita ? "★ " : ""}
                  {v.nome}
                </span>
              </a>
              <form
                action={rendiVistaPredefinita.bind(null, v.id)}
                style={{ display: "inline" }}
              >
                <button
                  className="pill-opt"
                  type="submit"
                  title={
                    v.predefinita
                      ? "È la vista predefinita: premi per toglierla"
                      : "Rendila la vista predefinita di questa pagina"
                  }
                >
                  {v.predefinita ? "★" : "☆"}
                </button>
              </form>
              <form action={eliminaVista.bind(null, v.id)} style={{ display: "inline" }}>
                <button className="pill-opt" type="submit" title={`Elimina la vista "${v.nome}"`}>
                  ✕
                </button>
              </form>
            </span>
          );
        })}

        {viste.some((v) => v.predefinita) && (
          <a className="pill-opt" href={`${base}?vista=libera`} title="Apri la pagina senza filtri, ignorando la vista predefinita">
            Senza filtri
          </a>
        )}

        {/* Salvare la pagina nuda non ha senso: la vista sarebbe la pagina. */}
        {correnti !== "" && (
          <form
            action={salvaVista.bind(null, pagina, correnti)}
            style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}
          >
            <input
              name="nome"
              placeholder="Salva questa vista come…"
              required
              maxLength={60}
              style={{ minWidth: 200 }}
            />
            <button className="btn small" type="submit">Salva</button>
          </form>
        )}
      </div>
      {correnti !== "" && (
        <p className="cella-sub" style={{ marginTop: 8, whiteSpace: "normal" }}>
          Si salva quello che si vede adesso: {correnti.split("&").join(" · ")}. Un nome già usato
          riscrive quella vista. Le viste sono condivise, non personali.
        </p>
      )}
    </section>
  );
}
