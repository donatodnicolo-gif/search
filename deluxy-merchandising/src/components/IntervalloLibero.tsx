import { isoRoma } from "@/lib/fuso";

// **L'intervallo scelto a mano, accanto alle pillole di periodo.**
//
// Le pillole («Mese in corso», «Ultimi 30 giorni»…) restano la via normale, come
// vuole il Libro UX (§8-bis): un doppio campo data come unica scelta obbliga a
// contare i giorni ogni volta. Questo è l'opzione in più per la domanda che le
// pillole non sanno fare — «dal 10 al 24 dicembre», «la settimana della festa
// della mamma».
//
// È un `<details>` con un form GET, senza JavaScript: chiuso è una pillola come
// le altre, aperto mostra i due campi e «Applica». Le date finiscono
// nell'indirizzo (`?periodo=personalizzato&dal=…&al=…`), quindi la vista si
// condivide e si mette nei preferiti come tutte le altre. I parametri della
// pagina che non c'entrano col periodo (la vista pezzi/valore, i filtri) si
// passano in `nascosti`, altrimenti applicare l'intervallo li azzererebbe.
//
// Le date si limitano a oggi: non c'è venduto nel futuro, e un «al» domani
// sembrerebbe un intervallo che funziona e invece è solo più corto.
export function IntervalloLibero({
  action,
  dal,
  al,
  attivo,
  nascosti,
}: {
  action: string;
  dal?: string;
  al?: string;
  attivo: boolean;
  nascosti?: Record<string, string | undefined>;
}) {
  const oggi = isoRoma(new Date());
  return (
    <details className="intervallo-libero" open={attivo || undefined}>
      <summary className={`pill-opt${attivo ? " attuale" : ""}`} aria-current={attivo ? "true" : undefined}>
        Intervallo personalizzato
      </summary>
      <form method="get" action={action} className="intervallo-libero-form">
        <input type="hidden" name="periodo" value="personalizzato" />
        {Object.entries(nascosti ?? {}).map(([nome, valore]) =>
          valore ? <input key={nome} type="hidden" name={nome} value={valore} /> : null
        )}
        <label className="campo-inline">
          dal
          <input type="date" name="dal" required defaultValue={dal} max={oggi} aria-label="Dal giorno" />
        </label>
        <label className="campo-inline">
          al
          <input type="date" name="al" required defaultValue={al} max={oggi} aria-label="Al giorno" />
        </label>
        <button className="btn btn-secondario" type="submit">
          Applica
        </button>
      </form>
    </details>
  );
}
