import { prisma } from "@/lib/db";
import { formattaEuro, formattaNumero } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";

// Dove finiscono i soldi dentro la campagna: telefono o computer, che giorno
// della settimana, rete di ricerca o partner. Sono i tagli su cui si può agire
// senza rifare la campagna — un correttivo per dispositivo o una fascia oraria
// tolta valgono quanto una keyword esclusa.

const ETICHETTA: Record<string, string> = {
  MOBILE: "Telefono",
  DESKTOP: "Computer",
  TABLET: "Tablet",
  CONNECTED_TV: "TV connessa",
  OTHER: "Altro",
  MONDAY: "Lunedì",
  TUESDAY: "Martedì",
  WEDNESDAY: "Mercoledì",
  THURSDAY: "Giovedì",
  FRIDAY: "Venerdì",
  SATURDAY: "Sabato",
  SUNDAY: "Domenica",
  SEARCH: "Ricerca Google",
  SEARCH_PARTNERS: "Partner di ricerca",
  CONTENT: "Display",
  YOUTUBE_SEARCH: "YouTube ricerca",
  YOUTUBE_WATCH: "YouTube video",
  MIXED: "Misto",
};

const ORDINE_GIORNI = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

const TITOLI: Record<string, string> = {
  dispositivo: "Da che dispositivo",
  giorno: "In che giorno",
  rete: "Su quale rete",
};

export async function SegmentiCampagna({ campagnaId, brand }: { campagnaId: string; brand: string }) {
  const righe = await prisma.segmentoCampagna.findMany({ where: { campagnaId } });

  if (righe.length === 0) {
    return (
      <section className="scheda">
        <div className="scheda-titolo">Dove finisce la spesa</div>
        <div className="vuoto-mini">
          Nessun taglio della spesa: lo manda lo script con <b>AZIONE = &quot;diagnosi&quot;</b>, insieme ai
          termini di ricerca.
        </div>
      </section>
    );
  }

  const be = breakEvenRoas(brand);
  const periodo = righe[0].dal && righe[0].al
    ? `${righe[0].dal.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} → ${righe[0].al.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`
    : null;

  const tipi = ["dispositivo", "giorno", "rete"].filter((t) => righe.some((r) => r.tipo === t));

  return (
    <section className="scheda">
      <div className="scheda-titolo">Dove finisce la spesa{periodo ? ` · ${periodo}` : ""}</div>
      <div className="due-colonne" style={{ gap: 18 }}>
        {tipi.map((tipo) => {
          const gruppo = righe
            .filter((r) => r.tipo === tipo)
            .sort((a, b) =>
              tipo === "giorno"
                ? ORDINE_GIORNI.indexOf(a.valore) - ORDINE_GIORNI.indexOf(b.valore)
                : (b.spesa ?? 0) - (a.spesa ?? 0)
            );
          const totale = gruppo.reduce((s, r) => s + (r.spesa ?? 0), 0);
          return (
            <div key={tipo}>
              <div className="cella-sub" style={{ marginBottom: 6 }}>{TITOLI[tipo].toUpperCase()}</div>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>{TITOLI[tipo]}</th>
                      <th className="num">Spesa</th>
                      <th className="num">Quota</th>
                      <th className="num">Conv.</th>
                      <th className="num">Resa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruppo.map((r) => {
                      const spesa = r.spesa ?? 0;
                      const resa = spesa > 0 ? (r.ricavi ?? 0) / spesa : null;
                      const colore =
                        resa == null ? "var(--text-tertiary)" :
                        resa >= be * 1.5 ? "var(--green)" :
                        resa >= be ? "var(--blue)" : "var(--red)";
                      return (
                        <tr key={r.id}>
                          <td className="cella-nome">{ETICHETTA[r.valore] ?? r.valore}</td>
                          <td className="num">{formattaEuro(spesa)}</td>
                          <td className="num cella-muta">
                            {totale > 0 ? `${Math.round((spesa / totale) * 100)}%` : "—"}
                          </td>
                          <td className="num cella-muta">{formattaNumero(r.conversioni)}</td>
                          <td className="num" style={{ color: colore, fontWeight: 600 }}>
                            {resa != null ? `${resa.toFixed(2).replace(".", ",")}×` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
        Se un dispositivo o un giorno stanno sotto il break-even di {brand} ({be.toFixed(2).replace(".", ",")}×) mentre
        un altro sta sopra, la media di campagna li nasconde entrambi: è lì che si guadagna
        spostando, non tagliando.
      </p>
    </section>
  );
}
