import Link from "next/link";
import { prisma } from "@/lib/db";
import { anteprima } from "@/lib/rubrica";
import { googleConfigurato } from "@/lib/google";
import { salvaRubrica } from "@/app/actions";

export const dynamic = "force-dynamic";

// Salvataggio dei clienti nella rubrica Google.
// La pagina mostra SEMPRE la prova a vuoto: il pulsante che scrive davvero
// compare sotto il riepilogo, mai prima. Scrivere migliaia di contatti nella
// rubrica personale è un'azione esterna difficile da annullare.
export default async function Rubrica({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const limite = Math.min(2000, Math.max(1, Number(sp.limite ?? "50") || 50));
  const minimoOrdini = Math.max(1, Number(sp.minimoOrdini ?? "2") || 2);
  const dal = sp.dal || "";

  const collegato = googleConfigurato();
  const sel = { limite, minimoOrdini, dal: dal || undefined };
  const { riepilogo, voci } = collegato
    ? await anteprima(sel)
    : { riepilogo: null, voci: [] as Awaited<ReturnType<typeof anteprima>>["voci"] };

  const [salvati, errori] = await Promise.all([
    prisma.contattoRubrica.count({ where: { esito: "ok" } }),
    prisma.contattoRubrica.count({ where: { esito: "errore" } }),
  ]);

  return (
    <main className="main">
      <Link href="/clienti" className="ritorno">← Clienti</Link>

      <div className="page-head">
        <div>
          <h1 className="page-title">Rubrica Google</h1>
          <p className="page-sub">
            Salva i clienti nella rubrica Google. I contatti già tuoi non vengono mai modificati: si tocca
            solo ciò che ha creato questa app.
          </p>
        </div>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{salvati.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Contatti già salvati</div>
        </div>
        {errori > 0 && (
          <div className="kpi">
            <div className="kpi-valore">{errori.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Con errore</div>
          </div>
        )}
      </div>

      {!collegato ? (
        <div className="vuoto">
          <p style={{ marginBottom: 10 }}>Google non è collegato.</p>
          <p className="testo-guida">
            Servono <code className="inline">GOOGLE_CLIENT_ID</code>,{" "}
            <code className="inline">GOOGLE_CLIENT_SECRET</code> e{" "}
            <code className="inline">GOOGLE_REFRESH_TOKEN</code> nell&apos;ambiente. Si possono copiare
            dall&apos;app Messaggi con <code className="inline">node scripts/importa-google-da-messaggi.mjs</code>.
          </p>
        </div>
      ) : (
        <>
          {/* Selezione: si parte da un sottoinsieme, non da tutti */}
          <form className="filtri" method="get">
            <div className="campo-modulo">
              <label>Almeno quanti ordini</label>
              <input name="minimoOrdini" type="number" min={1} defaultValue={minimoOrdini} style={{ width: 110 }} />
            </div>
            <div className="campo-modulo">
              <label>Ha ordinato dal</label>
              <input name="dal" type="date" defaultValue={dal} />
            </div>
            <div className="campo-modulo">
              <label>Quanti al massimo</label>
              <input name="limite" type="number" min={1} max={2000} defaultValue={limite} style={{ width: 110 }} />
            </div>
            <button className="btn btn-secondario" type="submit" style={{ alignSelf: "flex-end" }}>
              Ricalcola anteprima
            </button>
          </form>

          {riepilogo && (
            <>
              <div className="scheda">
                <div className="scheda-titolo">Prova a vuoto — nulla è stato scritto</div>
                <div className="kpi-riga" style={{ marginBottom: 0 }}>
                  <div className="kpi">
                    <div className="kpi-valore">{riepilogo.daCreare}</div>
                    <div className="kpi-etichetta">Da creare</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-valore">{riepilogo.giaSalvati}</div>
                    <div className="kpi-etichetta">Già salvati</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-valore">{riepilogo.senzaTelefono}</div>
                    <div className="kpi-etichetta">Senza telefono (saltati)</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-valore">{riepilogo.totaleConsiderati}</div>
                    <div className="kpi-etichetta">Considerati</div>
                  </div>
                </div>
              </div>

              {riepilogo.daCreare > 0 && (
                <form action={salvaRubrica} className="scheda">
                  <div className="scheda-titolo">Scrivi nella rubrica</div>
                  <input type="hidden" name="limite" value={limite} />
                  <input type="hidden" name="minimoOrdini" value={minimoOrdini} />
                  <input type="hidden" name="dal" value={dal} />
                  <p className="testo-guida" style={{ marginBottom: 12 }}>
                    Verranno creati fino a <strong>{riepilogo.daCreare}</strong> contatti nella tua rubrica
                    Google, al ritmo di circa 3 al secondo. Un contatto già presente e non creato da questa
                    app viene saltato, non modificato.
                  </p>
                  <button className="btn" type="submit">Salva {riepilogo.daCreare} contatti</button>
                </form>
              )}

              <div className="tabella-wrap">
                <table>
                  <thead>
                    <tr><th>Nome in rubrica</th><th>Telefono</th><th>Cosa succede</th></tr>
                  </thead>
                  <tbody>
                    {voci.slice(0, 100).map((v) => (
                      <tr key={v.chiave}>
                        <td className="cella-nome">{v.nome}</td>
                        <td className="cella-muta">{v.telefono ?? "—"}</td>
                        <td>
                          <span className={`badge${v.azione === "creare" ? "" : " neutro"}`} style={{ color: v.azione === "creare" ? "var(--green)" : undefined }}>
                            <span className="dot" />
                            {v.azione === "creare"
                              ? "da creare"
                              : v.azione === "gia-salvato"
                                ? "già salvato"
                                : v.azione === "aggiornare"
                                  ? "da aggiornare"
                                  : "senza telefono"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {voci.length > 100 && (
                <p className="testo-guida" style={{ marginTop: 10 }}>
                  Mostrate le prime 100 di {voci.length}.
                </p>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
