import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { ficNoteCredito, FicPermessoNoteCredito, ficStato, type FicNotaCredito } from "@/lib/fic";

export const dynamic = "force-dynamic";

// IL REFERTO DELLE NOTE DI CREDITO (28/08/2026).
//
// ⚠️ Nasce da una domanda dell'utente: «nel calcolo dei ricavi detrai le note di
// credito di Fatture in Cloud?». La risposta misurata era **no**, e non per un
// errore di calcolo: le note di credito **non entravano affatto**. Ogni chiamata
// a FIC filtrava `type=invoice`, e il permesso OAuth concesso
// (`issued_documents.invoices`) non comprendeva nemmeno le note — provato
// sull'API di produzione: `type=credit_note` → **403 NO_PERMISSION**.
//
// ⭐ **Un dato che l'integrazione non ha il permesso di vedere non risulta
// mancante.** Il fatturato tornava completo e plausibile, e nessuna schermata
// poteva accorgersi che era al lordo degli storni. Per questo la prima cosa che
// serviva non era una sottrazione: era una pagina che li **mostri**.
//
// ⚠️ Questa pagina NON tocca i ricavi. Il fatturato del conto economico è la
// somma di `FatturaServizio.imponibile`, righe scritte a mano; qui si vede
// quanto varrebbe la detrazione, non la si applica. Applicarla vuol dire
// decidere a quale partner e a quale tipologia attribuire ogni nota, e quella
// decisione si prende guardando questi numeri, non prima di averli visti.
export default async function NoteCreditoPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>;
}) {
  const sp = await searchParams;
  const anno = sp.anno ? parseInt(sp.anno) : ANNO_CORRENTE;

  const stato = await ficStato();
  let note: FicNotaCredito[] | null = null;
  let permessoMancante = false;
  let errore: string | null = null;

  if (stato.collegato) {
    try {
      note = await ficNoteCredito(anno);
    } catch (e) {
      if (e instanceof FicPermessoNoteCredito) permessoMancante = true;
      else errore = e instanceof Error ? e.message : String(e);
    }
  }

  // Il fatturato come lo conta il conto economico oggi: righe scritte a mano.
  const fatturato = await prisma.fatturaServizio.aggregate({
    where: { anno },
    _sum: { imponibile: true },
    _count: true,
  });
  const ricavi = fatturato._sum.imponibile ?? 0;
  const storni = (note ?? []).reduce((s, n) => s + n.imponibile, 0);

  // Le righe dove qualcuno ha scritto a mano che c'era una nota di credito.
  // ⚠️ Sono la prova che la detrazione oggi è **disciplina, non meccanismo**:
  // dove la persona se n'è ricordata è stata scalata, altrove no.
  const aMano = await prisma.fatturaServizio.findMany({
    where: {
      anno,
      OR: [
        { numero: { contains: "NC", mode: "insensitive" } },
        { descrizione: { contains: "credito", mode: "insensitive" } },
        { descrizione: { contains: "storno", mode: "insensitive" } },
      ],
    },
    include: { partner: true },
    orderBy: { mese: "desc" },
  });

  const anni = [ANNO_CORRENTE, ANNO_CORRENTE - 1, ANNO_CORRENTE - 2];

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Note di credito {anno}</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Quanto varrebbe detrarle dal fatturato. Questa pagina non cambia nessun numero del conto economico.
          </p>
        </div>
        <div className="flex gap-2">
          {anni.map((a) => (
            <Link
              key={a}
              href={`/fatture/note-credito?anno=${a}`}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                a === anno ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              {a}
            </Link>
          ))}
        </div>
      </div>

      {!stato.collegato && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Fatture in Cloud non è collegato: da qui non si può leggere niente.{" "}
          <Link href="/impostazioni" className="underline">
            Impostazioni
          </Link>
        </div>
      )}

      {permessoMancante && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
          <p className="font-medium">Il permesso per leggere le note di credito non c&apos;è ancora.</p>
          <p>
            Fatture in Cloud risponde <strong>403 · nessun permesso</strong>. Il collegamento attuale è stato
            autorizzato quando l&apos;app chiedeva soltanto le fatture: il permesso nuovo esiste nel codice, ma un token
            già emesso porta i permessi che aveva al momento del consenso.
          </p>
          <p>
            Serve <strong>rifare il collegamento</strong> da{" "}
            <Link href="/impostazioni" className="underline">
              Impostazioni → Fatture in Cloud
            </Link>
            . Finché non si fa, questa pagina non dice «zero note»: dice che non può vederle — che è un&apos;altra cosa.
          </p>
        </div>
      )}

      {errore && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Lettura non riuscita: {errore}
        </div>
      )}

      {note && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Riquadro
              titolo={`Fatturato ${anno}`}
              valore={euro(ricavi)}
              nota={`${fatturato._count} fatture — è il numero che entra nel conto economico`}
            />
            <Riquadro
              titolo="Note di credito"
              valore={euro(storni)}
              nota={`${note.length} note emesse — oggi NON sono detratte da nessuna parte`}
            />
            <Riquadro
              titolo="Fatturato al netto"
              valore={euro(ricavi - storni)}
              nota={
                ricavi > 0 ? `${((storni / ricavi) * 100).toFixed(1)}% in meno del fatturato dichiarato` : "—"
              }
              forte
            />
          </div>

          {note.length === 0 ? (
            <p className="text-sm text-neutral-500">Nessuna nota di credito emessa nel {anno}.</p>
          ) : (
            <div className="rounded-xl border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-neutral-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Numero</th>
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-4 py-2 font-medium">Cliente</th>
                    <th className="px-4 py-2 font-medium text-right">Imponibile</th>
                  </tr>
                </thead>
                <tbody>
                  {note.map((n) => (
                    <tr key={n.id} className="border-t border-neutral-100">
                      <td className="px-4 py-2">
                        {n.urlDettaglio ? (
                          <a href={n.urlDettaglio} target="_blank" rel="noreferrer" className="underline">
                            {n.numero}
                          </a>
                        ) : (
                          n.numero
                        )}
                      </td>
                      <td className="px-4 py-2 text-neutral-500">{n.data ? dataIt(new Date(n.data)) : "—"}</td>
                      <td className="px-4 py-2">{n.cliente}</td>
                      <td className="px-4 py-2 text-right tabular-nums">− {euro(n.imponibile)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {aMano.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">Righe dove la nota è stata scalata a mano</h2>
          <p className="text-sm text-neutral-500">
            Qui la detrazione l&apos;ha fatta una persona scrivendo l&apos;importo già ridotto. È la prova che oggi il
            netto dipende da chi digita: dove se n&apos;è ricordato è tolto, altrove no.
          </p>
          <div className="rounded-xl border border-neutral-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Mese</th>
                  <th className="px-4 py-2 font-medium">Partner</th>
                  <th className="px-4 py-2 font-medium">Numero scritto</th>
                  <th className="px-4 py-2 font-medium text-right">Imponibile</th>
                </tr>
              </thead>
              <tbody>
                {aMano.map((f) => (
                  <tr key={f.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2 text-neutral-500">{f.mese}</td>
                    <td className="px-4 py-2">{f.partner.nome}</td>
                    <td className="px-4 py-2 text-neutral-500">{f.numero ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{euro(f.imponibile)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Riquadro({
  titolo,
  valore,
  nota,
  forte,
}: {
  titolo: string;
  valore: string;
  nota: string;
  forte?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${forte ? "border-neutral-900" : "border-neutral-200"}`}>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{titolo}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{valore}</div>
      <div className="text-xs text-neutral-500 mt-1">{nota}</div>
    </div>
  );
}
