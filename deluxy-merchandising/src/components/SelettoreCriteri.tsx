import type { Criteri, VociDisponibili } from "@/lib/criteri-tipologia";

// I criteri che definiscono una tipologia. Ogni riquadro è un criterio: dentro
// si scelgono uno o più valori (valgono **in alternativa**), e i riquadri
// compilati valgono **tutti insieme**. È scritto in pagina, perché è la cosa che
// si sbaglia a intuito.
//
// Niente JS: sono `<select multiple>` e un numero. I nomi dei campi sono
// `crit_<voce>`, li rilegge `criteriDaForm`.

const STILE: React.CSSProperties = {
  font: "inherit",
  padding: "8px 10px",
  borderRadius: "var(--radius-m)",
  background: "var(--fill)",
  border: "1px solid transparent",
  width: "100%",
};

function Riquadro({
  titolo,
  nota,
  children,
}: {
  titolo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="campo-modulo">
      <label>{titolo}</label>
      {children}
      {nota && (
        <span className="page-sub" style={{ margin: "4px 0 0", fontSize: 12 }}>
          {nota}
        </span>
      )}
    </div>
  );
}

export function SelettoreCriteri({ criteri, voci }: { criteri: Criteri; voci: VociDisponibili }) {
  const righe = (n: number) => Math.min(6, Math.max(3, n));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p className="page-sub" style={{ margin: 0 }}>
        Dentro un riquadro i valori valgono <b>in alternativa</b> (fascia Luxury <i>o</i> Eccezionale); i riquadri
        che compili valgono <b>tutti insieme</b> (fascia Luxury <i>e</i> tipo Fiori). Tieni premuto Ctrl/Cmd per
        sceglierne più d'uno; lascia vuoto un riquadro per non usarlo.
      </p>

      {/* Classe e non stile inline: lo stile inline vince sempre sulla media
          query che sotto gli 800px porta .modulo a una colonna — la trappola
          già pagata con le classifiche su tablet. */}
      <div className="modulo modulo-due">
        <Riquadro titolo="Fascia di prezzo" nota={`${voci.fasce.length} fasce · è quella in cui cade il prezzo`}>
          <select name="crit_fasce" multiple defaultValue={criteri.fasce ?? []} size={righe(voci.fasce.length)} style={STILE}>
            {voci.fasce.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </Riquadro>

        <Riquadro titolo="Tipo prodotto (dal negozio)" nota={`${voci.tipi.length} tipi letti da Shopify`}>
          <select name="crit_tipi" multiple defaultValue={criteri.tipi ?? []} size={righe(voci.tipi.length)} style={STILE}>
            {voci.tipi.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Riquadro>

        <Riquadro titolo="Fornitore (dal negozio)" nota={`${voci.fornitori.length} fornitori letti da Shopify`}>
          <select name="crit_fornitori" multiple defaultValue={criteri.fornitori ?? []} size={righe(voci.fornitori.length)} style={STILE}>
            {voci.fornitori.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Riquadro>

        <Riquadro
          titolo="Linea"
          nota={
            voci.linee.length === 0
              ? "Nessuna linea creata: si decidono in «Imposta categorie e linee»."
              : `${voci.linee.length} linee`
          }
        >
          <select name="crit_linee" multiple defaultValue={criteri.linee ?? []} size={righe(voci.linee.length || 3)} style={STILE}>
            {voci.linee.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </Riquadro>

        <Riquadro titolo="Collezione del negozio" nota={`${voci.collezioni.length} collezioni importate`}>
          <select name="crit_collezioni" multiple defaultValue={criteri.collezioni ?? []} size={6} style={STILE}>
            {voci.collezioni.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titolo} ({c.negozio})
              </option>
            ))}
          </select>
        </Riquadro>

        <Riquadro
          titolo="Area (città del fornitore)"
          nota={
            voci.citta.length === 0
              ? "Nessun fornitore interno ha una città."
              : `${voci.citta.length} città. Attenzione: pochissimi prodotti hanno un fornitore interno collegato, quindi questo criterio ne seleziona pochi.`
          }
        >
          <select name="crit_citta" multiple defaultValue={criteri.citta ?? []} size={righe(voci.citta.length || 3)} style={STILE}>
            {voci.citta.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Riquadro>

        <Riquadro titolo="Tag" nota="Una parola per riga, cerca dentro i tag del negozio (Rose, Natale…).">
          <textarea
            name="crit_tag_testo"
            rows={3}
            style={STILE}
            defaultValue={(criteri.tag ?? []).join("\n")}
            placeholder={"Rose\nSan Valentino"}
          />
        </Riquadro>

        <Riquadro titolo="Novità" nota="Prodotti aggiunti al catalogo negli ultimi N giorni. Vuoto = non usato.">
          <input
            name="crit_novitaGiorni"
            type="number"
            min={1}
            step={1}
            style={STILE}
            defaultValue={criteri.novitaGiorni ?? ""}
            placeholder="es. 30"
          />
        </Riquadro>
      </div>
    </div>
  );
}
