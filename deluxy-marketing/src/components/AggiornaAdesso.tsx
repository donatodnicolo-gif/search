import { aggiornaAdesso } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { formattaDataOra } from "@/lib/dominio";

// Il bottone "Aggiorna adesso", con la verità scritta accanto: su Meta è l'app
// che va a prendere i dati e succede subito; su Google gli Script girano dentro
// Google Ads e da fuori nessuno può avviarli, quindi la richiesta aspetta la
// prossima partenza di uno qualsiasi degli script di quell'account.
export async function AggiornaAdesso({
  dove = "/ricezione",
  esito,
  compatto = false,
}: {
  dove?: string;
  esito?: string;
  compatto?: boolean;
}) {
  const [inCoda, ultimaFatta, ultimaConsegna, accountGoogle] = await Promise.all([
    prisma.richiestaAggiornamento.findMany({
      where: { stato: "in_attesa" },
      orderBy: { creataIl: "asc" },
    }),
    prisma.richiestaAggiornamento.findFirst({
      where: { stato: "fatta" },
      orderBy: { fattaIl: "desc" },
    }),
    prisma.ricezioneDati.findFirst({
      where: { fonte: "google_ads" },
      orderBy: { ricevutoIl: "desc" },
      select: { ricevutoIl: true, account: true },
    }),
    prisma.accountAdv.count({ where: { piattaforma: "google_ads", attivo: true } }),
  ]);

  const messaggi: Record<string, { testo: string; colore: string }> = {
    "in-coda": {
      testo: "Richiesta messa in coda: la esegue il primo script che parte su quell'account.",
      colore: "var(--green)",
    },
    "gia-in-coda": {
      testo: "Era già in coda: resta una richiesta sola, non se ne accumulano.",
      colore: "var(--text-secondary)",
    },
    "meta-fatto": { testo: "Meta aggiornato adesso.", colore: "var(--green)" },
    "meta-non-configurato": {
      testo: "Meta non è collegato: manca META_ACCESS_TOKEN fra le variabili d'ambiente.",
      colore: "var(--red)",
    },
    "tiktok-fatto": { testo: "TikTok aggiornato adesso.", colore: "var(--green)" },
    "tiktok-non-configurato": {
      testo: "TikTok non è collegato: manca il token in Impostazioni → TikTok Ads.",
      colore: "var(--red)",
    },
  };
  const messaggio = esito ? messaggi[esito] : null;

  return (
    <section className="scheda">
      <div className="scheda-titolo">Aggiorna adesso</div>

      {messaggio && (
        <div className="nota-info" style={{ borderColor: "rgba(0,0,0,.12)" }}>
          <span className="nota-icona" style={{ color: messaggio.colore }}>◈</span>
          <span>{messaggio.testo}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <form action={aggiornaAdesso}>
          <input type="hidden" name="canale" value="google_ads" />
          <input type="hidden" name="lavoro" value="metriche" />
          <input type="hidden" name="giorni" value="7" />
          <input type="hidden" name="dove" value={dove} />
          <button className="btn" type="submit">Chiedi i dati Google di oggi</button>
        </form>

        {!compatto && (
          <>
            <form action={aggiornaAdesso}>
              <input type="hidden" name="canale" value="google_ads" />
              <input type="hidden" name="lavoro" value="tutto" />
              <input type="hidden" name="giorni" value="30" />
              <input type="hidden" name="dove" value={dove} />
              <button className="btn fantasma" type="submit">Rifai tutto, ultimi 30 giorni</button>
            </form>

            <form action={aggiornaAdesso}>
              <input type="hidden" name="canale" value="meta_ads" />
              <input type="hidden" name="giorni" value="7" />
              <input type="hidden" name="dove" value={dove} />
              <button className="btn fantasma" type="submit">Aggiorna Meta ora</button>
            </form>

            <form action={aggiornaAdesso}>
              <input type="hidden" name="canale" value="tiktok" />
              <input type="hidden" name="giorni" value="7" />
              <input type="hidden" name="dove" value={dove} />
              <button className="btn fantasma" type="submit">Aggiorna TikTok ora</button>
            </form>
          </>
        )}
      </div>

      {inCoda.length > 0 && (
        <ul className="storia" style={{ marginTop: 14 }}>
          {inCoda.map((r) => (
            <li key={r.id}>
              <span className="storia-data">{formattaDataOra(r.creataIl)}</span>
              <span className="storia-testo">
                <b>{r.lavoro}</b> · ultimi {r.giorni} giorni
                {r.account ? ` · account ${r.account}` : " · tutti gli account"}
              </span>
              <span className="storia-autore" style={{ color: "var(--orange)" }}>in attesa</span>
            </li>
          ))}
        </ul>
      )}

      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        <b>Su Meta succede subito</b>: è l&apos;app che va a prendere i dati.{" "}
        <b>Su Google no</b>, e non è una mancanza dell&apos;app: gli Script girano dentro Google Ads e
        non esiste un modo di avviarli da fuori. Il verso è l&apos;opposto — è lo script che a ogni
        partenza chiede all&apos;app se c&apos;è qualcosa da rifare. Quindi &quot;adesso&quot; vuol dire{" "}
        <b>alla prossima partenza</b>: se vuoi che sia questione di minuti, metti la colonna
        <i> Frequenza</i> di uno degli script (basta uno) su <b>ogni ora</b>.
        {ultimaConsegna && (
          <>
            {" "}Ultimi dati Google ricevuti {formattaDataOra(ultimaConsegna.ricevutoIl)}
            {ultimaConsegna.account ? ` dall'account ${ultimaConsegna.account}` : ""}
            {accountGoogle > 1 ? ` (account censiti: ${accountGoogle})` : ""}.
          </>
        )}
        {ultimaFatta?.fattaIl && (
          <> Ultima richiesta servita {formattaDataOra(ultimaFatta.fattaIl)}: {ultimaFatta.esito}.</>
        )}
      </p>
    </section>
  );
}
