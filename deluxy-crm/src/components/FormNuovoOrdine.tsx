"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { creaOrdineDalCrm } from "@/lib/actions";
import type {
  NegozioCS,
  OpzioniCS,
  ProdottoCS,
  RigaNuovoOrdine,
  RispostaTariffeCS,
  EsitoCreazione,
} from "@/lib/nuovo-ordine";

// Il form «ordine al telefono» del CRM: si compila col cliente in linea, la
// bozza nasce su Shopify (via Customer Service) e il link di pagamento arriva
// qui, pronto da copiare o mandare per mail. Client component perché le righe
// si accumulano e il catalogo si cerca mentre si parla.
//
// Dall'11/09/2026 le OPZIONI sono quelle del Customer Service, chieste a lui
// (/api/v1/nuovo-ordine/opzioni): le fasce vengono dagli orari del negozio per
// il giorno scelto (o si scrivono a mano, «flessibile»), le spedizioni dalle
// voci usate e dalle tariffe del sito per quell'indirizzo (con la stima fuori
// zona), i metodi di pagamento da quelli visti, l'IVA come scelta, e in più
// destinatario diverso, consegna anonima, consenso marketing, eccezione agli
// orari per un giorno chiuso. Se il CS non risponde, il modulo lo dice e resta
// utilizzabile con le voci a mano.

type Props = {
  codice: string;
  cliente: { nome: string; cognome: string; email: string; telefono: string };
  indirizzo: { indirizzo: string; cap: string; citta: string; provincia: string; paese: string } | null;
  negozi: NegozioCS[];
  negozioSuggerito: string;
};

type RigaMostrata = RigaNuovoOrdine & { etichetta: string; immagine?: string };

const euro = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

/** Oggi in Italia, AAAA-MM-GG (le date si confrontano come stringhe, mai come Date). */
function oggiRoma(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

export default function FormNuovoOrdine({ codice, cliente, indirizzo, negozi, negozioSuggerito }: Props) {
  const [negozioId, setNegozioId] = useState(negozioSuggerito || negozi[0]?.id || "");
  const [righe, setRighe] = useState<RigaMostrata[]>([]);
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState<ProdottoCS[]>([]);
  const [ricercaNota, setRicercaNota] = useState<string | null>(null);
  const [cercando, setCercando] = useState(false);

  // Le opzioni del CS per il negozio scelto.
  const [opzioni, setOpzioni] = useState<OpzioniCS | null>(null);
  const [opzioniNota, setOpzioniNota] = useState<string | null>(null);

  // La consegna.
  const [data, setData] = useState("");
  const [fascia, setFascia] = useState("");
  const [fasciaLibera, setFasciaLibera] = useState(false);
  const [eccezione, setEccezione] = useState(false);
  const [eccezioneMotivo, setEccezioneMotivo] = useState("");
  const [via, setVia] = useState(indirizzo?.indirizzo ?? "");
  const [cap, setCap] = useState(indirizzo?.cap ?? "");
  const [citta, setCitta] = useState(indirizzo?.citta ?? "");
  const [provincia, setProvincia] = useState(indirizzo?.provincia ?? "");
  const [paese, setPaese] = useState(indirizzo?.paese ?? "IT");
  const [altroDestinatario, setAltroDestinatario] = useState(false);
  const [anonima, setAnonima] = useState(false);

  // La spedizione: «u:i» voce usata · «t:i» tariffa del sito · nessuna · custom.
  const [spedizione, setSpedizione] = useState<string>("nessuna");
  const [tariffe, setTariffe] = useState<RispostaTariffeCS | null>(null);
  const [tariffeStato, setTariffeStato] = useState<"" | "carico" | "ok" | "errore">("");
  const [tariffeNota, setTariffeNota] = useState("");
  const [customTitolo, setCustomTitolo] = useState("");
  const [customPrezzo, setCustomPrezzo] = useState("");

  // Chi paga e come.
  const [consensoMarketing, setConsensoMarketing] = useState(true);
  const [aggiungiIva, setAggiungiIva] = useState(false);
  const [pagamento, setPagamento] = useState<"link" | "pagato">("link");
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<EsitoCreazione | null>(null);
  const [copiato, setCopiato] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // ---- Le opzioni sono del negozio: cambiano quando cambia lui -------------
  useEffect(() => {
    let vivo = true;
    setOpzioni(null);
    setOpzioniNota(null);
    setSpedizione("nessuna");
    setTariffe(null);
    setTariffeStato("");
    if (!negozioId) return;
    fetch(`/api/interno/opzioni-ordine?negozio=${encodeURIComponent(negozioId)}`)
      .then(async (r) => {
        const d = (await r.json()) as OpzioniCS & { errore?: string };
        if (!vivo) return;
        if (!r.ok || d.errore) {
          setOpzioniNota(
            d.errore ??
              "Il Customer Service non dice le sue opzioni per questo negozio: fasce, spedizioni e mezzi si scrivono a mano.",
          );
          return;
        }
        setOpzioni(d);
        setAggiungiIva(Boolean(d.iva?.predefinito));
        setSpedizione(d.spedizioni?.length ? "u:0" : "nessuna");
      })
      .catch(() => {
        if (vivo) setOpzioniNota("Il Customer Service non risponde: fasce, spedizioni e mezzi si scrivono a mano.");
      });
    return () => {
      vivo = false;
    };
  }, [negozioId]);

  // ---- Il giorno e le sue fasce (dagli orari del negozio) -------------------
  const oggi = oggiRoma();
  const giorno = data && opzioni ? (opzioni.fasce.calendario.find((g) => g.data === data) ?? null) : null;
  const dataPassata = Boolean(data) && data < oggi;
  const giornoEsito = dataPassata
    ? { ok: false, motivo: `${data} è già passato.` }
    : giorno
      ? { ok: giorno.ok, motivo: giorno.motivo }
      : null;
  const fasceDelGiorno: string[] = opzioni
    ? giorno
      ? giorno.fasce
      : opzioni.fasce.oltre
    : ["08-12", "12-16", "16-20"];
  const giornoChiusoMaConcordabile = Boolean(giornoEsito && !giornoEsito.ok && !dataPassata);
  useEffect(() => {
    if (!giornoChiusoMaConcordabile) {
      setEccezione(false);
      setEccezioneMotivo("");
    }
  }, [giornoChiusoMaConcordabile]);
  // Una fascia già scelta che il giorno nuovo non offre più: si passa a mano,
  // altrimenti la tendina la cancellerebbe scegliendo la prima al posto suo.
  const chiaveFasce = fasceDelGiorno.join("|");
  useEffect(() => {
    if (fascia.trim() && !chiaveFasce.split("|").includes(fascia.trim())) setFasciaLibera(true);
  }, [fascia, chiaveFasce]);

  // ---- Le tariffe del sito per QUESTO indirizzo e QUESTE righe --------------
  const chiaveRighe = useMemo(() => righe.map((r) => `${r.variantId ?? r.titolo}:${r.prezzo ?? ""}x${r.quantita}`).join("|"), [righe]);
  useEffect(() => {
    if (!negozioId || !righe.length || !(citta.trim() || cap.trim())) {
      setTariffe(null);
      setTariffeStato("");
      return;
    }
    let vivo = true;
    setTariffeStato("carico");
    setTariffeNota("");
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/interno/tariffe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            negozioId,
            indirizzo: { indirizzo: via, citta, cap, provincia, paese: paese || "IT" },
            righe: righe.map(({ variantId, titolo, prezzo, quantita }) => (variantId ? { variantId, quantita } : { titolo, prezzo, quantita })),
          }),
        });
        const d = (await r.json()) as RispostaTariffeCS & { errore?: string };
        if (!vivo) return;
        if (!r.ok || d.errore) {
          setTariffeStato("errore");
          setTariffeNota(d.errore ?? "Il sito non ha risposto sulle tariffe.");
          return;
        }
        setTariffe(d);
        setTariffeStato("ok");
      } catch {
        if (vivo) {
          setTariffeStato("errore");
          setTariffeNota("Il sito non ha risposto sulle tariffe.");
        }
      }
    }, 700);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negozioId, chiaveRighe, citta, cap, provincia, paese, via]);

  // ---- Il catalogo -----------------------------------------------------------
  async function cerca() {
    if (!q.trim() || !negozioId) return;
    setCercando(true);
    setRicercaNota(null);
    try {
      const r = await fetch(`/api/interno/prodotti?negozio=${encodeURIComponent(negozioId)}&q=${encodeURIComponent(q.trim())}`);
      const d = (await r.json()) as { stato?: string; prodotti?: ProdottoCS[]; messaggio?: string; errore?: string };
      if (d.stato === "ok") {
        setRisultati(d.prodotti ?? []);
        if (!d.prodotti?.length) setRicercaNota("Nessun prodotto con questo nome nel catalogo del negozio.");
      } else if (d.stato === "senza-permesso") {
        setRisultati([]);
        setRicercaNota("Questo negozio non lascia leggere il catalogo: usa la riga scritta a mano qui sotto.");
      } else {
        setRisultati([]);
        setRicercaNota(d.messaggio ?? d.errore ?? "La ricerca non ha risposto.");
      }
    } catch {
      setRicercaNota("La ricerca non ha risposto: riprova.");
    } finally {
      setCercando(false);
    }
  }

  function aggiungiDalCatalogo(p: ProdottoCS) {
    setRighe((r) => [
      ...r,
      {
        variantId: p.variantId,
        titolo: `${p.titolo}${p.variante ? ` — ${p.variante}` : ""}`,
        prezzo: p.prezzo,
        quantita: 1,
        etichetta: `${p.titolo}${p.variante ? ` — ${p.variante}` : ""} · ${euro(p.prezzo)}`,
        immagine: p.immagine,
      },
    ]);
    setRisultati([]);
    setQ("");
  }

  function aggiungiAMano() {
    const titolo = (formRef.current?.elements.namedItem("rigaTitolo") as HTMLInputElement | null)?.value.trim();
    const prezzoTesto = (formRef.current?.elements.namedItem("rigaPrezzo") as HTMLInputElement | null)?.value;
    const prezzo = Number((prezzoTesto ?? "").replace(",", "."));
    if (!titolo || !Number.isFinite(prezzo) || prezzo < 0) return;
    setRighe((r) => [...r, { titolo, prezzo, quantita: 1, etichetta: `${titolo} · ${euro(prezzo)} (fuori catalogo)` }]);
    const t = formRef.current?.elements.namedItem("rigaTitolo") as HTMLInputElement | null;
    const p = formRef.current?.elements.namedItem("rigaPrezzo") as HTMLInputElement | null;
    if (t) t.value = "";
    if (p) p.value = "";
  }

  // ---- La spedizione scelta, in cifre --------------------------------------
  function spedizioneScelta(): { titolo: string; prezzo: number } {
    if (spedizione === "nessuna") return { titolo: "", prezzo: 0 };
    if (spedizione === "custom") return { titolo: customTitolo.trim() || "Consegna", prezzo: Number(customPrezzo.replace(",", ".")) || 0 };
    const [tipo, i] = spedizione.split(":");
    if (tipo === "u") {
      const s = opzioni?.spedizioni[Number(i)];
      return { titolo: s?.titolo ?? "", prezzo: s?.prezzo ?? 0 };
    }
    const t = tariffe?.tariffe[Number(i)];
    return { titolo: t?.titolo ?? "", prezzo: t?.prezzo ?? 0 };
  }
  const totaleRighe = righe.reduce((s, r) => s + (r.prezzo ?? 0) * r.quantita, 0);
  const totale = totaleRighe + spedizioneScelta().prezzo;

  // ---- L'invio ---------------------------------------------------------------
  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inCorso) return;
    const fd = new FormData(e.currentTarget);
    const v = (nome: string) => String(fd.get(nome) ?? "").trim();

    if (!righe.length) {
      setEsito({ ok: false, errore: "Aggiungi almeno un prodotto (dal catalogo o scritto a mano)." });
      return;
    }
    // Gli orari del negozio: una data chiusa non passa, salvo eccezione
    // concordata con motivo. Lo stesso controllo lo rifà il CS alla creazione.
    if (giornoEsito && !giornoEsito.ok) {
      if (dataPassata) {
        setEsito({ ok: false, errore: `${giornoEsito.motivo} Una data passata non si può concordare.` });
        return;
      }
      if (!eccezione || !eccezioneMotivo.trim()) {
        setEsito({ ok: false, errore: `${giornoEsito.motivo} Scegli un altro giorno, oppure spunta «Eccezione concordata» e scrivi il motivo.` });
        return;
      }
    }
    if (pagamento === "link" && !v("email")) {
      setEsito({ ok: false, errore: "Per mandare il link di pagamento serve l'email del cliente." });
      return;
    }

    setInCorso(true);
    setEsito(null);
    try {
      const r = await creaOrdineDalCrm({
        chiaveCliente: codice,
        nomeCliente: [v("nome"), v("cognome")].filter(Boolean).join(" "),
        negozioId,
        cliente: { nome: v("nome"), cognome: v("cognome"), email: v("email"), telefono: v("telefono") },
        consegna: {
          data,
          fascia: fascia.trim(),
          indirizzo: via.trim(),
          civicoNote: v("civicoNote"),
          cap: cap.trim(),
          citta: citta.trim(),
          provincia: provincia.trim(),
          paese: paese.trim() || "IT",
        },
        righe: righe.map(({ variantId, titolo, prezzo, quantita }) => (variantId ? { variantId, quantita } : { titolo, prezzo, quantita })),
        biglietto: v("biglietto"),
        spedizione: spedizioneScelta(),
        pagamento,
        mezzoPagamento: pagamento === "pagato" ? v("mezzoPagamento") : "",
        destinatario: altroDestinatario ? { nome: v("destNome"), cognome: v("destCognome"), telefono: v("destTelefono") } : undefined,
        anonima,
        consensoMarketing,
        aggiungiIva,
        eccezioneOrari: giornoChiusoMaConcordabile && eccezione ? eccezioneMotivo.trim() : "",
      });
      setEsito(r);
      if (r.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setInCorso(false);
    }
  }

  async function copiaLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      /* la selezione manuale resta possibile */
    }
  }

  // ---- Esito: l'ordine è nato -------------------------------------------
  if (esito?.ok) {
    const linkMail = `/mail/componi?cliente=${encodeURIComponent(codice)}&ordinelink=${encodeURIComponent(esito.linkPagamento)}`;
    return (
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-titolo">{esito.ordineNumero ? `Ordine ${esito.ordineNumero} creato` : "Ordine creato"}</div>
        <div className="card-sub">
          {esito.ordineNumero
            ? "Era già pagato: su Shopify è nato chiuso e pagato, e rientrerà dal registro Orders come tutti gli altri."
            : "La bozza è su Shopify: quando il cliente paga dal link, l'ordine nasce da sé e rientra dal registro Orders."}
        </div>
        {esito.linkPagamento ? (
          <>
            <div className="campo">
              <label>Link di pagamento</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" readOnly value={esito.linkPagamento} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn ghost" type="button" onClick={() => copiaLink(esito.linkPagamento)}>
                  {copiato ? "Copiato ✓" : "Copia"}
                </button>
              </div>
              <span className="aiuto">
                {esito.inviato
                  ? "Shopify ha già mandato la mail col link all'indirizzo del cliente; da qui puoi comunque mandarne una tua, più personale."
                  : "Il link non si salva da nessuna parte: copialo o mandalo ora."}
              </span>
            </div>
            <div className="form-piede" style={{ justifyContent: "flex-start" }}>
              <a className="btn" href={linkMail}>Manda il link per mail</a>
              <a className="btn ghost" href={`/clienti/${encodeURIComponent(codice)}`}>Torna alla scheda</a>
            </div>
          </>
        ) : (
          <div className="form-piede" style={{ justifyContent: "flex-start" }}>
            <a className="btn" href={`/clienti/${encodeURIComponent(codice)}`}>Torna alla scheda</a>
          </div>
        )}
      </div>
    );
  }

  const primoAperto = opzioni?.fasce.primoGiornoAperto ?? null;
  const stima = tariffe?.stima ?? null;

  // ---- Il form ------------------------------------------------------------
  return (
    <form ref={formRef} onSubmit={invia} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
      {esito && !esito.ok ? <div className="errore-card">{esito.errore}</div> : null}
      {opzioniNota ? <div className="errore-card">{opzioniNota}</div> : null}

      <div className="griglia lavoro" style={{ alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Cosa ordina</div>
            <div className="card-sub">Cerca nel catalogo del negozio, o scrivi una riga a mano per i fuori listino.</div>

            <div className="campo">
              <label>Negozio</label>
              <select value={negozioId} onChange={(e) => setNegozioId(e.target.value)}>
                {negozi.map((n) => (
                  <option key={n.id} value={n.id}>{n.nome}</option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label>Cerca nel catalogo</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void cerca();
                    }
                  }}
                  placeholder="es. bouquet peonie"
                />
                <button className="btn ghost" type="button" onClick={() => void cerca()} disabled={cercando}>
                  {cercando ? "Cerco…" : "Cerca"}
                </button>
              </div>
              {ricercaNota ? <span className="aiuto">{ricercaNota}</span> : null}
            </div>

            {risultati.length ? (
              <div className="timeline" style={{ marginBottom: 8 }}>
                {risultati.slice(0, 8).map((p) => (
                  <div className="timeline-voce" key={p.variantId}>
                    {p.immagine ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="mini-foto" src={p.immagine} alt="" />
                    ) : null}
                    <div className="timeline-corpo">
                      <div className="timeline-titolo">
                        {p.titolo}
                        {p.variante ? <span className="secondario"> — {p.variante}</span> : null}
                      </div>
                      <div className="timeline-quando">
                        {euro(p.prezzo)} {p.disponibile ? "" : "· non disponibile"}
                      </div>
                    </div>
                    <button className="btn ghost mini" type="button" style={{ alignSelf: "center" }} onClick={() => aggiungiDalCatalogo(p)}>
                      Aggiungi
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="form-riga" style={{ alignItems: "flex-end" }}>
              <div className="campo" style={{ flex: 2, marginBottom: 0 }}>
                <label>Riga a mano</label>
                <input type="text" name="rigaTitolo" placeholder="es. Bouquet su misura, peonie e rose" />
              </div>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label>Prezzo €</label>
                <input type="text" name="rigaPrezzo" inputMode="decimal" placeholder="es. 350" />
              </div>
              <button className="btn ghost" type="button" onClick={aggiungiAMano} style={{ marginBottom: 1 }}>
                Aggiungi
              </button>
            </div>

            {righe.length ? (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--hairline)", paddingTop: 6 }}>
                {righe.map((r, i) => (
                  <div className="timeline-voce" key={i}>
                    {r.immagine ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="mini-foto" src={r.immagine} alt="" />
                    ) : null}
                    <div className="timeline-corpo">
                      <div className="timeline-titolo">{r.etichetta}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="number"
                        min={1}
                        value={r.quantita}
                        onChange={(e) =>
                          setRighe((tutte) => tutte.map((x, j) => (j === i ? { ...x, quantita: Math.max(1, Number(e.target.value) || 1) } : x)))
                        }
                        style={{ width: 64 }}
                      />
                      <button className="btn rosso mini" type="button" onClick={() => setRighe((tutte) => tutte.filter((_, j) => j !== i))}>
                        Togli
                      </button>
                    </div>
                  </div>
                ))}
                <p className="secondario piccolo" style={{ marginTop: 8 }}>
                  Prodotti {euro(totaleRighe)} · con la consegna {euro(totale)}
                  {aggiungiIva ? " · più IVA" : ""}
                </p>
              </div>
            ) : (
              <p className="terziario piccolo" style={{ marginTop: 12 }}>Nessuna riga ancora: l&apos;ordine parte da qui.</p>
            )}
          </div>

          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Consegna</div>
            <div className="card-sub">
              Giorno e fascia come li offre il negozio (dai suoi orari nel Customer Service); finiscono negli attributi che
              Orders sa leggere.
            </div>
            <div className="form-riga">
              <div className="campo">
                <label>Giorno</label>
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-invalid={giornoEsito ? !giornoEsito.ok : undefined} />
                {giornoEsito && !giornoEsito.ok ? (
                  <span className="aiuto" style={{ color: "var(--red)" }}>{giornoEsito.motivo}</span>
                ) : giorno && giorno.ok && giorno.fasce.length === 0 ? (
                  <span className="aiuto" style={{ color: "var(--gold-strong)" }}>
                    Per questo giorno non resta nessuna fascia: se è concordato, scrivila a mano («flessibile»).
                  </span>
                ) : primoAperto && !data ? (
                  <span className="aiuto">Primo giorno in cui il negozio consegna: {primoAperto}.</span>
                ) : opzioni && !opzioni.fasce.configurato ? (
                  <span className="aiuto">Questo negozio non ha orari scritti nel Customer Service: nessun controllo sul giorno.</span>
                ) : null}
              </div>
              <div className="campo">
                <label>Fascia oraria</label>
                {fasciaLibera ? (
                  <>
                    <input type="text" value={fascia} onChange={(e) => setFascia(e.target.value)} placeholder="es. 17-18, o «dopo le 20»" />
                    <button
                      type="button"
                      className="btn ghost mini"
                      style={{ alignSelf: "flex-start" }}
                      onClick={() => {
                        setFasciaLibera(false);
                        setFascia("");
                      }}
                    >
                      Torna alle fasce del negozio
                    </button>
                  </>
                ) : (
                  <select
                    value={fascia}
                    onChange={(e) => {
                      if (e.target.value === "__libera") {
                        setFasciaLibera(true);
                        setFascia("");
                        return;
                      }
                      setFascia(e.target.value);
                    }}
                  >
                    <option value="">— scegli la fascia —</option>
                    {fasceDelGiorno.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                    <option value="__libera">Flessibile: la scrivo io…</option>
                  </select>
                )}
              </div>
            </div>

            {giornoChiusoMaConcordabile ? (
              <div className="campo" style={{ gap: 6 }}>
                <label className="scelta" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={eccezione} onChange={(e) => setEccezione(e.target.checked)} />{" "}
                  <strong style={{ fontWeight: 550 }}>Eccezione concordata</strong> — si consegna lo stesso quel giorno
                </label>
                {eccezione ? (
                  <>
                    <input
                      type="text"
                      value={eccezioneMotivo}
                      onChange={(e) => setEccezioneMotivo(e.target.value)}
                      maxLength={200}
                      placeholder="con chi e perché (es. concordato col fioraio, consegna anche la domenica)"
                      aria-label="Motivo dell'eccezione"
                    />
                    <span className="aiuto">Il motivo finisce nella nota dell&apos;ordine: lo legge chi prepara e chi consegna.</span>
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="campo">
              <label>Indirizzo</label>
              <input type="text" value={via} onChange={(e) => setVia(e.target.value)} placeholder="via e numero civico" />
            </div>
            <div className="form-riga">
              <div className="campo">
                <label>CAP</label>
                <input type="text" value={cap} onChange={(e) => setCap(e.target.value)} />
              </div>
              <div className="campo">
                <label>Città</label>
                <input type="text" value={citta} onChange={(e) => setCitta(e.target.value)} />
              </div>
              <div className="campo">
                <label>Prov.</label>
                <input type="text" value={provincia} onChange={(e) => setProvincia(e.target.value)} maxLength={2} />
              </div>
              <div className="campo">
                <label>Paese</label>
                <input type="text" value={paese} onChange={(e) => setPaese(e.target.value)} maxLength={2} />
              </div>
            </div>
            <div className="campo">
              <label>Note per la consegna</label>
              <input type="text" name="civicoNote" placeholder="citofono, piano, portineria…" />
            </div>

            <div className="campo" style={{ gap: 6 }}>
              <label className="scelta" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={altroDestinatario} onChange={(e) => setAltroDestinatario(e.target.checked)} /> Riceve
                un&apos;altra persona <span className="aiuto">(nei regali il valet chiama lei, non chi paga)</span>
              </label>
              {altroDestinatario ? (
                <div className="form-riga">
                  <div className="campo" style={{ marginBottom: 0 }}>
                    <label>Nome</label>
                    <input type="text" name="destNome" />
                  </div>
                  <div className="campo" style={{ marginBottom: 0 }}>
                    <label>Cognome</label>
                    <input type="text" name="destCognome" />
                  </div>
                  <div className="campo" style={{ marginBottom: 0 }}>
                    <label>Telefono</label>
                    <input type="text" name="destTelefono" placeholder="lo chiama il valet sotto casa" />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="campo">
              <label className="scelta" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={anonima} onChange={(e) => setAnonima(e.target.checked)} /> Consegna anonima{" "}
                <span className="aiuto">(chi riceve non deve sapere da parte di chi)</span>
              </label>
            </div>

            <div className="campo">
              <label>Biglietto / dedica</label>
              <textarea name="biglietto" rows={2} placeholder="Il testo che accompagna il regalo" />
            </div>

            <div className="campo" style={{ marginBottom: 0 }}>
              <label>
                Spedizione{" "}
                {tariffeStato === "carico" ? <span className="aiuto">(chiedo le tariffe al sito…)</span> : null}
              </label>
              <select value={spedizione} onChange={(e) => setSpedizione(e.target.value)}>
                {opzioni?.spedizioni.length ? (
                  <optgroup label="Voci che il negozio usa">
                    {opzioni.spedizioni.map((s, i) => (
                      <option key={`u${i}`} value={`u:${i}`}>
                        {s.titolo} — {euro(s.prezzo)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {tariffe?.tariffe.length ? (
                  <optgroup label="Tariffe del sito per questo indirizzo">
                    {tariffe.tariffe.map((t, i) => (
                      <option key={`t${i}`} value={`t:${i}`}>
                        {t.titolo} — {euro(t.prezzo)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <option value="nessuna">Senza voce di spedizione</option>
                <option value="custom">Altra (scrivila sotto)</option>
              </select>
              {spedizione === "custom" ? (
                <div className="form-riga" style={{ marginTop: 8 }}>
                  <input type="text" value={customTitolo} onChange={(e) => setCustomTitolo(e.target.value)} placeholder="Nome della consegna" />
                  <input type="text" value={customPrezzo} onChange={(e) => setCustomPrezzo(e.target.value)} inputMode="decimal" placeholder="Prezzo €" />
                </div>
              ) : null}
              {tariffeStato === "errore" ? <span className="aiuto">{tariffeNota}</span> : null}
              {tariffeStato === "ok" && tariffe && tariffe.tariffe.length === 0 && !stima ? (
                <span className="aiuto">
                  Il sito non ha una tariffa per questo indirizzo
                  {tariffe.stimaStato === "troppo-lontano" && tariffe.stimaKm
                    ? `: ${tariffe.stimaKm} km da ${tariffe.stimaPartenza}, là consegna un fornitore del posto.`
                    : ": scrivi tu la voce di consegna."}
                </span>
              ) : null}
              {stima ? (
                <span className="aiuto" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  Stima fuori zona: {euro(stima.prezzo)} ({stima.km} km da {stima.partenza}, {euro(stima.base)} + {stima.euroPerKm} €/km). Il sito resta
                  il listino: la decisione è tua.
                  <button
                    type="button"
                    className="btn ghost mini"
                    onClick={() => {
                      setSpedizione("custom");
                      setCustomTitolo("Consegna fuori zona");
                      setCustomPrezzo(String(stima.prezzo));
                    }}
                  >
                    Usa la stima
                  </button>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Chi paga</div>
            <div className="card-sub">Nome e contatti del cliente (già presi dalla scheda).</div>
            <div className="form-riga">
              <div className="campo">
                <label>Nome</label>
                <input type="text" name="nome" defaultValue={cliente.nome} />
              </div>
              <div className="campo">
                <label>Cognome</label>
                <input type="text" name="cognome" defaultValue={cliente.cognome} />
              </div>
            </div>
            <div className="campo">
              <label>Email</label>
              <input type="email" name="email" defaultValue={cliente.email} />
              <span className="aiuto">Se c&apos;è, Shopify manda da sé la mail col link di pagamento.</span>
            </div>
            <div className="campo">
              <label>Telefono</label>
              <input type="text" name="telefono" defaultValue={cliente.telefono} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label className="scelta" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={consensoMarketing} onChange={(e) => setConsensoMarketing(e.target.checked)} /> Acconsente alle
                comunicazioni <span className="aiuto">(si scrive sul cliente Shopify; togli la spunta se dice di no)</span>
              </label>
            </div>
          </div>

          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Come paga</div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", cursor: "pointer" }}>
              <input type="radio" name="pagamento" checked={pagamento === "link"} onChange={() => setPagamento("link")} style={{ width: "auto", marginTop: 3 }} />
              <span>
                <strong style={{ fontWeight: 550 }}>Gli mando il link</strong>
                <span className="secondario piccolo" style={{ display: "block" }}>La bozza resta bozza finché non paga lui, con carta, dal link.</span>
              </span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", cursor: "pointer" }}>
              <input type="radio" name="pagamento" checked={pagamento === "pagato"} onChange={() => setPagamento("pagato")} style={{ width: "auto", marginTop: 3 }} />
              <span>
                <strong style={{ fontWeight: 550 }}>Ha già pagato</strong>
                <span className="secondario piccolo" style={{ display: "block" }}>
                  Bonifico visto, contanti o POS: l&apos;ordine nasce pagato. Solo se i soldi sono davvero arrivati.
                </span>
              </span>
            </label>
            {pagamento === "pagato" ? (
              <div className="campo" style={{ marginTop: 6 }}>
                <label>Con che mezzo</label>
                <input type="text" name="mezzoPagamento" list="mezzi-pagamento" placeholder="es. bonifico del 24/08, contanti…" />
                {opzioni?.metodiPagamento.length ? (
                  <datalist id="mezzi-pagamento">
                    {opzioni.metodiPagamento.map((m) => (
                      <option key={m.nome} value={m.nome}>{`${m.nome} · usato ${m.usato} volte`}</option>
                    ))}
                  </datalist>
                ) : null}
              </div>
            ) : null}
            {opzioni?.iva.aggiungibile ? (
              <div className="campo" style={{ marginTop: 6, marginBottom: 0 }}>
                <label className="scelta" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={aggiungiIva} onChange={(e) => setAggiungiIva(e.target.checked)} /> Aggiungi l&apos;IVA sopra ai prezzi
                </label>
                <span className="aiuto">{opzioni.iva.spiegazione}</span>
              </div>
            ) : null}
          </div>

          <button className="btn" type="submit" disabled={inCorso || !negozioId}>
            {inCorso ? "Creo l'ordine…" : pagamento === "link" ? "Crea l'ordine e dammi il link" : "Crea l'ordine (già pagato)"}
          </button>
          <p className="terziario piccolo">
            L&apos;ordine nasce su Shopify e rientra dal registro Orders; qui resta la riga nel diario del cliente.
          </p>
        </div>
      </div>
    </form>
  );
}
