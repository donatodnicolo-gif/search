import { notFound } from "next/navigation";
import { RubricaNelModulo } from "@/components/RubricaNelModulo";
import { Sidebar } from "@/components/Sidebar";
import { RicercaIndirizzo } from "@/components/RicercaIndirizzo";
import { TornaIndietro } from "@/components/TornaIndietro";
import { CATEGORIE, isCategoria } from "@/lib/categorie";
import { aggiornaPartner } from "@/lib/azioni";
import { getOpzioniAccount } from "@/lib/commerciali";
import { DESCRIZIONI_TIPO_LUOGO, ETICHETTE_TIPO_LUOGO, TIPI_LUOGO } from "@/lib/luoghi";
import { prisma } from "@/lib/db";
import { leggiSoggetto } from "@/lib/soggetto-fiscale";

export const dynamic = "force-dynamic";

function Campo({
  etichetta,
  nome,
  valore,
  largo,
  obbligatorio,
  children,
}: {
  etichetta: string;
  nome?: string;
  valore?: string | null;
  largo?: boolean;
  obbligatorio?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`campo-modulo${largo ? " largo" : ""}`}>
      <label htmlFor={nome}>
        {etichetta}
        {obbligatorio && <span className="obbligatorio"> *</span>}
      </label>
      {children ?? <input id={nome} name={nome} type="text" defaultValue={valore ?? ""} />}
    </div>
  );
}

// Modifica dei dati anagrafici (bottone "Modifica" della scheda). I tre stati
// (commerciale, finanziario, analisi), gli interessi e l'archivio si
// gestiscono con le pillole della scheda; qui tutto il resto,
// referenti compresi (le righe svuotate vengono rimosse).
export default async function Modifica({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const p = await prisma.partner.findUnique({
    where: { id },
    include: {
      contatti: true,
      capogruppo: { select: { nome: true } },
      soggettoFiscale: { include: { gruppo: { select: { id: true, nome: true } } } },
    },
  });
  if (!p) notFound();

  // Opzioni categoria: il catalogo chiuso, più il valore attuale se fuori
  // catalogo (es. scritto da un'app), così non lo si perde aprendo la scheda.
  const opzioniCategoria = isCategoria(p.categoria) ? [...CATEGORIE] : [p.categoria, ...CATEGORIE];

  // Chi può seguire l'anagrafica: il team commerciale arriva da Budgets.
  const opzioniAccount = await getOpzioniAccount(p.account);

  // ⚠️ Fatturazione della SOCIETÀ collegata a questa sede: si compila una
  // volta e vale per tutte le sedi che fatturano con quella società — non per
  // tutte quelle che hanno la stessa insegna, che possono essere due società.
  const fin = leggiSoggetto(p);
  const haSedi = await prisma.partner.count({
    where: {
      attivo: true,
      NOT: { id: p.id },
      OR: [
        { nome: { equals: (p.capogruppo?.nome ?? p.nome).trim(), mode: "insensitive" } },
        { capogruppoId: p.id },
      ],
    },
  });

  // ⚠️ Quante sedi fattura DAVVERO questa società. È un'altra domanda da
  // «quante sedi ha l'insegna»: fino al 27/08/2026 qui si prometteva che il
  // salvataggio valeva «per tutte le sedi dell'insegna», e infatti i valori
  // venivano ricopiati su tutte — anche su quelle che fatturano con un'altra
  // società. Adesso vale per le sedi collegate a QUESTO soggetto, e basta.
  const sediDelSoggetto = p.soggettoFiscaleId
    ? await prisma.partner.count({ where: { attivo: true, soggettoFiscaleId: p.soggettoFiscaleId } })
    : 0;

  // Referenti esistenti più due righe vuote per aggiungerne
  const righe = [...p.contatti, ...Array.from({ length: 2 }, () => null)];

  return (
    <div className="layout">
      <Sidebar categoriaAttiva={p.categoria} />
      <main className="main">
        <TornaIndietro fallback={`/partner/${p.id}`} label={`Scheda di ${p.nome}`} />

        <div className="page-head">
          <div>
            <h1 className="page-title">Modifica anagrafica</h1>
            <p className="page-sub">{p.nome} · le modifiche valgono per tutte le app Deluxy</p>
          </div>
        </div>

        {sp.errore && <div className="avviso-errore">Nome e categoria sono obbligatori.</div>}

        <form action={aggiornaPartner.bind(null, p.id)}>
          <section className="scheda">
            <h2 className="scheda-titolo">Anagrafica</h2>
            <div className="modulo">
              <Campo etichetta="Nome / Insegna" nome="nome" obbligatorio>
                <input id="nome" name="nome" type="text" required defaultValue={p.nome} />
              </Campo>
              <Campo etichetta="Categoria" nome="categoria" obbligatorio>
                <select id="categoria" name="categoria" required defaultValue={p.categoria}>
                  {opzioniCategoria.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Campo>
              <Campo etichetta="Ragione sociale" nome="ragioneSociale" valore={p.ragioneSociale} />
              <RicercaIndirizzo />
              <Campo etichetta="Città" nome="citta" valore={p.citta} />
              <Campo etichetta="Provincia" nome="provincia" valore={p.provincia} />
              <Campo etichetta="Regione" nome="regione" valore={p.regione} />
              <Campo etichetta="Sede" nome="sede">
                <input id="sede" name="sede" type="text" defaultValue={p.sede ?? ""} placeholder="Montenapoleone, Flagship, Outlet…" />
                <p className="testo-guida">
                  Come si chiama questo luogo dentro l&apos;insegna. Serve quando l&apos;azienda ha
                  più sedi: senza, si distinguono solo dall&apos;indirizzo.
                </p>
              </Campo>
              <Campo etichetta="Tipo di luogo" nome="tipoLuogo">
                <select id="tipoLuogo" name="tipoLuogo" defaultValue={p.tipoLuogo ?? ""}>
                  <option value="">— non indicato —</option>
                  {TIPI_LUOGO.map((t) => (
                    <option key={t} value={t}>
                      {ETICHETTE_TIPO_LUOGO[t]} — {DESCRIZIONI_TIPO_LUOGO[t]}
                    </option>
                  ))}
                </select>
                <p className="testo-guida">
                  Distingue <strong>la sede</strong> dell&apos;azienda dai <strong>negozi</strong>: senza,
                  il registro non sa dire quale dei luoghi sia quale.
                </p>
              </Campo>
              <Campo etichetta="Indirizzo" nome="indirizzo" valore={p.indirizzo} largo />
              <Campo etichetta="Email" nome="email">
                <input id="email" name="email" type="email" defaultValue={p.email ?? ""} />
              </Campo>
              <Campo etichetta="Telefono" nome="telefono" valore={p.telefono} />
              <Campo etichetta="P. IVA" nome="pIva" valore={fin.pIva} />
              <Campo etichetta="Codice fiscale" nome="codiceFiscale" valore={fin.codiceFiscale} />
              <Campo etichetta="Account commerciale" nome="account">
                <select id="account" name="account" defaultValue={p.account ?? ""}>
                  <option value="">— nessuno —</option>
                  {opzioniAccount.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <p className="testo-guida">
                  Team commerciale di Deluxy Budgets. Chi non c&apos;è più resta selezionabile solo
                  sulle anagrafiche che l&apos;hanno già.
                </p>
              </Campo>
              <Campo etichetta="Ultimo contatto" nome="ultimaVisita">
                <input
                  id="ultimaVisita"
                  name="ultimaVisita"
                  type="date"
                  defaultValue={p.ultimaVisita ? p.ultimaVisita.toISOString().slice(0, 10) : ""}
                />
              </Campo>
              <Campo etichetta="Note" nome="note" largo>
                <textarea id="note" name="note" rows={4} defaultValue={p.note ?? ""} />
              </Campo>
            </div>
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">
              Dati finanziari <span className="scheda-sub">fatturazione e pagamenti</span>
            </h2>
            <p className="testo-guida" style={{ marginTop: 0 }}>
              {sediDelSoggetto > 1 ? (
                <>
                  Sono i dati di <strong>{fin.ragioneSociale}</strong>, la società che fattura questa
                  sede: salvandoli valgono per tutte e {sediDelSoggetto} le sedi che fattura.{" "}
                  {haSedi + 1 > sediDelSoggetto && (
                    <>
                      ⚠️ L&apos;insegna ha {haSedi + 1} sedi in tutto: le altre fatturano con una
                      società diversa e <strong>non</strong> vengono toccate.
                    </>
                  )}
                </>
              ) : fin.id ? (
                <>
                  Sono i dati di <strong>{fin.ragioneSociale}</strong>, la società che fattura questa
                  sede. Nessun&apos;altra sede è collegata a questa società.
                </>
              ) : (
                <>
                  Questa sede non ha ancora una società di fatturazione. Salvando la P. IVA ne nasce
                  una — o, se quella P. IVA è già nel registro, la sede si collega a quella.
                </>
              )}
            </p>
            <div className="modulo">
              <Campo etichetta="PEC" nome="pec">
                <input id="pec" name="pec" type="email" defaultValue={fin.pec ?? ""} />
              </Campo>
              <Campo etichetta="Codice SDI" nome="codiceSdi" valore={fin.codiceSdi} />
              <Campo etichetta="IBAN" nome="iban" valore={fin.iban} largo />
              <Campo etichetta="Intestatario del conto" nome="intestatarioConto" largo>
                <input
                  id="intestatarioConto"
                  name="intestatarioConto"
                  type="text"
                  defaultValue={fin.intestatarioConto ?? ""}
                  placeholder={p.ragioneSociale ?? p.nome}
                />
                <p className="testo-guida">
                  Il nome <strong>a cui esce il bonifico</strong>. Non sempre è l&apos;insegna né la
                  ragione sociale: ditte individuali e società che incassano per il negozio hanno
                  un intestatario diverso. La banca controlla che intestatario e IBAN combacino, e
                  se non combaciano il pagamento viene <strong>rifiutato</strong>.
                </p>
              </Campo>
              <Campo etichetta="Banca" nome="banca" valore={fin.banca} />
              <Campo etichetta="Metodo di pagamento" nome="metodoPagamento" valore={fin.metodoPagamento} />
              <Campo etichetta="Condizioni di pagamento" nome="condizioniPagamento" valore={fin.condizioniPagamento} />
              <Campo etichetta="Gruppo di pagamento" nome="gruppoPagamento" largo>
                <input
                  id="gruppoPagamento"
                  name="gruppoPagamento"
                  type="text"
                  defaultValue={fin.gruppoPagamento ?? ""}
                  placeholder="Es. sede centrale di Milano · facoltativo"
                />
                <p className="testo-guida">
                  Facoltativo. Compilalo quando <strong>paga una centrale per tutte le sedi</strong>:
                  la scheda lo mette in evidenza e le singole sedi non si fatturano separatamente.
                  Lascialo vuoto se ogni sede paga per sé.
                </p>
              </Campo>
              <Campo etichetta="Contatto amministrativo" nome="amministrazioneNome" valore={fin.amministrazioneNome} />
              <Campo etichetta="Telefono amministrazione" nome="amministrazioneTelefono" valore={fin.amministrazioneTelefono} />
              <Campo etichetta="Email amministrazione" nome="amministrazioneEmail">
                <input
                  id="amministrazioneEmail"
                  name="amministrazioneEmail"
                  type="email"
                  defaultValue={fin.amministrazioneEmail ?? ""}
                />
              </Campo>
              <Campo etichetta="Note amministrative" nome="noteAmministrative" largo>
                <textarea
                  id="noteAmministrative"
                  name="noteAmministrative"
                  rows={3}
                  defaultValue={fin.noteAmministrative ?? ""}
                />
              </Campo>
            </div>
          </section>

          <section className="scheda">
            <div className="testata-sezione">
              <h2 className="scheda-titolo" style={{ marginBottom: 0 }}>
                Persone di riferimento{" "}
                <span className="scheda-sub">di questa sede</span>
              </h2>
              <RubricaNelModulo partnerNome={p.nome} citta={p.citta} righe={righe.length} />
            </div>
            <input type="hidden" name="righeContatti" value={righe.length} />
            {righe.map((c, i) => (
              <div className="modulo modulo-contatto" key={c?.id ?? `nuova-${i}`}>
                {/* L'id fa sì che il referente venga aggiornato e non ricreato:
                    così non perde il collegamento a HubSpot né il nome rubrica. */}
                {c && <input type="hidden" name={`c${i}-id`} value={c.id} />}
                <Campo etichetta="Ruolo" nome={`c${i}-ruolo`} valore={c?.ruolo} />
                <Campo etichetta="Nome" nome={`c${i}-nome`} valore={c?.nome} />
                <Campo etichetta="Telefono" nome={`c${i}-telefono`} valore={c?.telefono} />
                <Campo etichetta="Email" nome={`c${i}-email`}>
                  <input id={`c${i}-email`} name={`c${i}-email`} type="email" defaultValue={c?.email ?? ""} />
                </Campo>
              </div>
            ))}
            <p className="testo-guida">Per rimuovere un referente svuota tutti i suoi campi.</p>
          </section>

          <div className="azioni-modulo">
            <a className="btn btn-secondario" href={`/partner/${p.id}`}>Annulla</a>
            <button type="submit" className="btn">Salva modifiche</button>
          </div>
        </form>
      </main>
    </div>
  );
}
