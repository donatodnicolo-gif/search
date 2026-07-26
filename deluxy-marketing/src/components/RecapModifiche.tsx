import { prisma } from "@/lib/db";
import { formattaDataOra } from "@/lib/dominio";

// Il recap delle ultime modifiche: cosa è cambiato su questa campagna e quando.
// Tre sorgenti che raccontano la stessa storia da punti diversi — le modifiche
// eseguite (paper-trail del doc 11), le operazioni in coda o fallite, e le voci
// del registro — messe in una riga sola in ordine di tempo.
export async function RecapModifiche({ campagnaId }: { campagnaId: string }) {
  const [modifiche, operazioni, eventi] = await Promise.all([
    prisma.modifica.findMany({ where: { campagnaId }, orderBy: { eseguitaIl: "desc" }, take: 15 }),
    prisma.operazioneAdv.findMany({ where: { campagnaId }, orderBy: { creataIl: "desc" }, take: 15 }),
    prisma.registroEvento.findMany({
      where: { entita: "campagna", entitaId: campagnaId },
      orderBy: { creatoIl: "desc" },
      take: 15,
    }),
  ]);

  type Voce = {
    quando: Date;
    cosa: string;
    dettaglio: string | null;
    chi: string;
    colore: string;
    etichetta: string;
  };
  const voci: Voce[] = [];

  for (const m of modifiche) {
    voci.push({
      quando: m.eseguitaIl,
      cosa: m.descrizione,
      dettaglio: m.prima || m.dopo ? `${m.prima ?? "?"} → ${m.dopo ?? "?"}` : null,
      chi: m.autore,
      colore: "var(--green)",
      etichetta: m.livello,
    });
  }
  for (const o of operazioni) {
    // Le eseguite hanno già la loro Modifica: qui si tengono le altre, che
    // sono quelle che raccontano cosa NON è ancora successo.
    if (o.stato === "eseguita") continue;
    voci.push({
      quando: o.creataIl,
      cosa: `${o.tipo.split("_").join(" ")} su ${o.bersaglio}`,
      dettaglio: o.esito ?? o.motivo,
      chi: o.richiestaDa,
      colore:
        o.stato === "fallita" ? "var(--red)" :
        o.stato === "approvata" ? "var(--blue)" :
        o.stato === "annullata" ? "var(--text-tertiary)" : "var(--orange)",
      etichetta:
        o.stato === "in_attesa" ? "da approvare" :
        o.stato === "approvata" ? "approvata" :
        o.stato === "fallita" ? "fallita" : o.stato,
    });
  }
  for (const e of eventi) {
    voci.push({
      quando: e.creatoIl,
      cosa: e.titolo,
      dettaglio: e.dettaglio,
      chi: e.autore,
      colore: "var(--text-tertiary)",
      etichetta: e.tipo,
    });
  }

  voci.sort((a, b) => b.quando.getTime() - a.quando.getTime());
  const ultime = voci.slice(0, 12);

  return (
    <section className="scheda">
      <div className="scheda-titolo">Ultime modifiche ({voci.length})</div>
      {ultime.length === 0 ? (
        <div className="vuoto-mini">
          Nessuna modifica registrata su questa campagna. Una modifica nasce solo quando
          un&apos;operazione approvata viene <b>eseguita davvero</b> dallo script: quello che si
          cambia a mano in Google Ads non passa di qui e resta invisibile all&apos;app.
        </div>
      ) : (
        <ul className="storia">
          {ultime.map((v, i) => (
            <li key={i}>
              <span className="storia-data">{formattaDataOra(v.quando)}</span>
              <span className="storia-testo">
                <span className="tag-salute" style={{ color: v.colore, marginRight: 8 }}>
                  <span className="dot" />
                  {v.etichetta}
                </span>
                {v.cosa}
                {v.dettaglio && <span className="cella-sub"> {v.dettaglio}</span>}
              </span>
              <span className="storia-autore">{v.chi}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
        Dopo ogni modifica eseguita partono 72 ore di blackout e due verifiche automatiche
        (+24h e +72h): i dati dentro quella finestra non valgono come giudizio.
      </p>
    </section>
  );
}
