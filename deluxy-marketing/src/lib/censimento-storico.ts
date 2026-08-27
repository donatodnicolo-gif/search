import { prisma } from "@/lib/db";
import { brandDa } from "@/lib/ingest-metriche";
import { registra } from "@/lib/registro";

// IL CENSIMENTO STORICO DELLE CAMPAGNE — quali e quante ce n'erano davvero.
//
// ⚠️ A COSA RISPONDE, e perché serviva. L'app conosce le campagne che gli
// script le raccontano, e gli script guardano una finestra corta e (salvo
// `INCLUDI_RIMOSSE`) solo quelle non rimosse: tutto quello che è stato spento e
// cancellato prima di quella finestra, per l'app non è mai esistito. Non «zero
// spesa»: assente. Alla domanda «quante campagne abbiamo avuto in tre anni e
// quanto sono costate» l'elenco delle campagne vive risponde a un'altra
// domanda, e sembra rispondere alla tua.
//
// ⚠️ NON È IL DETTAGLIO DELLE CAMPAGNE, di proposito: una riga per campagna
// per ANNO con i totali. Chi vuole il giorno per giorno guarda
// `MetricaCampagna`, che però esiste solo per le campagne vive.
//
// ⚠️ Ripetibile: la chiave (canale, account, idEsterno, anno) fa sì che
// rifare il censimento AGGIORNI i totali. Un censimento che si somma a sé
// stesso è peggio di nessun censimento.

export type RigaCensimento = {
  idEsterno: string;
  nome: string;
  anno: number;
  stato?: string | null;
  tipo?: string | null;
  spesa?: number | null;
  impression?: number | null;
  click?: number | null;
  conversioni?: number | null;
  ricavi?: number | null;
  primoMese?: number | null;
  ultimoMese?: number | null;
  mesiAttivi?: number | null;
};

export type EsitoCensimento = {
  salvate: number;
  scartate: number;
  campagne: number;
  anni: number[];
  spesa: number;
  motiviScarto: string[];
};

const num = (v: unknown, def = 0) => {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? n : def;
};
const mese = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
};

export async function salvaCensimento(
  righe: RigaCensimento[],
  opzioni: { canale?: string; account: string; brand?: string }
): Promise<EsitoCensimento> {
  const canale = opzioni.canale ?? "google_ads";
  const account = String(opzioni.account);

  let salvate = 0;
  const scartate: string[] = [];
  const campagne = new Set<string>();
  const anni = new Set<number>();
  let spesa = 0;

  for (const r of righe) {
    const idEsterno = r?.idEsterno ? String(r.idEsterno) : "";
    const nome = r?.nome ? String(r.nome) : "";
    const anno = Number(r?.anno);
    // ⚠️ Una riga senza id o senza anno non si "aggiusta": senza id non si sa
    // di quale campagna parla e la si attaccherebbe a un'omonima, senza anno
    // il conteggio per anno mente. Si scarta, e si dice perché.
    if (!idEsterno || !nome || !Number.isInteger(anno) || anno < 2000 || anno > 2100) {
      if (scartate.length < 10) {
        scartate.push(
          `${nome || "(senza nome)"} — ${!idEsterno ? "senza id" : !nome ? "senza nome" : `anno "${r?.anno}" non valido`}`
        );
      }
      continue;
    }

    const dati = {
      nome,
      stato: r.stato ? String(r.stato) : null,
      tipo: r.tipo ? String(r.tipo) : null,
      brand: brandDa(nome, opzioni.brand),
      spesa: num(r.spesa),
      impression: Math.round(num(r.impression)),
      click: Math.round(num(r.click)),
      conversioni: num(r.conversioni),
      ricavi: num(r.ricavi),
      primoMese: mese(r.primoMese),
      ultimoMese: mese(r.ultimoMese),
      mesiAttivi: Math.round(num(r.mesiAttivi)),
      vistoIl: new Date(),
    };

    await prisma.campagnaStorica.upsert({
      where: { canale_account_idEsterno_anno: { canale, account, idEsterno, anno } },
      create: { canale, account, idEsterno, anno, ...dati },
      update: dati,
    });

    salvate++;
    campagne.add(idEsterno);
    anni.add(anno);
    spesa += dati.spesa;
  }

  // La corsa si scrive dove si scrivono tutte le altre consegne: chi guarda
  // «Dati in arrivo» deve vedere anche questa, o il censimento diventa una
  // cosa che è successa e non risulta a nessuno.
  await prisma.ricezioneDati.create({
    data: {
      fonte: canale,
      account,
      tipo: "censimento-storico",
      righe: righe.length,
      nuove: salvate,
      scartate: scartate.length,
      campagne: campagne.size,
      esito: salvate === 0 && righe.length > 0 ? "vuoto" : "ok",
    },
  });

  await registra({
    autore: "sistema",
    tipo: "import",
    entita: "campagna",
    entitaId: account,
    titolo: `Censimento storico · ${account}`,
    dettaglio:
      `${campagne.size} campagne su ${[...anni].sort().join(", ") || "nessun anno"} · ` +
      `${salvate} righe salvate · ${Math.round(spesa)} € di spesa` +
      (scartate.length ? ` · ${scartate.length} righe scartate` : ""),
  });

  return {
    salvate,
    scartate: scartate.length,
    campagne: campagne.size,
    anni: [...anni].sort(),
    spesa,
    motiviScarto: scartate,
  };
}

export type VoceCensimento = {
  idEsterno: string;
  nome: string;
  canale: string;
  account: string;
  brand: string | null;
  stato: string | null;
  tipo: string | null;
  spesa: number;
  conversioni: number;
  ricavi: number;
  anni: number[];
  dal: string; // "03/2024"
  al: string;
  // ⚠️ NON è una colonna: si calcola confrontando con `Campagna` al momento
  // della lettura. Uno stato salvato («questa l'app la conosce») diventa falso
  // il giorno dopo, e nessuno se ne accorge.
  notaAllApp: boolean;
};

/** Il censimento raccolto per campagna, con quello che l'app già conosce. */
export async function riepilogoCensimento(filtro?: { anno?: number; canale?: string }) {
  const righe = await prisma.campagnaStorica.findMany({
    where: {
      ...(filtro?.anno ? { anno: filtro.anno } : {}),
      ...(filtro?.canale ? { canale: filtro.canale } : {}),
    },
    orderBy: [{ anno: "desc" }, { spesa: "desc" }],
  });

  const idsVivi = new Set(
    (
      await prisma.campagna.findMany({
        where: { idEsterno: { not: null } },
        select: { idEsterno: true },
      })
    )
      .map((c) => c.idEsterno)
      .filter((x): x is string => Boolean(x))
  );

  const perCampagna = new Map<string, VoceCensimento & { mesi: [number, number][] }>();
  for (const r of righe) {
    const chiave = `${r.canale}|${r.account}|${r.idEsterno}`;
    const v = perCampagna.get(chiave);
    const mesi: [number, number][] = [
      [r.anno, r.primoMese ?? 1],
      [r.anno, r.ultimoMese ?? 12],
    ];
    if (!v) {
      perCampagna.set(chiave, {
        idEsterno: r.idEsterno,
        nome: r.nome,
        canale: r.canale,
        account: r.account,
        brand: r.brand,
        stato: r.stato,
        tipo: r.tipo,
        spesa: r.spesa,
        conversioni: r.conversioni,
        ricavi: r.ricavi,
        anni: [r.anno],
        dal: "",
        al: "",
        notaAllApp: idsVivi.has(r.idEsterno),
        mesi,
      });
    } else {
      v.spesa += r.spesa;
      v.conversioni += r.conversioni;
      v.ricavi += r.ricavi;
      v.anni.push(r.anno);
      v.mesi.push(...mesi);
      // Il nome più recente vince: le campagne si rinominano, e il censimento
      // legge gli anni dal più recente al più vecchio.
    }
  }

  const fmt = (a: number, m: number) => `${String(m).padStart(2, "0")}/${a}`;
  const voci = [...perCampagna.values()]
    .map((v) => {
      const ordinati = v.mesi.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const primo = ordinati[0];
      const ultimo = ordinati[ordinati.length - 1];
      const { mesi: _mesi, ...resto } = v;
      void _mesi;
      return {
        ...resto,
        anni: [...new Set(v.anni)].sort(),
        dal: primo ? fmt(primo[0], primo[1]) : "—",
        al: ultimo ? fmt(ultimo[0], ultimo[1]) : "—",
      };
    })
    .sort((a, b) => b.spesa - a.spesa);

  // Per anno: quante campagne hanno DAVVERO speso in quell'anno e quanto. Una
  // campagna che esisteva ma non ha speso un euro non è la stessa cosa.
  const perAnno = new Map<number, { campagne: number; conSpesa: number; spesa: number }>();
  for (const r of righe) {
    const a = perAnno.get(r.anno) ?? { campagne: 0, conSpesa: 0, spesa: 0 };
    a.campagne++;
    if (r.spesa > 0) a.conSpesa++;
    a.spesa += r.spesa;
    perAnno.set(r.anno, a);
  }

  const ultimaCorsa = await prisma.ricezioneDati.findFirst({
    where: { tipo: "censimento-storico" },
    orderBy: { ricevutoIl: "desc" },
  });

  return {
    voci,
    perAnno: [...perAnno.entries()].sort((a, b) => b[0] - a[0]).map(([anno, d]) => ({ anno, ...d })),
    totaleCampagne: voci.length,
    mai: voci.filter((v) => !v.notaAllApp).length,
    spesaTotale: voci.reduce((s, v) => s + v.spesa, 0),
    ultimaCorsa,
  };
}
