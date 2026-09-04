import { prisma } from "@/lib/db";
import { metaPuoScrivere } from "@/lib/meta-scrittura";
import { eseguiMetaAdesso } from "@/lib/azioni";

// Le operazioni su META: chi le esegue, e perché a volte non parte niente.
//
// ⚠️ SU META NON C'È LO SCRIPT. Su Google il motore gira dentro l'account e
// passa da solo ogni ora; qui la scrittura parte dall'app, e non c'è nessun
// cron — voluto: finché non avrà fatto qualche giro vero sotto gli occhi di
// qualcuno, non deve poter partire da sola nel cuore della notte.
//
// Il risultato però era che una coda Meta approvata restava lì per sempre
// senza che niente lo dicesse: identica a una coda che sta per essere eseguita.
// Questo riquadro dice le due cose che mancavano — **se si può scrivere** e
// **chi preme il bottone** — e il bottone è qui.
export async function EseguiMeta() {
  const [permesso, inAttesa, approvate] = await Promise.all([
    metaPuoScrivere(),
    prisma.operazioneAdv.count({ where: { canale: "meta_ads", stato: "in_attesa" } }),
    prisma.operazioneAdv.count({ where: { canale: "meta_ads", stato: "approvata" } }),
  ]);

  // Niente in ballo e scrittura spenta: il riquadro non serve a nessuno.
  if (inAttesa === 0 && approvate === 0 && !permesso.puo) return null;

  // ⚠️ A coda VUOTA il riquadro si stringe in una riga. Con due zeri grandi e
  // un bottone spento occupava la prima schermata per dire «non c'è niente da
  // fare»: lo spazio va a chi ha qualcosa da dire.
  if (inAttesa === 0 && approvate === 0) {
    return (
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
        <b>Meta</b>: niente in coda. Su Meta esegue l&apos;app nel momento in cui approvi; il
        bottone per le approvate rimaste ferme compare qui quando serve.
      </p>
    );
  }

  return (
    <section className="scheda">
      <div className="scheda-titolo">Operazioni su Meta</div>
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        Su Google le esegue lo script dentro l&apos;account, da solo. Su Meta le esegue{" "}
        <b>l&apos;app, nel momento in cui le approvi</b> (dal 04/09/2026): non c&apos;è nessun
        giro notturno, di proposito. Il bottone qui sotto serve per le approvate rimaste ferme
        (approvate prima di quella data, o via API). Meta accetta pausa e riattivazione
        (campagne e gruppi), il cambio di budget e il lancio — keyword e negative lì non esistono.
      </p>

      <div className="kpi-riga" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <div className="kpi-valore" style={inAttesa > 0 ? { color: "var(--orange)" } : undefined}>
            {inAttesa}
          </div>
          <div className="kpi-etichetta">Da approvare</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{approvate}</div>
          <div className="kpi-etichetta">Approvate, rimaste senza esecuzione</div>
        </div>
      </div>

      {/* ⚠️ Il motivo per cui non si può scrivere si dice PER ESTESO. «Non
          disponibile» manderebbe a cercare un guasto che non c'è: qui manca un
          permesso o un interruttore, e sono due cose che si sistemano in due
          minuti se si sa quali sono. */}
      {!permesso.puo ? (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>◈</span>
          <span>
            <b>La scrittura su Meta è spenta</b>, quindi le operazioni approvate restano ferme.{" "}
            {permesso.perche}
          </span>
        </div>
      ) : (
        <form action={eseguiMetaAdesso}>
          <button className="btn small" type="submit" disabled={approvate === 0}>
            {approvate === 0 ? "Niente di approvato da eseguire" : `Esegui adesso (${approvate})`}
          </button>
          <span className="cella-sub" style={{ marginLeft: 10 }}>
            Al massimo 10 per volta. Ogni esito viene scritto sulla riga dell&apos;operazione, come
            per Google.
          </span>
        </form>
      )}
    </section>
  );
}
