import { cambiaStato } from "@/lib/azioni";
import { BadgeStato } from "./BadgeStato";
import { COLORE_STATO, ETICHETTE_STATO, STATI } from "@/lib/stati";

// Badge di stato cliccabile nelle righe dell'elenco: si apre un menu con gli
// altri stati e un click esegue il passaggio (stessa server action della scheda).
export function MenuStato({ partnerId, stato }: { partnerId: string; stato: string }) {
  return (
    // key={stato}: al cambio di stato il menu si smonta e si richiude da solo
    <details className="menu-stato" key={stato}>
      <summary>
        <BadgeStato stato={stato} />
        <span className="menu-freccia">▾</span>
      </summary>
      <form action={cambiaStato.bind(null, partnerId)} className="menu-stato-lista">
        {STATI.filter((s) => s !== stato).map((s) => (
          <button
            key={s}
            type="submit"
            name="stato"
            value={s}
            className="menu-stato-voce"
            style={{ color: COLORE_STATO[s] }}
          >
            <span className="dot" />
            <span className="stato-label">{ETICHETTE_STATO[s]}</span>
          </button>
        ))}
      </form>
    </details>
  );
}
