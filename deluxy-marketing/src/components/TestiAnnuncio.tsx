import { ETICHETTA_GIUDIZIO_GOOGLE, GIUDIZI_GOOGLE } from "@/lib/dominio";

// Titoli e descrizioni come si vedono in Google Ads: una scheda per testo, con
// sotto il conteggio dei caratteri sul limite (21 / 30). È la stessa forma che
// si ha davanti quando si scrive l'annuncio, e serve a poter confrontare senza
// tradurre a mente da un elenco all'altro.
//
// ⚠️ Il conteggio in cima è **quanti ne esistono su quanti ne può mostrare un
// annuncio** (15 titoli, 4 descrizioni). Non è una percentuale di
// completamento: una campagna può avere trenta titoli diversi sparsi su più
// annunci e stare benissimo.
export type TestoAnnuncio = {
  id: string;
  tipo: string; // titolo | descrizione
  testo: string;
  caratteri: number | null;
  rendimento: string | null;
  // Gli ID degli annunci che usano questo testo, separati da virgola; ogni
  // voce può portare lo stato attaccato ("id:ENABLED", dall'11/08).
  annunci?: string | null;
  finalUrl?: string | null;
};

const LIMITE: Record<string, number> = { titolo: 30, descrizione: 90 };
const PER_ANNUNCIO: Record<string, number> = { titolo: 15, descrizione: 4 };

// `{KeyWord:...}` è inserimento dinamico: Google ci mette la parola cercata,
// quindi la lunghezza scritta non è quella vera e segnarla in rosso è un
// allarme falso.
const dinamico = (t: string) => /\{(keyword|customizer|countdown)/i.test(t);

function Gruppo({ titolo, tipo, testi }: { titolo: string; tipo: string; testi: TestoAnnuncio[] }) {
  if (testi.length === 0) return null;
  const limite = LIMITE[tipo] ?? 30;
  return (
    <div className="ga-blocco">
      <div className="ga-intestazione">
        {titolo} <span className="ga-conteggio">{testi.length}</span>
        <span className="ga-su">su {PER_ANNUNCIO[tipo] ?? 15} per annuncio</span>
      </div>
      {testi.map((t) => {
        const din = dinamico(t.testo);
        const lungo = !din && (t.caratteri ?? 0) > limite;
        const giudizio =
          t.rendimento && GIUDIZI_GOOGLE.includes(t.rendimento)
            ? ETICHETTA_GIUDIZIO_GOOGLE[t.rendimento] ?? t.rendimento
            : null;
        return (
          <div className="ga-riga" key={t.id}>
            <div className={`ga-casella${lungo ? " oltre" : ""}`}>{t.testo}</div>
            <div className="ga-sotto">
              {giudizio && <span className="ga-giudizio">{giudizio}</span>}
              <span className={lungo ? "ga-caratteri oltre" : "ga-caratteri"}>
                {din ? "dinamico" : `${t.caratteri ?? "?"} / ${limite}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TestiAnnuncio({
  testi,
  destinazioni = [],
}: {
  testi: TestoAnnuncio[];
  // Le righe `tipo: "destinazione"` del gruppo: portano l'elenco degli
  // annunci che le usano, e da lì si scrive la landing sotto ogni colonna.
  destinazioni?: TestoAnnuncio[];
}) {
  const titoli = testi.filter((t) => t.tipo === "titolo");
  const descrizioni = testi.filter((t) => t.tipo === "descrizione");
  if (titoli.length === 0 && descrizioni.length === 0) return null;

  const giudicati = testi.filter((t) => t.rendimento && GIUDIZI_GOOGLE.includes(t.rendimento)).length;
  // Senza giudizio si ordina per lunghezza: è l'unica cosa azionabile rimasta.
  const perLunghezza = (a: TestoAnnuncio, b: TestoAnnuncio) => (b.caratteri ?? 0) - (a.caratteri ?? 0);

  // ⚠️ Un elenco di 39 titoli e 12 descrizioni non è quello che vede chi cerca:
  // quello che va in asta è **un annuncio**, con i suoi 15 titoli e le sue 4
  // descrizioni. Qui si rimettono insieme, una colonna per annuncio.
  //
  // Serve `annunci` (gli ID che usano ogni testo), che arriva dal giro `copy`
  // dello script aggiornato al 07/08/2026: finché non passa, quel campo è
  // vuoto e si mostra l'elenco unico DICENDO perché.
  const perAnnuncio = new Map<string, TestoAnnuncio[]>();
  // Lo STATO di ogni annuncio, quando la voce lo porta ("id:ENABLED", dallo
  // script aggiornato l'11/08): senza, le colonne non dicevano quale annuncio
  // è in asta e quale è fermo. Le voci vecchie (solo id) restano leggibili.
  const statoAnnuncio = new Map<string, string>();
  for (const t of testi) {
    for (const voce of (t.annunci ?? "").split(",").filter(Boolean)) {
      const [id, stato] = voce.split(":");
      if (!id) continue;
      if (stato && !statoAnnuncio.has(id)) statoAnnuncio.set(id, stato);
      const v = perAnnuncio.get(id) ?? [];
      v.push(t);
      perAnnuncio.set(id, v);
    }
  }
  // Dalle DESTINAZIONI (che sono per gruppo, non condivise): dove manda ogni
  // annuncio, il suo stato, e — quando ci sono — il RECINTO del gruppo.
  //
  // ⚠️ I testi sono CONDIVISI fra gruppi: le loro voci citano anche annunci
  // di ALTRI gruppi, e sulla scheda comparivano colonne e «attivi» che su
  // Google stanno altrove — misurato l'11/08: 4 attivi nell'app contro 1
  // Eligible su Google. Gli annunci delle destinazioni sono del gruppo:
  // quando l'elenco c'è, le colonne si limitano a quelli.
  const landingAnnuncio = new Map<string, string>();
  const annunciDelGruppo = new Set<string>();
  for (const d of destinazioni) {
    const url = d.finalUrl ?? d.testo;
    for (const voce of (d.annunci ?? "").split(",").filter(Boolean)) {
      const [id, stato] = voce.split(":");
      if (!id) continue;
      annunciDelGruppo.add(id);
      if (stato && !statoAnnuncio.has(id)) statoAnnuncio.set(id, stato);
      if (url && !landingAnnuncio.has(id)) landingAnnuncio.set(id, url);
    }
  }

  // Prima gli annunci IN ASTA (è quello che si guarda per primo), poi i più
  // ricchi: un annuncio con 15 titoli è quello completo, uno con 3 un residuo.
  const annunci = [...perAnnuncio.entries()]
    .filter(([id]) => annunciDelGruppo.size === 0 || annunciDelGruppo.has(id))
    .sort((a, b) => {
      const pesoA = statoAnnuncio.get(a[0]) === "ENABLED" ? 0 : 1;
      const pesoB = statoAnnuncio.get(b[0]) === "ENABLED" ? 0 : 1;
      return pesoA - pesoB || b[1].length - a[1].length;
    });

  const nota =
    giudicati === 0 ? (
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        Google <b>non li giudica</b>: su questa campagna risponde «non applicabile» su tutti,
        quindi non c&apos;è un migliore e un peggiore da mostrare. Sotto ogni testo, i caratteri
        sul limite — in rosso quelli che Google troncherebbe.
      </p>
    ) : null;

  if (annunci.length === 0) {
    return (
      <>
        {nota}
        <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
          Questi sono <b>tutti i testi della campagna messi insieme</b>, non i singoli annunci:
          per dividerli serve sapere quale annuncio usa quale testo, e quel dato arriva col
          prossimo giro <code>AZIONE = &quot;copy&quot;</code> dello script.
        </p>
        <div className="ga-colonne">
          <Gruppo titolo="Titoli" tipo="titolo" testi={[...titoli].sort(perLunghezza)} />
          <Gruppo titolo="Descrizioni" tipo="descrizione" testi={[...descrizioni].sort(perLunghezza)} />
        </div>
      </>
    );
  }

  return (
    <>
      {nota}
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
        Una colonna per <b>annuncio</b> ({annunci.length}): sono i testi che vanno in asta
        insieme. Lo stesso titolo può comparire in più annunci — è normale, ed è il motivo per
        cui la somma delle colonne è più grande del numero di testi diversi.
      </p>
      <div className="ga-colonne">
        {annunci.map(([id, suoi], i) => {
          const stato = statoAnnuncio.get(id);
          return (
          <div key={id}>
            <div className="ga-annuncio" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Annuncio {i + 1}
              {/* Il fatto di Google, per annuncio: attivo = in asta adesso. */}
              {stato === "ENABLED" ? (
                <span className="tag-salute" style={{ color: "var(--green)" }}>
                  <span className="dot" />attivo
                </span>
              ) : stato === "PAUSED" ? (
                <span className="tag-salute" style={{ color: "var(--ardesia)" }}>
                  <span className="dot" />in pausa
                </span>
              ) : (
                <span
                  className="cella-sub"
                  title="Lo stato per annuncio arriva col giro copy dello script aggiornato all'11/08: finché non passa, non si sa"
                >
                  stato non ancora letto
                </span>
              )}
            </div>
            {/* DOVE MANDA questo annuncio: la landing vera, cliccabile. Se i
                dati sono di prima dell'11/08 il legame non c'è, e si tace. */}
            {landingAnnuncio.has(id) && (
              <div className="cella-sub" style={{ marginBottom: 8, overflowWrap: "anywhere" }}>
                ↳{" "}
                <a
                  href={landingAnnuncio.get(id)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--blue)" }}
                  title="La final URL dell'annuncio, come sta su Google"
                >
                  {landingAnnuncio.get(id)!.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
            <Gruppo
              titolo="Titoli"
              tipo="titolo"
              testi={suoi.filter((t) => t.tipo === "titolo").sort(perLunghezza)}
            />
            <Gruppo
              titolo="Descrizioni"
              tipo="descrizione"
              testi={suoi.filter((t) => t.tipo === "descrizione").sort(perLunghezza)}
            />
          </div>
          );
        })}
      </div>
    </>
  );
}
