import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { aggiornaPartner } from "@/lib/azioni";
import { prisma } from "@/lib/db";

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

// Modifica dei dati anagrafici (bottone "Modifica" della scheda). Stato,
// interessi e archivio si gestiscono dalla scheda; qui tutto il resto,
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
  const [p, categorie] = await Promise.all([
    prisma.partner.findUnique({ where: { id }, include: { contatti: true } }),
    prisma.partner.groupBy({ by: ["categoria"], where: { attivo: true }, orderBy: { categoria: "asc" } }),
  ]);
  if (!p) notFound();

  // Referenti esistenti più due righe vuote per aggiungerne
  const righe = [...p.contatti, ...Array.from({ length: 2 }, () => null)];

  return (
    <div className="layout">
      <Sidebar categoriaAttiva={p.categoria} />
      <main className="main">
        <a className="ritorno" href={`/partner/${p.id}`}>← Scheda di {p.nome}</a>

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
                <>
                  <input
                    id="categoria"
                    name="categoria"
                    type="text"
                    required
                    list="lista-categorie"
                    defaultValue={p.categoria}
                  />
                  <datalist id="lista-categorie">
                    {categorie.map((c) => (
                      <option key={c.categoria} value={c.categoria} />
                    ))}
                  </datalist>
                </>
              </Campo>
              <Campo etichetta="Ragione sociale" nome="ragioneSociale" valore={p.ragioneSociale} />
              <Campo etichetta="Città" nome="citta" valore={p.citta} />
              <Campo etichetta="Provincia" nome="provincia" valore={p.provincia} />
              <Campo etichetta="Regione" nome="regione" valore={p.regione} />
              <Campo etichetta="Indirizzo" nome="indirizzo" valore={p.indirizzo} largo />
              <Campo etichetta="Email" nome="email">
                <input id="email" name="email" type="email" defaultValue={p.email ?? ""} />
              </Campo>
              <Campo etichetta="Telefono" nome="telefono" valore={p.telefono} />
              <Campo etichetta="P. IVA" nome="pIva" valore={p.pIva} />
              <Campo etichetta="Codice fiscale" nome="codiceFiscale" valore={p.codiceFiscale} />
              <Campo etichetta="Account commerciale" nome="account" valore={p.account} />
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
            <div className="modulo">
              <Campo etichetta="PEC" nome="pec">
                <input id="pec" name="pec" type="email" defaultValue={p.pec ?? ""} />
              </Campo>
              <Campo etichetta="Codice SDI" nome="codiceSdi" valore={p.codiceSdi} />
              <Campo etichetta="IBAN" nome="iban" valore={p.iban} largo />
              <Campo etichetta="Banca" nome="banca" valore={p.banca} />
              <Campo etichetta="Metodo di pagamento" nome="metodoPagamento" valore={p.metodoPagamento} />
              <Campo etichetta="Condizioni di pagamento" nome="condizioniPagamento" valore={p.condizioniPagamento} />
              <Campo etichetta="Contatto amministrativo" nome="amministrazioneNome" valore={p.amministrazioneNome} />
              <Campo etichetta="Telefono amministrazione" nome="amministrazioneTelefono" valore={p.amministrazioneTelefono} />
              <Campo etichetta="Email amministrazione" nome="amministrazioneEmail">
                <input
                  id="amministrazioneEmail"
                  name="amministrazioneEmail"
                  type="email"
                  defaultValue={p.amministrazioneEmail ?? ""}
                />
              </Campo>
              <Campo etichetta="Note amministrative" nome="noteAmministrative" largo>
                <textarea
                  id="noteAmministrative"
                  name="noteAmministrative"
                  rows={3}
                  defaultValue={p.noteAmministrative ?? ""}
                />
              </Campo>
            </div>
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">Persone di riferimento</h2>
            <input type="hidden" name="righeContatti" value={righe.length} />
            {righe.map((c, i) => (
              <div className="modulo modulo-contatto" key={c?.id ?? `nuova-${i}`}>
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
