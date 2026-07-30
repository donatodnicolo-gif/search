import { Sidebar } from "@/components/Sidebar";
import { lanciaCampagna } from "@/lib/azioni";
import { BRANDS, ETICHETTA_BRAND, formattaEuro, formattaNumero } from "@/lib/dominio";
import {
  categorieDisponibili,
  localitaNote,
  propostaCampagna,
  CITTA_NOTE,
} from "@/lib/nuova-campagna";

export const dynamic = "force-dynamic";

// Una campagna nuova a partire da quello che GIÀ FUNZIONA.
//
// /campagne/lancia esiste da prima ed è un modulo vuoto: chiede di ricordarsi
// a memoria quali parole rendono e quali bruciano, mentre l'app quei numeri li
// ha. Qui si scelgono tre cose — brand, categoria, città — e il resto arriva
// dallo storico: le keyword che hanno superato il break-even, i sitelink che
// rendono, il budget delle campagne sorelle.
//
// Il traguardo però è lo STESSO modulo di /lancia: l'ultimo passo compila
// quel form e chiama `lanciaCampagna`. Così la catena resta intera — lint
// 7.2/7.3, coda, approvazione a mano, campagna che nasce IN PAUSA. Un
// suggeritore che scavalcasse l'approvazione sarebbe un modo elegante di
// perdere il controllo.

const ETICHETTA_CATEGORIA: Record<string, string> = {
  fiori: "Fiori", torte: "Torte", colazioni: "Colazioni", dolci: "Dolci",
  palloncini: "Palloncini", vini: "Vini", altro: "Altro",
};

export default async function CreaCampagna({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; categoria?: string; citta?: string; errore?: string }>;
}) {
  const sp = await searchParams;
  const brand = sp.brand && BRANDS.includes(sp.brand as never) ? sp.brand : null;
  const categoria = sp.categoria ?? null;
  const citta = sp.citta ?? null;
  const passo = !brand ? 1 : !categoria ? 2 : !citta ? 3 : 4;

  const categorie = brand ? await categorieDisponibili(brand) : [];
  const localita = brand ? await localitaNote(brand) : [];
  const proposta = brand && categoria && citta ? await propostaCampagna({ brand, categoria, citta }) : null;

  const link = (p: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ brand, categoria, citta, ...p })) if (v) q.set(k, v);
    return `/campagne/crea?${q}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="campagne" />
      <main className="main">
        <a className="ritorno" href="/campagne">← Campagne</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Crea una campagna</h1>
            <p className="page-sub">
              Scegli <b>brand</b>, <b>prodotto</b> e <b>città</b>: keyword, sitelink e budget arrivano da
              quello che sta già funzionando. Alla fine si approva come sempre — la campagna nasce <b>in pausa</b>.
            </p>
          </div>
        </div>

        {sp.errore && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>⛔</span>
            <span><b>Non accodata:</b> {sp.errore}</span>
          </div>
        )}

        {/* I tre passi, sempre visibili: si torna indietro cliccando */}
        <div className="filtri" style={{ gap: 8, marginBottom: 18 }}>
          {[
            { n: 1, nome: "Brand", valore: brand ? ETICHETTA_BRAND[brand] : null, vai: link({ brand: null, categoria: null, citta: null }) },
            { n: 2, nome: "Prodotto", valore: categoria ? ETICHETTA_CATEGORIA[categoria] ?? categoria : null, vai: link({ categoria: null, citta: null }) },
            { n: 3, nome: "Città", valore: citta ? citta.charAt(0).toUpperCase() + citta.slice(1) : null, vai: link({ citta: null }) },
          ].map((p) => (
            <a
              key={p.n}
              href={p.vai}
              className={p.valore ? "pill-scelta" : "pill-opt"}
              style={{ pointerEvents: p.n > passo ? "none" : undefined, opacity: p.n > passo ? 0.45 : 1 }}
            >
              <b>{p.n}.</b> {p.valore ?? p.nome}
            </a>
          ))}
        </div>

        {/* ---------- PASSO 1: brand ---------- */}
        {passo === 1 && (
          <section className="scheda">
            <div className="scheda-titolo">Per quale marchio</div>
            <div className="filtri" style={{ gap: 10, padding: "4px 0" }}>
              {BRANDS.filter((b) => b !== "cross").map((b) => (
                <a key={b} className="pill-opt" href={link({ brand: b, categoria: null, citta: null })}>
                  {ETICHETTA_BRAND[b]}
                </a>
              ))}
            </div>
            <p className="page-sub" style={{ marginTop: 10 }}>
              Il brand decide il <b>break-even</b> con cui si giudica ogni suggerimento: Gifts 3,33× ·
              Flowers 2,5× · Cake 2,0×. Lo stesso 2,5 è buono per Cake e una perdita per Gifts.
            </p>
          </section>
        )}

        {/* ---------- PASSO 2: categoria ---------- */}
        {passo === 2 && (
          <section className="scheda">
            <div className="scheda-titolo">Che prodotto vuoi spingere</div>
            <p className="page-sub" style={{ marginBottom: 12 }}>
              Le categorie sono quelle che <b>{ETICHETTA_BRAND[brand!]} vende davvero</b>, col venduto
              a fianco: non un elenco teorico.
            </p>
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr><th>Prodotto</th><th className="num">Venduto</th><th className="num">Righe d&apos;ordine</th><th className="num">Campagne collegate</th><th></th></tr>
                </thead>
                <tbody>
                  {categorie.map((c) => (
                    <tr key={c.categoria}>
                      <td className="cella-nome">{ETICHETTA_CATEGORIA[c.categoria] ?? c.categoria}</td>
                      <td className="num">{formattaEuro(c.venduto)}</td>
                      <td className="num">{formattaNumero(c.righe)}</td>
                      <td className="num">{c.campagneCollegate || "—"}</td>
                      <td><a className="btn-secondario" href={link({ categoria: c.categoria, citta: null })}>Scegli</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {categorie.length === 0 && (
              <div className="vuoto">Nessun ordine registrato per {ETICHETTA_BRAND[brand!]}: senza venduto non si sa cosa spingere.</div>
            )}
          </section>
        )}

        {/* ---------- PASSO 3: città ---------- */}
        {passo === 3 && (
          <section className="scheda">
            <div className="scheda-titolo">In quale città</div>
            {localita.length > 0 && (
              <>
                <p className="page-sub" style={{ marginBottom: 10 }}>
                  Dove {ETICHETTA_BRAND[brand!]} è <b>già presente</b> — utile a non aprire per sbaglio
                  una campagna che si fa concorrenza da sola:
                </p>
                <div className="tabella-wrap" style={{ marginBottom: 18 }}>
                  <table>
                    <thead><tr><th>Città</th><th className="num">Campagne</th><th className="num">Spesa storica</th><th></th></tr></thead>
                    <tbody>
                      {localita.map((l) => (
                        <tr key={l.citta}>
                          <td className="cella-nome">{l.citta.charAt(0).toUpperCase() + l.citta.slice(1)}</td>
                          <td className="num">{l.campagne}</td>
                          <td className="num">{formattaEuro(l.spesa)}</td>
                          <td><a className="btn-secondario" href={link({ citta: l.citta })}>Scegli</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="scheda-titolo" style={{ marginTop: 4 }}>Una città nuova</div>
            <p className="page-sub" style={{ marginBottom: 10 }}>
              È qui che questa pagina serve davvero: le keyword che funzionano altrove vengono
              <b> riscritte per la città scelta</b> — «fiori milano» rende 12,5×, quindi per Napoli si parte
              da «fiori napoli».
            </p>
            <div className="filtri" style={{ gap: 8 }}>
              {CITTA_NOTE.filter((c) => c.length > 4 && !["milan", "rome", "florence", "venice", "naples"].includes(c))
                .filter((c) => !localita.some((l) => l.citta === c))
                .map((c) => (
                  <a key={c} className="pill-opt" href={link({ citta: c })}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </a>
                ))}
            </div>
          </section>
        )}

        {/* ---------- PASSO 4: la proposta ---------- */}
        {passo === 4 && proposta && (
          <>
            <section className="scheda">
              <div className="scheda-titolo">Su cosa si basa questa proposta</div>
              <div className="kpi-riga">
                <div className="kpi"><div className="kpi-etichetta">Campagne esaminate</div><div className="kpi-valore">{proposta.campagneEsaminate}</div></div>
                <div className="kpi"><div className="kpi-etichetta">Spesa già fatta</div><div className="kpi-valore">{formattaEuro(proposta.spesaEsaminata)}</div></div>
                <div className="kpi"><div className="kpi-etichetta">Break-even {ETICHETTA_BRAND[proposta.brand]}</div><div className="kpi-valore">{proposta.breakEven.toFixed(2)}×</div></div>
                <div className="kpi"><div className="kpi-etichetta">Keyword proposte</div><div className="kpi-valore">{proposta.keyword.length}</div></div>
              </div>
              {proposta.avvertenze.map((a, i) => (
                <div key={i} className="nota-info" style={{ marginTop: 10 }}>
                  <span className="nota-icona">⚠️</span><span>{a}</span>
                </div>
              ))}
            </section>

            {proposta.keyword.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">Le parole che hanno già reso</div>
                <p className="page-sub" style={{ marginBottom: 10 }}>
                  Solo quelle sopra il break-even di {ETICHETTA_BRAND[proposta.brand]} con almeno 10 clic e
                  20 € di spesa alle spalle. <b>Riscritta</b> vuol dire che nominava un&apos;altra città ed è
                  stata adattata a {proposta.citta}.
                </p>
                <div className="tabella-wrap">
                  <table>
                    <thead><tr><th>Keyword</th><th className="num">Resa</th><th className="num">Spesa</th><th className="num">Clic</th><th>Da</th></tr></thead>
                    <tbody>
                      {proposta.keyword.map((k, i) => (
                        <tr key={i}>
                          <td className="cella-nome">
                            {k.testo}{" "}
                            {k.riscritta && <span className="tag-neutro">riscritta</span>}
                          </td>
                          <td className="num"><b>{k.roas?.toFixed(1)}×</b></td>
                          <td className="num">{formattaEuro(k.spesa)}</td>
                          <td className="num">{formattaNumero(k.clic)}</td>
                          <td className="cella-sub">{k.daCampagna}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {proposta.sitelink.length > 0 && (
              <section className="scheda">
                <div className="scheda-titolo">I sitelink che rendono</div>
                <div className="tabella-wrap">
                  <table>
                    <thead><tr><th>Sitelink</th><th className="num">Resa</th><th className="num">Clic</th></tr></thead>
                    <tbody>
                      {proposta.sitelink.map((s, i) => (
                        <tr key={i}>
                          <td className="cella-nome">{s.testo}</td>
                          <td className="num"><b>{s.roas?.toFixed(1)}×</b></td>
                          <td className="num">{formattaNumero(s.clic)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="page-sub" style={{ marginTop: 8 }}>
                  I sitelink non si creano da script: questi si aggiungono a mano in Google Ads dopo che la
                  campagna esiste. Sono qui perché è adesso che si decide.
                </p>
              </section>
            )}

            {/* Il modulo vero: precompilato, ma è quello di sempre */}
            <section className="scheda">
              <div className="scheda-titolo">La campagna da accodare</div>
              <form className="modulo" action={lanciaCampagna}>
                <input type="hidden" name="brand" value={proposta.brand} />
                <div className="campo-modulo largo">
                  <label>Nome <span className="obbligatorio">*</span></label>
                  <input name="nome" required defaultValue={proposta.nomeSuggerito} />
                </div>
                <div className="griglia-campi">
                  <div className="campo-modulo">
                    <label>Budget al giorno (€) <span className="obbligatorio">*</span></label>
                    <input name="budget" type="number" step="0.01" required defaultValue={proposta.budgetSuggerito ?? undefined} />
                  </div>
                  <div className="campo-modulo">
                    <label>Gruppo di annunci</label>
                    <input name="gruppo" defaultValue={`${ETICHETTA_CATEGORIA[proposta.categoria] ?? proposta.categoria} ${proposta.citta}`} />
                  </div>
                </div>
                <div className="campo-modulo largo">
                  <label>URL di destinazione</label>
                  <input name="finalUrl" placeholder="https://…" />
                </div>
                <div className="campo-modulo largo">
                  <label>Keyword (una per riga)</label>
                  <textarea name="keywords" rows={Math.max(4, proposta.keyword.length)} defaultValue={proposta.keyword.map((k) => k.testo).join("\n")} />
                </div>
                <div className="campo-modulo largo">
                  <label>Titoli (una per riga, max 30 caratteri — ne servono almeno 3)</label>
                  <textarea name="titoli" rows={Math.max(4, proposta.titoli.length)} defaultValue={proposta.titoli.join("\n")} />
                </div>
                <div className="campo-modulo largo">
                  <label>Descrizioni (una per riga, max 90 caratteri)</label>
                  <textarea name="descrizioni" rows={Math.max(3, proposta.descrizioni.length)} defaultValue={proposta.descrizioni.join("\n")} />
                </div>
                <div className="campo-modulo largo">
                  <label>Perché la stiamo lanciando</label>
                  <input name="motivo" defaultValue={`${ETICHETTA_CATEGORIA[proposta.categoria] ?? proposta.categoria} su ${proposta.citta}: parole già provate su ${proposta.campagneEsaminate} campagne affini`} />
                </div>
                <div className="azioni-modulo">
                  <button className="btn" type="submit">Metti in coda</button>
                  <a className="btn-secondario" href={link({ citta: null })}>Cambia città</a>
                </div>
                <p className="page-sub">
                  Il copy passa dal <b>lint 7.2/7.3</b> prima di entrare in coda, e la campagna va comunque
                  <b> approvata a mano</b> in Operazioni. Nasce <b>in pausa</b>: si accende dopo la checklist 4.1.
                </p>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
