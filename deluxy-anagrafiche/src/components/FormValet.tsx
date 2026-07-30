import { MEZZI, STATI_VALET, ETICHETTE_STATO_VALET } from "@/lib/valet";

// Form dell'anagrafica valet, uno solo per "Nuovo" e "Modifica": i campi sono
// gli stessi e tenerli in due copie voleva dire vederli divergere.
// Lo stato di servizio compare solo alla creazione — dopo si cambia dalle
// pillole della scheda, come per i partner.
export function FormValet({
  valore,
  nuovo = false,
}: {
  valore?: {
    nome: string;
    cognome: string | null;
    telefono: string | null;
    email: string | null;
    indirizzo: string | null;
    citta: string | null;
    provincia: string | null;
    provinceServite: string | null;
    mezzo: string | null;
    codiceFiscale: string | null;
    pIva: string | null;
    note: string | null;
  };
  nuovo?: boolean;
}) {
  const v = valore;
  return (
    <>
      <section className="scheda">
        <h2 className="scheda-titolo">La persona</h2>
        <div className="modulo">
          <div className="campo-modulo">
            <label htmlFor="nome">
              Nome <span className="obbligatorio">*</span>
            </label>
            <input id="nome" name="nome" required defaultValue={v?.nome ?? ""} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="cognome">Cognome</label>
            <input id="cognome" name="cognome" defaultValue={v?.cognome ?? ""} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="telefono">Telefono</label>
            <input id="telefono" name="telefono" type="tel" defaultValue={v?.telefono ?? ""} />
            <p className="testo-guida">
              È il dato con cui si riconosce una persona in un elenco di consegne: due valet con lo
              stesso numero non si creano.
            </p>
          </div>
          <div className="campo-modulo">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" defaultValue={v?.email ?? ""} />
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="indirizzo">Indirizzo</label>
            <input id="indirizzo" name="indirizzo" defaultValue={v?.indirizzo ?? ""} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="citta">Città</label>
            <input id="citta" name="citta" defaultValue={v?.citta ?? ""} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="provincia">Provincia</label>
            <input id="provincia" name="provincia" defaultValue={v?.provincia ?? ""} />
          </div>
          {nuovo && (
            <div className="campo-modulo">
              <label htmlFor="stato">Stato di servizio</label>
              <select id="stato" name="stato" defaultValue="in_servizio">
                {STATI_VALET.map((s) => (
                  <option key={s} value={s}>
                    {ETICHETTE_STATO_VALET[s]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      <section className="scheda">
        <h2 className="scheda-titolo">
          Come lavora <span className="scheda-sub">per orientarsi · l&apos;assegnazione vera è nella piattaforma</span>
        </h2>
        <div className="modulo">
          <div className="campo-modulo">
            <label htmlFor="provinceServite">Province servite</label>
            <input
              id="provinceServite"
              name="provinceServite"
              placeholder="MI, MB, VA"
              defaultValue={v?.provinceServite ?? ""}
            />
            <p className="testo-guida">
              Sigle separate da virgola. Le province su cui il valet viene davvero assegnato le
              gestisce la piattaforma consegne: questo campo serve a cercarlo qui.
            </p>
          </div>
          <div className="campo-modulo">
            <label htmlFor="mezzo">Mezzo</label>
            <select id="mezzo" name="mezzo" defaultValue={v?.mezzo ?? ""}>
              <option value="">—</option>
              {MEZZI.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="scheda">
        <h2 className="scheda-titolo">
          Identità fiscale{" "}
          <span className="scheda-sub">facoltativa · IBAN e stipendi restano nella piattaforma</span>
        </h2>
        <div className="modulo">
          <div className="campo-modulo">
            <label htmlFor="codiceFiscale">Codice fiscale</label>
            <input id="codiceFiscale" name="codiceFiscale" defaultValue={v?.codiceFiscale ?? ""} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="pIva">P. IVA</label>
            <input id="pIva" name="pIva" defaultValue={v?.pIva ?? ""} />
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="note">Note</label>
            <textarea id="note" name="note" rows={3} defaultValue={v?.note ?? ""} />
          </div>
        </div>
      </section>
    </>
  );
}
