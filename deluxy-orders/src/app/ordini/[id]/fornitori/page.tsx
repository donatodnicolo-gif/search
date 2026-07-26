import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { euro, dataBreve, consegnaBreve } from "@/lib/ordini";
import { cercaFornitori } from "@/lib/fornitori";

export const dynamic = "force-dynamic";

// Fornitori vicini alla consegna di un ordine. La ricerca la fa l'app
// Ricerca fornitori (search-deluxy): qui si mostra il risultato con i contatti
// pronti all'uso. Niente viene salvato: si interroga quando serve.
export default async function FornitoriOrdine({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { id } = await params;
  const { categoria } = await searchParams;

  const ordine = await prisma.ordine.findUnique({
    where: { id },
    select: {
      id: true,
      numero: true,
      brand: true,
      data: true,
      totale: true,
      valuta: true,
      spedizioneNome: true,
      clienteNome: true,
      indirizzo: true,
      citta: true,
      cap: true,
      provincia: true,
      dataConsegna: true,
      fasciaConsegna: true,
    },
  });
  if (!ordine) notFound();

  const esito = await cercaFornitori(ordine.brand, ordine.numero, categoria);

  return (
    <main className="main">
      <Link href={`/ordini/${ordine.id}`} className="ritorno">← Torna all&apos;ordine {ordine.numero}</Link>

      <div className="page-head">
        <div>
          <h1 className="page-title">Fornitori vicini</h1>
          <p className="page-sub">
            {ordine.numero} · {ordine.brand} · {dataBreve(ordine.data)} · {euro(ordine.totale, ordine.valuta)}
            {consegnaBreve(ordine.dataConsegna, ordine.fasciaConsegna)
              ? ` · consegna ${consegnaBreve(ordine.dataConsegna, ordine.fasciaConsegna)}`
              : ""}
          </p>
        </div>
        {esito.stato === "ok" && (
          <div className="scelta-vista" role="group" aria-label="Categoria">
            <Link
              className={`vista-opz${esito.categoria === "fiorai" ? " attiva" : ""}`}
              href={`/ordini/${ordine.id}/fornitori?categoria=fiorai`}
            >
              Fiorai
            </Link>
            <Link
              className={`vista-opz${esito.categoria === "pasticcerie" ? " attiva" : ""}`}
              href={`/ordini/${ordine.id}/fornitori?categoria=pasticcerie`}
            >
              Pasticcerie
            </Link>
          </div>
        )}
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Indirizzo di consegna</div>
        <p>
          {[ordine.spedizioneNome ?? ordine.clienteNome, ordine.indirizzo, [ordine.cap, ordine.citta, ordine.provincia].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>

      {esito.stato === "non-configurato" && (
        <div className="vuoto">
          <p style={{ marginBottom: 10 }}>
            La ricerca fornitori non è ancora collegata.
          </p>
          <p className="testo-guida">
            Serve la chiave dell&apos;app Ricerca fornitori nella variabile
            d&apos;ambiente <code className="inline">SEARCH_API_KEY</code> (e, se
            il sito non è quello predefinito, <code className="inline">SEARCH_URL</code>).
            La chiave si genera in search-deluxy e non va mai scritta nel codice.
          </p>
        </div>
      )}

      {esito.stato === "errore" && (
        <div className="avviso-errore">{esito.messaggio}</div>
      )}

      {esito.stato === "ok" && (
        <>
          {esito.nota && <p className="testo-guida" style={{ marginBottom: 14 }}>{esito.nota}</p>}
          {esito.fornitori.length === 0 ? (
            <div className="vuoto">Nessun fornitore trovato vicino a questo indirizzo.</div>
          ) : (
            <div className="griglia-fornitori">
              {esito.fornitori.map((f, i) => (
                <div className="scheda card-fornitore" key={`${f.nome}-${i}`}>
                  <div className="fornitore-testa">
                    <div>
                      <div className="fornitore-nome">{f.nome}</div>
                      <div className="fornitore-indirizzo">{f.indirizzo}</div>
                    </div>
                    {f.distanzaKm != null && (
                      <span className="badge neutro" title={f.distanzaTipo}>
                        {f.distanzaKm} km{f.minutiAuto != null ? ` · ${f.minutiAuto} min` : ""}
                      </span>
                    )}
                  </div>

                  <div className="fornitore-dati">
                    {f.valutazione != null && (
                      <span className="fornitore-dato">
                        ★ {f.valutazione}
                        {f.numeroRecensioni ? ` (${f.numeroRecensioni})` : ""}
                      </span>
                    )}
                    {f.apertoOra != null && (
                      <span className={`fornitore-dato ${f.apertoOra ? "aperto" : "chiuso"}`}>
                        {f.apertoOra ? "aperto ora" : "chiuso ora"}
                      </span>
                    )}
                    {f.telefono && <span className="fornitore-dato">{f.telefono}</span>}
                  </div>

                  <div className="fornitore-azioni">
                    {f.telefono && (
                      <a className="btn btn-secondario small" href={`tel:${f.telefono.replace(/\s/g, "")}`}>
                        Chiama
                      </a>
                    )}
                    {f.whatsapp && (
                      <a className="btn btn-secondario small" href={f.whatsapp} target="_blank" rel="noopener noreferrer">
                        WhatsApp
                      </a>
                    )}
                    {f.sito && (
                      <a className="btn btn-secondario small" href={f.sito} target="_blank" rel="noopener noreferrer">
                        Sito
                      </a>
                    )}
                    {f.mappa && (
                      <a className="btn btn-secondario small" href={f.mappa} target="_blank" rel="noopener noreferrer">
                        Mappa
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="testo-guida" style={{ marginTop: 14 }}>
            Ricerca fatta dall&apos;app Ricerca fornitori sull&apos;indirizzo di consegna. I risultati non vengono salvati: si aggiornano a ogni apertura.
          </p>
        </>
      )}
    </main>
  );
}
