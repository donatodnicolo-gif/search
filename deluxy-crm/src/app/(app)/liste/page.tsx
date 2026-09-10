import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { creaListaAI, creaListaManuale } from "@/lib/actions";
import { catalogoListe } from "@/lib/orders";
import { dataIt, SEGMENTI } from "@/lib/etichette";
import { RigaLink } from "@/components/RigaLink";
import BottoneInvio from "@/components/BottoneInvio";

export const dynamic = "force-dynamic";
// La generazione legge il brief con l'AI e poi scarica i clienti da Orders a
// pagine di 500: su liste grandi serve più respiro del minuto standard.
export const maxDuration = 300;

type Query = { errore?: string; modo?: string };

// I siti Deluxy (i brand negli ordini): si possono anche scrivere a mano.
const SITI = ["deluxy.it", "cakedesign.me", "deluxyflowers.com"];
const TIPOLOGIE = ["privato", "azienda", "horeca", "eventi", "rivenditore"];

// LISTE — i pubblici del CRM. Due strade per costruirne una: il brief in
// italiano che l'AI traduce in criteri, oppure le CONDIZIONI scelte a mano nel
// form (stessa ricetta, stesso esecutore, senza AI). «Non contattare» è
// sempre escluso.
export default async function Liste({ searchParams }: { searchParams: Promise<Query> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const manuale = sp.modo === "manuale";
  const [liste, cat] = await Promise.all([
    prisma.listaClienti.findMany({
      orderBy: { creatoIl: "desc" },
      include: { _count: { select: { membri: true } } },
    }),
    catalogoListe(),
  ]);
  const listeOrders = cat.ok ? cat.dati.liste : [];

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Liste</h1>
          <p className="page-sub">
            I pubblici a cui scrivere: descritti a parole all&apos;AI, o costruiti a mano scegliendo le condizioni sui
            dati veri di Orders. Da ogni lista si mandano mail o WhatsApp, uno a uno ma personalizzati.
          </p>
        </div>
      </div>

      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="griglia lavoro" style={{ alignItems: "start" }}>
        <div>
          {liste.length === 0 ? (
            <div className="card vuoto">
              <div className="quadratino">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                </svg>
              </div>
              <h3>Nessuna lista, per ora</h3>
              <p>La prima si costruisce qui accanto: a parole con l&apos;AI, o a condizioni.</p>
            </div>
          ) : (
            <div className="card tabella-card">
              <div className="tabella-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Lista</th>
                      <th className="num">Clienti</th>
                      <th>Come</th>
                      <th>Generata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((l) => (
                      // La riga è la lista: tutta la riga la apre (Libro §8).
                      <RigaLink key={l.id} href={`/liste/${l.id}`}>
                        <td>
                          <a href={`/liste/${l.id}`}>
                            <div className="cella-principale">{l.nome}</div>
                            <div className="cella-sotto">{l.brief.length > 90 ? `${l.brief.slice(0, 90)}…` : l.brief}</div>
                          </a>
                        </td>
                        <td className="num">{l._count.membri}</td>
                        <td>
                          <span className="chip">{l.modello === "manuale" ? "a condizioni" : "con l'AI"}</span>
                        </td>
                        <td className="secondario piccolo">{dataIt(l.generataIl, true)}</td>
                      </RigaLink>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="filtri riga-chips-scorri" style={{ marginBottom: 0 }}>
            <a className={`filtro-pillola${!manuale ? " attivo" : ""}`} href="/liste">Con l&apos;AI</a>
            <a className={`filtro-pillola${manuale ? " attivo" : ""}`} href="/liste?modo=manuale">A condizioni</a>
          </div>

          {!manuale ? (
            <div className="card">
              <div className="card-titolo">Nuova lista con l&apos;AI</div>
              <div className="card-sub">
                Scrivi il brief come lo diresti a una persona: chi, dove, che rapporto hanno con noi, per farne cosa.
              </div>
              <form action={creaListaAI}>
                <div className="campo">
                  <textarea
                    name="brief"
                    rows={6}
                    required
                    aria-label="Il brief per l'AI"
                    placeholder={
                      "es. I clienti migliori di Milano che hanno comprato per San Valentino, per invitarli alla cena del 14 febbraio.\n\nes. Chi ama le peonie e non ordina da più di sei mesi: voglio mandargli un pensiero via WhatsApp."
                    }
                  />
                </div>
                <div className="form-piede">
                  <BottoneInvio inCorso="Sto costruendo la lista… (fino a un minuto)">Costruisci la lista</BottoneInvio>
                </div>
                <p className="terziario piccolo" style={{ marginTop: 8 }}>
                  Chi ha chiesto di non essere contattato resta fuori, sempre. La generazione può richiedere fino a un
                  minuto: il bottone lo dice finché lavora, e alla fine si apre la lista.
                </p>
              </form>
            </div>
          ) : (
            <div className="card">
              <div className="card-titolo">Nuova lista a condizioni</div>
              <div className="card-sub">
                Le stesse condizioni che userebbe l&apos;AI, scelte da te. Tutto è facoltativo: quel che non compili non
                filtra.
              </div>
              <form action={creaListaManuale}>
                <div className="campo">
                  <label>Nome della lista <span className="ob">*</span></label>
                  <input type="text" name="nome" required maxLength={60} placeholder="es. Clienti Cake dell'ultima settimana" />
                </div>

                <div className="card-titolo sezione-form">Chi</div>
                <div className="campo">
                  <label>Parti da queste liste di Orders <span className="aiuto">(unione; vuoto = tutti i clienti)</span></label>
                  <div className="scelte">
                    {listeOrders.map((l) => (
                      <label key={l.chiave} className="scelta" title={l.criterio}>
                        <input type="checkbox" name="liste" value={l.chiave} /> {l.nome} <span className="terziario">· {l.clienti}</span>
                      </label>
                    ))}
                    {listeOrders.length === 0 ? <span className="terziario piccolo">Orders non risponde: le liste non si vedono.</span> : null}
                  </div>
                </div>

                <div className="campo">
                  <label>Escludi chi sta in</label>
                  <select name="escludiListe" multiple size={3}>
                    {listeOrders.map((l) => (
                      <option key={l.chiave} value={l.chiave}>{l.nome}</option>
                    ))}
                  </select>
                  <span className="aiuto">«Non contattare» è escluso sempre, anche se non lo scegli.</span>
                </div>

                <div className="card-titolo sezione-form">Dove e cosa</div>
                <div className="campo">
                  <label>Sito da cui comprano</label>
                  <div className="scelte">
                    {SITI.map((s) => (
                      <label key={s} className="scelta">
                        <input type="checkbox" name="brand" value={s} /> {s}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-riga">
                  <div className="campo">
                    <label>Città <span className="aiuto">(più d&apos;una con la virgola)</span></label>
                    <input type="text" name="citta" placeholder="es. Milano, Roma" />
                  </div>
                  <div className="campo">
                    <label>Parole nei gusti <span className="aiuto">(virgola)</span></label>
                    <input type="text" name="gustiContiene" placeholder="es. peonie, compleanno" />
                  </div>
                </div>

                <div className="campo">
                  <label>Segmento</label>
                  <div className="scelte">
                    {Object.entries(SEGMENTI).map(([k, s]) => (
                      <label key={k} className="scelta">
                        <input type="checkbox" name="segmenti" value={k} /> {s.nome}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="campo">
                  <label>Tipologia</label>
                  <div className="scelte">
                    {TIPOLOGIE.map((t) => (
                      <label key={t} className="scelta">
                        <input type="checkbox" name="tipologie" value={t} /> {t}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="card-titolo sezione-form">Quanto</div>
                <div className="form-riga">
                  <div className="campo">
                    <label>Spesa minima (€)</label>
                    <input type="number" name="spesaMin" min={0} step="1" />
                  </div>
                  <div className="campo">
                    <label>Spesa massima (€)</label>
                    <input type="number" name="spesaMax" min={0} step="1" />
                  </div>
                </div>
                <div className="form-riga">
                  <div className="campo">
                    <label>Ordini minimi</label>
                    <input type="number" name="ordiniMin" min={0} step="1" />
                  </div>
                  <div className="campo">
                    <label>Ordini massimi</label>
                    <input type="number" name="ordiniMax" min={0} step="1" />
                  </div>
                </div>
                <div className="form-riga">
                  <div className="campo">
                    <label>Ultimo ordine entro (giorni)</label>
                    <input type="number" name="giorniUltimoMax" min={0} step="1" placeholder="es. 7" />
                  </div>
                  <div className="campo">
                    <label>Ultimo ordine da almeno (giorni)</label>
                    <input type="number" name="giorniUltimoMin" min={0} step="1" placeholder="es. 180" />
                  </div>
                </div>

                <div className="card-titolo sezione-form">Uscita</div>
                <div className="campo">
                  <label>Contatti</label>
                  <div className="scelte">
                    <label className="scelta"><input type="checkbox" name="soloEmail" value="1" /> solo chi ha l&apos;email</label>
                    <label className="scelta"><input type="checkbox" name="soloTelefono" value="1" /> solo chi ha il telefono</label>
                    <label className="scelta"><input type="checkbox" name="soloConsensoEmail" value="1" /> solo con consenso email (newsletter)</label>
                  </div>
                </div>

                <div className="form-riga">
                  <div className="campo">
                    <label>Ordina per</label>
                    <select name="ordina" defaultValue="speso">
                      <option value="speso">spesa</option>
                      <option value="recenti">ultimo ordine più recente</option>
                      <option value="ordini">numero di ordini</option>
                    </select>
                  </div>
                  <div className="campo">
                    <label>Al massimo</label>
                    <input type="number" name="limite" min={1} max={500} defaultValue={200} />
                  </div>
                </div>

                <div className="form-piede">
                  <BottoneInvio inCorso="Sto leggendo i clienti da Orders…">Costruisci la lista</BottoneInvio>
                </div>
                <p className="terziario piccolo" style={{ marginTop: 8 }}>
                  Senza una lista di partenza si leggono fino a 3000 clienti (per spesa, o per recenza se filtri sui
                  giorni). La lista dice sempre come è stata costruita.
                </p>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
