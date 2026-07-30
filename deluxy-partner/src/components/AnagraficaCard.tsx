import { risolviAnagrafica, urlAnagrafiche, type Anagrafica } from "@/lib/anagrafiche";
import { collegaAnagraficaEsistente, scollegaAnagrafica } from "@/lib/riconciliazione-actions";

// Etichetta e colore badge per gli stati del registro (vedi deluxy-anagrafiche)
const STATI: Record<string, { etichetta: string; classe: string }> = {
  prospect: { etichetta: "Prospect", classe: "neutral" },
  in_contatto: { etichetta: "In contatto", classe: "blue" },
  in_attesa: { etichetta: "In attesa", classe: "orange" },
  in_trattativa: { etichetta: "In trattativa", classe: "purple" },
  da_ricontattare: { etichetta: "Da ricontattare", classe: "orange" },
  attivo: { etichetta: "Partner", classe: "green" },
  non_interessato: { etichetta: "Non interessato", classe: "red" },
  dismesso: { etichetta: "Dismesso", classe: "red" },
};

function BadgeStato({ stato }: { stato: string }) {
  const s = STATI[stato] ?? { etichetta: stato, classe: "neutral" };
  return (
    <span className={`badge ${s.classe}`}>
      <span className="dot" />
      {s.etichetta}
    </span>
  );
}

function Voce({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="info-item">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

// Card con i dati anagrafici letti in diretta dal registro centralizzato
// (deluxy-anagrafiche). Se il registro è spento, non configurato o il partner
// non è ancora censito lì, la card spiega la situazione senza rompere la scheda.
export async function AnagraficaCard({
  nomePartner,
  anagraficaId,
  partnerId,
}: {
  nomePartner: string;
  anagraficaId?: string | null;
  partnerId?: string;
}) {
  // Collegato per id = join affidabile; altrimenti ripiego sul match per nome
  const anagrafica: Anagrafica | null = await risolviAnagrafica(nomePartner, anagraficaId);
  // Aggancio manuale: quando i nomi non combaciano (es. «DR VRANJES gennaio» qui
  // e «Dr. Vranjes» nel registro) l'automatismo non trova nulla e creare
  // l'anagrafica farebbe un doppione: qui si incolla id o link della scheda.
  const formCollega = partnerId && (
    <form
      action={collegaAnagraficaEsistente.bind(null, partnerId)}
      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}
    >
      <input
        type="text"
        name="anagraficaRif"
        placeholder="Incolla qui l'id o il link della scheda in Anagrafiche"
        style={{ flex: "1 1 320px", fontSize: 12.5, padding: "6px 8px" }}
      />
      <button className="btn small primary" type="submit" title="Collega questo partner a un'anagrafica già presente nel registro">
        Collega anagrafica
      </button>
    </form>
  );

  return (
    <>
      <h2 className="section-title">Anagrafica dal registro centralizzato</h2>
      <div className="card">
        {!anagrafica ? (
          <>
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
              Nessuna corrispondenza automatica nel registro Anagrafiche. Se la scheda <strong>esiste già</strong>{" "}
              (magari con un nome scritto diversamente), aprila su{" "}
              <a href={urlAnagrafiche()} target="_blank" style={{ color: "var(--blue)" }}>
                Deluxy Anagrafiche
              </a>{" "}
              e incolla qui sotto il suo link: le due schede restano collegate per sempre, senza creare doppioni.
            </p>
            {formCollega}
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <BadgeStato stato={anagrafica.stato} />
                <span className="badge neutral"><span className="dot" />{anagrafica.categoria}</span>
                {anagrafica.fonte === "platform" && (
                  <span className="badge gold"><span className="dot" />da app.deluxy.it</span>
                )}
              </span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <a
                  href={`${urlAnagrafiche()}/partner/${anagrafica.id}`}
                  target="_blank"
                  className="btn small secondary"
                >
                  Apri nel registro ↗
                </a>
                {partnerId && anagraficaId && (
                  <form action={scollegaAnagrafica.bind(null, partnerId)} style={{ display: "inline" }}>
                    <button className="btn small secondary" type="submit" title="Rimuove solo il collegamento: i dati nel registro restano">
                      Scollega
                    </button>
                  </form>
                )}
              </span>
            </div>

            {/* Trovata per somiglianza di nome ma NON agganciata per id: il legame
                non è salvato e potrebbe rompersi se un nome cambia. */}
            {partnerId && !anagraficaId && (
              <div style={{ marginBottom: 14, padding: 12, borderRadius: "var(--radius-m)", background: "var(--bg)" }}>
                <span className="badge orange"><span className="dot" />Corrispondenza trovata per nome, non ancora collegata</span>
                <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
                  Se è la scheda giusta, collegala: l&apos;abbinamento resta stabile anche se un nome cambia.
                </p>
                <form action={collegaAnagraficaEsistente.bind(null, partnerId)} style={{ marginTop: 8 }}>
                  <input type="hidden" name="anagraficaRif" value={anagrafica.id} />
                  <button className="btn small primary" type="submit">Collega questa anagrafica</button>
                </form>
              </div>
            )}
            <div className="info-grid">
              <Voce k="Ragione sociale" v={anagrafica.ragioneSociale} />
              <Voce k="P. IVA" v={anagrafica.pIva} />
              <Voce k="Codice fiscale" v={anagrafica.codiceFiscale} />
              <Voce k="Indirizzo" v={anagrafica.indirizzo} />
              <Voce k="Città" v={[anagrafica.citta, anagrafica.provincia].filter(Boolean).join(" · ")} />
              <Voce k="Email" v={anagrafica.email} />
              <Voce k="Telefono" v={anagrafica.telefono} />
              <Voce k="Account commerciale" v={anagrafica.account} />
            </div>
            {(() => {
              const f = anagrafica.datiFinanziari;
              if (!f) return null;
              const amm = [f.amministrazioneNome, f.amministrazioneTelefono, f.amministrazioneEmail]
                .filter(Boolean)
                .join(" · ");
              const haFin = f.pec || f.codiceSdi || f.iban || f.banca || amm;
              if (!haFin) return null;
              return (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hairline)" }}>
                  <div className="k" style={{ marginBottom: 8 }}>Dati amministrativi / fatturazione</div>
                  <div className="info-grid">
                    <Voce k="PEC" v={f.pec} />
                    <Voce k="Codice SDI" v={f.codiceSdi} />
                    <Voce k="IBAN" v={f.iban} />
                    <Voce k="Banca" v={f.banca} />
                    <Voce k="Contatto amministrativo" v={amm || null} />
                  </div>
                </div>
              );
            })()}
            {anagrafica.contatti.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="k" style={{ marginBottom: 6 }}>Persone di riferimento</div>
                {anagrafica.contatti.map((c) => (
                  <div key={c.id} style={{ fontSize: 13.5, padding: "3px 0", color: "var(--text)" }}>
                    {[c.ruolo, c.nome].filter(Boolean).join(": ")}
                    {(c.telefono || c.email) && (
                      <span style={{ color: "var(--text-secondary)" }}>
                        {" — "}
                        {[c.telefono, c.email].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
