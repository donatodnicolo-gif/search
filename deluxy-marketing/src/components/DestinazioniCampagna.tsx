import { prisma } from "@/lib/db";

// Dove mandano gli annunci: le pagine su cui atterra chi clicca.
//
// Sono DUE cose diverse e stanno separate apposta:
//  · la **destinazione dell'annuncio** (`ad_group_ad.ad.final_urls`) è dove
//    finisce chi clicca il titolo — la landing vera;
//  · l'**URL di un sitelink** è dove finisce chi clicca quel collegamento
//    sotto l'annuncio, che di solito è un'altra pagina.
// Mescolarle direbbe che l'annuncio manda su cinque pagine, e non è così.
//
// ⚠️ Le destinazioni degli annunci arrivano solo dal giro `copy` dello script
// **aggiornato al 04/08/2026**: prima nessuna query chiedeva `final_urls` e
// nel database c'erano URL solo sui sitelink. Finché quel giro non passa, qui
// si dice che il dato non c'è — invece di mostrare i sitelink facendoli
// passare per la destinazione dell'annuncio.
export async function DestinazioniCampagna({ nomeCampagna }: { nomeCampagna: string }) {
  const righe = await prisma.copyAnnuncio.findMany({
    where: { campagna: nomeCampagna, tipo: { in: ["destinazione", "sitelink"] } },
    select: {
      id: true, tipo: true, testo: true, finalUrl: true, gruppo: true,
      note: true, statoPiattaforma: true, clic: true, spesa: true,
    },
    orderBy: [{ tipo: "asc" }, { testo: "asc" }],
  });

  // ⚠️ **Solo quello che è acceso su Google.** L'elenco mostrava anche le
  // destinazioni di annunci e sitelink in pausa: pagine dove oggi non atterra
  // nessuno, in mezzo a quelle vive e con lo stesso aspetto. Alla domanda
  // «dove mando il traffico» rispondeva col traffico di mesi fa.
  const attivo = (r: (typeof righe)[number]) =>
    (r.statoPiattaforma ?? "ENABLED").toUpperCase() === "ENABLED";
  const destinazioni = righe.filter((r) => r.tipo === "destinazione" && attivo(r));
  const sitelink = righe.filter((r) => r.tipo === "sitelink" && r.finalUrl && attivo(r));
  const fermi =
    righe.filter((r) => !attivo(r) && (r.tipo === "destinazione" || (r.tipo === "sitelink" && r.finalUrl))).length;
  if (destinazioni.length === 0 && sitelink.length === 0) return null;

  // Le landing censite in app: quando l'URL combacia si offre anche la scheda
  // interna, con la sua scorecard. Il confronto ignora protocollo e barra
  // finale, che sono differenze di scrittura, non di pagina.
  const pulisci = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  const landing = new Map(
    (await prisma.landingPage.findMany({ select: { id: true, url: true, scorecard: true } })).map(
      (l) => [pulisci(l.url), l]
    )
  );

  // ⚠️ **I gruppi ACCESI che non dichiarano nessuna destinazione.** Il blocco
  // mostrava solo quello che c'era, e il silenzio sembrava completezza:
  // misurato l'08/08/2026 su «[Deluxy] - Fiori Milano ENG», delle nove
  // destinazioni nessuna era di **Flowers Delivery** — l'unico gruppo acceso,
  // cioè l'unico che sta spendendo. Alla domanda «dove mando il traffico» la
  // pagina rispondeva elencando le pagine dei gruppi fermi.
  //
  // Succede quando l'annuncio non ha una URL finale sua: le **Dynamic Search
  // Ads** non ce l'hanno per definizione — la pagina la sceglie Google dal
  // sito — e lo stesso vale per le PMax. Non è un buco dell'import: è una cosa
  // che quell'annuncio non dichiara, e va detta invece di lasciare il vuoto.
  const gruppiAccesi = await prisma.gruppo.findMany({
    where: { campagna: { nome: nomeCampagna }, statoPiattaforma: "ENABLED" },
    select: { nome: true, nomeVisibile: true },
  });
  const conDestinazione = new Set(destinazioni.map((d) => d.gruppo).filter(Boolean));
  const senzaDestinazione = gruppiAccesi.filter((g) => !conDestinazione.has(g.nome));

  const riga = (r: (typeof righe)[number]) => {
    const url = r.finalUrl ?? r.testo;
    const censita = landing.get(pulisci(url));
    return (
      <li key={r.id}>
        <a
          className="dest-url"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Apri la pagina in una finestra nuova"
        >
          {url.replace(/^https?:\/\//, "")}
          <span aria-hidden="true" className="tag-link-freccia">↗</span>
        </a>
        <span className="dest-note">
          {r.tipo === "sitelink" && <b>{r.testo} · </b>}
          {r.gruppo ? `${r.gruppo} · ` : ""}
          {r.note ?? ""}
        </span>
        {censita && (
          <a className="tag-neutro" href={`/landing/${censita.id}`}>
            scheda{censita.scorecard != null ? ` · ${censita.scorecard}/100` : ""}
          </a>
        )}
      </li>
    );
  };

  return (
    <section className="scheda">
      <div className="scheda-titolo">Dove mandano gli annunci</div>

      {destinazioni.length > 0 ? (
        <>
          <p className="cella-sub" style={{ marginBottom: 10, whiteSpace: "normal" }}>
            <b>Link diretto dell&apos;annuncio</b> ({destinazioni.length}): la pagina che si apre
            cliccando il <b>titolo</b>. È la landing vera della campagna — quella che deve
            convertire.
            {fermi > 0 && ` Solo quelle accese: ${fermi} in pausa su Google non sono in elenco.`}
          </p>
          <ul className="dest-elenco">{destinazioni.map(riga)}</ul>
          {senzaDestinazione.length > 0 && (
            <div className="nota-info" style={{ marginTop: 12, borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
              <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
              <span>
                {senzaDestinazione.length === 1 ? "Un gruppo acceso non ha" : `${senzaDestinazione.length} gruppi accesi non hanno`}{" "}
                <b>nessuna destinazione qui sopra</b>:{" "}
                {senzaDestinazione.map((g) => g.nomeVisibile ?? g.nome).join(", ")}. Sono quelli che
                stanno spendendo <b>adesso</b>, quindi l&apos;elenco non risponde alla domanda per
                la parte che conta di più. Succede quando l&apos;annuncio non dichiara una URL
                propria — le <b>Dynamic Search Ads</b> e le PMax non ce l&apos;hanno, perché la
                pagina la sceglie Google. In quel caso la landing si guarda in Google Ads.
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            La destinazione degli annunci <b>non è ancora arrivata</b>: fino al 04/08/2026 lo
            script non chiedeva a Google la URL finale, quindi nel database ci sono URL solo sui
            sitelink. Compare qui dopo il primo giro <b>copy</b> con lo script aggiornato.
          </span>
        </div>
      )}

      {sitelink.length > 0 && (
        <>
          <p className="cella-sub" style={{ margin: "16px 0 10px", whiteSpace: "normal" }}>
            <b>Sitelink</b> ({sitelink.length}): i collegamenti in piccolo <b>sotto</b>
            l&apos;annuncio, ognuno con la sua pagina. Sono un&apos;altra domanda — chi clicca un
            sitelink non sta andando sulla landing della campagna, sta scegliendo un&apos;altra
            strada. In grassetto il testo del collegamento, com&apos;è scritto nell&apos;annuncio.
          </p>
          <ul className="dest-elenco">{sitelink.map(riga)}</ul>
        </>
      )}
    </section>
  );
}
