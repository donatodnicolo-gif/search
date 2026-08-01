import { formattaEuro } from "@/lib/dominio";

// I dodici mesi dell'anno, per sapere QUANDO si vende.
//
// Un andamento giorno per giorno risponde a "cosa è successo"; questo risponde
// a "cosa sta per succedere". Nel gifting la stagionalità domina tutto — San
// Valentino, Festa della Mamma, Natale — e i mesi che restano non hanno dati
// per definizione: l'unica cosa onesta da mettere lì è **quello che è successo
// negli stessi mesi degli anni scorsi**, dichiarandolo per quello che è.
//
// Quindi due letture sovrapposte:
//  · barra piena  = quest'anno, dati veri
//  · barra chiara = media degli anni precedenti (atteso, non promesso)

export type PuntoStagione = {
  data: Date;
  spesa: number | null;
  ricavi: number | null;
  conversioni: number | null;
};

const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export function Stagionalita({ punti }: { punti: PuntoStagione[] }) {
  if (punti.length === 0) return null;

  const oggi = new Date();
  const annoCorrente = oggi.getUTCFullYear();
  const meseCorrente = oggi.getUTCMonth();

  // Per ogni mese: quest'anno e la media degli anni precedenti
  const quest = Array.from({ length: 12 }, () => ({ ricavi: 0, spesa: 0, conv: 0, giorni: 0 }));
  const storico = Array.from({ length: 12 }, () => new Map<number, { ricavi: number; spesa: number; conv: number }>());

  for (const p of punti) {
    const anno = p.data.getUTCFullYear();
    const mese = p.data.getUTCMonth();
    const ric = p.ricavi ?? 0;
    const sp = p.spesa ?? 0;
    const cv = p.conversioni ?? 0;
    if (anno === annoCorrente) {
      quest[mese].ricavi += ric;
      quest[mese].spesa += sp;
      quest[mese].conv += cv;
      quest[mese].giorni++;
    } else if (anno < annoCorrente) {
      const m = storico[mese];
      const a = m.get(anno) ?? { ricavi: 0, spesa: 0, conv: 0 };
      a.ricavi += ric;
      a.spesa += sp;
      a.conv += cv;
      m.set(anno, a);
    }
  }

  const mediaStorica = storico.map((m) => {
    if (m.size === 0) return null;
    const anni = [...m.values()];
    return {
      ricavi: anni.reduce((s, a) => s + a.ricavi, 0) / anni.length,
      spesa: anni.reduce((s, a) => s + a.spesa, 0) / anni.length,
      conv: anni.reduce((s, a) => s + a.conv, 0) / anni.length,
      anni: m.size,
    };
  });

  // Se non c'è mai un ricavo (succede: gruppi che portano traffico ma la
  // conversione è attribuita altrove) si ripiega sulle conversioni, altrimenti
  // il grafico sarebbe una fila di zeri.
  const totRicavi = quest.reduce((s, q) => s + q.ricavi, 0) + mediaStorica.reduce((s, m) => s + (m?.ricavi ?? 0), 0);
  const misura: "ricavi" | "conversioni" = totRicavi > 0 ? "ricavi" : "conversioni";
  const val = (x: { ricavi: number; conv: number } | null) =>
    x == null ? 0 : misura === "ricavi" ? x.ricavi : x.conv;

  const massimo = Math.max(
    ...quest.map((q) => val(q)),
    ...mediaStorica.map((m) => val(m)),
    1
  );

  const conStorico = mediaStorica.filter(Boolean).length;
  // Il mese più forte fra quelli che restano: è la domanda vera.
  const restanti = mediaStorica
    .map((m, i) => ({ mese: i, valore: val(m), anni: m?.anni ?? 0 }))
    .filter((x) => x.mese >= meseCorrente && x.valore > 0);
  const miglioreProssimo = restanti.length > 0
    ? restanti.reduce((a, b) => (b.valore > a.valore ? b : a))
    : null;

  const ALTEZZA = 132;

  return (
    <div className="stagione">
      <div className="stagione-barre">
        {MESI_BREVI.map((nome, i) => {
          const q = quest[i];
          const s = mediaStorica[i];
          const vq = val(q);
          const vs = val(s);
          const passato = i <= meseCorrente;
          const titolo =
            `${MESI[i]}: ` +
            (vq > 0
              ? `${annoCorrente} ${misura === "ricavi" ? formattaEuro(vq) : `${Math.round(vq)} conv.`}`
              : passato
                ? `${annoCorrente} nessun dato`
                : "mese futuro") +
            (s ? ` · media ${s.anni} ${s.anni === 1 ? "anno" : "anni"} precedenti ${misura === "ricavi" ? formattaEuro(vs) : `${Math.round(vs)} conv.`}` : "");

          return (
            <div className="stagione-mese" key={nome} title={titolo}>
              <div className="stagione-colonna" style={{ height: ALTEZZA }}>
                {vs > 0 && (
                  <span
                    className="barra-storico"
                    style={{ height: `${Math.max((vs / massimo) * 100, 1.5)}%` }}
                  />
                )}
                {vq > 0 && (
                  <span
                    className="barra-anno"
                    style={{ height: `${Math.max((vq / massimo) * 100, 1.5)}%` }}
                  />
                )}
              </div>
              <span className={`stagione-etichetta${i === meseCorrente ? " adesso" : ""}`}>{nome}</span>
            </div>
          );
        })}
      </div>

      <div className="stagione-legenda">
        <span><i className="q-anno" />{annoCorrente}</span>
        {conStorico > 0 && <span><i className="q-storico" />media anni precedenti</span>}
        <span className="stagione-misura">
          {misura === "ricavi" ? "ricavi dichiarati" : "conversioni"}
        </span>
      </div>

      {conStorico === 0 ? (
        <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
          Non c&apos;è ancora storia di anni precedenti per questo gruppo: la stagionalità si potrà
          leggere quando ci sarà almeno un anno completo alle spalle.
        </p>
      ) : miglioreProssimo ? (
        <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
          Da qui a dicembre il mese storicamente più forte è <b>{MESI[miglioreProssimo.mese]}</b>
          {" "}({misura === "ricavi" ? formattaEuro(miglioreProssimo.valore) : `${Math.round(miglioreProssimo.valore)} conversioni`} di
          media su {miglioreProssimo.anni} {miglioreProssimo.anni === 1 ? "anno" : "anni"}).
          {" "}È una media di quello che è successo, non una previsione: dice quando conviene avere
          budget pronto, non quanto si incasserà.
        </p>
      ) : (
        <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
          Nessun mese da qui a dicembre ha precedenti con vendite: non c&apos;è una stagionalità da
          leggere su questa parte dell&apos;anno.
        </p>
      )}
    </div>
  );
}
