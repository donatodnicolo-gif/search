import { prisma } from "@/lib/db";
import {
  daQuanto,
  ETICHETTA_CANALE,
  ETICHETTA_OPERAZIONE,
  formattaDataOra,
} from "@/lib/dominio";

// COSA È STATO DECISO E NON È ANCORA SUCCESSO.
//
// ⚠️ Il difetto che questo riquadro chiude, misurato il 27/08/2026 sul
// database di produzione: una `pausa_campagna` su Meta approvata il 26/08 alle
// 10:56 era ancora lì il giorno dopo — la campagna su Meta ancora ENABLED —
// e insieme a lei tre operazioni **fallite**, la più vecchia dal 21/08.
// Dalla prima schermata non si vedeva niente di tutto questo: la sidebar
// mostrava un «1» accanto a Operazioni (in attesa + approvate sommate) e le
// fallite non le contava nessuno. Una decisione presa e mai eseguita non è
// una coda vuota, ma da fuori si legge uguale.
//
// ⚠️ Qui NON si rifà la diagnosi della pagina Operazioni (se lo script abbia
// già scavalcato l'approvata, quanti giri sono passati): quella regola vive
// là, e ricopiarla vorrebbe dire farla divergere. Qui si dicono solo fatti
// nudi — quante, da quanto, e **chi le esegue** — e si linka dove si decide.
export async function CodaFerma() {
  const [approvate, inAttesa, fallite, piuVecchiaInAttesa, ultimaFallita] = await Promise.all([
    prisma.operazioneAdv.findMany({
      where: { stato: "approvata" },
      orderBy: { approvataIl: "asc" },
      take: 5,
      select: {
        id: true,
        tipo: true,
        canale: true,
        bersaglio: true,
        approvataIl: true,
        creataIl: true,
        daEseguireDal: true,
      },
    }),
    prisma.operazioneAdv.count({ where: { stato: "in_attesa" } }),
    prisma.operazioneAdv.count({ where: { stato: "fallita" } }),
    prisma.operazioneAdv.findFirst({
      where: { stato: "in_attesa" },
      orderBy: { creataIl: "asc" },
      select: { creataIl: true },
    }),
    prisma.operazioneAdv.findFirst({
      where: { stato: "fallita" },
      orderBy: { creataIl: "desc" },
      select: { creataIl: true },
    }),
  ]);

  // Coda pulita: il riquadro non compare. Lo spazio della prima schermata va a
  // chi ha qualcosa da dire, non a un «tutto a posto» che si smette di leggere.
  if (approvate.length === 0 && inAttesa === 0 && fallite === 0) return null;

  // ⚠️ Una PROGRAMMATA non è ferma: la sua data di partenza non è ancora
  // arrivata, e contarla fra le cose in ritardo sarebbe gridare al lupo.
  const adesso = Date.now();
  const ferme = approvate.filter(
    (o) => !o.daEseguireDal || o.daEseguireDal.getTime() <= adesso
  );
  const programmate = approvate.length - ferme.length;

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Decisioni prese e non ancora eseguite
        {ferme.length > 0 && (
          <span style={{ color: "var(--orange)", fontWeight: 400 }}>
            {" "}· {ferme.length} {ferme.length === 1 ? "approvata ferma" : "approvate ferme"}
          </span>
        )}
        {fallite > 0 && (
          <span style={{ color: "var(--red)", fontWeight: 400 }}>
            {" "}· {fallite} {fallite === 1 ? "fallita" : "fallite"}
          </span>
        )}
      </div>

      {ferme.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Operazione</th>
                <th>Su cosa</th>
                <th>Canale</th>
                <th>Approvata</th>
                <th>Chi la esegue</th>
              </tr>
            </thead>
            <tbody>
              {ferme.map((o) => {
                const quando = o.approvataIl ?? o.creataIl;
                const q = daQuanto(quando);
                const meta = o.canale === "meta_ads";
                return (
                  <tr key={o.id}>
                    <td className="cella-nome">{ETICHETTA_OPERAZIONE[o.tipo] ?? o.tipo}</td>
                    <td className="cella-muta">{o.bersaglio}</td>
                    <td className="cella-muta">{ETICHETTA_CANALE[o.canale] ?? o.canale}</td>
                    <td style={{ color: q.ore >= 24 ? "var(--red)" : "var(--text)", fontWeight: q.ore >= 24 ? 600 : 400 }}>
                      {q.testo}
                      <div className="cella-sub" style={{ color: "var(--text-tertiary)" }}>
                        {formattaDataOra(quando)}
                      </div>
                    </td>
                    {/* ⚠️ È la differenza che conta: su Google il motore è lo
                        script dentro l'account e passa da solo; su Meta è
                        l'app, che dal 04/09/2026 esegue all'approvazione — se
                        una Meta è qui, è stata approvata prima di quella data
                        o via API, e la si esegue col bottone. Senza scriverlo,
                        le due attese si leggono identiche. */}
                    <td className="cella-muta">
                      {meta ? (
                        <b>l&apos;app: col bottone «Esegui adesso» in Operazioni</b>
                      ) : (
                        "lo script, al prossimo giro dell'account"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        {inAttesa > 0 && (
          <>
            <b>{inAttesa}</b> {inAttesa === 1 ? "operazione aspetta" : "operazioni aspettano"} di
            essere approvata
            {piuVecchiaInAttesa && <> (la più vecchia da {daQuanto(piuVecchiaInAttesa.creataIl).testo})</>}.{" "}
          </>
        )}
        {fallite > 0 && (
          <>
            <b>{fallite}</b> {fallite === 1 ? "è fallita e nessuno l'ha rimessa in coda" : "sono fallite e nessuno le ha rimesse in coda"}
            {ultimaFallita && <> (l&apos;ultima {daQuanto(ultimaFallita.creataIl).testo})</>}: una
            fallita resta ferma finché non la si rimette in coda o non la si annulla.{" "}
          </>
        )}
        {programmate > 0 && (
          <>
            Altre <b>{programmate}</b> sono approvate ma <b>programmate</b> per più avanti: non
            sono in ritardo.{" "}
          </>
        )}
        {approvate.length === 5 && <>Ne sono elencate al massimo cinque. </>}
        <a href="/operazioni?torna=%2F">Vai alla coda</a> — lì c&apos;è il bottone per eseguire
        quelle di Meta, il motivo di ogni fallimento e «Rimetti in coda».
      </p>
    </section>
  );
}
