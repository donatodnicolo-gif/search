import { formattaEuro, formattaNumero, roas as calcolaRoas } from "@/lib/dominio";

// L'andamento giorno per giorno, raccolto per mese.
//
// Su una finestra lunga la tabella giornaliera diventa illeggibile — quel
// gruppo di Fiori Milano ha 761 giorni — e la domanda che ci si fa guardandola
// non è mai "quanto ho speso il 14 marzo", ma "come sta andando quest'anno,
// e in che mese è cambiato qualcosa". Quindi: prima i mesi, e il giorno è a un
// clic di distanza per chi lo cerca davvero.
//
// Usa <details>/<summary> nativi: nessun JavaScript, funziona anche mentre la
// pagina è ancora un componente server, e il browser ricorda l'apertura col
// tasto indietro.

export type GiornoMetrica = {
  data: Date;
  spesa: number | null;
  impression: number | null;
  click: number | null;
  conversioni: number | null;
  ricavi: number | null;
};

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

type Totali = {
  spesa: number;
  impression: number;
  click: number;
  conversioni: number;
  ricavi: number;
  giorni: number;
};

function somma(t: Totali, g: GiornoMetrica): Totali {
  return {
    spesa: t.spesa + (g.spesa ?? 0),
    impression: t.impression + (g.impression ?? 0),
    click: t.click + (g.click ?? 0),
    conversioni: t.conversioni + (g.conversioni ?? 0),
    ricavi: t.ricavi + (g.ricavi ?? 0),
    giorni: t.giorni + 1,
  };
}

const VUOTI: Totali = { spesa: 0, impression: 0, click: 0, conversioni: 0, ricavi: 0, giorni: 0 };

export function AndamentoMensile({
  metriche,
  vuoto,
}: {
  metriche: GiornoMetrica[];
  // Cosa dire quando non c'è niente: cambia fra campagna e gruppo
  vuoto?: React.ReactNode;
}) {
  if (metriche.length === 0) {
    return <div className="vuoto-mini">{vuoto ?? "Nessuna metrica giornaliera."}</div>;
  }

  // Dal più recente al più vecchio: la domanda parte sempre da adesso
  const ordinate = [...metriche].sort((a, b) => b.data.getTime() - a.data.getTime());

  const mesi = new Map<string, { anno: number; mese: number; giorni: GiornoMetrica[]; tot: Totali }>();
  for (const g of ordinate) {
    const anno = g.data.getUTCFullYear();
    const mese = g.data.getUTCMonth();
    const k = `${anno}-${String(mese).padStart(2, "0")}`;
    const m = mesi.get(k) ?? { anno, mese, giorni: [], tot: { ...VUOTI } };
    m.giorni.push(g);
    m.tot = somma(m.tot, g);
    mesi.set(k, m);
  }
  const elenco = [...mesi.values()];

  return (
    <div className="mesi">
      <div className="mesi-testa">
        <span>Mese</span>
        <span className="num">Spesa</span>
        <span className="num">Impr.</span>
        <span className="num">Click</span>
        <span className="num">Conv.</span>
        <span className="num">Ricavi</span>
        <span className="num">ROAS</span>
      </div>

      {elenco.map((m, i) => {
        const r = calcolaRoas(m.tot.ricavi, m.tot.spesa);
        return (
          // Il primo mese aperto: è quello che si sta guardando
          <details key={`${m.anno}-${m.mese}`} className="mese" open={i === 0}>
            <summary className="mese-riga">
              <span className="mese-nome">
                <span className="mese-freccia" aria-hidden="true">›</span>
                {MESI[m.mese]} {m.anno}
                <i>{m.tot.giorni} {m.tot.giorni === 1 ? "giorno" : "giorni"}</i>
              </span>
              <span className="num">{formattaEuro(m.tot.spesa)}</span>
              <span className="num">{formattaNumero(m.tot.impression)}</span>
              <span className="num">{formattaNumero(m.tot.click)}</span>
              <span className="num">{formattaNumero(m.tot.conversioni)}</span>
              <span className="num">{formattaEuro(m.tot.ricavi)}</span>
              <span className="num">{r != null ? `${r.toFixed(1).replace(".", ",")}×` : "—"}</span>
            </summary>

            <div className="mese-giorni">
              {m.giorni.map((g) => {
                const rg = calcolaRoas(g.ricavi, g.spesa);
                return (
                  <div className="giorno-riga" key={g.data.toISOString()}>
                    <span className="cella-muta">
                      {g.data.toLocaleDateString("it-IT", { day: "2-digit", month: "short", timeZone: "UTC" })}
                    </span>
                    <span className="num">{formattaEuro(g.spesa)}</span>
                    <span className="num">{formattaNumero(g.impression)}</span>
                    <span className="num">{formattaNumero(g.click)}</span>
                    <span className="num">{formattaNumero(g.conversioni)}</span>
                    <span className="num">{formattaEuro(g.ricavi)}</span>
                    <span className="num">{rg != null ? `${rg.toFixed(1).replace(".", ",")}×` : "—"}</span>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
