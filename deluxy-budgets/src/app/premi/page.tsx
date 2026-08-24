import {
  ANNO_CORRENTE, caricaAnno, contoEconomico, contoEconomicoMensile, LIVELLI, type Livello,
} from "@/lib/calc";
import { quotaDeluxyAnno } from "@/lib/quota";
import { misuraPremi } from "@/lib/premi";
import { prisma } from "@/lib/db";
import { PremiEditor } from "@/components/PremiEditor";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Premi({
  searchParams,
}: {
  searchParams: Promise<{ livello?: string }>;
}) {
  const sp = await searchParams;
  const livello = (LIVELLI.some((l) => l.key === sp.livello) ? sp.livello : "RAGGIUNGIBILE") as Livello;

  const [dati, premi, team, persone] = await Promise.all([
    caricaAnno(ANNO_CORRENTE),
    prisma.premio.findMany({ where: { year: ANNO_CORRENTE }, orderBy: [{ ambito: "asc" }, { creato: "asc" }] }),
    prisma.team.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.dipendente.findMany({ where: { year: ANNO_CORRENTE }, orderBy: { nome: "asc" } }),
  ]);

  // La stessa quota D2C del P&L: un obiettivo di vendita misurato su una base
  // diversa da quella del conto economico farebbe scattare o mancare i premi
  // per una ragione che non c'entra col lavoro di nessuno.
  const q = await quotaDeluxyAnno(ANNO_CORRENTE, dati.maisons);

  // L'EBITDA su cui si misurano i premi: quello **prima dei premi**, che è
  // anche l'ordine del conto economico (EBITDA → premi → risultato netto).
  // Sull'anno intero si usa il conto economico vero, su un periodo parziale la
  // somma dei mesi — il P&L mensile ripartisce i costi in modo suo, e usarlo
  // anche sull'anno darebbe un numero diverso da quello mostrato in grande.
  const mensile = contoEconomicoMensile(dati, livello, q.percentuale / 100);
  const ebitdaAnno = contoEconomico(dati, livello, undefined, q.percentuale / 100).ebitda;
  const ebitdaDelPeriodo = (mesi: number[]) =>
    mesi.length === 12
      ? ebitdaAnno
      : mensile.filter((m) => mesi.includes(m.month)).reduce((s, m) => s + m.ebitda, 0);

  const misurati = misuraPremi(
    dati,
    premi,
    livello,
    q.percentuale / 100,
    ebitdaDelPeriodo,
    new Map(team.map((t) => [t.id, t.nome])),
    new Map(persone.map((p) => [p.id, p.nome]))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Premi</h1>
          <p className="page-caption">
            I premi al raggiungimento di un risultato, {ANNO_CORRENTE}. Un premio dice{" "}
            <strong>a chi</strong> va (tutta l&apos;azienda, una squadra, una persona),{" "}
            <strong>per cosa</strong> e <strong>quanto</strong> vale. Il risultato lo misura l&apos;app sui
            dati che ha già — vendite, EBITDA — così un premio è un impegno e non un promemoria.
          </p>
        </div>
        <div className="page-actions">
          {/* Il livello si sceglie qui perché **cambia quali premi scattano**:
              è la cosa più importante della pagina, non un filtro secondario. */}
          <div className="seg">
            {LIVELLI.map((l) => (
              <Link
                key={l.key}
                href={`/premi?livello=${l.key}`}
                className={l.key === livello ? "on" : ""}
                title={`Misura i risultati sul budget ${l.label.toLowerCase()}.`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <PremiEditor
        year={ANNO_CORRENTE}
        premi={misurati}
        team={team.map((t) => ({ id: t.id, nome: t.nome }))}
        persone={persone.map((p) => ({ id: p.id, nome: p.nome }))}
        maisons={dati.maisons.map((m) => ({ slug: m.slug, nome: m.nome }))}
        linee={dati.linee.map((l) => ({ id: l.id, nome: l.nome }))}
        livello={LIVELLI.find((l) => l.key === livello)?.label ?? livello}
      />
    </>
  );
}
