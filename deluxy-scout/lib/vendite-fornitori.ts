// LE VENDITE DI UN FORNITORE — quanti ordini gli ha affidato il Customer
// Service negli ultimi 30 e 180 giorni, e per quanto (10/09/2026, richiesta
// dell'utente sulle schermate Fornitori e Segnalazioni CS).
//
// ⚠️ Il conteggio NON si fa qui: lo fa il Customer Service, che è la casa
// dell'assegnazione ordine → fornitore (`GET /api/v1/fornitori`, letto dalla
// Edge `customer-service`). Qui c'è solo la parte pura: come si aggancia un
// partner del registro a una riga del CS, e come si scrive a schermo. Pura
// perché si prova con i test — e perché la stessa regola serve a DUE
// schermate, che altrimenti divergerebbero al primo ritocco.

export interface VenditeFornitore {
  /** L'id nel registro Anagrafiche ('' = il CS non lo ha agganciato). */
  id: string;
  nome: string;
  /** Il nome normalizzato dal CS (`chiaveNome`): per l'aggancio di ripiego. */
  chiave: string;
  ordini30: number;
  ordiniLunga: number;
  venduto30: number;
  vendutoLunga: number;
  ultimoIl: string | null;
  ultimoNumero: string;
  /** L'ultimo pagamento fatto dal CS a questo fornitore (nessuna finestra). */
  ultimoPagamentoIl?: string | null;
}

export interface IndiceVendite {
  perId: Map<string, VenditeFornitore>;
  perChiave: Map<string, VenditeFornitore>;
  /** La finestra lunga in giorni (di norma 180). */
  giorniLunga: number;
  asOf: string | null;
}

/**
 * Lo stesso normalizzatore di `chiaveNome` del Customer Service
 * (`src/lib/cerca-fornitore.ts`): accenti via, minuscole, solo lettere e
 * cifre separate da uno spazio. ⚠️ Deve restare IDENTICO a quello di là, o
 * l'aggancio per nome smette di trovare in silenzio.
 */
export function chiaveNome(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Costruisce l'indice dalle righe del CS. */
export function indiceVendite(
  righe: VenditeFornitore[],
  opzioni: { giorniLunga?: number; asOf?: string | null } = {},
): IndiceVendite {
  const perChiave = new Map<string, VenditeFornitore>();
  for (const r of righe) {
    const k = r.chiave || chiaveNome(r.nome);
    // ⚠️ Due righe con lo stesso nome (una con id, una senza) sono lo stesso
    // fornitore scritto prima e dopo l'aggancio al registro: si sommano.
    // Misurato sul CS il 10/09/2026: su 118 ordini in 180 giorni solo 6 hanno
    // `fornitoreId`, e «FLEURS ET PLUS» stava in DUE righe (3 con id, 3 senza).
    // Tenere separata la riga con id avrebbe mostrato 3 dove ne aveva 6.
    const gia = perChiave.get(k);
    perChiave.set(k, gia ? somma(gia, r) : r);
  }
  // L'id punta alla riga SOMMATA del suo nome: chi cerca per id trova tutto.
  const perId = new Map<string, VenditeFornitore>();
  for (const r of righe) {
    if (!r.id) continue;
    const tot = perChiave.get(r.chiave || chiaveNome(r.nome));
    if (tot) perId.set(r.id, tot);
  }
  return { perId, perChiave, giorniLunga: opzioni.giorniLunga ?? 180, asOf: opzioni.asOf ?? null };
}

function somma(a: VenditeFornitore, b: VenditeFornitore): VenditeFornitore {
  const ultimoIl = !a.ultimoIl ? b.ultimoIl : !b.ultimoIl ? a.ultimoIl : a.ultimoIl > b.ultimoIl ? a.ultimoIl : b.ultimoIl;
  return {
    id: a.id || b.id,
    nome: a.nome,
    chiave: a.chiave,
    ordini30: a.ordini30 + b.ordini30,
    ordiniLunga: a.ordiniLunga + b.ordiniLunga,
    venduto30: a.venduto30 + b.venduto30,
    vendutoLunga: a.vendutoLunga + b.vendutoLunga,
    ultimoIl,
    ultimoNumero: ultimoIl === a.ultimoIl ? a.ultimoNumero : b.ultimoNumero,
    ultimoPagamentoIl: piuRecente(a.ultimoPagamentoIl, b.ultimoPagamentoIl),
  };
}

/** La più recente fra due date ISO (null se mancano tutte e due). */
export function piuRecente(...date: (string | null | undefined)[]): string | null {
  let m: string | null = null;
  for (const d of date) if (d && (!m || d > m)) m = d;
  return m;
}

/**
 * Le vendite di un partner del registro: prima per id (l'aggancio sicuro),
 * poi per nome normalizzato (il ripiego, per gli ordini scritti prima che il
 * CS agganciasse il fornitore al registro). Null = il CS non gli ha dato
 * ordini nella finestra — che è diverso da «non lo sappiamo» (indice assente).
 */
export function venditeDi(
  partner: { id: string; nome: string },
  indice: IndiceVendite | null | undefined,
): VenditeFornitore | null {
  if (!indice) return null;
  return indice.perId.get(partner.id) ?? indice.perChiave.get(chiaveNome(partner.nome)) ?? null;
}

/**
 * «3 ordini · € 420» oppure «—». Zero ordini non si scrive come «0 · € 0»:
 * nella colonna il vuoto dice «niente», e cento zeri sarebbero rumore.
 */
export function riassuntoVendite(ordini: number, venduto: number): string {
  if (!ordini) return '—';
  const n = `${ordini} ${ordini === 1 ? 'ordine' : 'ordini'}`;
  if (!venduto) return n;
  return `${n} · ${euroTondo(venduto)}`;
}

/**
 * «€ 1.235»: all'euro, col punto delle migliaia scritto a mano. ⚠️ Non
 * `toLocaleString('it-IT')`: sotto jest (e su alcuni runtime senza ICU
 * completo) il separatore non esce, e «1235» in una colonna di importi si
 * legge male accanto a «1.235».
 */
export function euroTondo(v: number): string {
  const n = Math.round(Math.abs(v));
  const cifre = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `€ ${v < 0 ? '-' : ''}${cifre}`;
}

/**
 * I fornitori che il CS usa ma che NON stanno fra i partner dati: sono quelli
 * che nel registro mancano (o non sono agganciati). Si dicono, non si
 * nascondono: chi va a visitare i fornitori deve sapere che ce ne sono altri.
 */
export function fornitoriNonNelRegistro(
  indice: IndiceVendite | null | undefined,
  partner: { id: string; nome: string }[],
): VenditeFornitore[] {
  if (!indice) return [];
  const ids = new Set(partner.map((p) => p.id));
  const chiavi = new Set(partner.map((p) => chiaveNome(p.nome)));
  const fuori: VenditeFornitore[] = [];
  const visti = new Set<string>();
  for (const r of indice.perChiave.values()) {
    if ((r.id && ids.has(r.id)) || chiavi.has(r.chiave || chiaveNome(r.nome))) continue;
    const k = r.chiave || chiaveNome(r.nome);
    if (visti.has(k)) continue;
    visti.add(k);
    fuori.push(r);
  }
  return fuori.sort((a, b) => b.ordiniLunga - a.ordiniLunga || a.nome.localeCompare(b.nome, 'it'));
}
