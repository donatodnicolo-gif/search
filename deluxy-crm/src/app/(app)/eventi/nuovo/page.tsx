import { salvaEvento } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function NuovoEvento({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Nuovo evento</h1>
          <p className="page-sub">
            Un&apos;occasione speciale per i clienti: cena, anteprima, presentazione. La data e l&apos;ora sono in ora
            italiana; l&apos;evento finirà anche nel Deluxy Calendario.
          </p>
        </div>
        <a className="btn ghost" href="/eventi">← Eventi</a>
      </div>

      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="card" style={{ maxWidth: 640 }}>
        <form action={salvaEvento}>
          <input type="hidden" name="torna" value="/eventi/nuovo" />
          <div className="campo">
            <label>Titolo *</label>
            <input type="text" name="titolo" placeholder="es. Cena di San Valentino — tavolo Deluxy" required />
          </div>
          <div className="form-riga">
            <div className="campo">
              <label>Inizio *</label>
              <input type="datetime-local" name="dataInizio" required />
            </div>
            <div className="campo">
              <label>Fine</label>
              <input type="datetime-local" name="dataFine" />
            </div>
          </div>
          <div className="campo">
            <label>Luogo</label>
            <input type="text" name="luogo" placeholder="es. Terrazza Aperol, Milano" />
          </div>
          <div className="form-riga">
            <div className="campo">
              <label>Dress code</label>
              <input type="text" name="dressCode" placeholder="es. cocktail" />
            </div>
            <div className="campo">
              <label>Capienza</label>
              <input type="number" name="capienza" min={1} placeholder="es. 40" />
            </div>
          </div>
          <div className="campo">
            <label>Descrizione <span className="aiuto">(si può usare nelle mail d&apos;invito con {"{{evento}}"})</span></label>
            <textarea name="descrizione" rows={3} placeholder="Che serata sarà, perché invitiamo, cosa offriamo…" />
          </div>
          <div className="campo">
            <label>Note interne</label>
            <input type="text" name="note" placeholder="Budget, fornitori, referenti…" />
          </div>
          <div className="form-piede">
            <button className="btn" type="submit">Crea l&apos;evento</button>
          </div>
        </form>
      </div>
    </>
  );
}
