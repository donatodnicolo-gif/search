import { attiviDaImportare } from "@/lib/importa-registro";
import { importaAttiviOra, collegaDubbio, creaDubbioComunque } from "@/lib/importa-actions";
import { BottoneInvio } from "./BottoneInvio";

// «Nel registro ci sono N clienti che qui non ci sono».
//
// Nel registro lo stato si chiama «Cliente» (il valore salvato è `attivo`):
// vuol dire che con quell'azienda ci lavoriamo davvero — le si fattura, si
// incassa, la si paga — e quindi deve avere una scheda anche qui.
//
// L'ingresso avviene da solo in due modi: il registro ci chiama appena una
// scheda diventa cliente (`POST /api/v1/partners`), e ogni notte il cron
// `/api/cron/anagrafiche` ripassa l'elenco per recuperare chi era già cliente
// prima, o chi è sfuggito perché l'app era irraggiungibile.
//
// ⚠️ La seconda parte — «assomigliano a una scheda già qui» — esiste per un
// danno vero: il 31/07/2026 l'import ha creato 17 doppioni, fra cui un secondo
// AMIR («Amir Roma. Cioccolato e Pasticceria»). Un'azienda scritta in due modi
// non la riconosce un confronto di stringhe: qui si mostra e decide una
// persona.
export async function AttiviDaRegistro() {
  const { nuovi, dubbi } = await attiviDaImportare();
  if (nuovi.length === 0 && dubbi.length === 0) return null;

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      {nuovi.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className="badge blue">
              <span className="dot" />
              {nuovi.length} {nuovi.length === 1 ? "cliente nuovo" : "clienti nuovi"} in Anagrafiche
            </span>
            <form action={importaAttiviOra} style={{ display: "inline" }}>
              <BottoneInvio className="btn small primary" inCorso="Importo…">
                Portali in Finance
              </BottoneInvio>
            </form>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: dubbi.length ? 14 : 0 }}>
            {nuovi.slice(0, 6).map((a) => a.nome.replace(/\s+/g, " ")).join(", ")}
            {nuovi.length > 6 ? ` e altri ${nuovi.length - 6}` : ""}. Nessuno di questi somiglia a una
            scheda già presente. Entrano da soli ogni notte: il bottone serve a non aspettare. Fee e
            condizioni di pagamento restano da scrivere — sono patti commerciali, non dati anagrafici.
          </p>
        </>
      )}

      {dubbi.length > 0 && (
        <>
          <span className="badge orange">
            <span className="dot" />
            {dubbi.length} da decidere: somigliano a schede già qui
          </span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 8 }}>
            Non vengono create da sole: la stessa azienda scritta in due modi diventerebbe due
            schede, e le vendite finirebbero divise fra le due.
          </p>
          <div className="table-wrap">
            <table className="mini-table">
              <thead>
                <tr>
                  <th>In Anagrafiche</th>
                  <th>Somiglia a</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dubbi.slice(0, 20).map((d) => (
                  <tr key={d.anagrafica.id}>
                    <td>
                      <strong>{d.anagrafica.nome.replace(/\s+/g, " ")}</strong>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {[d.anagrafica.categoria, d.anagrafica.citta].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {d.simili.slice(0, 3).map((s) => s.nome).join(" · ")}
                      {d.simili.length > 3 ? ` e altre ${d.simili.length - 3}` : ""}
                    </td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <form action={collegaDubbio} style={{ display: "inline-flex", gap: 6 }}>
                          <input type="hidden" name="anagraficaId" value={d.anagrafica.id} />
                          <select name="partnerId" defaultValue={d.simili[0]?.id} style={{ fontSize: 12, padding: "4px 8px" }}>
                            {d.simili.map((s) => (
                              <option key={s.id} value={s.id}>{s.nome}</option>
                            ))}
                          </select>
                          <BottoneInvio className="btn small secondary" inCorso="…">
                            È la stessa: collega
                          </BottoneInvio>
                        </form>
                        <form action={creaDubbioComunque} style={{ display: "inline" }}>
                          <input type="hidden" name="anagraficaId" value={d.anagrafica.id} />
                          <BottoneInvio className="btn small secondary" inCorso="…">
                            È un&apos;altra: crea
                          </BottoneInvio>
                        </form>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dubbi.length > 20 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Mostrati i primi 20 di {dubbi.length}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
