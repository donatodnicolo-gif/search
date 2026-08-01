"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { importaAttivi, anagraficheAttive, creaDaAnagrafica } from "./importa-registro";

// «Portali in Finance»: l'import a mano, per non aspettare il cron della notte.
export async function importaAttiviOra() {
  const esito = await importaAttivi("manuale");
  revalidatePath("/partner", "layout");
  const pezzi = [
    esito.creati.length ? `${esito.creati.length} schede create` : null,
    esito.collegati.length ? `${esito.collegati.length} collegate a schede esistenti` : null,
    esito.dubbi ? `${esito.dubbi} lasciate da decidere (somigliano a schede già qui)` : null,
    esito.errori.length ? `${esito.errori.length} non riuscite: ${esito.errori.join("; ")}` : null,
  ].filter(Boolean);
  const messaggio = esito.errore
    ? esito.errore
    : pezzi.length === 0
      ? "Nessun cliente da portare dentro: erano già tutti qui."
      : pezzi.join(" · ") + (esito.creati.length ? `. Create: ${esito.creati.slice(0, 8).join(", ")}` : "");
  redirect(
    `/partner?${esito.errore || esito.errori.length ? "importErrore" : "importFatto"}=${encodeURIComponent(messaggio)}`
  );
}

// «È la stessa azienda»: invece di creare una scheda nuova, il record del
// registro si attacca a quella che c'è già. È il gesto che evita il doppione.
export async function collegaDubbio(fd: FormData) {
  const anagraficaId = String(fd.get("anagraficaId") ?? "").trim();
  const partnerId = String(fd.get("partnerId") ?? "").trim();
  if (!anagraficaId || !partnerId) redirect("/partner");
  const a = (await anagraficheAttive()).find((x) => x.id === anagraficaId);
  const p = await prisma.partner.update({
    where: { id: partnerId },
    data: { anagraficaId },
  });
  revalidatePath("/partner", "layout");
  // ⚠️ Va detto QUALE anagrafica è stata collegata, città compresa: nel
  // registro ci sono più schede con lo stesso nome — «DR. VRANJES MILANO» e
  // «Dr. Vranjes BAGNO A RIPOLI», «MONCLER» a Firenze e a Forte dei Marmi —
  // e collegandone una l'altra resta in elenco identica. Senza questa riga
  // sembra che il clic non abbia fatto niente.
  const quale = a ? `«${a.nome.replace(/\s+/g, " ")}${a.citta ? ` · ${a.citta}` : ""}»` : "l'anagrafica";
  const restano = a
    ? (await anagraficheAttive()).filter(
        (x) => x.id !== a.id && x.nome.trim().toLowerCase() === a.nome.trim().toLowerCase()
      )
    : [];
  redirect(
    `/partner?importFatto=${encodeURIComponent(
      `${quale} è ora collegata a «${p.nome}».` +
        (restano.length
          ? ` Attenzione: nel registro c'è ancora ${restano.length === 1 ? "un'altra scheda" : `altre ${restano.length} schede`} con lo stesso nome (${restano
              .map((r) => r.citta ?? "senza città")
              .join(", ")}): è una sede diversa e va decisa a parte.`
          : "")
    )}`
  );
}

// «È un'altra azienda»: si crea la scheda, nonostante la somiglianza.
export async function creaDubbioComunque(fd: FormData) {
  const anagraficaId = String(fd.get("anagraficaId") ?? "").trim();
  if (!anagraficaId) redirect("/partner");
  const a = (await anagraficheAttive()).find((x) => x.id === anagraficaId);
  if (!a) {
    redirect(`/partner?importErrore=${encodeURIComponent("Quell'anagrafica non risulta più fra i clienti del registro.")}`);
  }
  const esito = await creaDaAnagrafica(a!);
  revalidatePath("/partner", "layout");
  redirect(
    esito.ok
      ? `/partner?importFatto=${encodeURIComponent(`«${esito.nome}» creato.`)}`
      : `/partner?importErrore=${encodeURIComponent(esito.errore!)}`
  );
}
