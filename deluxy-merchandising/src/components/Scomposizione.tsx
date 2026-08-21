import { euro } from "@/lib/dominio";
import { intervalloIt } from "@/lib/fuso";
import { scomposizioneVendite, type LenteScomposta, type VoceScomposizione } from "@/lib/scomposizione";

// **Da cosa viene la differenza** — la sezione che risponde alla domanda che
// tutte le altre lasciavano aperta.
//
// Il resto della pagina dice *quanto* è cambiato il venduto. Qui si smonta quel
// numero: quali siti, categorie, fornitori, fasce di prezzo, aree d'Italia lo
// hanno mosso, e — prima ancora — se la differenza viene dal **numero di pezzi
// o dal prezzo**, e da prodotti **nuovi, persi o rimasti**.
//
// Regola grafica: il segno si vede prima del numero. Le barre partono da uno
// zero al centro e vanno a destra (verde, ha aggiunto) o a sinistra (rosso, ha
// tolto), perché la domanda è «chi ha spinto e chi ha frenato» e leggerlo dai
// segni meno in una colonna di cifre è un lavoro che la pagina può fare al posto
// di chi guarda.

function segno(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${euro(Math.abs(n))}`;
}

/** Barra a due versi con lo zero al centro: destra ha aggiunto, sinistra ha tolto. */
function BarraContributo({ valore, massimo }: { valore: number; massimo: number }) {
  const larghezza = massimo > 0 ? Math.min(50, (50 * Math.abs(valore)) / massimo) : 0;
  const positivo = valore >= 0;
  return (
    <div className="barra-contributo" aria-hidden>
      <span className="barra-contributo-asse" />
      <span
        className={`barra-contributo-riempi ${positivo ? "su" : "giu"}`}
        style={{ width: `${larghezza}%`, [positivo ? "left" : "right"]: "50%" }}
      />
    </div>
  );
}

function TabellaLente({ lente }: { lente: LenteScomposta }) {
  const massimo = Math.max(...lente.voci.map((v) => Math.abs(v.delta)), 0);
  return (
    <div className="scheda">
      <div className="scheda-titolo con-periodo">{lente.nome}</div>
      <div className="scheda-periodo">
        {lente.additiva ? (
          <>
            compilata sul <strong>{Math.round(lente.copertura)}%</strong> del venduto del periodo
          </>
        ) : (
          <>quote che non fanno 100 — vedi sotto</>
        )}
      </div>
      <p className="nota-lente">{lente.spiegazione}</p>
      <table className="tabella-scomposizione">
        <thead>
          <tr>
            <th>Voce</th>
            <th className="num">Prima</th>
            <th className="num">Ora</th>
            <th className="num">Differenza</th>
            <th style={{ width: 120 }}>Peso</th>
          </tr>
        </thead>
        <tbody>
          {lente.voci.map((v: VoceScomposizione) => (
            <tr key={v.chiave} className={v.resto ? "riga-resto" : undefined}>
              <td>
                <span className="cella-nome">{v.etichetta}</span>
                <div className="cella-sub">
                  {v.pezziPrec} → {v.pezzi} pz
                </div>
              </td>
              <td className="num">{euro(v.ricavoPrec)}</td>
              <td className="num">{euro(v.ricavo)}</td>
              <td className="num" style={{ color: v.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                {segno(v.delta)}
                {v.quotaDelta != null && (
                  <div className="cella-sub">{Math.round(v.quotaDelta)}% della differenza</div>
                )}
              </td>
              <td>
                <BarraContributo valore={v.delta} massimo={massimo} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function Scomposizione({ giorni, brand }: { giorni: number; brand: string | null }) {
  const s = await scomposizioneVendite(giorni, brand);
  const { totale, effetti, movimento } = s;

  if (totale.ricavo === 0 && totale.ricavoPrec === 0) {
    return (
      <div className="scheda">
        <div className="scheda-titolo">Da cosa viene la differenza</div>
        <div className="vuoto-mini">
          Nessuna vendita a buon fine né in questo periodo né in quello precedente: non c&apos;è
          differenza da spiegare.
        </div>
      </div>
    );
  }

  const additive = s.lenti.filter((l) => l.additiva);
  const altre = s.lenti.filter((l) => !l.additiva);
  const massimoEffetto = Math.max(Math.abs(effetti.volume), Math.abs(effetti.prezzo));
  const massimoMov = Math.max(
    movimento.nuovi.ricavo,
    movimento.persi.ricavo,
    Math.abs(movimento.rimasti.delta)
  );

  return (
    <section className="sezione-scomposizione">
      <div className="scheda-titolo" style={{ margin: "26px 0 3px" }}>
        Da cosa viene la differenza
      </div>
      <div className="scheda-periodo">
        {intervalloIt(s.finestra.dal, s.finestra.al)} contro{" "}
        {intervalloIt(s.finestra.dalPrec, s.finestra.alPrec)}
      </div>

      <div className="scheda scheda-sintesi">
        <div className="sintesi-cifra" style={{ color: totale.delta >= 0 ? "var(--green)" : "var(--red)" }}>
          {segno(totale.delta)}
        </div>
        <div className="sintesi-testo">
          Il venduto a buon fine è passato da <strong>{euro(totale.ricavoPrec)}</strong> a{" "}
          <strong>{euro(totale.ricavo)}</strong>
          {totale.deltaPct != null && <> ({totale.deltaPct >= 0 ? "+" : "−"}{Math.abs(Math.round(totale.deltaPct))}%)</>}.
          Qui sotto quella differenza è smontata pezzo per pezzo: ogni tabella la
          divide in modo diverso, ma <strong>ognuna somma sempre a {segno(totale.delta)}</strong>.
        </div>
      </div>

      {!s.quadra && (
        <div className="avviso avviso-attenzione">
          <strong>I contributi non tornano al totale.</strong> È un difetto di calcolo, non un dato:
          non fidarti di questa sezione finché non è corretto. (Le altre pagine restano valide.)
        </div>
      )}

      {/* — Le due spiegazioni che non sono categorie — */}
      <div className="due-colonne" style={{ marginTop: 14 }}>
        <div className="scheda">
          <div className="scheda-titolo con-periodo">Pezzi o prezzo?</div>
          <div className="scheda-periodo">
            vendere di più o vendere a di più sono due mestieri diversi
          </div>
          <table className="tabella-scomposizione">
            <tbody>
              <tr>
                <td>
                  <span className="cella-nome">Quanti pezzi</span>
                  <div className="cella-sub">
                    {totale.pezziPrec} → {totale.pezzi} pz, allo scontrino di prima
                  </div>
                </td>
                <td className="num" style={{ color: effetti.volume >= 0 ? "var(--green)" : "var(--red)" }}>
                  {segno(effetti.volume)}
                </td>
                <td style={{ width: 110 }}>
                  <BarraContributo valore={effetti.volume} massimo={massimoEffetto} />
                </td>
              </tr>
              <tr>
                <td>
                  <span className="cella-nome">A che prezzo</span>
                  <div className="cella-sub">
                    scontrino medio {euro(effetti.prezzoMedioPrec)} → {euro(effetti.prezzoMedio)}
                  </div>
                </td>
                <td className="num" style={{ color: effetti.prezzo >= 0 ? "var(--green)" : "var(--red)" }}>
                  {segno(effetti.prezzo)}
                </td>
                <td>
                  <BarraContributo valore={effetti.prezzo} massimo={massimoEffetto} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="nota-lente">
            Il primo numero è la differenza che si sarebbe avuta vendendo la quantità di oggi al
            prezzo medio di prima; il secondo è quella dovuta al prezzo. Insieme fanno
            esattamente {segno(totale.delta)}.
          </p>
        </div>

        <div className="scheda">
          <div className="scheda-titolo con-periodo">Prodotti nuovi, persi, rimasti</div>
          <div className="scheda-periodo">spesso spiega più di qualunque categoria</div>
          <table className="tabella-scomposizione">
            <tbody>
              <tr>
                <td>
                  <span className="cella-nome">Nuovi</span>
                  <div className="cella-sub">
                    {movimento.nuovi.articoli} articoli che prima non vendevano
                  </div>
                </td>
                <td className="num" style={{ color: "var(--green)" }}>{segno(movimento.nuovi.ricavo)}</td>
                <td style={{ width: 110 }}>
                  <BarraContributo valore={movimento.nuovi.ricavo} massimo={massimoMov} />
                </td>
              </tr>
              <tr>
                <td>
                  <span className="cella-nome">Persi</span>
                  <div className="cella-sub">
                    {movimento.persi.articoli} articoli che vendevano e ora no
                  </div>
                </td>
                <td className="num" style={{ color: "var(--red)" }}>{segno(-movimento.persi.ricavo)}</td>
                <td>
                  <BarraContributo valore={-movimento.persi.ricavo} massimo={massimoMov} />
                </td>
              </tr>
              <tr>
                <td>
                  <span className="cella-nome">Rimasti</span>
                  <div className="cella-sub">
                    {movimento.rimasti.articoli} articoli presenti in tutti e due i periodi
                  </div>
                </td>
                <td
                  className="num"
                  style={{ color: movimento.rimasti.delta >= 0 ? "var(--green)" : "var(--red)" }}
                >
                  {segno(movimento.rimasti.delta)}
                </td>
                <td>
                  <BarraContributo valore={movimento.rimasti.delta} massimo={massimoMov} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="nota-lente">
            Un articolo è «perso» se in questo periodo non ha venduto nulla: può essere uscito di
            catalogo, esaurito o semplicemente fermo. Le righe che nessun prodotto ha riconosciuto
            contano per titolo, perché è tutto quello che se ne sa.
          </p>
        </div>
      </div>

      {/* — Le lenti additive — */}
      {additive.map((l) => (
        <TabellaLente key={l.chiave} lente={l} />
      ))}

      {/* — La lente non additiva, dichiarata — */}
      {altre.map((l) => (
        <TabellaLente key={l.chiave} lente={l} />
      ))}

      {s.lentiVuote.length > 0 && (
        <p className="page-sub">
          Non compaiono qui:{" "}
          {s.lentiVuote.map((x, i) => (
            <span key={x.nome}>
              {i > 0 && " · "}
              <strong>{x.nome}</strong> — {x.perche}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
