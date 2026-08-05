import { prisma } from "./db";
import {
  STATO_INFO,
  TIPO_INFO,
  confiniMese,
  dataBreve,
  formattaDurata,
  giorniCoperti,
  giornoAData,
  giornoDi,
  intervalloEsteso,
  meseEsteso,
  minutiLavorati,
  oraDi,
  turniDelGiorno,
  type StatoAssenza,
  type TipoAssenza,
  type Turno,
} from "./cartellino";

// Il riepilogo presenze di un mese, per tutti. Sta qui e non dentro la pagina
// perché lo usano in due: la schermata di gestione e l'email che l'admin manda.
// Se fossero due conti separati, prima o poi direbbero numeri diversi — ed è il
// tipo di differenza che nessuno nota finché non è un problema.

export type Giornata = {
  giorno: string; // "YYYY-MM-DD"
  data: Date;
  minuti: number;
  aperto: boolean;
  turni: Turno[];
  conManuali: boolean; // almeno una riga inserita a mano, non timbrata
};

export type AssenzaRiga = {
  tipo: string;
  stato: string;
  dal: Date;
  al: Date;
  giorniNelMese: number;
  motivo: string;
};

export type RigaPresenze = {
  utenteId: string;
  nome: string;
  email: string;
  minuti: number;
  giornate: Giornata[]; // dalla più recente
  assenze: AssenzaRiga[];
  giorniAssenza: number;
  dentroOra: { dalle: Date | null; minuti: number } | null;
};

export type Riepilogo = {
  mese: string; // "YYYY-MM"
  etichettaMese: string;
  righe: RigaPresenze[];
  totaleMinuti: number;
  generatoIl: Date;
};

export async function riepilogoMese(mese: string, adesso: Date = new Date()): Promise<Riepilogo> {
  const confini = confiniMese(mese);
  if (!confini) throw new Error(`Mese non valido: ${mese}`);
  const inizioMese = giornoAData(confini.primo)!;
  const fineMese = giornoAData(confini.ultimo)!;
  const oggi = giornoDi(adesso);

  const [utenti, timbrature, assenze] = await Promise.all([
    prisma.utente.findMany({
      where: { attivo: true },
      select: { id: true, nome: true, email: true },
      orderBy: { nome: "asc" },
    }),
    prisma.timbratura.findMany({
      where: { giorno: { gte: confini.primo, lte: confini.ultimo } },
      orderBy: { istante: "asc" },
    }),
    // Le assenze che toccano il mese: comprese quelle iniziate prima o finite dopo.
    // Le respinte no: non sono assenze, sono richieste dette di no.
    prisma.assenza.findMany({
      where: { dal: { lte: fineMese }, al: { gte: inizioMese }, stato: { not: "respinta" } },
      orderBy: { dal: "asc" },
    }),
  ]);

  const perUtente = new Map<string, Map<string, typeof timbrature>>();
  for (const t of timbrature) {
    const giorni = perUtente.get(t.utenteId) ?? new Map<string, typeof timbrature>();
    const righe = giorni.get(t.giorno) ?? [];
    righe.push(t);
    giorni.set(t.giorno, righe);
    perUtente.set(t.utenteId, giorni);
  }

  const righe: RigaPresenze[] = utenti.map((u) => {
    const giorni = perUtente.get(u.id) ?? new Map<string, typeof timbrature>();

    const giornate: Giornata[] = [...giorni.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([giorno, marcature]) => {
        // Un turno lasciato aperto conta fino ad adesso solo se è oggi.
        const calcolo = minutiLavorati(marcature, giorno === oggi ? adesso : null);
        return {
          giorno,
          data: marcature[0].istante,
          minuti: calcolo.minuti,
          aperto: calcolo.aperto,
          turni: turniDelGiorno(marcature),
          conManuali: marcature.some((m) => m.origine === "manuale"),
        };
      });

    const sue = assenze.filter((a) => a.utenteId === u.id);
    const assenzeRighe: AssenzaRiga[] = sue.map((a) => {
      const dal = a.dal < inizioMese ? inizioMese : a.dal;
      const al = a.al > fineMese ? fineMese : a.al;
      return {
        tipo: a.tipo,
        stato: a.stato,
        dal: a.dal,
        al: a.al,
        giorniNelMese: giorniCoperti(dal, al),
        motivo: a.motivo,
      };
    });

    const oggiCalcolo = minutiLavorati(giorni.get(oggi) ?? [], adesso);

    return {
      utenteId: u.id,
      nome: u.nome,
      email: u.email,
      minuti: giornate.reduce((acc, g) => acc + g.minuti, 0),
      giornate,
      assenze: assenzeRighe,
      giorniAssenza: assenzeRighe.reduce((acc, a) => acc + a.giorniNelMese, 0),
      dentroOra: oggiCalcolo.aperto ? { dalle: oggiCalcolo.dalle, minuti: oggiCalcolo.minuti } : null,
    };
  });

  return {
    mese,
    etichettaMese: meseEsteso(mese),
    righe,
    totaleMinuti: righe.reduce((acc, r) => acc + r.minuti, 0),
    generatoIl: adesso,
  };
}

// ---------- L'email ----------

function etichettaTipo(t: string) {
  return TIPO_INFO[t as TipoAssenza]?.etichetta ?? t;
}

function etichettaStato(s: string) {
  return STATO_INFO[s as StatoAssenza]?.etichetta ?? s;
}

// In una tabella "—" sta bene, in una frase no: «— su 1 giorni» non si legge.
function ore(minuti: number): string {
  return minuti > 0 ? formattaDurata(minuti) : "0h";
}

function plurale(n: number, singolare: string, plurale: string): string {
  return `${n} ${n === 1 ? singolare : plurale}`;
}

function turniInRiga(g: Giornata): string {
  return g.turni.map((t) => `${oraDi(t.entrata)}–${t.uscita ? oraDi(t.uscita) : "in corso"}`).join(", ");
}

/**
 * Il rapporto da spedire: stessa sostanza della schermata, in due formati.
 * Il testo semplice non è un ripiego — è quello che si legge dal telefono, dove
 * il Cartellino non si apre.
 */
export function rapportoPresenze(
  r: Riepilogo,
  opzioni: { nota?: string; daNome: string } = { daNome: "" },
): { oggetto: string; testo: string; html: string } {
  const oggetto = `Presenze Deluxy — ${r.etichettaMese}`;
  const quando = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "short",
    timeStyle: "short",
  }).format(r.generatoIl);

  // ----- testo semplice -----
  const righeTesto: string[] = [
    oggetto,
    `Generato il ${quando}${opzioni.daNome ? ` da ${opzioni.daNome}` : ""}.`,
    "",
  ];
  if (opzioni.nota) righeTesto.push(opzioni.nota, "");

  righeTesto.push("RIEPILOGO", "");
  for (const p of r.righe) {
    righeTesto.push(
      `- ${p.nome}: ${ore(p.minuti)} su ${plurale(p.giornate.length, "giorno", "giorni")} timbrati` +
        (p.giorniAssenza
          ? `, ${plurale(p.giorniAssenza, "giorno", "giorni")} di assenza`
          : ""),
    );
  }
  righeTesto.push("", `Totale ore del mese: ${ore(r.totaleMinuti)}`, "");

  righeTesto.push("DETTAGLIO", "");
  for (const p of r.righe) {
    righeTesto.push(`${p.nome} (${p.email})`);
    if (p.giornate.length === 0) righeTesto.push("  nessuna timbratura");
    for (const g of [...p.giornate].reverse()) {
      righeTesto.push(
        `  ${dataBreve(g.data)}  ${turniInRiga(g)}  ${ore(g.minuti)}` +
          (g.conManuali ? "  [righe inserite a mano]" : "") +
          (g.aperto ? "  [turno aperto]" : ""),
      );
    }
    for (const a of p.assenze) {
      righeTesto.push(
        `  ${etichettaTipo(a.tipo)} ${intervalloEsteso(a.dal, a.al)} — ${etichettaStato(a.stato)}` +
          (a.motivo ? ` (${a.motivo})` : ""),
      );
    }
    righeTesto.push("");
  }
  righeTesto.push("Deluxy Hub — deluxy-hub.vercel.app/cartellino");

  // ----- html -----
  // Stili in linea: i client di posta buttano via i fogli di stile. Palette
  // sobria del design system, nessuna immagine, nessun font esterno.
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const th = 'style="text-align:left;padding:8px 10px;border-bottom:1px solid #d9d9de;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6e6e73"';
  const td = 'style="padding:8px 10px;border-bottom:1px solid #ededf0;font-size:14px"';

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;background:#f5f5f7;padding:24px">
  <div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e3e3e6;border-radius:14px;padding:26px">
    <h1 style="font-size:20px;margin:0 0 4px;letter-spacing:-.02em">Presenze Deluxy</h1>
    <p style="margin:0 0 18px;color:#6e6e73;font-size:13.5px">${esc(r.etichettaMese)} · generato il ${esc(quando)}${
      opzioni.daNome ? ` da ${esc(opzioni.daNome)}` : ""
    }</p>
    ${opzioni.nota ? `<p style="margin:0 0 18px;font-size:14px">${esc(opzioni.nota)}</p>` : ""}

    <table style="width:100%;border-collapse:collapse;margin-bottom:26px">
      <thead><tr><th ${th}>Persona</th><th ${th}>Ore</th><th ${th}>Giorni timbrati</th><th ${th}>Giorni di assenza</th></tr></thead>
      <tbody>
        ${r.righe
          .map(
            (p) => `<tr>
          <td ${td}><strong>${esc(p.nome)}</strong><br><span style="color:#8e8e93;font-size:12px">${esc(p.email)}</span></td>
          <td ${td}>${formattaDurata(p.minuti)}</td>
          <td ${td}>${p.giornate.length || "—"}</td>
          <td ${td}>${p.giorniAssenza || "—"}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
      <tfoot><tr><td ${td}><strong>Totale</strong></td><td ${td}><strong>${formattaDurata(
        r.totaleMinuti,
      )}</strong></td><td ${td}></td><td ${td}></td></tr></tfoot>
    </table>

    ${r.righe
      .map(
        (p) => `<h2 style="font-size:15px;margin:22px 0 8px;letter-spacing:-.01em">${esc(p.nome)}</h2>
      ${
        p.giornate.length === 0
          ? '<p style="margin:0;color:#8e8e93;font-size:13px">Nessuna timbratura nel mese.</p>'
          : `<table style="width:100%;border-collapse:collapse">
        <thead><tr><th ${th}>Giorno</th><th ${th}>Turni</th><th ${th}>Ore</th></tr></thead>
        <tbody>${[...p.giornate]
          .reverse()
          .map(
            (g) => `<tr>
            <td ${td}>${esc(dataBreve(g.data))}${
              g.conManuali
                ? '<br><span style="color:#8e8e93;font-size:11.5px">righe inserite a mano</span>'
                : ""
            }</td>
            <td ${td}>${esc(turniInRiga(g))}</td>
            <td ${td}>${formattaDurata(g.minuti)}${
              g.aperto ? '<br><span style="color:#8e8e93;font-size:11.5px">turno aperto</span>' : ""
            }</td>
          </tr>`,
          )
          .join("")}</tbody></table>`
      }
      ${
        p.assenze.length > 0
          ? `<ul style="margin:10px 0 0;padding-left:18px;font-size:13.5px;color:#3a3a3c">${p.assenze
              .map(
                (a) =>
                  `<li>${esc(etichettaTipo(a.tipo))} · ${esc(intervalloEsteso(a.dal, a.al))} — ${esc(
                    etichettaStato(a.stato),
                  )}${a.motivo ? ` <span style="color:#8e8e93">(${esc(a.motivo)})</span>` : ""}</li>`,
              )
              .join("")}</ul>`
          : ""
      }`,
      )
      .join("")}

    <p style="margin:26px 0 0;color:#8e8e93;font-size:12px">
      Deluxy Hub · il cartellino si apre da computer su deluxy-hub.vercel.app/cartellino
    </p>
  </div>
</div>`;

  return { oggetto, testo: righeTesto.join("\n"), html };
}
