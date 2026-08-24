"use client";

import { useEffect, useRef, useState } from "react";
import { creaOrdineDalCrm } from "@/lib/actions";
import type { NegozioCS, ProdottoCS, RigaNuovoOrdine, SpedizioneCS, EsitoCreazione } from "@/lib/nuovo-ordine";

// Il form «ordine al telefono» del CRM: si compila col cliente in linea, la
// bozza nasce su Shopify (via Customer Service) e il link di pagamento arriva
// qui, pronto da copiare o mandare per mail. Client component perché le righe
// si accumulano e il catalogo si cerca mentre si parla.

type Props = {
  codice: string;
  cliente: { nome: string; cognome: string; email: string; telefono: string };
  indirizzo: { indirizzo: string; cap: string; citta: string; provincia: string; paese: string } | null;
  negozi: NegozioCS[];
  negozioSuggerito: string;
};

type RigaMostrata = RigaNuovoOrdine & { etichetta: string; immagine?: string };

export default function FormNuovoOrdine({ codice, cliente, indirizzo, negozi, negozioSuggerito }: Props) {
  const [negozioId, setNegozioId] = useState(negozioSuggerito || negozi[0]?.id || "");
  const [righe, setRighe] = useState<RigaMostrata[]>([]);
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState<ProdottoCS[]>([]);
  const [ricercaNota, setRicercaNota] = useState<string | null>(null);
  const [cercando, setCercando] = useState(false);
  const [spedizioni, setSpedizioni] = useState<SpedizioneCS[]>([]);
  const [spedizione, setSpedizione] = useState<string>("0");
  const [pagamento, setPagamento] = useState<"link" | "pagato">("link");
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<EsitoCreazione | null>(null);
  const [copiato, setCopiato] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Le spedizioni sono del negozio: cambiano quando cambia lui.
  useEffect(() => {
    let vivo = true;
    setSpedizioni([]);
    setSpedizione("nessuna");
    if (!negozioId) return;
    fetch(`/api/interno/spedizioni?negozio=${encodeURIComponent(negozioId)}`)
      .then((r) => r.json())
      .then((d: { spedizioni?: SpedizioneCS[] }) => {
        if (!vivo) return;
        setSpedizioni(d.spedizioni ?? []);
        setSpedizione(d.spedizioni?.length ? "0" : "nessuna");
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [negozioId]);

  async function cerca() {
    if (!q.trim() || !negozioId) return;
    setCercando(true);
    setRicercaNota(null);
    try {
      const r = await fetch(
        `/api/interno/prodotti?negozio=${encodeURIComponent(negozioId)}&q=${encodeURIComponent(q.trim())}`,
      );
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
        quantita: 1,
        etichetta: `${p.titolo}${p.variante ? ` — ${p.variante}` : ""} · ${p.prezzo.toFixed(2).replace(".", ",")} €`,
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
    setRighe((r) => [
      ...r,
      { titolo, prezzo, quantita: 1, etichetta: `${titolo} · ${prezzo.toFixed(2).replace(".", ",")} € (fuori catalogo)` },
    ]);
    const t = formRef.current?.elements.namedItem("rigaTitolo") as HTMLInputElement | null;
    const p = formRef.current?.elements.namedItem("rigaPrezzo") as HTMLInputElement | null;
    if (t) t.value = "";
    if (p) p.value = "";
  }

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inCorso) return;
    const fd = new FormData(e.currentTarget);
    const v = (nome: string) => String(fd.get(nome) ?? "").trim();

    if (!righe.length) {
      setEsito({ ok: false, errore: "Aggiungi almeno un prodotto (dal catalogo o scritto a mano)." });
      return;
    }

    const sp =
      spedizione === "nessuna"
        ? { titolo: "", prezzo: 0 }
        : spedizione === "custom"
          ? { titolo: v("spedizioneTitolo") || "Consegna", prezzo: Number(v("spedizionePrezzo").replace(",", ".")) || 0 }
          : {
              titolo: spedizioni[Number(spedizione)]?.titolo ?? "",
              prezzo: spedizioni[Number(spedizione)]?.prezzo ?? 0,
            };

    setInCorso(true);
    setEsito(null);
    try {
      const r = await creaOrdineDalCrm({
        chiaveCliente: codice,
        nomeCliente: [v("nome"), v("cognome")].filter(Boolean).join(" "),
        negozioId,
        cliente: { nome: v("nome"), cognome: v("cognome"), email: v("email"), telefono: v("telefono") },
        consegna: {
          data: v("dataConsegna"),
          fascia: v("fascia"),
          indirizzo: v("indirizzo"),
          civicoNote: v("civicoNote"),
          cap: v("cap"),
          citta: v("citta"),
          provincia: v("provincia"),
          paese: v("paese") || "IT",
        },
        righe: righe.map(({ variantId, titolo, prezzo, quantita }) =>
          variantId ? { variantId, quantita } : { titolo, prezzo, quantita },
        ),
        biglietto: v("biglietto"),
        spedizione: sp,
        pagamento,
        mezzoPagamento: pagamento === "pagato" ? v("mezzoPagamento") : "",
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

  // ---- Il form ------------------------------------------------------------
  return (
    <form ref={formRef} onSubmit={invia} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
      {esito && !esito.ok ? <div className="errore-card">{esito.errore}</div> : null}

      <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", alignItems: "start" }}>
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
                        {p.prezzo.toFixed(2).replace(".", ",")} € {p.disponibile ? "" : "· non disponibile"}
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
                          setRighe((tutte) =>
                            tutte.map((x, j) => (j === i ? { ...x, quantita: Math.max(1, Number(e.target.value) || 1) } : x)),
                          )
                        }
                        style={{ width: 64 }}
                      />
                      <button
                        className="btn rosso mini"
                        type="button"
                        onClick={() => setRighe((tutte) => tutte.filter((_, j) => j !== i))}
                      >
                        Togli
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="terziario piccolo" style={{ marginTop: 12 }}>Nessuna riga ancora: l&apos;ordine parte da qui.</p>
            )}
          </div>

          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Consegna</div>
            <div className="card-sub">Data e fascia finiscono negli attributi che il registro Orders sa leggere.</div>
            <div className="form-riga">
              <div className="campo">
                <label>Data di consegna</label>
                <input type="date" name="dataConsegna" />
              </div>
              <div className="campo">
                <label>Fascia oraria</label>
                <select name="fascia" defaultValue="">
                  <option value="">—</option>
                  <option value="08-12">08–12</option>
                  <option value="12-16">12–16</option>
                  <option value="16-20">16–20</option>
                </select>
              </div>
            </div>
            <div className="campo">
              <label>Indirizzo</label>
              <input type="text" name="indirizzo" defaultValue={indirizzo?.indirizzo ?? ""} placeholder="via e numero civico" />
            </div>
            <div className="form-riga">
              <div className="campo">
                <label>CAP</label>
                <input type="text" name="cap" defaultValue={indirizzo?.cap ?? ""} />
              </div>
              <div className="campo">
                <label>Città</label>
                <input type="text" name="citta" defaultValue={indirizzo?.citta ?? ""} />
              </div>
              <div className="campo">
                <label>Prov.</label>
                <input type="text" name="provincia" defaultValue={indirizzo?.provincia ?? ""} maxLength={2} />
              </div>
              <div className="campo">
                <label>Paese</label>
                <input type="text" name="paese" defaultValue={indirizzo?.paese ?? "IT"} maxLength={2} />
              </div>
            </div>
            <div className="campo">
              <label>Note per la consegna</label>
              <input type="text" name="civicoNote" placeholder="citofono, piano, portineria…" />
            </div>
            <div className="campo">
              <label>Biglietto / dedica</label>
              <textarea name="biglietto" rows={2} placeholder="Il testo che accompagna il regalo" />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label>Spedizione</label>
              <select value={spedizione} onChange={(e) => setSpedizione(e.target.value)}>
                {spedizioni.map((s, i) => (
                  <option key={i} value={String(i)}>
                    {s.titolo} — {s.prezzo.toFixed(2).replace(".", ",")} €
                  </option>
                ))}
                <option value="nessuna">Senza voce di spedizione</option>
                <option value="custom">Altra (scrivila sotto)</option>
              </select>
              {spedizione === "custom" ? (
                <div className="form-riga" style={{ marginTop: 8 }}>
                  <input type="text" name="spedizioneTitolo" placeholder="Nome della consegna" />
                  <input type="text" name="spedizionePrezzo" inputMode="decimal" placeholder="Prezzo €" />
                </div>
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
            <div className="campo" style={{ marginBottom: 0 }}>
              <label>Telefono</label>
              <input type="text" name="telefono" defaultValue={cliente.telefono} />
            </div>
          </div>

          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Come paga</div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", cursor: "pointer" }}>
              <input type="radio" name="pagamento" checked={pagamento === "link"} onChange={() => setPagamento("link")} style={{ width: "auto", marginTop: 3 }} />
              <span>
                <strong style={{ fontWeight: 550 }}>Gli mando il link</strong>
                <span className="secondario piccolo" style={{ display: "block" }}>
                  La bozza resta bozza finché non paga lui, con carta, dal link.
                </span>
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
              <div className="campo" style={{ marginTop: 6, marginBottom: 0 }}>
                <label>Con che mezzo</label>
                <input type="text" name="mezzoPagamento" placeholder="es. bonifico del 24/08, contanti…" />
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
