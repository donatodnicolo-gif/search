import { catalogoListe, clientiDiLista, elencoClienti, type ClienteRiga } from "./orders";
import { chiediJson } from "./openai";

// DAL BRIEF ALLA LISTA — in due tempi, e la divisione è il punto:
// 1. l'AI legge il brief e lo TRADUCE in criteri verificabili (quali liste di
//    Orders unire, quali filtri applicare): mai un elenco di nomi inventati;
// 2. il codice ESEGUE i criteri sui dati veri di Orders, con le note di
//    trasparenza (quanti esclusi, quali cap) — così la lista si può rileggere,
//    rigenerare e difendere.
//
// «Non contattare» si esclude SEMPRE: una lista costruita per scrivere alle
// persone non può contenere chi ha chiesto di non essere contattato.

export type CriteriLista = {
  liste?: string[];
  escludiListe?: string[];
  citta?: string[];
  brand?: string[];
  segmenti?: string[];
  tipologie?: string[];
  spesaMin?: number;
  spesaMax?: number;
  ordiniMin?: number;
  ordiniMax?: number;
  giorniUltimoMax?: number;
  giorniUltimoMin?: number;
  gustiContiene?: string[];
  soloEmail?: boolean;
  soloTelefono?: boolean;
  soloConsensoEmail?: boolean;
  ordina?: "speso" | "recenti" | "ordini";
  limite?: number;
};

export type ListaGenerata = {
  ok: true;
  nome: string;
  spiegazione: string;
  criteri: CriteriLista;
  modello: string;
};

const LIMITE_DEFAULT = 200;
const LIMITE_MASSIMO = 500;
const MAX_PAGINE_BASE = 8; // 8 × 500 = 4000 clienti letti al massimo per lista

export async function generaCriteriDaBrief(brief: string): Promise<ListaGenerata | { ok: false; errore: string }> {
  const cat = await catalogoListe();
  if (!cat.ok) return { ok: false, errore: cat.errore };

  const catalogoTesto = cat.dati.liste
    .map((l) => `- "${l.chiave}" (${l.clienti} clienti): ${l.criterio}`)
    .join("\n");

  const sistema = `Sei il selezionatore di pubblici del CRM di Deluxy (fiori, torte e regali di lusso, consegne in guanti bianchi).
Il tuo compito: tradurre il brief dell'operatore in CRITERI di selezione sui dati che esistono davvero. Non inventi clienti e non inventi campi.

LISTE DISPONIBILI nel registro ordini (si possono UNIRE come base con "liste", o SOTTRARRE con "escludiListe"):
${catalogoTesto}

CAMPI FILTRABILI per ogni cliente: citta (testo), brand (i siti da cui compra: deluxy.it, cakedesign.me, deluxyflowers.com...), segmento (vip, da-non-perdere, fedele, ricorrente, nuovo, una-tantum, da-riattivare, perso), tipologia (privato, azienda, horeca, eventi, rivenditore), speso (EUR totali), ordini (numero), giorniDallUltimo (giorni dall'ultimo ordine), gusti (il riassunto AI dei suoi acquisti: fiori preferiti, occasioni, destinatari).
⚠️ "segmenti" e "tipologie" vogliono i valori AL SINGOLARE qui sopra (privato, fedele), NON le chiavi delle liste che sono al plurale (privati, fedeli). Se la selezione è già coperta dalle liste in "liste", NON ripeterla nei filtri: un filtro ridondante può solo restringere per sbaglio.

Rispondi SOLO con un oggetto JSON:
{
  "nome": "nome breve e parlante della lista (max 40 caratteri)",
  "spiegazione": "1-3 frasi in italiano: come hai letto il brief e perché questi criteri",
  "criteri": {
    "liste": ["chiavi da unire come base; scegli le più mirate, evita di partire da tutto"],
    "escludiListe": [],
    "citta": [], "brand": [], "segmenti": [], "tipologie": [],
    "spesaMin": null, "spesaMax": null, "ordiniMin": null, "ordiniMax": null,
    "giorniUltimoMax": null, "giorniUltimoMin": null,
    "gustiContiene": ["parole da cercare nei gusti, es. peonie, compleanno"],
    "soloEmail": true/false, "soloTelefono": true/false, "soloConsensoEmail": true/false,
    "ordina": "speso" | "recenti" | "ordini",
    "limite": numero (default ${LIMITE_DEFAULT}, massimo ${LIMITE_MASSIMO})
  }
}

REGOLE:
- Se il brief riguarda un'occasione comprata in passato (San Valentino, Natale, festa della mamma/donna) usa la lista corrispondente come base.
- "Migliori", "top", "importanti" → segmenti vip e da-non-perdere, o spesaMin sensata.
- Se serviranno MAIL metti "soloEmail": true; se serviranno WHATSAPP metti "soloTelefono": true; se il brief non lo dice, lasciali false.
- "soloConsensoEmail" mettilo true solo se il brief parla di newsletter/marketing di massa; per inviti personali e auguri lascialo false.
- Se il brief chiede cose che questi dati non sanno dire (es. "chi ha figli"), NON inventare: rispondi {"impossibile": "spiegazione in italiano di cosa manca"}.
- Omesso ciò che non serve: criteri asciutti, non decorativi.`;

  const esito = await chiediJson<{
    nome?: string;
    spiegazione?: string;
    criteri?: CriteriLista;
    impossibile?: string;
  }>(sistema, `Brief dell'operatore:\n${brief}`);

  if (!esito.ok) return esito;
  if (esito.dati.impossibile) return { ok: false, errore: `L'AI non può costruirla: ${esito.dati.impossibile}` };
  if (!esito.dati.criteri) return { ok: false, errore: "Il modello non ha restituito criteri." };

  return {
    ok: true,
    nome: (esito.dati.nome ?? "Lista senza nome").slice(0, 60),
    spiegazione: esito.dati.spiegazione ?? "",
    criteri: esito.dati.criteri,
    modello: esito.modello,
  };
}

// ---------------------------------------------------------------------------

// ⚠️ Le liste di ESCLUSIONE non possono essere «quasi giuste» (giuria
// performance 28/08): prima, un errore di rete faceva `break` e l'esclusione
// usciva VUOTA in silenzio — e la nota diceva perfino «Nessuno da escludere».
// Con «non-contattare» questo vuol dire scrivere a chi ha chiesto di non
// essere contattato. Ora la lettura o è COMPLETA o è un errore dichiarato:
// niente terza via.
async function chiaviDiLista(
  chiave: string,
): Promise<{ ok: true; chiavi: Set<string> } | { ok: false; errore: string }> {
  const fuori = new Set<string>();
  for (let page = 1; page <= MAX_PAGINE_BASE; page++) {
    const r = await clientiDiLista(chiave, { page, limit: 500 });
    if (!r.ok) return { ok: false, errore: `lettura di «${chiave}» fallita: ${r.errore}` };
    for (const c of r.dati.clienti) fuori.add(c.cliente);
    if (page >= r.dati.pagine) return { ok: true, chiavi: fuori };
  }
  // Usciti dal ciclo senza aver visto l'ultima pagina = lista più grande del
  // tetto: per un'esclusione è un troncamento che falsifica, non un risparmio.
  return { ok: false, errore: `la lista «${chiave}» supera le ${MAX_PAGINE_BASE * 500} righe: lettura troncata` };
}

export async function eseguiCriteri(
  criteri: CriteriLista,
): Promise<{ ok: true; clienti: ClienteRiga[]; note: string[] } | { ok: false; errore: string }> {
  const note: string[] = [];
  const serveRiepilogo = Boolean(criteri.gustiContiene?.length);

  // 1. La base: l'unione delle liste chieste, o i clienti per spesa.
  const base = new Map<string, ClienteRiga>();
  if (criteri.liste?.length) {
    let pagineUsate = 0;
    for (const chiave of criteri.liste) {
      for (let page = 1; page <= MAX_PAGINE_BASE; page++) {
        if (pagineUsate >= MAX_PAGINE_BASE) break;
        const r = await clientiDiLista(chiave, { page, limit: 500, riepilogo: serveRiepilogo });
        pagineUsate++;
        if (!r.ok) {
          note.push(`La lista «${chiave}» non si è potuta leggere: ${r.errore}`);
          break;
        }
        for (const c of r.dati.clienti) if (!base.has(c.cliente)) base.set(c.cliente, c);
        if (page >= r.dati.pagine) break;
      }
    }
    note.push(`Base: ${base.size} clienti dall'unione di ${criteri.liste.map((l) => `«${l}»`).join(" + ")}.`);
    if (pagineUsate >= MAX_PAGINE_BASE) note.push(`Lettura fermata a ${MAX_PAGINE_BASE * 500} righe: liste molto grandi, i criteri restano validi sui letti.`);
  } else {
    const MAX_PAGINE_TUTTI = 6;
    for (let page = 1; page <= MAX_PAGINE_TUTTI; page++) {
      const r = await elencoClienti({ ordina: "speso", page, limit: 500 });
      if (!r.ok) return { ok: false, errore: r.errore };
      for (const c of r.dati.clienti) if (!base.has(c.cliente)) base.set(c.cliente, c);
      if (page >= r.dati.pagine) break;
      if (page === MAX_PAGINE_TUTTI)
        note.push(`Senza una lista di partenza si considerano i primi ${MAX_PAGINE_TUTTI * 500} clienti per spesa.`);
    }
    note.push(`Base: ${base.size} clienti dal registro, ordinati per spesa.`);
  }

  // 2. Le esclusioni: quelle chieste, più «non-contattare» SEMPRE.
  // ⚠️ BLOCCANTI: se un'esclusione non si legge per intero, la generazione
  // FALLISCE — mai una lista parziale che sembra completa.
  const daEscludere = new Set<string>([...(criteri.escludiListe ?? []), "non-contattare"]);
  let esclusi = 0;
  for (const chiave of daEscludere) {
    const esito = await chiaviDiLista(chiave);
    if (!esito.ok) return { ok: false, errore: `Esclusione non affidabile — ${esito.errore}. Lista NON generata.` };
    for (const k of esito.chiavi) if (base.delete(k)) esclusi++;
  }
  if (esclusi) note.push(`Esclusi ${esclusi} clienti (${[...daEscludere].map((l) => `«${l}»`).join(", ")}).`);
  else note.push(`Nessuno da escludere («non-contattare» controllata comunque).`);

  // 3. Il consenso esplicito, se chiesto. Stessa regola: o completo o errore
  // (un consenso letto a metà terrebbe dentro chi non l'ha dato).
  if (criteri.soloConsensoEmail) {
    const esitoConsenso = await chiaviDiLista("consenso-email");
    if (!esitoConsenso.ok) return { ok: false, errore: `Consenso non verificabile — ${esitoConsenso.errore}. Lista NON generata.` };
    const consenso = esitoConsenso.chiavi;
    const prima = base.size;
    for (const k of [...base.keys()]) if (!consenso.has(k)) base.delete(k);
    note.push(`Tenuti solo i ${base.size} con consenso email esplicito (erano ${prima}).`);
  }

  // 4. I filtri campo per campo.
  // ⚠️ Le chiavi delle LISTE sono al plurale (privati, fedeli), i valori del
  // SINGOLO cliente al singolare (privato, fedele): due vocabolari. L'AI ogni
  // tanto li confonde, e un filtro che per questo svuota la lista in silenzio
  // è un bug — qui si normalizza, non si punisce.
  const SINGOLARI: Record<string, string> = {
    privati: "privato",
    aziende: "azienda",
    rivenditori: "rivenditore",
    fedeli: "fedele",
    nuovi: "nuovo",
    persi: "perso",
    ricorrenti: "ricorrente",
  };
  const normalizza = (valori: string[] | undefined) =>
    valori?.map((v) => SINGOLARI[v.toLowerCase()] ?? v.toLowerCase());
  const segmenti = normalizza(criteri.segmenti);
  const tipologie = normalizza(criteri.tipologie);

  const contiene = (valore: string | null | undefined, cercati: string[]) =>
    Boolean(valore) && cercati.some((c) => valore!.toLowerCase().includes(c.toLowerCase()));

  let clienti = [...base.values()].filter((c) => {
    if (criteri.citta?.length && !contiene(c.citta, criteri.citta)) return false;
    if (criteri.brand?.length && !c.brand.some((b) => contiene(b, criteri.brand!))) return false;
    if (segmenti?.length && !segmenti.includes(c.segmento.toLowerCase())) return false;
    if (tipologie?.length && (!c.tipologia || !tipologie.includes(c.tipologia.toLowerCase()))) return false;
    if (criteri.spesaMin != null && c.speso < criteri.spesaMin) return false;
    if (criteri.spesaMax != null && c.speso > criteri.spesaMax) return false;
    if (criteri.ordiniMin != null && c.ordini < criteri.ordiniMin) return false;
    if (criteri.ordiniMax != null && c.ordini > criteri.ordiniMax) return false;
    if (criteri.giorniUltimoMax != null && (c.giorniDallUltimo == null || c.giorniDallUltimo > criteri.giorniUltimoMax)) return false;
    if (criteri.giorniUltimoMin != null && (c.giorniDallUltimo == null || c.giorniDallUltimo < criteri.giorniUltimoMin)) return false;
    if (criteri.gustiContiene?.length) {
      const testo = `${c.riepilogo?.gusti ?? ""} ${c.riepilogo?.riassunto ?? ""}`;
      if (!criteri.gustiContiene.some((g) => testo.toLowerCase().includes(g.toLowerCase()))) return false;
    }
    if (criteri.soloEmail && !c.email) return false;
    if (criteri.soloTelefono && !c.telefono) return false;
    return true;
  });

  if (criteri.gustiContiene?.length) {
    note.push(
      `Il filtro sui gusti («${criteri.gustiContiene.join("», «")}») guarda i riassunti AI: chi non ne ha ancora uno resta fuori.`,
    );
  }

  // 5. Ordine e taglio.
  const ordina = criteri.ordina ?? "speso";
  clienti.sort((a, b) => {
    if (ordina === "recenti") return (a.giorniDallUltimo ?? 9e9) - (b.giorniDallUltimo ?? 9e9);
    if (ordina === "ordini") return b.ordini - a.ordini;
    return b.speso - a.speso;
  });
  const limite = Math.min(LIMITE_MASSIMO, Math.max(1, criteri.limite ?? LIMITE_DEFAULT));
  if (clienti.length > limite) {
    note.push(`${clienti.length} corrispondevano: tenuti i primi ${limite} per ${ordina}.`);
    clienti = clienti.slice(0, limite);
  }

  return { ok: true, clienti, note };
}
