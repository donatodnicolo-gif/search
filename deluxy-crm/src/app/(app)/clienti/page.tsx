import { catalogoListe, elencoClienti, schedaCliente } from "@/lib/orders";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { dataIt, euro, segmento } from "@/lib/etichette";
import { RigaLink } from "@/components/RigaLink";
import { prisma } from "@/lib/db";
import { clusterDi, impostazioniClienti, inSoglia } from "@/lib/cluster";
import { unisciDaTabella } from "@/lib/actions";

export const dynamic = "force-dynamic";

type Params = { q?: string; lista?: string; ordina?: string; verso?: string; page?: string; errore?: string; esito?: string };

// IL LIBRO CLIENTI — ogni riga è una persona, non un ordine. Tutto arriva
// dal registro di Deluxy Orders (chiave email → telefono → nome): il CRM non
// tiene una copia dei clienti, la legge.
//
// ⚠️ NIENTE scorciatoie di periodo qui (valutato 28/08/2026, Libro v1.9
// §8-bis): l'elenco arriva da Orders già PAGINATO (50 alla volta) e l'API non
// accetta un filtro sull'ultimo ordine — filtrare la pagina in locale
// mostrerebbe «i clienti recenti fra questi 50», non i clienti recenti (la
// trappola dell'OR largo col take). La recency è già espressa dalle liste
// (Nuovi, Da riattivare, Persi), che Orders calcola su TUTTI i clienti.
export default async function Clienti({ searchParams }: { searchParams: Promise<Params> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const lista = sp.lista?.trim() || undefined;
  const ordina = sp.ordina?.trim() || "speso";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [cat, elenco, imp] = await Promise.all([
    catalogoListe(),
    elencoClienti({ q, lista, ordina, page, limit: 50 }),
    impostazioniClienti(),
  ]);
  // Il punteggio dato a mano (profilo di relazione) per i clienti di QUESTA pagina.
  const chiaviPagina = elenco.ok ? elenco.dati.clienti.map((c) => c.cliente) : [];
  const profili = chiaviPagina.length
    ? await prisma.profiloCliente.findMany({
        where: { chiaveCliente: { in: chiaviPagina } },
        select: { chiaveCliente: true, punteggio: true, nome: true, consensoCrm: true },
      })
    : [];
  const profilo = new Map(profili.map((p) => [p.chiaveCliente, p]));
  // Le unioni che toccano questa pagina: una riga alias resta in elenco (Orders
  // la conosce così, e la ricerca deve trovarla) ma si legge come «unita a…» e
  // rimanda alla scheda principale; la principale dice quante schede ha dentro.
  const unioni = chiaviPagina.length
    ? await prisma.unioneClienti.findMany({
        where: { OR: [{ chiaveAlias: { in: chiaviPagina } }, { chiavePrincipale: { in: chiaviPagina } }] },
      })
    : [];
  const aliasDi = new Map(unioni.map((u) => [u.chiaveAlias, u.chiavePrincipale]));
  const quanteUnite = new Map<string, number>();
  for (const u of unioni) quanteUnite.set(u.chiavePrincipale, (quanteUnite.get(u.chiavePrincipale) ?? 0) + 1);
  // Il nome della principale: dalla pagina se c'è, altrimenti da Orders (cache 60 s).
  const principaliFuori = [...new Set(aliasDi.values())].filter((k) => !chiaviPagina.includes(k));
  const nomiFuori = new Map(
    await Promise.all(
      principaliFuori.map(async (k): Promise<[string, string | null]> => {
        const s = await schedaCliente(k);
        return [k, s.ok ? (s.dati.nome ?? s.dati.email ?? null) : null];
      }),
    ),
  );
  const nomeDi = (chiave: string): string | null => {
    const nostro = profilo.get(chiave)?.nome;
    if (nostro) return nostro;
    const inPagina = elenco.ok ? elenco.dati.clienti.find((x) => x.cliente === chiave) : undefined;
    return inPagina?.nome ?? inPagina?.email ?? nomiFuori.get(chiave) ?? null;
  };
  const conSoglie = Boolean(imp.soglie.spesaTotaleMin || imp.soglie.spesaAnnuaMin || imp.soglie.ordiniAnnoMin);

  const linkCon = (mod: Partial<Params>) => {
    const p = new URLSearchParams();
    const valori = { q, lista, ordina, page: String(page), ...mod };
    if (valori.q) p.set("q", valori.q);
    if (valori.lista) p.set("lista", valori.lista);
    if (valori.ordina && valori.ordina !== "speso") p.set("ordina", valori.ordina);
    if (valori.page && valori.page !== "1") p.set("page", valori.page);
    const s = p.toString();
    return s ? `/clienti?${s}` : "/clienti";
  };

  const listePrincipali = cat.ok
    ? cat.dati.liste.filter((l) =>
        ["vip", "da-non-perdere", "fedeli", "ricorrenti", "nuovi", "da-riattivare", "persi"].includes(l.chiave),
      )
    : [];

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Clienti</h1>
          <p className="page-sub">
            Il libro dei clienti, costruito dagli ordini veri (fonte: Deluxy Orders). Cerca per nome, email o telefono;
            filtra per lista per lavorare un pubblico alla volta.
          </p>
        </div>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">Fatto.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="filtri">
        <form method="get" action="/clienti">
          {lista ? <input type="hidden" name="lista" value={lista} /> : null}
          <input
            type="search"
            name="q"
            aria-label="Cerca nel libro clienti"
            placeholder="Cerca nome, email, telefono…"
            defaultValue={q ?? ""}
            style={{ width: 280 }}
          />
          <button className="btn ghost" type="submit">Cerca</button>
        </form>
        {/* Solo le pillole stanno nella corsia che scorre su mobile (Libro
            §8.9): il form di ricerca resta fuori, sempre visibile. */}
        <div className="riga-chips-scorri">
          <a className={`filtro-pillola${!lista ? " attivo" : ""}`} href={linkCon({ lista: undefined, page: "1" })}>
            Tutti
          </a>
          {listePrincipali.map((l) => (
            <a
              key={l.chiave}
              className={`filtro-pillola${lista === l.chiave ? " attivo" : ""}`}
              href={linkCon({ lista: l.chiave, page: "1" })}
              title={l.criterio}
            >
              {l.nome} · {l.clienti}
            </a>
          ))}
        </div>
      </div>

      {!elenco.ok ? (
        <div className="errore-card">{elenco.errore}</div>
      ) : elenco.dati.clienti.length === 0 ? (
        <div className="card vuoto">
          <div className="quadratino">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-3.8-3.8" />
            </svg>
          </div>
          <h3>Nessun cliente trovato</h3>
          <p>
            Prova con un&apos;altra ricerca, o togli il filtro della lista.{" "}
            {q || lista ? (
              <a className="link-quieto" href="/clienti">Azzera ricerca e filtri</a>
            ) : null}
          </p>
        </div>
      ) : (
        <>
          <div className="card tabella-card">
            <div className="tabella-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <a className="link-quieto" href={linkCon({ ordina: "nome", page: "1" })}>Cliente</a>
                    </th>
                    <th title="Consenso CRM: ha voglia di sentire Eva (di default sì)">CRM</th>
                    <th>Città</th>
                    <th>Segmento</th>
                    <th title="I tuoi gruppi, da Impostazioni">Cluster</th>
                    <th className="num">
                      <a className="link-quieto" href={linkCon({ ordina: "ordini", page: "1" })}>Ordini</a>
                    </th>
                    <th className="num">
                      <a className="link-quieto" href={linkCon({ ordina: "speso", page: "1" })}>Speso</a>
                    </th>
                    <th className="num">Medio</th>
                    <th>
                      <a className="link-quieto" href={linkCon({ ordina: "ultimo", page: "1" })}>Ultimo ordine</a>
                    </th>
                    <th>Brand</th>
                  </tr>
                </thead>
                <tbody>
                  {elenco.dati.clienti.map((c) => {
                    const seg = segmento(c.segmento);
                    const pr = profilo.get(c.cliente);
                    const k = clusterDi(c, imp, pr?.punteggio ?? null);
                    const fuori = conSoglie && !inSoglia(c, imp);
                    const principaleDi = aliasDi.get(c.cliente);
                    const unite = quanteUnite.get(c.cliente) ?? 0;
                    const destinazione = principaleDi ?? c.cliente;
                    return (
                      // La riga è il cliente: tutta la riga apre la sua scheda (Libro §8).
                      <RigaLink key={c.cliente} href={`/clienti/${destinazione}`}>
                        <td style={principaleDi ? { opacity: 0.6 } : undefined}>
                          {/* Spunta per «Unisci»: il form sta sotto la tabella (attributo form=).
                              Una riga già unita non si rispunta: si separa dalla scheda. */}
                          {principaleDi ? null : (
                            <input
                              type="checkbox"
                              name="scelti"
                              value={c.cliente}
                              form="unisci-form"
                              aria-label={`Seleziona ${c.nome ?? c.email ?? "cliente"} per unirlo`}
                              style={{ width: "auto", marginRight: 8, verticalAlign: "middle" }}
                            />
                          )}
                          <a href={`/clienti/${destinazione}`} style={{ display: "inline-block", verticalAlign: "middle" }}>
                            <div className="cella-principale">
                              {pr?.nome || c.nome || c.email || c.telefono || "—"}
                              {pr?.punteggio != null ? <span className="chip oro" style={{ marginLeft: 6 }} title="Punteggio">{pr.punteggio}</span> : null}
                              {unite ? (
                                <span className="chip" style={{ marginLeft: 6 }} title="Schede di Orders unite a questa">
                                  +{unite} {unite === 1 ? "unita" : "unite"}
                                </span>
                              ) : null}
                            </div>
                            <div className="cella-sotto">
                              {principaleDi
                                ? `unita a ${nomeDi(principaleDi) ?? "un'altra scheda"} → apre quella`
                                : (c.email ?? c.telefono ?? "")}
                            </div>
                          </a>
                        </td>
                        <td>
                          {/* Il pallino: oro = vuole sentirci (default), rosso = ha detto di no. */}
                          <span
                            className="dot-consenso"
                            style={{ background: pr?.consensoCrm === false ? "var(--red)" : "var(--gold-strong)" }}
                            title={pr?.consensoCrm === false ? "Consenso CRM: no" : "Consenso CRM: sì"}
                            aria-label={pr?.consensoCrm === false ? "Consenso CRM no" : "Consenso CRM sì"}
                          />
                        </td>
                        <td>{c.citta ?? "—"}</td>
                        <td>
                          <span className="badge colorato" style={{ ["--badge-colore" as string]: seg.colore }}>
                            <span className="dot" />
                            {seg.nome}
                          </span>
                        </td>
                        <td>
                          {k ? (
                            <span className="badge colorato" style={{ ["--badge-colore" as string]: k.colore }}>
                              <span className="dot" />
                              {k.nome}
                            </span>
                          ) : (
                            <span className="terziario">—</span>
                          )}
                          {fuori ? <div className="cella-sotto" title="Sotto le soglie di Impostazioni">fuori soglia</div> : null}
                        </td>
                        <td className="num">{c.ordini}</td>
                        <td className="num">{euro(c.speso)}</td>
                        <td className="num">{euro(c.ordineMedio)}</td>
                        <td>
                          {dataIt(c.ultimoOrdine)}
                          {c.giorniDallUltimo != null ? (
                            <div className="cella-sotto">{c.giorniDallUltimo} giorni fa</div>
                          ) : null}
                        </td>
                        <td className="secondario piccolo">{c.brand.join(", ") || "—"}</td>
                      </RigaLink>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* «Unisci»: le righe spuntate diventano una scheda sola (richiesta
              dell'utente 10/09). Le spunte stanno nelle righe, il form qui. */}
          <form id="unisci-form" action={unisciDaTabella} className="barra-unisci">
            <input type="hidden" name="torna" value={linkCon({})} />
            <span className="secondario piccolo">
              Stessa persona con due chiavi (email del lavoro e personale, o solo il telefono)? Spunta le righe e
              uniscile: la scheda principale sarà quella con più ordini; si separa quando vuoi dalla scheda.
            </span>
            <button className="btn ghost" type="submit">Unisci i selezionati</button>
          </form>
          <div className="paginazione">
            <span>
              {elenco.dati.totale} clienti · pagina {elenco.dati.page} di {elenco.dati.pagine}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              {page > 1 ? (
                <a className="btn ghost mini" href={linkCon({ page: String(page - 1) })}>← Precedente</a>
              ) : null}
              {page < elenco.dati.pagine ? (
                <a className="btn ghost mini" href={linkCon({ page: String(page + 1) })}>Successiva →</a>
              ) : null}
            </span>
          </div>
        </>
      )}
    </>
  );
}
