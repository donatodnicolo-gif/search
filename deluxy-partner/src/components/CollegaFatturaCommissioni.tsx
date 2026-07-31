import { collegaFatturaCommissioni } from "@/lib/fic-actions";
import { euro, dataIt } from "@/lib/format";
import { nomeMese } from "@/lib/calc";
import type { FicFattura } from "@/lib/fic";

// «La fattura c'è già»: aggancia al mese una fattura commissioni emessa fuori
// dall'app (a mano su Fatture in Cloud, o prima che l'app tenesse il conto).
//
// Senza questo l'unico bottone era «Emetti», e un mese già fatturato restava
// «da emettere» per sempre: l'unica via d'uscita era emettere una seconda
// fattura, cioè fatturare due volte la stessa commissione.
//
// Le candidate sono le fatture FIC intestate a quel partner nell'anno; il campo
// libero resta per i casi che l'elenco non copre (fattura di un altro anno,
// intestata a un nome mai riconciliato). In entrambi i casi il numero viene
// cercato su FIC prima di essere salvato.
export function CollegaFatturaCommissioni({
  partnerId,
  partnerNome,
  anno,
  mese,
  tornaA,
  candidate,
}: {
  partnerId: string;
  partnerNome: string;
  anno: number;
  mese: number;
  tornaA: string;
  candidate: FicFattura[];
}) {
  return (
    <details style={{ display: "inline-block" }}>
      <summary
        className="btn small secondary"
        style={{ listStyle: "none", cursor: "pointer", display: "inline-block" }}
        title={`Collega una fattura già emessa su Fatture in Cloud alle commissioni di ${nomeMese(mese)}`}
      >
        Esiste già
      </summary>
      <form
        action={collegaFatturaCommissioni.bind(null, partnerId, anno, mese, tornaA)}
        style={{
          position: "absolute",
          zIndex: 20,
          marginTop: 6,
          padding: 12,
          minWidth: 300,
          background: "var(--surface)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-m)",
          boxShadow: "var(--shadow-float)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div className="muted" style={{ fontSize: 12 }}>
          Quale fattura di Fatture in Cloud sono le commissioni di {nomeMese(mese)} {anno} di{" "}
          {partnerNome}?
        </div>
        {candidate.length > 0 ? (
          <select name="numeroScelto" defaultValue="" style={{ fontSize: 12.5, padding: "5px 8px" }}>
            <option value="">— scegli fra le sue fatture {anno} —</option>
            {candidate.map((f) => (
              <option key={f.id} value={f.numero}>
                {f.numero} · {dataIt(f.data ? new Date(f.data) : null)} · {euro(f.totale)} · {f.cliente}
              </option>
            ))}
          </select>
        ) : (
          <div className="muted" style={{ fontSize: 11.5 }}>
            Nessuna fattura {anno} intestata a questo partner su Fatture in Cloud: scrivi il numero.
          </div>
        )}
        <input
          type="text"
          name="numero"
          placeholder="…oppure il numero, es. 460/2026"
          style={{ fontSize: 12.5, padding: "5px 8px" }}
          autoComplete="off"
        />
        <button className="btn small primary" type="submit">
          Collega al mese
        </button>
        <div className="muted" style={{ fontSize: 11 }}>
          Non crea niente su Fatture in Cloud: segna che la fattura di questo mese è quella.
        </div>
      </form>
    </details>
  );
}
