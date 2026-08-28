import { notFound } from "next/navigation";
import { FormValet } from "@/components/FormValet";
import { Sidebar } from "@/components/Sidebar";
import { TornaIndietro } from "@/components/TornaIndietro";
import { aggiornaValet } from "@/lib/azioni-valet";
import { prisma } from "@/lib/db";
import { nomeCompleto } from "@/lib/valet";

export const dynamic = "force-dynamic";

export default async function ModificaValet({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await prisma.valet.findUnique({ where: { id } });
  if (!v) notFound();

  return (
    <div className="layout">
      <Sidebar valetAttivo />
      <main className="main">
        <TornaIndietro fallback={`/valet/${v.id}`} label={`Scheda di ${nomeCompleto(v)}`} />

        <div className="page-head">
          <div>
            <h1 className="page-title">Modifica valet</h1>
            <p className="page-sub">{nomeCompleto(v)} · ogni cambiamento finisce nella storia della scheda</p>
          </div>
        </div>

        {sp.errore === "nome" && <div className="avviso-errore">Il nome è obbligatorio.</div>}

        <form action={aggiornaValet.bind(null, v.id)}>
          <FormValet valore={v} />
          <div className="azioni-modulo">
            <a className="btn btn-secondario" href={`/valet/${v.id}`}>Annulla</a>
            <button className="btn" type="submit">Salva modifiche</button>
          </div>
        </form>
      </main>
    </div>
  );
}
