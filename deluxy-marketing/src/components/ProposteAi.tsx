import { Badge } from "@/components/Badge";
import { accettaProposta, adattaProposta, chiediProposteAi, portaIdealeQui, portaIdealiQui, scartaProposta } from "@/lib/azioni";
import { formattaEuro, testoKeywordPulito } from "@/lib/dominio";
import { ContaSelezionate, SelezionaTutte } from "@/components/SelezioneRighe";
import { cittaDiNome, perAltraCitta } from "@/lib/nuova-campagna";
import {
  COLORE_AZIONE_PROPOSTA,
  ETICHETTA_AZIONE_PROPOSTA,
  ETICHETTA_CLASSE_PAROLA,
  idealiCheMancano,
  SPIEGA_CLASSE_PAROLA,
} from "@/lib/proposte-ai";
import { prisma } from "@/lib/db";

// Il pannello delle proposte dell'AI su keyword e parole cercate.
//
// ⚠️ Qui non succede niente su Google. L'AI **propone**, la proposta resta
// scritta finché una persona non la accetta, e accettarla mette in coda
// un'operazione che va comunque approvata. La catena app → coda → approvazione
// → script resta intera: l'AI è un parere in più, non una scorciatoia.
export async function ProposteAi({
  campagna,
  esito,
  errore,
}: {
  campagna: { id: string; nome: string; brand: string };
  esito?: string;
  errore?: string;
}) {
  const [proposte, mancanti] = await Promise.all([
    prisma.propostaAi.findMany({
      where: { campagnaId: campagna.id },
      orderBy: [{ stato: "asc" }, { creataIl: "desc" }],
    }),
    idealiCheMancano(campagna),
  ]);

  // La città di cui parla questa campagna: se una parola proposta ne nomina
  // un'altra, si può riscriverla per qui invece di scartarla.
  const cittaCampagna = cittaDiNome(campagna.nome);
  const aperte = proposte.filter((p) => p.stato === "proposta");
  const daFare = aperte.filter((p) => p.azione !== "tieni" && p.azione !== "osserva");
  const ultima = proposte[0]?.creataIl ?? null;

  return (
    <section className="scheda" id="proposte">
      <div className="scheda-titolo" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        Cosa farne, secondo l&apos;AI
        {daFare.length > 0 && <Badge testo={`${daFare.length} da decidere`} colore="var(--blue)" />}
      </div>

      {errore && (
        <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--red)" }}>⛔</span>
          <span>{errore}</span>
        </div>
      )}
      {esito && (
        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>{esito}</span>
        </div>
      )}

      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
        L&apos;AI guarda ogni keyword e ogni parola cercata di questa campagna e dice cosa ne farebbe,
        col numero da cui nasce la decisione. <b>Non tocca niente</b>: accettare una proposta mette in
        coda un&apos;operazione, che resta da approvare come tutte le altre. Le parole con troppi pochi
        clic non vengono nemmeno mandate all&apos;AI — su quelle la risposta è «aspetta», e la decide
        il codice, non un parere.
        {ultima && <> Ultimo giro: {ultima.toLocaleString("it-IT")}.</>}
      </p>

      <form action={chiediProposteAi.bind(null, campagna.id)} style={{ marginBottom: 14 }}>
        <button className="btn small" type="submit">
          {proposte.length > 0 ? "Chiedi di nuovo all'AI" : "Chiedi all'AI"}
        </button>
      </form>

      {aperte.length === 0 ? (
        <div className="vuoto-mini">
          {proposte.length === 0
            ? "Nessuna proposta ancora: premi il bottone qui sopra."
            : "Tutte le proposte sono state decise. Rilancia per rifarle sui numeri di oggi."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Parola</th>
                <th>Classe</th>
                <th>Cosa farne</th>
                <th>Perché</th>
                <th>Decidi</th>
              </tr>
            </thead>
            <tbody>
              {aperte.map((p) => {
                const eseguibile =
                  ["escludi", "pausa", "aggiungi", "alza", "abbassa"].includes(p.azione) && p.fiducia !== "bassa";
                // La parola nomina un'ALTRA città rispetto a questa campagna:
                // presa così com'è comprerebbe ricerche di un'altra piazza.
                // Riscritta, invece, è esattamente quella che serve qui.
                const adattata =
                  cittaCampagna && p.fiducia !== "bassa"
                    ? perAltraCitta(testoKeywordPulito(p.testo), cittaCampagna)
                    : null;
                return (
                  <tr key={p.id}>
                    <td style={{ maxWidth: 260 }}>
                      <div className="cella-nome">{p.testo}</div>
                      <div className="cella-sub">
                        {p.tipo === "keyword" ? "keyword comprata" : "parola cercata"}
                      </div>
                    </td>
                    <td>
                      {p.classe ? (
                        <span title={SPIEGA_CLASSE_PAROLA[p.classe]}>
                          <Badge
                            testo={ETICHETTA_CLASSE_PAROLA[p.classe] ?? p.classe}
                            colore={p.classe === "ideal" ? "var(--gold-strong)" : "var(--text-secondary)"}
                          />
                        </span>
                      ) : (
                        <span className="cella-sub">—</span>
                      )}
                    </td>
                    <td>
                      <Badge
                        testo={ETICHETTA_AZIONE_PROPOSTA[p.azione] ?? p.azione}
                        colore={COLORE_AZIONE_PROPOSTA[p.azione] ?? "var(--text-tertiary)"}
                      />
                      {p.fiducia === "bassa" && (
                        <div className="cella-sub">fiducia bassa: non eseguibile da qui</div>
                      )}
                    </td>
                    <td className="cella-muta" style={{ maxWidth: 380, whiteSpace: "normal" }}>
                      {p.motivo}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {eseguibile && (
                          <form action={accettaProposta.bind(null, p.id)}>
                            <button className="btn small" type="submit" title="Mette in coda l'operazione, da approvare">
                              Accetta
                            </button>
                          </form>
                        )}
                        {adattata && (
                          <form action={adattaProposta.bind(null, p.id)}>
                            <button
                              className="btn small btn-secondario"
                              type="submit"
                              title={`Mette in coda «${adattata}» invece di «${p.testo}»: stessa parola, la città di questa campagna`}
                            >
                              Adatta: {adattata}
                            </button>
                          </form>
                        )}
                        <form action={scartaProposta.bind(null, p.id)}>
                          <button className="btn small btn-secondario" type="submit">Scarta</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ——— Le ideali che qui mancano ——— */}
      <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 20, paddingTop: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <Badge testo="Ideali che qui mancano" colore="var(--gold-strong)" />
          <span className="cella-sub" style={{ whiteSpace: "normal" }}>
            parole che descrivono <b>quello che vendiamo</b> e che rendono su un&apos;altra campagna
            dello stesso brand, ma qui non ci sono.
          </span>
        </div>
        <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
          Si confrontano <b>solo le ideali</b>. «Consegna fiori Roma» vale anche a Milano, quindi si
          suggerisce; «maryflor Milano» è il nome di un&apos;insegna e resta dov&apos;è — trasportarla
          non vorrebbe dire niente. Nel dubbio l&apos;AI deve dire <i>specifica</i>: una ideale
          sbagliata viene poi proposta a tutte le altre campagne e propaga l&apos;errore.
        </p>
        {mancanti.length === 0 ? (
          <div className="vuoto-mini">
            Niente da suggerire: o le altre campagne del brand non sono ancora state giudicate
            dall&apos;AI, o quello che rende là c&apos;è già anche qui.
          </div>
        ) : (
          // ⚠️ UN FORM SOLO PER TUTTA LA TABELLA. I bottoni di riga restano
          // (con `formAction`, che vince su quella del form): chi ne vuole una
          // fa un clic come prima. Le spunte servono a chi le decide in blocco.
          <form action={portaIdealiQui.bind(null, campagna.id, cittaCampagna)}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <SelezionaTutte nome="ideali" titolo="Spunta tutte le parole suggerite" />
                  </th>
                  <th>Parola</th>
                  <th>Funziona su</th>
                  <th className="num">Spesa là</th>
                  <th className="num">Resa là</th>
                  <th>Perché l&apos;AI la promuove</th>
                  <th>Portala qui</th>
                </tr>
              </thead>
              <tbody>
                {mancanti.map((m) => {
                  // Se la parola nomina un'altra città e questa campagna ne ha
                  // una sua, presa com'è comprerebbe le ricerche dell'altra
                  // piazza: si riscrive, traducendo la lingua del testo.
                  const riscritta = cittaCampagna
                    ? perAltraCitta(testoKeywordPulito(m.testo), cittaCampagna)
                    : null;
                  return (
                  <tr key={m.testo}>
                    <td>
                      {/* Il valore e' la parola D'ORIGINE: l'adattamento lo
                          rifa' il server, cosi la regola vive in un posto solo. */}
                      <input type="checkbox" name="ideali" value={m.testo} aria-label={`Scegli «${m.testo}»`} />
                    </td>
                    <td className="cella-nome" style={{ maxWidth: 240 }}>{m.testo}</td>
                    <td className="cella-muta" style={{ maxWidth: 200 }}>
                      <a href={`/campagne/${m.daCampagnaId}`}>{m.daCampagna}</a>
                    </td>
                    <td className="num">{formattaEuro(m.spesa)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {m.resa != null ? `${m.resa.toFixed(2)}×` : "—"}
                    </td>
                    <td className="cella-muta" style={{ maxWidth: 340, whiteSpace: "normal" }}>{m.motivo}</td>
                    <td>
                      {riscritta ? (
                        <button
                          className="btn small"
                          type="submit"
                          formAction={portaIdealeQui.bind(null, campagna.id, m.testo, cittaCampagna)}
                          title={`Mette in coda «${riscritta}» invece di «${testoKeywordPulito(m.testo)}»: stessa parola, la città di questa campagna`}
                        >
                          Adatta: {riscritta}
                        </button>
                      ) : (
                        <button
                          className="btn small btn-secondario"
                          type="submit"
                          formAction={portaIdealeQui.bind(null, campagna.id, m.testo, null)}
                          title="Mette in coda la parola così com'è"
                        >
                          Porta qui
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* La barra sta SOTTO la tabella, dove finisce di leggere chi ha
              appena spuntato le righe. Il numero è quello vero delle caselle
              spuntate: se dicesse «porta le selezionate» senza dire quante,
              non ci sarebbe modo di accorgersi di una spunta di troppo. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <ContaSelezionate
              nome="ideali"
              etichetta={(n) =>
                n === 0 ? "Porta qui le selezionate" : n === 1 ? "Porta qui 1 parola" : `Porta qui ${n} parole`
              }
            />
            <span className="cella-sub" style={{ whiteSpace: "normal" }}>
              Ognuna diventa un&apos;operazione sua, da approvare: puoi dire sì a cinque e no a
              una. Dove serve, la parola viene adattata alla città di questa campagna.
            </span>
          </div>
          </form>
        )}
        <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
          Il confronto è sulle <b>parole</b>, non sulla stringa: «flower delivery milan» e «milan
          flower delivery» sono la stessa cosa e non si suggerisce due volte. Spesa e resa sono
          quelle <b>dell&apos;altra campagna</b>, congelate quando l&apos;AI l&apos;ha giudicata: dicono
          che là funziona, non che qui funzionerà.
        </p>
      </div>
    </section>
  );
}
